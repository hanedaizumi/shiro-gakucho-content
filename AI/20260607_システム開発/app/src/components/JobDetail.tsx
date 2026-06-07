"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ValidationPanel } from "./ValidationPanel";

interface JobData {
  id: string;
  jobType?: string;
  status: string;
  stepMessage: string | null;
  errorMessage: string | null;
  scriptNumber: number | null;
  coinSymbol?: string | null;
  coinName?: string | null;
  researchMode?: string | null;
  outputMode?: string | null;
  report?: { markdown: string } | null;
  script?: {
    markdown: string;
    validation?: {
      passed: boolean;
      checks: Array<{ id: string; label: string; passed: boolean; message?: string }>;
      charCount: number;
      ngWords: string[];
    } | null;
  } | null;
}

const ALL_STEPS = [
  "collecting",
  "analyzing",
  "report_generating",
  "report_ready",
  "script_generating",
  "script_ready",
];

const MODE_LABELS: Record<string, string> = {
  fundamentals: "ファンダ",
  technical: "テクニカル",
  both: "両方",
};

const OUTPUT_LABELS: Record<string, string> = {
  report: "レポート",
  script: "台本",
  report_and_script: "レポート＆台本",
};

function jobTitle(job: JobData): string {
  const coin = job.coinName
    ? `${job.coinName}（${job.coinSymbol ?? ""}）`
    : job.scriptNumber
      ? `台本${job.scriptNumber}`
      : "生成ジョブ";
  const mode = job.researchMode ? MODE_LABELS[job.researchMode] ?? "" : "";
  const output = job.outputMode ? OUTPUT_LABELS[job.outputMode] ?? "" : "";
  return [coin, mode, output].filter(Boolean).join(" — ");
}

export function JobDetail({ jobId }: { jobId: string }) {
  const router = useRouter();
  const [job, setJob] = useState<JobData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"report" | "script">("report");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const showReport =
    job?.outputMode !== "script" && !!job?.report?.markdown;
  const showScript =
    job?.outputMode !== "report" && !!job?.script?.markdown;

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error ?? `HTTP ${res.status}`);
    }
    const data = await res.json();
    setLoadError(null);
    setJob(data);
    return data as JobData;
  }, [jobId]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const data = await fetchJob();
        if (!mounted) return;

        const preferScript = data.outputMode === "script" && data.script?.markdown;
        const preferReport = data.outputMode === "report" && data.report?.markdown;

        if (preferScript) {
          setActiveTab("script");
          setEditContent(data.script!.markdown);
        } else if (preferReport) {
          setActiveTab("report");
          setEditContent(data.report!.markdown);
        } else if (data.script?.markdown) {
          setActiveTab("script");
          setEditContent(data.script.markdown);
        } else if (data.report?.markdown) {
          setActiveTab("report");
          setEditContent(data.report.markdown);
        }
      } catch (err) {
        if (mounted) {
          setLoadError(err instanceof Error ? err.message : "読み込みに失敗しました");
        }
      }
    }

    load();

    const interval = setInterval(() => {
      fetchJob().catch(() => {});
    }, 2000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, [fetchJob]);

  async function handleSave() {
    setSaving(true);
    await fetch(`/api/jobs/${jobId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        [activeTab === "report" ? "reportMarkdown" : "scriptMarkdown"]: editContent,
      }),
    });
    await fetchJob();
    setSaving(false);
  }

  async function handleDelete() {
    const label = job ? jobTitle(job) : "このジョブ";
    if (!confirm(`${label}を削除しますか？`)) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, { method: "DELETE" });
      if (!res.ok) {
        alert("削除に失敗しました");
        return;
      }
      router.push("/");
      router.refresh();
    } finally {
      setDeleting(false);
    }
  }

  if (loadError) {
    return (
      <div className="rounded-xl border border-[var(--danger)] bg-[var(--surface)] p-6">
        <p className="text-[var(--danger)]">エラー: {loadError}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-4 text-sm text-[var(--accent)] hover:underline"
        >
          ダッシュボードに戻る
        </button>
      </div>
    );
  }

  if (!job) {
    return <p className="text-[var(--muted)]">読み込み中...</p>;
  }

  const stepIndex = ALL_STEPS.indexOf(job.status);
  const isComplete =
    job.status === "script_ready" ||
    (job.status === "report_ready" && job.outputMode === "report");
  const hasContent = activeTab === "report" ? showReport : showScript;

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">{jobTitle(job)}</h2>
            <p className="text-sm text-[var(--muted)]">{job.stepMessage}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDelete}
              disabled={deleting}
              className="rounded-lg border border-[var(--danger)] px-3 py-1 text-sm text-[var(--danger)] hover:bg-red-900/20 disabled:opacity-50"
            >
              {deleting ? "削除中..." : "削除"}
            </button>
            <span
              className={`rounded-full px-3 py-1 text-sm font-medium ${
                isComplete
                  ? "bg-green-900/50 text-green-400"
                  : job.status === "failed"
                    ? "bg-red-900/50 text-red-400"
                    : "bg-amber-900/50 text-amber-400"
              }`}
            >
              {job.status}
            </span>
          </div>
        </div>

        {!isComplete && job.status !== "failed" && (
          <div className="mt-4 flex gap-1">
            {ALL_STEPS.map((s, i) => (
              <div
                key={s}
                className={`h-1 flex-1 rounded ${
                  i <= stepIndex ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                }`}
              />
            ))}
          </div>
        )}

        {job.errorMessage && (
          <p className="mt-4 text-sm text-[var(--danger)]">{job.errorMessage}</p>
        )}
      </div>

      {job.script?.validation && activeTab === "script" && showScript && (
        <ValidationPanel validation={job.script.validation} />
      )}

      {(showReport || showScript) && (
        <>
          {showReport && showScript && (
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setActiveTab("report");
                  setEditContent(job.report?.markdown ?? "");
                }}
                className={`rounded-lg px-4 py-2 text-sm ${
                  activeTab === "report"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--surface)] text-[var(--muted)]"
                }`}
              >
                レポート
              </button>
              <button
                onClick={() => {
                  setActiveTab("script");
                  setEditContent(job.script?.markdown ?? "");
                }}
                className={`rounded-lg px-4 py-2 text-sm ${
                  activeTab === "script"
                    ? "bg-[var(--accent)] text-black"
                    : "bg-[var(--surface)] text-[var(--muted)]"
                }`}
              >
                台本
              </button>
            </div>
          )}

          {hasContent && (
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              rows={24}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 font-mono text-sm leading-relaxed"
            />
          )}

          {hasContent && (
            <div className="flex gap-3">
              <button
                onClick={handleSave}
                disabled={saving}
                className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-sm hover:border-[var(--accent)]"
              >
                {saving ? "保存中..." : "保存"}
              </button>
              <a
                href={`/api/export?jobId=${jobId}&type=${activeTab}`}
                className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-medium text-black"
              >
                Markdownダウンロード
              </a>
            </div>
          )}
        </>
      )}
    </div>
  );
}
