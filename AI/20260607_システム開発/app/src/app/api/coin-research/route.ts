import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runUnifiedPipeline } from "@/lib/jobs/unified-pipeline";
import type { CoinResearchMode } from "@/lib/store/types";

/** @deprecated /api/research を使用してください */
export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      coinInput?: string;
      mode?: CoinResearchMode;
    };

    if (!body.coinInput?.trim()) {
      return NextResponse.json({ error: "コイン名を入力してください" }, { status: 400 });
    }

    const job = await prisma.researchJob.create({
      data: {
        jobType: "unified_research",
        status: "pending",
        stepMessage: "ジョブを開始しています...",
        researchMode: body.mode ?? "both",
        outputMode: "report",
      },
    });

    runUnifiedPipeline(job.id, {
      coinInput: body.coinInput.trim(),
      researchMode: body.mode ?? "both",
      outputMode: "report",
    }).catch(console.error);

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
