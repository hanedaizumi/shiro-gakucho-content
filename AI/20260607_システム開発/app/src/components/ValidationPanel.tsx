"use client";

interface Check {
  id: string;
  label: string;
  passed: boolean;
  message?: string;
}

interface ValidationPanelProps {
  validation: {
    passed: boolean;
    checks: Check[];
    charCount: number;
    ngWords: string[];
  } | null;
}

export function ValidationPanel({ validation }: ValidationPanelProps) {
  if (!validation) return null;

  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold">4施策チェックリスト</h3>
        <span
          className={`text-sm font-medium ${
            validation.passed ? "text-[var(--success)]" : "text-[var(--danger)]"
          }`}
        >
          {validation.passed ? "全項目OK" : "要確認あり"}
        </span>
      </div>
      <ul className="space-y-1">
        {validation.checks.map((c) => (
          <li key={c.id} className="flex items-start gap-2 text-sm">
            <span className={c.passed ? "text-[var(--success)]" : "text-[var(--danger)]"}>
              {c.passed ? "✓" : "✗"}
            </span>
            <span>
              {c.label}
              {c.message && (
                <span className="text-[var(--muted)]"> — {c.message}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
