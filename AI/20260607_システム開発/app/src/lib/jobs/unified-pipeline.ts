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
import { generateCoinScriptMarkdown } from "@/lib/llm/coin-script-generator";
import { generateReport } from "@/lib/llm/report-generator";
import { generateScript } from "@/lib/llm/script-generator";
import { validateScript } from "@/lib/validators/script-validator";
import {
  loadExternalContext,
  getNextScriptNumber,
  syncScriptHistoryFromFiles,
} from "@/lib/external-refs/loader";
import { exportArtifacts, exportCoinReport } from "@/lib/export";
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
    const includeReport =
      options.outputMode === "report" || options.outputMode === "report_and_script";
    const includeScript =
      options.outputMode === "script" || options.outputMode === "report_and_script";
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
    if (needsTechnical(effectiveMode, options.outputMode, coin.symbol)) {
      await updateJob(jobId, "analyzing", "テクニカル分析を実行中...");
      const ctx = coin.symbol === "BTC" ? await loadExternalContext() : null;
      technical = runTechnicalAnalysis(
        collectedData,
        ctx?.usedConcepts ?? [],
        planning.tradingBias
      );

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

    let reportMd = "";
    let reportJson: object = {};

    if (includeReport || includeScript) {
      await updateJob(jobId, "report_generating", "レポートを生成中...");

      const includeFundamentals =
        effectiveMode === "fundamentals" || effectiveMode === "both";

      if (includeFundamentals) {
        reportMd = await generateCoinReportMarkdown(collected, technical, planning);
      } else if (coin.symbol === "BTC" && technical) {
        const ctx = await loadExternalContext(options.scriptNumber);
        const result = await generateReport(
          collectedData,
          technical,
          ctx.previousScript
        );
        reportMd = result.markdown;
        reportJson = result.json as object;
      } else {
        reportMd = await generateCoinReportMarkdown(collected, technical, planning);
      }

      if (coin.symbol === "BTC" && technical && includeScript) {
        const ctx = await loadExternalContext(options.scriptNumber);
        const result = await generateReport(
          collectedData,
          technical,
          ctx.previousScript
        );
        reportJson = result.json as object;
      } else if (!reportJson || Object.keys(reportJson).length === 0) {
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
    }

    if (includeReport && !includeScript) {
      await exportCoinReport(jobId, coin.symbol, reportMd);
      await prisma.researchJob.update({
        where: { id: jobId },
        data: {
          status: "report_ready",
          stepMessage: "レポート完成",
          completedAt: new Date().toISOString(),
        },
      });
      return;
    }

    if (includeScript) {
      await updateJob(jobId, "script_generating", "台本を生成中...");
      const num =
        coin.symbol === "BTC"
          ? (options.scriptNumber ?? (await getNextScriptNumber()))
          : null;

      let scriptMd: string;
      let episodeUsed: string;
      let conceptUsed: string;
      let validation;

      if (coin.symbol === "BTC" && technical && num !== null) {
        const btcScriptNumber = num;
        const ctx = await loadExternalContext(btcScriptNumber);
        const result = await generateScript(
          reportJson as import("@/lib/types").ReportJson,
          reportMd,
          ctx,
          btcScriptNumber
        );
        scriptMd = result.markdown;
        episodeUsed = result.episodeUsed;
        conceptUsed = result.conceptUsed;
        validation = validateScript(
          scriptMd,
          reportJson as import("@/lib/types").ReportJson,
          episodeUsed,
          ctx.usedEpisodes
        );

        await prisma.researchJob.update({
          where: { id: jobId },
          data: { scriptNumber: btcScriptNumber },
        });

        const scriptFilename = `台本${btcScriptNumber}_${coin.symbol}分析_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.md`;
        await prisma.scriptHistory.upsert({
          where: { scriptNumber: btcScriptNumber },
          create: {
            scriptNumber: btcScriptNumber,
            filename: scriptFilename,
            conceptUsed,
            episodeUsed,
            keyLevels: (reportJson as import("@/lib/types").ReportJson).technical
              ?.keyLevels as object ?? {},
            content: scriptMd.slice(0, 50000),
            publishedAt: new Date().toISOString(),
          },
          update: {
            filename: scriptFilename,
            conceptUsed,
            episodeUsed,
            content: scriptMd.slice(0, 50000),
            publishedAt: new Date().toISOString(),
          },
        });

        await exportArtifacts(jobId, reportMd, scriptMd, btcScriptNumber);
      } else {
        const result = generateCoinScriptMarkdown({
          coin,
          reportMarkdown: reportMd,
          technical,
          researchMode: options.researchMode,
          planning,
        });
        scriptMd = result.markdown;
        episodeUsed = result.episodeUsed;
        conceptUsed = result.conceptUsed;
        validation = {
          passed: true,
          checks: [{ id: "coin_script", label: "コイン台本生成", passed: true }],
          charCount: scriptMd.replace(/\s/g, "").length,
          ngWords: [],
        };
        await exportCoinReport(jobId, coin.symbol, reportMd);
      }

      await prisma.script.create({
        data: {
          jobId,
          markdown: scriptMd,
          episodeUsed,
          conceptUsed,
          validation: validation as object,
          charCount: validation.charCount,
        },
      });

      await prisma.researchJob.update({
        where: { id: jobId },
        data: {
          status: "script_ready",
          stepMessage: "完了",
          completedAt: new Date().toISOString(),
        },
      });
    }
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
