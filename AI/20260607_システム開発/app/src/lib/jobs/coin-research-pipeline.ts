import { prisma } from "@/lib/db";
import type { JobStatus } from "@/lib/store/types";
import { resolveCoinInput } from "@/lib/coins/resolver";
import {
  collectCoinData,
  type CoinResearchMode,
} from "@/lib/collectors/coin-data";
import { runTechnicalAnalysis } from "@/lib/analysis";
import { generateCoinReportMarkdown } from "@/lib/llm/coin-report-generator";
import { exportCoinReport } from "@/lib/export";
import type { CollectedData } from "@/lib/collectors";
import { normalizePlanning } from "@/lib/planning/context";

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

function toCollectedData(coinData: Awaited<ReturnType<typeof collectCoinData>>): CollectedData {
  return {
    binance: coinData.binance,
    cmc: coinData.cmc,
    news: coinData.news,
    youtube: coinData.youtube,
    youtubeAnalysis: coinData.youtubeAnalysis,
    youtubeConsensus: coinData.youtubeConsensus,
  };
}

export async function runCoinResearchPipeline(
  jobId: string,
  options: { coinInput: string; mode: CoinResearchMode }
) {
  try {
    const coin = resolveCoinInput(options.coinInput);

    await prisma.researchJob.update({
      where: { id: jobId },
      data: {
        coinSymbol: coin.symbol,
        coinName: coin.name,
        researchMode: options.mode,
      },
    });

    await updateJob(jobId, "collecting", `${coin.name}（${coin.symbol}）のデータを収集中...`);
    const planning = normalizePlanning({});
    const collected = await collectCoinData(coin, options.mode, planning);

    await prisma.sourceDocument.createMany({
      data: [
        {
          jobId,
          type: "coin",
          title: `${coin.symbol} research`,
          content: JSON.stringify({
            coin,
            mode: options.mode,
            newsCount: collected.news.length,
            youtubeCount: collected.youtube.length,
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
    if (options.mode === "technical" || options.mode === "both") {
      await updateJob(jobId, "analyzing", "テクニカル分析を実行中...");
      technical = runTechnicalAnalysis(toCollectedData(collected), []);

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

    await updateJob(jobId, "report_generating", "リサーチレポートを生成中...");
    const reportMd = await generateCoinReportMarkdown(collected, technical, planning);

    await prisma.report.create({
      data: {
        jobId,
        markdown: reportMd,
        json: {
          coin,
          mode: options.mode,
          technical,
          newsCount: collected.news.length,
          youtubeCount: collected.youtube.length,
        },
      },
    });

    await exportCoinReport(jobId, coin.symbol, reportMd);

    await prisma.researchJob.update({
      where: { id: jobId },
      data: {
        status: "report_ready",
        stepMessage: "リサーチ完了",
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
