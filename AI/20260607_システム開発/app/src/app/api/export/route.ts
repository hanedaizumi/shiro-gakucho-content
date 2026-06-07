import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const jobId = searchParams.get("jobId");
  const type = searchParams.get("type") ?? "script";

  if (!jobId) {
    return NextResponse.json({ error: "jobId required" }, { status: 400 });
  }

  const job = await prisma.researchJob.findUnique({
    where: { id: jobId },
    include: { report: true, script: true },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  const content =
    type === "report" ? job.report?.markdown : job.script?.markdown;

  if (!content) {
    return NextResponse.json({ error: "Content not ready" }, { status: 404 });
  }

  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");
  const filename =
    type === "report"
      ? `report_${date}.md`
      : `台本${job.scriptNumber ?? "X"}_BTC分析_${date}.md`;

  return new NextResponse(content, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
