import { prisma } from "@/lib/db";
import type { JobStatus, OutputMode } from "@/lib/store/types";
import { resolveCoinInput } from "@/lib/coins/resolver";
import {
  collectCoinData,
  type CoinResearchMode,
} from "@/lib/collectors/coin-data";
import type { CollectedData } from "@/lib/collectors";
import { runTechnicalAnalysis } from "@/lib/analysis";
import { generateCoinReportMarkdown } from "@/lib/llm/coin-report-generator";
import { generateReport } from "@/lib/llm/report-generator";
import {
  loadExternalContext,
  syncScriptHistoryFromFiles,
} from "@/lib/external-refs/loader";
import { buildPreviousScriptFromText } from "@/lib/external-refs/previous-script";
import { exportCoinReport } from "@/lib/export";
import { normalizePlanning, type PlanningContext } from "@/lib/planning/context";

async function updateJob(
  jobId: string,
  status: JobStatus,
  stepMessage: string,
  extra?: Record<string, unknown>
) {
  await prisma.researchJob.update({
    where: { id: jobId },
    data: { status, stepMessage, ...extra },
  });
}

function toCollectedData(
  coinData: Awaited<ReturnType<typeof collectCoinData>>
): CollectedData {
  return {
    binance: coinData.binance,
    cmc: coinData.cmc,
    news: coinData.news,
    youtube: coinData.youtube,
    youtubeAnalysis: coinData.youtubeAnalysis,
    youtubeConsensus: coinData.youtubeConsensus,
  };
}

function needsTechnical(
  mode: CoinResearchMode,
  outputMode: OutputMode,
  symbol: string
): boolean {
  if (mode === "technical" || mode === "both") return true;
  if (outputMode !== "report" && symbol === "BTC") return true;
  return false;
}

export async function runUnifiedPipeline(
  jobId: string,
  options: {
    coinInput: string;
    researchMode: CoinResearchMode;
    outputMode: OutputMode;
    scriptNumber?: number;
    thumbnailText?: string;
    titleText?: string;
    storyHypothesis?: string;
    tradingBias?: "bullish" | "bearish" | "neutral";
    /** フォームに貼り付けられた前回台本の本文（あればファイル検索より優先） */
    previousScriptText?: string;
  }
) {
  try {
    await syncScriptHistoryFromFiles();

    const coin = resolveCoinInput(options.coinInput);
    const planning: PlanningContext = normalizePlanning({
      thumbnailText: options.thumbnailText,
      titleText: options.titleText,
      storyHypothesis: options.storyHypothesis,
      tradingBias: options.tradingBias ?? "neutral",
    });
    const effectiveMode: CoinResearchMode =
      needsTechnical(options.researchMode, options.outputMode, coin.symbol) &&
      options.researchMode === "fundamentals"
        ? "both"
        : options.researchMode;

    await prisma.researchJob.update({
      where: { id: jobId },
      data: {
        jobType: "unified_research",
        coinSymbol: coin.symbol,
        coinName: coin.name,
        researchMode: options.researchMode,
        outputMode: options.outputMode,
        thumbnailText: planning.thumbnailText || null,
        titleText: planning.titleText || null,
        storyHypothesis: planning.storyHypothesis || null,
      },
    });

    await updateJob(
      jobId,
      "collecting",
      `${coin.name}（${coin.symbol}）のデータを収集中...`
    );
    const collected = await collectCoinData(coin, effectiveMode, planning);
    const collectedData = toCollectedData(collected);

    await prisma.sourceDocument.createMany({
      data: [
        {
          jobId,
          type: "coin",
          title: `${coin.symbol} research`,
          content: JSON.stringify({
            coin,
            mode: effectiveMode,
            outputMode: options.outputMode,
            planning,
          }),
        },
        ...collected.news.map((n) => ({
          jobId,
          type: "news",
          title: n.title,
          url: n.url,
          content: n.summary,
        })),
        ...collected.youtube.map((v) => ({
          jobId,
          type: "youtube",
          title: v.title,
          url: v.url,
          content: JSON.stringify({
            channel: v.channelTitle,
            analysis: collected.youtubeAnalysis.find((a) => a.videoId === v.videoId),
          }),
        })),
      ],
    });

    let technical = null;
    let usedConceptsForReport: string[] = [];
    if (needsTechnical(effectiveMode, options.outputMode, coin.symbol)) {
      await updateJob(jobId, "analyzing", "テクニカル分析を実行中...");
      const ctx = coin.symbol === "BTC" ? await loadExternalContext() : null;

      // 永続化された概念使用履歴（GCS/store.json）を読み込む。
      // 今回の台本番号（または番号なしなら今日）のエントリは除外し、
      // 同じレポートの再生成で概念が無駄に切り替わらないようにする。
      const today = new Date().toISOString().split("T")[0];
      const conceptHistory = await prisma.conceptLog.findMany();
      const persistedUsed = conceptHistory
        .filter((e) =>
          options.scriptNumber != null
            ? e.scriptNumber !== options.scriptNumber
            : !(e.scriptNumber == null && e.date === today)
        )
        .map((e) => e.name);

      usedConceptsForReport = [
        ...new Set([...(ctx?.usedConcepts ?? []), ...persistedUsed]),
      ];

      technical = runTechnicalAnalysis(
        collectedData,
        usedConceptsForReport,
        planning.tradingBias
      );

      // 今回選定された概念を履歴に記録（次回以降は重複しない）
      if (coin.symbol === "BTC" && technical.conceptSuggestion?.name) {
        await prisma.conceptLog
          .record({
            name: technical.conceptSuggestion.name,
            scriptNumber: options.scriptNumber ?? null,
          })
          .catch(() => {});
      }

      await prisma.marketSnapshot.createMany({
        data: [
          {
            jobId,
            timeframe: "1d",
            price: technical.currentPrice,
            rsi: technical.rsiDaily,
            ma200: technical.ma200,
            divergence: technical.ma200Divergence,
            rawJson: collected.binance.candles.daily.slice(-30),
          },
        ],
      });
    }

    // --- レポート生成（台本作成機能は廃止し、常にレポートのみ出力） ---
    await updateJob(jobId, "report_generating", "レポートを生成中...");

    // フォームに前回台本が貼り付けられていればそれを優先
    const userPreviousScript = options.previousScriptText
      ? buildPreviousScriptFromText(options.previousScriptText, options.scriptNumber)
      : null;

    let reportMd = "";
    let reportJson: object = {};

    const includeFundamentals =
      effectiveMode === "fundamentals" || effectiveMode === "both";

    if (coin.symbol === "BTC" && technical && !includeFundamentals) {
      // BTCテクニカル専用レポート（台本構成①〜⑪対応）
      const ctx = await loadExternalContext(options.scriptNumber);
      const result = await generateReport(
        collectedData,
        technical,
        userPreviousScript ?? ctx.previousScript,
        usedConceptsForReport
      );
      reportMd = result.markdown;
      reportJson = result.json as object;
    } else if (coin.symbol === "BTC" && technical && includeFundamentals) {
      // ファンダ＋テクニカル：両方のレポートを結合
      const ctx = await loadExternalContext(options.scriptNumber);
      const technicalResult = await generateReport(
        collectedData,
        technical,
        userPreviousScript ?? ctx.previousScript,
        usedConceptsForReport
      );
      const fundamentalsMd = await generateCoinReportMarkdown(collected, technical, planning);
      reportMd = `${technicalResult.markdown}\n\n---\n\n${fundamentalsMd}`;
      reportJson = technicalResult.json as object;
    } else {
      reportMd = await generateCoinReportMarkdown(collected, technical, planning);
      reportJson = {
        coin,
        mode: effectiveMode,
        planning,
        technical,
        newsCount: collected.news.length,
        youtubeCount: collected.youtube.length,
      };
    }

    await prisma.report.create({
      data: { jobId, markdown: reportMd, json: reportJson },
    });

    await exportCoinReport(jobId, coin.symbol, reportMd);
    await prisma.researchJob.update({
      where: { id: jobId },
      data: {
        status: "report_ready",
        stepMessage: "レポート完成",
        completedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.researchJob.update({
      where: { id: jobId },
      data: {
        status: "failed",
        errorMessage: message,
        stepMessage: "エラーが発生しました",
        completedAt: new Date().toISOString(),
      },
    });
    throw error;
  }
}
