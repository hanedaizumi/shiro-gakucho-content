# BTC市況リサーチ → 台本自動生成システム

シロ学長テクニカルチャンネル向け。Binance等からBTC市況を収集し、分析レポートとYouTube台本（台本⑤形式）をワンクリック生成するWebアプリ。

## クイックスタート

### Windows（Docker不要・推奨）

PowerShell で以下を実行してからブラウザで http://localhost:3000 を開く:

```powershell
cd "AI\20260607_システム開発\scripts"
.\start-dev.ps1
```

初回は `npm install` と DB 初期化を自動実行します。`Ctrl+C` で停止。

> **重要:** `localhost:3000` はサーバー起動中のみ有効です。リンクだけ開いても `Connection Failed` になります。

### WSL + Docker（PostgreSQL使用時）

```bash
cd 20260607_システム開発
docker compose up -d
cd app
cp .env.example .env
# DATABASE_URL を PostgreSQL に変更し schema.prisma の provider も postgresql に
npm install
npx prisma migrate deploy
npm run dev
```

## 使い方

1. ダッシュボードで「今日のBTC分析を生成」をクリック
2. 進捗画面でレポート・台本の生成を待つ（2〜5分）
3. 台本をプレビュー・編集・ダウンロード
4. 出力先: `output/reports/` と `output/scripts/`

## データソース

| Tier | ソース | 条件 |
|---|---|---|
| 1 | Binance API | 常時 |
| 1 | ニュースRSS | 常時 |
| 2 | CoinMarketCap | APIキー |
| 2 | YouTube Data API | APIキー |
| 2 | X API | トークン（未設定時は手動ペースト） |

## ディレクトリ構成

```
20260607_システム開発/
├── app/              # Next.js アプリ
├── output/           # 生成物エクスポート
├── prompts/          # LLMプロンプト
├── docker-compose.yml
└── README.md
```

## 外部参照

`TECHNICAL_WORKSPACE_PATH` でシロ学長テクニカルフォルダを指定すると、以下を自動読み込み:

- `persona_technical.md`
- `00_チャンネル設計前提.md`
- `script-creation` SKILL
- 過去台本（前回予測照合・概念被り防止）

詳細は [02_未決定事項_確定.md](./02_未決定事項_確定.md) を参照。
