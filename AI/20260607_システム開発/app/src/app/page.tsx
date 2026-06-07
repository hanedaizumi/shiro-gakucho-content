import { PriceCard } from "@/components/PriceCard";
import { GenerateForm } from "@/components/GenerateForm";
import { JobList } from "@/components/JobList";

export default function HomePage() {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      <div className="space-y-6">
        <PriceCard />
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
          <h2 className="mb-4 text-lg font-semibold">新規生成</h2>
          <GenerateForm />
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h2 className="mb-4 text-lg font-semibold">生成履歴</h2>
        <JobList />
      </div>
    </div>
  );
}
