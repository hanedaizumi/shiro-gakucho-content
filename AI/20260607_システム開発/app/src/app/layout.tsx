import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "シロ学長 リサーチ＆台本ジェネレーター",
  description: "BTC台本生成・コイン別リサーチレポートを自動作成",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen antialiased">
        <header className="border-b border-[var(--border)] bg-[var(--surface)]">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div>
              <h1 className="text-lg font-bold text-[var(--accent)]">
                シロ学長 リサーチ＆台本ジェネレーター
              </h1>
              <p className="text-xs text-[var(--muted)]">
                BTC台本生成 ／ コイン別リサーチレポート
              </p>
            </div>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="text-[var(--muted)] hover:text-white">
                ダッシュボード
              </Link>
              <Link href="/settings" className="text-[var(--muted)] hover:text-white">
                設定
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
      </body>
    </html>
  );
}
