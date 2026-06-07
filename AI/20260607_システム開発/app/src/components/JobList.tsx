"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";

interface Job {
  id: string;
  jobType?: string;
  status: string;
  stepMessage: string | null;
  scriptNumber: number | null;
  coinSymbol?: string | null;
  coinName?: string | null;
  researchMode?: string | null;
  outputMode?: string | null;
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

const OUTPUT_LABELS: Record<string, string> = {
  report: "レポート",
  script: "台本",
  report_and_script: "両方",
};

function jobLabel(job: Job): string {
  const coin = job.coinName
    ? `${job.coinName}（${job.coinSymbol ?? ""}）`
    : job.scriptNumber
      ? `台本${job.scriptNumber}`
      : "生成ジョブ";
  const output = job.outputMode ? OUTPUT_LABELS[job.outputMode] ?? "" : "";
  return output ? `${coin} — ${output}` : coin;
}

function isDone(job: Job): boolean {
  return (
    job.status === "script_ready" ||
    (job.status === "report_ready" && job.outputMode === "report")
  );
}

export function JobList() {
  const [jobs, setJobs] = useState<Job[]>([]);

  const loadJobs = useCallback(async () => {
    const res = await fetch("/api/jobs");
    const data = await res.json();
    setJobs(Array.isArray(data) ? data : []);
  }, []);

  useEffect(() => {
    loadJobs().catch(() => {});
    const interval = setInterval(() => loadJobs().catch(() => {}), 3000);
    return () => clearInterval(interval);
  }, [loadJobs]);

  async function handleDelete(job: Job, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm(`${jobLabel(job)}を削除しますか？`)) return;

    const res = await fetch(`/api/jobs/${job.id}`, { method: "DELETE" });
    if (!res.ok) {
      alert("削除に失敗しました");
      return;
    }
    await loadJobs();
  }

  if (jobs.length === 0) {
    return <p className="text-sm text-[var(--muted)]">まだ生成履歴がありません</p>;
  }

  return (
    <div className="space-y-2">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="flex items-center gap-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] transition hover:border-[var(--accent)]"
        >
          <Link
            href={`/jobs/${job.id}`}
            className="flex flex-1 items-center justify-between px-4 py-3"
          >
            <div>
              <p className="text-sm font-medium">{jobLabel(job)}</p>
              <p className="text-xs text-[var(--muted)]">
                {new Date(job.startedAt).toLocaleString("ja-JP")}
              </p>
            </div>
            <div className="text-right">
              <span
                className={`text-xs font-medium ${
                  isDone(job)
                    ? "text-[var(--success)]"
                    : job.status === "failed"
                      ? "text-[var(--danger)]"
                      : "text-[var(--accent)]"
                }`}
              >
                {STATUS_LABELS[job.status] ?? job.status}
              </span>
              {job.script?.charCount ? (
                <p className="text-xs text-[var(--muted)]">{job.script.charCount}文字</p>
              ) : null}
            </div>
          </Link>
          <button
            onClick={(e) => handleDelete(job, e)}
            className="mr-3 rounded px-2 py-1 text-xs text-[var(--danger)] hover:bg-red-900/20"
            title="削除"
          >
            削除
          </button>
        </div>
      ))}
    </div>
  );
}
