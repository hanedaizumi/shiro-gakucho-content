"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Job {
  id: string;
  status: string;
  stepMessage: string | null;
  scriptNumber: number | null;
  startedAt: string;
  completedAt: string | null;
  script?: { charCount: number } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "待機中",
  collecting: "データ収集",
  analyzing: "分析中",
  report_generating: "レポート生成",
  report_ready: "レポート完成",
  script_generating: "台本生成",
  script_ready: "完了",
  failed: "失敗",
};

export function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);

  useEffect(() => {
    fetch("/api/jobs")
      .then((r) => r.json())
      .then(setJobs)
      .catch(() => {});
  }, []);

  if (jobs.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)]">まだ生成履歴がありません</p>
    );
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <Link
          key={job.id}
          href={`/jobs/${job.id}`}
          className="flex items-center justify-between rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-3 transition hover:border-[var(--accent)]"
        >
          <div>
            <p className="text-sm font-medium">
              {job.scriptNumber ? `台本${job.scriptNumber}` : "生成ジョブ"}
            </p>
            <p className="text-xs text-[var(--muted)]">
              {new Date(job.startedAt).toLocaleString("ja-JP")}
            </p>
          </div>
          <div className="text-right">
            <span
              className={`text-xs font-medium ${
                job.status === "script_ready"
                  ? "text-[var(--success)]"
                  : job.status === "failed"
                    ? "text-[var(--danger)]"
                    : "text-[var(--accent)]"
              }`}
            >
              {STATUS_LABELS[job.status] ?? job.status}
            </span>
            {job.script?.charCount && (
              <p className="text-xs text-[var(--muted)]">
                {job.script.charCount}文字
              </p>
            )}
          </div>
        </Link>
      ))}
    </div>
  );
}
