import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runUnifiedPipeline } from "@/lib/jobs/unified-pipeline";
import type { CoinResearchMode } from "@/lib/store/types";

const VALID_MODES: CoinResearchMode[] = ["fundamentals", "technical", "both"];

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      coinInput?: string;
      thumbnailText?: string;
      titleText?: string;
      storyHypothesis?: string;
      tradingBias?: "bullish" | "bearish" | "neutral";
      researchMode?: CoinResearchMode;
      scriptNumber?: number;
      previousScriptText?: string;
    };

    if (!body.coinInput?.trim()) {
      return NextResponse.json({ error: "コイン名を入力してください" }, { status: 400 });
    }

    const researchMode = body.researchMode ?? "both";

    if (!VALID_MODES.includes(researchMode)) {
      return NextResponse.json({ error: "無効なリサーチ種別です" }, { status: 400 });
    }

    // 台本作成機能は廃止。常にレポートのみ出力する
    const outputMode = "report" as const;

    const job = await prisma.researchJob.create({
      data: {
        jobType: "unified_research",
        status: "pending",
        stepMessage: "ジョブを開始しています...",
        researchMode,
        outputMode,
        scriptNumber: body.scriptNumber ?? null,
        thumbnailText: body.thumbnailText?.trim() || null,
        titleText: body.titleText?.trim() || null,
        storyHypothesis: body.storyHypothesis?.trim() || null,
      },
    });

    runUnifiedPipeline(job.id, {
      coinInput: body.coinInput.trim(),
      thumbnailText: body.thumbnailText?.trim(),
      titleText: body.titleText?.trim(),
      storyHypothesis: body.storyHypothesis?.trim(),
      tradingBias: body.tradingBias ?? "neutral",
      researchMode,
      outputMode,
      scriptNumber: body.scriptNumber,
      previousScriptText: body.previousScriptText?.trim(),
    }).catch(console.error);

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
