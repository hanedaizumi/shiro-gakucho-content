import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { runResearchPipeline } from "@/lib/jobs/research-pipeline";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      manualXPosts?: string;
      scriptNumber?: number;
    };

    const job = await prisma.researchJob.create({
      data: {
        status: "pending",
        stepMessage: "ジョブを開始しています...",
        manualXPosts: body.manualXPosts ?? null,
        scriptNumber: body.scriptNumber ?? null,
      },
    });

    // Run pipeline in background (non-blocking for response)
    runResearchPipeline(job.id, {
      manualXPosts: body.manualXPosts,
      scriptNumber: body.scriptNumber,
    }).catch(console.error);

    return NextResponse.json({ jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
