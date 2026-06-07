import { SyncHistoryButton } from "@/components/SyncHistoryButton";
import { YouTubeChannelSettings } from "@/components/YouTubeChannelSettings";

export default function SettingsPage() {
  const envVars = [
    { key: "DATABASE_URL", required: true },
    { key: "LLM_PROVIDER", required: true, default: "openai" },
    { key: "OPENAI_API_KEY", required: false },
    { key: "COINMARKETCAP_API_KEY", required: false },
    { key: "YOUTUBE_API_KEY", required: false },
    { key: "YOUTUBE_API_KEY_FALLBACK", required: false },
    { key: "TECHNICAL_WORKSPACE_PATH", required: false },
    { key: "TECHNICAL_OUTPUT_PATH", required: false },
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <h2 className="text-xl font-bold">設定</h2>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="mb-3 font-semibold">環境変数（.env）</h3>
        <p className="mb-4 text-sm text-[var(--muted)]">
          APIキーは <code className="text-[var(--accent)]">app/.env</code> に設定してください。
          台本・レポート・コインリサーチはAPIキーなしでも基本動作します。
          YouTube競合分析・CoinMarketCap詳細には各APIキーが必要です。
          設定後は開発サーバーを再起動してください。
        </p>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[var(--border)] text-left text-[var(--muted)]">
              <th className="py-2">変数名</th>
              <th className="py-2">必須</th>
            </tr>
          </thead>
          <tbody>
            {envVars.map((v) => (
              <tr key={v.key} className="border-b border-[var(--border)]">
                <td className="py-2 font-mono text-xs">{v.key}</td>
                <td className="py-2">{v.required ? "必須" : "任意"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="mb-3 font-semibold">YouTube ウォッチチャンネル</h3>
        <YouTubeChannelSettings />
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="mb-3 font-semibold">データソース</h3>
        <ul className="space-y-2 text-sm text-[var(--muted)]">
          <li>Tier 1: Binance API（価格・OHLCV）— 常時有効</li>
          <li>Tier 1: ニュースRSS（CoinDesk, Cointelegraph）— 常時有効</li>
          <li>Tier 2: CoinMarketCap — APIキー設定時</li>
          <li>Tier 2: YouTube Data API — APIキー設定時</li>
        </ul>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6">
        <h3 className="mb-3 font-semibold">外部参照パス</h3>
        <p className="text-sm text-[var(--muted)]">
          デフォルト: <code>../../../シロ学長テクニカル</code>
          <br />
          persona_technical.md、過去台本、script-creation SKILL を自動読み込み
        </p>
        <div className="mt-4">
          <SyncHistoryButton />
        </div>
      </div>
    </div>
  );
}
