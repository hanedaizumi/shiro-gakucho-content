import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runUnifiedPipeline } from "@/lib/jobs/unified-pipeline";
import type { CoinResearchMode, OutputMode } from "@/lib/store/types";

const VALID_MODES: CoinResearchMode[] = ["fundamentals", "technical", "both"];
const VALID_OUTPUTS: OutputMode[] = ["report", "script", "report_and_script"];

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      coinInput?: string;
      thumbnailText?: string;
      titleText?: string;
      researchMode?: CoinResearchMode;
      outputMode?: OutputMode;
      scriptNumber?: number;
    };

    if (!body.coinInput?.trim()) {
      return NextResponse.json({ error: "コイン名を入力してください" }, { status: 400 });
    }

    const researchMode = body.researchMode ?? "both";
    const outputMode = body.outputMode ?? "report_and_script";

    if (!VALID_MODES.includes(researchMode)) {
      return NextResponse.json({ error: "無効なリサーチ種別です" }, { status: 400 });
    }
    if (!VALID_OUTPUTS.includes(outputMode)) {
      return NextResponse.json({ error: "無効な出力形式です" }, { status: 400 });
    }

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
      },
    });

    runUnifiedPipeline(job.id, {
      coinInput: body.coinInput.trim(),
      thumbnailText: body.thumbnailText?.trim(),
      titleText: body.titleText?.trim(),
      researchMode,
      outputMode,
      scriptNumber: body.scriptNumber,
    }).catch(console.error);

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
