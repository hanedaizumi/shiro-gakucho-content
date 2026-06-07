import { readFile } from "fs/promises";
import path from "path";
import type { ReportJson } from "@/lib/types";
import type { ExternalContext } from "@/lib/external-refs/loader";
import { formatPrice } from "@/lib/analysis";
import { callLlm } from "./provider";

const EPISODES = [
  "8年前に感情任せのトレードで、1ヶ月で数千万円を溶かした私が、今は月利1,000万円を安定して出せるようになった。理由は1つ。「チャートは感情を持たない」という事実に気づいたからです。",
  "サラリーマン時代、仕事中にトイレに隠れてスマホでチャートを見ながら、感情任せにボタンを押して資産を溶かし続けていた私が、今は月利1,000万円を安定して出せるようになりました。チャートは感情を持たない。この事実に気づいた瞬間から、全てが変わりました。",
  "500万円を一瞬で失った時、チャートのルールを無視していた自分を痛感しました。今は感情を完全に排除し、ルール通りに機械的にトレードしています。",
  "野村証券時代、上司から「トレードで感情を殺す方法」を叩き込まれたことが、今の全ての土台になっています。",
];

async function loadPrompt(name: string): Promise<string> {
  const promptPath = path.join(process.cwd(), "..", "prompts", name);
  try {
    return await readFile(promptPath, "utf-8");
  } catch {
    return "YouTube台本を12セクション構成で作成してください。";
  }
}

function pickEpisode(usedEpisodes: string[]): string {
  for (const ep of EPISODES) {
    if (!usedEpisodes.some((u) => u.includes(ep.slice(0, 20)))) {
      return ep;
    }
  }
  return EPISODES[0];
}

function buildScriptTemplate(
  report: ReportJson,
  ctx: ExternalContext,
  scriptNumber: number
): string {
  const t = report.technical;
  const concept = (report.weeklyConcept as Record<string, string>).name;
  const b = report.scenarios.bullish as Record<string, string>;
  const s = report.scenarios.bearish as Record<string, string>;
  const episode = pickEpisode(ctx.usedEpisodes);
  const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

  const trendLabel =
    t.trend === "bearish" ? "下落優勢" : t.trend === "bullish" ? "上昇優勢" : "レンジ";

  const nearestResistance = t.keyLevels.find((l) => l.type === "resistance" && l.price > t.currentPrice);
  const hookDown = nearestResistance
    ? `${formatPrice(t.currentPrice)}ドルを割ると、次の止まりどころは${formatPrice(t.keyLevels.filter(l => l.type === "support").sort((a,b) => b.price - a.price)[0]?.price ?? t.currentPrice * 0.95)}ドルです。`
    : `今のビットコイン、${formatPrice(t.currentPrice)}ドルが正念場です。`;

  return `# 台本${scriptNumber} BTC分析_${dateStr}

---

## ① 導入（冒頭フック）

${hookDown}

前回の動画でお伝えしたラインが意識されています。
前回を見てポジションを取れた方、おめでとうございます。
見ていなかった方は、この値動きを参考に復習しておいてください。

${episode}

株式・仮想通貨で年間10億円を運用するシロです。

最後まで見れば、上昇・下落どちらに転んでも具体的なエントリーラインが自分で引けるようになります。

---

## ② 前半CTA（Discord誘導）

また、既に500名近いメンバーが在籍するシロ学長のDiscordコミュニティでは、
今日の狙い目・リアルタイムの市況解説を毎日無料で配信しています！

私が実際のトレードで使っているインジケーターもメンバー限定で無料配布中。
概要欄のリンクからご参加ください！

---

## ③ 目次

今日は3つお話しします。

①BTCの現在地
②${concept}
③上昇・下落それぞれのトレードプラン

特に3つ目は今週のトレードに直結してくるので最重要です！

---

## ④ BTCの現在地（日足分析）

まずは現状確認です。

今のビットコインは${formatPrice(t.currentPrice)}ドル付近。24時間で${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(1)}%、7日間で${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(1)}%の変化です。

今は${trendLabel}と判断できます。

${t.trendReasons.map((r, i) => `**根拠${String.fromCharCode(9312 + i)}：** ${r}`).join("\n\n")}

${t.candleCharacteristics}

では、何が起きればトレンドが切り替わるのか。
${t.trendReversalCondition}。
これが確認できるまでは${t.trend === "bearish" ? "下" : t.trend === "bullish" ? "上" : "中立"}目線を維持します。

---

## ⑤ 今週の重要ポイント：${concept}

${(report.weeklyConcept as Record<string, string>).reason}

200日移動平均線は約${formatPrice(t.ma200)}ドル。乖離率は${t.ma200Divergence.toFixed(1)}%です。
RSI（日足）は${t.rsiDaily.toFixed(0)}。${t.rsiDaily < 35 ? "売られすぎゾーンに入っており、短期反発が起きやすい水準です。" : t.rsiDaily > 65 ? "買われすぎに近づいています。" : "中間ゾーンです。"}

ただし、これは「トレンド転換の確定サイン」ではありません。
あくまで今週の立ち位置を読むための材料です。

---

## ⑥ コメント誘導

今の相場、あなたは上昇派ですか？下落派ですか？
コメントで「上」か「下」か教えてください。全部読んでます。

---

## ⑦ 上昇・下落 両シナリオのアクションプラン

では、具体的なトレードプランをお伝えします。
基本目線は${t.trend === "bearish" ? "下" : "上"}ですが、どちらに転んでも対応できるよう両シナリオを用意しています。

**【上昇シナリオ】**

トリガー：${b.trigger}
エントリー：${b.entry}
損切り：${b.stopLoss}
利確第1：${b.takeProfit1}
利確第2：${b.takeProfit2}

**【下落シナリオ】**

トリガー：${s.trigger}
エントリー：${s.entry}
損切り：${s.stopLoss}
利確第1：${s.takeProfit1}
利確第2：${s.takeProfit2}

条件が揃ったら動く。揃っていなければ待つ。
ポジションサイズは口座の2%まで。これが全ての前提です。

---

## ⑧ 中盤CTA

こういったリアルタイムの狙い目・毎日の市況は、シロ学長のDiscordコミュニティで無料配信しています。
より早く正確な情報でトレードしたい方は、概要欄のリンクからご参加ください！

また、実際にトレードにはVantageがおすすめです。
手数料が業界最安値クラスで、私も毎日使っています。
Discord内に詳しい手順を載せているので、まずはDiscordに入ってみてください。

---

## ⑨ まとめ（30秒）

今日の内容を30秒でまとめます。

今のビットコインは${formatPrice(t.currentPrice)}ドル付近で、基本目線は${t.trend === "bearish" ? "下" : t.trend === "bullish" ? "上" : "中立"}。
${concept}で見ると、今週の立ち位置が読みやすくなります。

上昇なら：${b.entry} → 利確 ${b.takeProfit1}
下落なら：${s.entry} → 利確 ${s.takeProfit1}

今日やることは1つだけ。
チャートに重要ラインを引いて、アラームをセットしておいてください。

---

## ⑪ 後半CTA（Discord + 次回予告）

シロ学長のDiscordコミュニティでは
・日々の狙い目
・リアルタイム市況
・相場分析ツール
これらが全て無料で手に入ります。

月額費用など一切かかりませんので、概要欄のリンクからご参加をお願いします！

次回は、${formatPrice(t.keyLevels[0]?.price ?? t.currentPrice * 1.05)}ドル付近の攻防と、その後のシナリオをお話しします。
チャンネル登録してお待ちください！

---

## ⑫ 締めの挨拶

最後まで見てくださり、ありがとうございます！
感想・質問などある方は、コメント欄にてお願いします。１つ１つ丁寧に返信させていただきます。

この動画が役に立ったと思ってくれた方は、高評価とチャンネル登録をお願いします！

それではまた次の動画でお会いしましょう！
`;
}

export async function generateScript(
  report: ReportJson,
  reportMarkdown: string,
  ctx: ExternalContext,
  scriptNumber: number
): Promise<{ markdown: string; episodeUsed: string; conceptUsed: string }> {
  const template = buildScriptTemplate(report, ctx, scriptNumber);
  const conceptUsed = (report.weeklyConcept as Record<string, string>).name;
  const episodeUsed = pickEpisode(ctx.usedEpisodes);

  const apiKey =
    process.env.OPENAI_API_KEY ||
    process.env.ANTHROPIC_API_KEY ||
    process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return { markdown: template, episodeUsed, conceptUsed };
  }

  try {
    const system = await loadPrompt("script-system.md");
    const user = `## ペルソナ\n${ctx.persona.slice(0, 3000)}\n\n## チャンネルルール\n${ctx.channelRules.slice(0, 2000)}\n\n## 台本テンプレートルール\n${ctx.scriptCreationSkill.slice(0, 4000)}\n\n## 過去台本参考\n${ctx.recentScripts.map((s) => s.content.slice(0, 1500)).join("\n---\n")}\n\n## レポート\n${reportMarkdown}\n\n## テンプレート（この構成を維持しつつ文言を磨く）\n${template}`;

    const llmMd = await callLlm(system, user);
    return {
      markdown: llmMd && llmMd.length > 2000 ? llmMd : template,
      episodeUsed,
      conceptUsed,
    };
  } catch {
    return { markdown: template, episodeUsed, conceptUsed };
  }
}
