import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const job = await prisma.researchJob.findUnique({
    where: { id },
    include: {
      report: true,
      script: true,
      snapshots: true,
      sources: { take: 20 },
    },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found" }, { status: 404 });
  }

  return NextResponse.json(job);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = (await request.json()) as {
    reportMarkdown?: string;
    scriptMarkdown?: string;
  };

  if (body.reportMarkdown) {
    await prisma.report.update({
      where: { jobId: id },
      data: { markdown: body.reportMarkdown },
    });
  }

  if (body.scriptMarkdown) {
    const script = await prisma.script.findUnique({ where: { jobId: id } });
    if (script) {
      await prisma.script.update({
        where: { jobId: id },
        data: {
          markdown: body.scriptMarkdown,
          charCount: body.scriptMarkdown.replace(/\s/g, "").length,
        },
      });
    }
  }

  const job = await prisma.researchJob.findUnique({
    where: { id },
    include: { report: true, script: true },
  });

  return NextResponse.json(job);
}
