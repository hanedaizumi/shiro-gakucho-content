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

## 自動同期について（2026/7/7〜）

上記9ファイルは、それぞれのワークスペースの `.cursor/rules/sync-skills-to-github.mdc` により、
**元ファイルが編集されたら自動でこのフォルダにも反映・コミット・pushされる**運用にしている。
（`Cursor(シロ学長)` 側：特別市況・成果報告・shiro-persona／`Cursor(もえ)` 側：リアルタイム市況・moe-persona）

## Cursor Mobile（スマホ）で実際に動かす場合の注意（2026/7/7〜）

**このフォルダ（`市況成果報告スキル管理/`）は人間が読むための「まとめ」であり、Cursor Mobile/クラウドエージェントはここを自動認識しない。**
Cursor Mobileでスキルを実行するには、以下の「機能用の配置場所」を使う（このリポジトリに追加済み）：

| 内容 | 機能用の配置場所 |
|---|---|
| 特別市況スキル | `Cursor(シロ学長)/.cursor/skills/discord-market/SKILL.md` |
| 成果報告スキル | `Cursor(シロ学長)/.cursor/skills/discord-results/SKILL.md` |
| リアルタイム市況スキル | `Cursor(もえ)/.cursor/skills/realtime-market/SKILL.md` |
| 上記に対応するルール一式（.mdc） | リポジトリ**ルート直下**の `.cursor/rules/` |

理由：Cursor Mobile/クラウドエージェントは `.cursor/skills` はサブフォルダにネストしていても自動認識するが、
`.cursor/rules`（.mdcファイル）は**リポジトリのルート直下にあるものしか認識しない**ため。

**現状の制限（今回は簡易対応のため未反映）**：
- 各スキルが参照する補助プロンプト（`05_Discord運用/プロンプト/特別市況プロンプト.md` 等）・入力フォルダ（`07_インプット/`）・出力保存先フォルダ（`08_アウトプット/`）はこのリポジトリに含めていない。
- そのためモバイルでスキルを実行すると、SKILL.md本体の指示だけで動作し、補助プロンプトの追加情報は反映されない。出力ファイルは新規作成される（保存先フォルダが存在しなくてもgitが作成する）。
- 必要になったら、ローカルの `07_インプット` / `08_アウトプット` / `05_Discord運用` フォルダもこのリポジトリに追加できる。

## 更新履歴

- 2026/7/7：リアルタイム市況のX版出力を廃止し、Discord版（BTC＋ゴールド）のみの出力に変更
- 2026/7/7：「もえ」ペルソナ・口調を廃止し、リアルタイム市況を含む全出力をシロ学長口調に統一（`moe-persona.mdc`は参照用に無効化）

最終更新日：2026/7/7
