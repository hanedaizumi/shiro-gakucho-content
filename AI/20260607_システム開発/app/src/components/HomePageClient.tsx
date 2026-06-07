"use client";

import ResearchForm from "@/components/ResearchForm";
import { JobList } from "@/components/JobList";

export default function HomePageClient() {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-1 text-lg font-semibold">リサーチ＆生成</h2>
        <p className="mb-5 text-xs text-[var(--muted)]">
          コイン名 → リサーチ種別 → 出力形式を選んで生成
        </p>
        <ResearchForm />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-4 text-lg font-semibold">生成履歴</h2>
        <JobList />
      </div>
    </div>
  );
}
