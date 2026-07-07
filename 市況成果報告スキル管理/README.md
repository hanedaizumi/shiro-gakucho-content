# 市況・成果報告 スキル管理

Cursor上で運用している以下3タスクの「スキル（SKILL.md）」「ルール（.mdc）」を1か所にまとめたフォルダです。

- 特別市況（Discord向け・シロ学長ワークスペース）
- リアルタイム市況（もえワークスペース）
- 成果報告（Discord/YouTube/X向け・シロ学長ワークスペース）

## フォルダ構成

```
市況成果報告スキル管理/
├── 共通ペルソナ/
│   ├── shiro-persona.mdc      … シロ学長の共通ペルソナ（特別市況・成果報告・リアルタイム市況X版で使用）
│   └── moe-persona.mdc        … もえの共通ペルソナ（リアルタイム市況本体で使用）
├── 特別市況/
│   ├── SKILL.md                … 特別市況解説作成スキル
│   └── discord-special-market.mdc … 特別市況の出力体裁・確定ルール
├── リアルタイム市況/
│   ├── SKILL.md                … リアルタイム市況作成スキル
│   └── realtime-market.mdc     … リアルタイム市況の出力体裁・確定ルール
└── 成果報告/
    ├── SKILL.md                … 成果報告作成スキル（Discord/YouTube/X）
    ├── results-format-preferences.mdc … 成果金額行フォーマット等
    └── youtube-x-plain-format.mdc     … YouTube/X（プレーン）とDiscord（マークダウン）の出し分け
```

## 元ファイルの場所（同期用）

実際にCursorが読み込んでいるのは以下のパスです。ルールを更新する際は、**元のパスとこのフォルダの両方**を更新してください（このフォルダは元ファイルのコピーであり、シンボリックリンクではありません）。

| ファイル | 元のパス |
|---|---|
| 特別市況 SKILL.md | `Cursor(シロ学長)/.cursor/skills/discord-market/SKILL.md` |
| discord-special-market.mdc | `Cursor(シロ学長)/.cursor/rules/discord-special-market.mdc` |
| リアルタイム市況 SKILL.md | `Cursor(もえ)/.cursor/skills/realtime-market/SKILL.md` |
| realtime-market.mdc | `Cursor(もえ)/.cursor/rules/realtime-market.mdc` |
| 成果報告 SKILL.md | `Cursor(シロ学長)/.cursor/skills/discord-results/SKILL.md` |
| results-format-preferences.mdc | `Cursor(シロ学長)/.cursor/rules/results-format-preferences.mdc` |
| youtube-x-plain-format.mdc | `Cursor(シロ学長)/.cursor/rules/youtube-x-plain-format.mdc` |
| shiro-persona.mdc | `Cursor(シロ学長)/.cursor/rules/shiro-persona.mdc` |
| moe-persona.mdc | `Cursor(もえ)/.cursor/rules/moe-persona.mdc` |

最終更新日：2026/7/7
