import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const jobs = await prisma.researchJob.findMany({
    orderBy: { startedAt: "desc" },
    take: 20,
    include: {
      report: { select: { id: true } },
      script: { select: { id: true, charCount: true } },
    },
  });

  return NextResponse.json(jobs);
}
