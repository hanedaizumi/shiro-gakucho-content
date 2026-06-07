import { prisma } from "@/lib/db";
import type { JobStatus } from "@/lib/store/types";
import { collectAllData } from "@/lib/collectors";
import { runTechnicalAnalysis } from "@/lib/analysis";
import { generateReport } from "@/lib/llm/report-generator";
import { generateScript } from "@/lib/llm/script-generator";
import { validateScript } from "@/lib/validators/script-validator";
import {
  loadExternalContext,
  getNextScriptNumber,
  syncScriptHistoryFromFiles,
} from "@/lib/external-refs/loader";
import { exportArtifacts } from "@/lib/export";

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

export async function runResearchPipeline(
  jobId: string,
  options?: { manualXPosts?: string; scriptNumber?: number }
) {
  try {
    await syncScriptHistoryFromFiles();

    await updateJob(jobId, "collecting", "市況データを収集中...");
    const collected = await collectAllData({
      manualXPosts: options?.manualXPosts,
    });

    // Save source documents
    await prisma.sourceDocument.createMany({
      data: [
        {
          jobId,
          type: "binance",
          title: "Binance BTC/USDT",
          content: JSON.stringify(collected.binance),
        },
        ...(collected.cmc
          ? [{
              jobId,
              type: "coinmarketcap",
              title: "CoinMarketCap",
              content: JSON.stringify(collected.cmc),
            }]
          : []),
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
          content: `${v.channelTitle}: ${v.description}`,
        })),
        ...collected.xPosts.map((p) => ({
          jobId,
          type: "x",
          title: p.author,
          url: p.url,
          content: p.text,
        })),
      ],
    });

    await updateJob(jobId, "analyzing", "テクニカル分析を実行中...");
    const ctx = await loadExternalContext();
    const technical = runTechnicalAnalysis(collected, ctx.usedConcepts);

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
        {
          jobId,
          timeframe: "4h",
          price: technical.currentPrice,
          rsi: technical.rsi4h,
          rawJson: collected.binance.candles.h4.slice(-30),
        },
      ],
    });

    await updateJob(jobId, "report_generating", "レポートを生成中...");
    const { markdown: reportMd, json: reportJson } = await generateReport(
      collected,
      technical,
      ctx.previousPrediction
    );

    await prisma.report.create({
      data: {
        jobId,
        markdown: reportMd,
        json: reportJson as object,
      },
    });

    await updateJob(jobId, "report_ready", "レポート完成。台本を生成中...");

    const scriptNumber = options?.scriptNumber ?? (await getNextScriptNumber());

    await updateJob(jobId, "script_generating", "台本を生成中...", {
      scriptNumber,
    });

    const { markdown: scriptMd, episodeUsed, conceptUsed } = await generateScript(
      reportJson,
      reportMd,
      ctx,
      scriptNumber
    );

    const validation = validateScript(
      scriptMd,
      reportJson,
      episodeUsed,
      ctx.usedEpisodes
    );

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

    const scriptFilename = `台本${scriptNumber}_BTC分析_${new Date().toISOString().split("T")[0].replace(/-/g, "")}.md`;
    await prisma.scriptHistory.upsert({
      where: { scriptNumber },
      create: {
        scriptNumber,
        filename: scriptFilename,
        conceptUsed,
        episodeUsed,
        keyLevels: reportJson.technical.keyLevels as object,
        content: scriptMd.slice(0, 50000),
        publishedAt: new Date(),
      },
      update: {
        filename: scriptFilename,
        conceptUsed,
        episodeUsed,
        keyLevels: reportJson.technical.keyLevels as object,
        content: scriptMd.slice(0, 50000),
        publishedAt: new Date(),
      },
    });

    await exportArtifacts(jobId, reportMd, scriptMd, scriptNumber);

    await prisma.researchJob.update({
      where: { id: jobId },
      data: {
        status: "script_ready",
        stepMessage: "完了",
        completedAt: new Date(),
        scriptNumber,
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
        completedAt: new Date(),
      },
    });
    throw error;
  }
}
