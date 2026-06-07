"use client";

import { use } from "react";
import Link from "next/link";
import { JobDetail } from "@/components/JobDetail";

export default function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);

  return (
    <div>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-[var(--muted)] hover:text-white"
      >
        ← ダッシュボードに戻る
      </Link>
      <JobDetail jobId={id} />
    </div>
  );
}
