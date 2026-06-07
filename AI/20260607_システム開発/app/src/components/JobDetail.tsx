"use client";

import { useCallback, useEffect, useState } from "react";
import { ValidationPanel } from "./ValidationPanel";

interface JobData {
  id: string;
  status: string;
  stepMessage: string | null;
  errorMessage: string | null;
  scriptNumber: number | null;
  report?: { markdown: string } | null;
  script?: {
    markdown: string;
    validation: {
      passed: boolean;
      checks: Array<{ id: string; label: string; passed: boolean; message?: string }>;
      charCount: number;
      ngWords: string[];
    };
  } | null;
}

const STEPS = [
  "collecting",
  "analyzing",
  "report_generating",
  "report_ready",
  "script_generating",
  "script_ready",
];

export function JobDetail({ jobId }: { jobId: string }) {
  const [job, setJob] = useState<JobData | null>(null);
  const [activeTab, setActiveTab] = useState<"report" | "script">("script");
  const [editContent, setEditContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchJob = useCallback(async () => {
    const res = await fetch(`/api/jobs/${jobId}`);
    const data = await res.json();
    setJob(data);
    return data as JobData;
  }, [jobId]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const data = await fetchJob();
      if (!mounted) return;
      if (data.script?.markdown) {
        setEditContent((prev) => prev || data.script!.markdown);
      } else if (data.report?.markdown) {
        setEditContent((prev) => prev || data.report!.markdown);
      }
    }

    load();

    const interval = setInterval(async () => {
      const data = await fetchJob();
      if (!mounted) return;
      if (
        data.status !== "script_ready" &&
        data.status !== "failed" &&
        data.script?.markdown
      ) {
        setEditContent(data.script.markdown);
      }
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

  if (!job) {
    return <p className="text-[var(--muted)]">読み込み中...</p>;
  }

  const stepIndex = STEPS.indexOf(job.status);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">
              {job.scriptNumber ? `台本${job.scriptNumber}` : "生成ジョブ"}
            </h2>
            <p className="text-sm text-[var(--muted)]">{job.stepMessage}</p>
          </div>
          <span
            className={`rounded-full px-3 py-1 text-sm font-medium ${
              job.status === "script_ready"
                ? "bg-green-900/50 text-green-400"
                : job.status === "failed"
                  ? "bg-red-900/50 text-red-400"
                  : "bg-amber-900/50 text-amber-400"
            }`}
          >
            {job.status}
          </span>
        </div>

        {job.status !== "failed" && job.status !== "script_ready" && (
          <div className="mt-4 flex gap-1">
            {STEPS.map((s, i) => (
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

      {job.script?.validation && (
        <ValidationPanel validation={job.script.validation} />
      )}

      {(job.report || job.script) && (
        <>
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

          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            rows={24}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--bg)] p-4 font-mono text-sm leading-relaxed"
          />

          <div className="flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-lg bg-[var(--surface)] border border-[var(--border)] px-4 py-2 text-sm hover:border-[var(--accent)]"
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
        </>
      )}
    </div>
  );
}
