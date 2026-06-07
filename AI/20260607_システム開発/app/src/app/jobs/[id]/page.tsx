import { JobDetail } from "@/components/JobDetail";
import Link from "next/link";

export default async function JobPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

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
