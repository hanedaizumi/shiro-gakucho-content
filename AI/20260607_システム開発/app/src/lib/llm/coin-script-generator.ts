import type { ResolvedCoin } from "@/lib/coins/resolver";
import type { TechnicalAnalysis } from "@/lib/types";
import { formatPrice } from "@/lib/analysis";
import type { PlanningContext } from "@/lib/planning/context";
import { buildPlanningAxisMemo } from "@/lib/planning/context";

export function generateCoinScriptMarkdown(options: {
  coin: ResolvedCoin;
  reportMarkdown: string;
  technical: TechnicalAnalysis | null;
  researchMode: string;
  planning: PlanningContext;
}): { markdown: string; conceptUsed: string; episodeUsed: string } {
  const { coin, reportMarkdown, technical, researchMode, planning } = options;
  const date = new Date().toISOString().split("T")[0].replace(/-/g, "");

  const newsMatches = [...reportMarkdown.matchAll(/### ニュース[①②③④⑤⑥⑦⑧⑨⑩⑪⑫\d]+：(.+)/g)];
  const topNews = newsMatches.slice(0, 3).map((m) => m[1]);

  const conceptUsed =
    researchMode === "fundamentals"
      ? "ファンダメンタルズ解説"
      : researchMode === "technical"
        ? technical?.conceptSuggestion.name ?? "テクニカル分析"
        : "ファンダ＋テクニカル統合";

  const episodeUsed =
    "正しい知識で1人でも多くの日本人を経済的自立へ導きたい——その想いから、今日もデータと構造で語ります。";

  const hookLine = planning.thumbnailText
    ? `「${planning.thumbnailText}」——このサムネを見て不安になった方、安心してください。今日は感情ではなく構造で整理します。`
    : `断言します。${coin.name}を見るとき、価格だけを追うのは危険です。`;

  const titleLine = planning.titleText
    ? `\n今日のテーマは「${planning.titleText}」の核心を、3本柱で解きほぐします。`
    : "";

  const axisMemos = buildPlanningAxisMemo(planning, coin.name, coin.symbol);

  const techBlock = technical
    ? `## ④ ${coin.name}の現在地

今の${coin.name}は${formatPrice(technical.currentPrice)}ドル付近。
相場フェーズは「${technical.marketPhaseLabel}」と判断できます。

**根拠①：** ${technical.trendReasons[0] ?? "トレンド継続"}
**根拠②：** ${technical.phaseReasons[0] ?? "価格構造の変化"}

重要ライン：
${technical.keyLevels
  .slice(0, 3)
  .map(
    (l) =>
      `- ${l.type === "support" ? "サポート" : "レジスタンス"} ${formatPrice(l.price)}ドル`
  )
  .join("\n")}

## ⑤ 今週の注目：${technical.conceptSuggestion.name}

${technical.conceptSuggestion.reason}

トレンド転換の条件：${technical.trendReversalCondition}`
    : "";

  const newsBlock =
    topNews.length > 0
      ? topNews
          .map((title, i) => `- **ニュース${i + 1}：** ${title}`)
          .join("\n")
      : "- リサーチレポートのニュース①〜を参照し、日付・数値・固有名詞を入れる";

  const markdown = `# ${coin.name}（${coin.symbol}）台本_${date}

---

## ① 導入（冒頭フック）

${hookLine}${titleLine}

株式・仮想通貨で年間10億円を運用するシロです。
最後まで見れば、何を根拠に、どこで判断するかが自分で分かるようになります。

---

## ② 前半CTA

シロ学長Discordでは、今日の${coin.symbol}の注目ポイントを毎日配信しています。
概要欄のリンクからご参加ください。

---

## ③ 目次

今日は3つお話しします。
${researchMode !== "technical" ? `①${coin.name}を動かすファンダ要因\n` : ""}${technical ? "②テクニカルの現在地と重要ライン\n" : ""}③今後のシナリオと行動指針

**企画の軸：**
${axisMemos.map((m) => `- ${m}`).join("\n")}

---

${researchMode !== "technical" ? `## ④ ファンダメンタルズ（ニュース・時事）

直近で押さえるべきニュース：

${newsBlock}

> 詳細・数値ハイライトはリサーチレポートのニュース①〜を参照

---
` : ""}
${techBlock}

---

## ⑥ まとめ

${coin.name}は、${researchMode === "fundamentals" ? "ファンダの変化" : researchMode === "technical" ? "テクニカルの構造" : "ファンダとテクニカルの両面"}を見れば、感情ではなく条件で判断できます。

恐怖で動くのではなく、ルールで動く。
それが長く勝つ唯一の方法です。

---

## ⑦ エンディング

今日の${coin.symbol}、上昇派ですか？下落派ですか？コメントで教えてください。全部読んでます。

次回は、${coin.symbol}の重要ラインに届いた場合の具体的な対応をお話しします。チャンネル登録してお待ちください。
`;

  return { markdown, conceptUsed, episodeUsed };
}
