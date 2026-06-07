import { readFile } from "fs/promises";
import path from "path";
import type { ReportJson } from "@/lib/types";
import type { ExternalContext } from "@/lib/external-refs/loader";
import { buildPreviousHitIntro } from "@/lib/external-refs/previous-script";
import {
  buildPhaseLocationSection,
  buildThreePartConceptSection,
  formatPrice,
} from "@/lib/analysis";
import { callLlm } from "./provider";

const MIN_CHAR_COUNT = 4000;

const EPISODES = [
  "8年前に感情任せのトレードで、1ヶ月で数千万円を溶かした私が、今は月利1,000万円を安定して出せるようになった。理由は1つ。「チャートは感情を持たない」という事実に気づいたからです。",
  "サラリーマン時代、仕事中にトイレに隠れてスマホでチャートを見ながら、感情任せにボタンを押して資産を溶かし続けていた私が、今は月利1,000万円を安定して出せるようになりました。チャートは感情を持たない。この事実に気づいた瞬間から、全てが変わりました。",
  "500万円を一瞬で失った時、チャートのルールを無視していた自分を痛感しました。今は感情を完全に排除し、ルール通りに機械的にトレードしています。",
  "野村証券時代、上司から「トレードで感情を殺す方法」を叩き込まれたことが、今の全ての土台になっています。",
];

const EMOTIONAL_BLOCKS = [
  `正直に言います。下落相場で一番怖いのは「まだ下がる」と分かっていながら、焦って買い戻してしまうことです。私も昔は何度もやりました。だからこそ、今日お伝えしたラインと条件をメモに残してください。チャートが感情を持たないなら、私たちもルールを持てばいい。`,
  `相場が荒れている時ほど、SNSの煽りに弱くなります。私も昔は「今しかない」と言われると飛び乗って大損しました。だから今日は煽りではなく、条件だけを渡しました。条件が揃うまで待てる人だけが、長く勝てます。`,
  `トレードで勝てない人の共通点は、負けた後に「取り返そう」とポジションを大きくすることです。私も500万円を一瞬で失った時、まさにそうでした。今日お伝えした2%ルールは、私が地獄から這い上がるために自分に課したルールです。`,
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

function countChars(text: string): number {
  return text.replace(/\s/g, "").length;
}

function buildKeyLevelsBlock(report: ReportJson): string {
  const levels = report.technical.keyLevels.slice(0, 4);
  if (!levels.length) return "";

  const lines = levels.map((l) => {
    const label = l.type === "support" ? "サポート" : "レジスタンス";
    return `- **${label} ${formatPrice(l.price)}ドル**`;
  });

  return `
チャートを開いたら、まずこの水平線を引いてください。

${lines.join("\n")}`;
}

function buildScenarioDetail(
  label: string,
  scenario: Record<string, string>,
  trend: string
): string {
  const isBull = label.includes("上昇");
  return `**【${label}】**

トリガー：${scenario.trigger}

エントリー：${scenario.entry}
「${isBull ? "下がったから買う" : "上がったから売る"}」ではなく、形が確定してから入るのが鉄則です。

損切り：${scenario.stopLoss}
ここを4時間足実体で割ったら、想定が崩れたと判断して即撤退してください。

利確第1：${scenario.takeProfit1}
第1目標到達後は、損切りラインをエントリー価格に移動してリスクをゼロにしましょう。

利確第2：${scenario.takeProfit2}
第1目標を実体で上抜け${isBull ? "" : "（または下抜け）"}できた場合のみ、第2目標まで引っ張ります。

${isBull ? "反発が来なかった場合" : "戻りが来なかった場合"}は、待つか${trend === "bearish" ? "下落" : "上昇"}シナリオに切り替えます。飛び乗りは一切しません。`;
}

function buildScriptTemplate(
  report: ReportJson,
  ctx: ExternalContext,
  scriptNumber: number
): string {
  const t = report.technical;
  const concept = (report.weeklyConcept as Record<string, string>).name;
  const confluence = t.confluence;
  const b = report.scenarios.bullish as Record<string, string>;
  const s = report.scenarios.bearish as Record<string, string>;
  const episode = pickEpisode(ctx.usedEpisodes);
  const dateStr = new Date().toISOString().split("T")[0].replace(/-/g, "");

  const trendLabel =
    t.trend === "bearish" ? "下落優勢" : t.trend === "bullish" ? "上昇優勢" : "レンジ";

  const supports = t.keyLevels
    .filter((l) => l.type === "support")
    .sort((a, b) => b.price - a.price);
  const resistances = t.keyLevels
    .filter((l) => l.type === "resistance")
    .sort((a, b) => a.price - b.price);

  const nearestResistance = resistances.find((l) => l.price > t.currentPrice);
  const nearestSupport = supports[0];

  const hookDown = nearestSupport && t.trend === "bearish"
    ? `今のビットコイン、${formatPrice(nearestSupport.price)}ドルを割ると一気に${formatPrice(nearestSupport.price * 0.95)}ドルまで急落するので、本当に気を付けてください。`
    : nearestResistance
      ? `今のビットコイン、${formatPrice(nearestResistance.price)}ドルを実体で上抜ければ、次の止まりどころは${formatPrice(nearestResistance.price * 1.03)}ドルです。`
      : `今のビットコイン、${formatPrice(t.currentPrice)}ドル。ここを割ると、次の大きな動きが始まります。`;

  const previousHitBlock = ctx.previousScript
    ? buildPreviousHitIntro(ctx.previousScript, t.currentPrice, t.trend)
    : `前回の動画でお伝えしたラインが、また意識されています。
前回を見てポジションを取れた方、おめでとうございます。
見ていなかった方は、この値動きを参考に復習しておいてください。`;

  const keyLevelsBlock = buildKeyLevelsBlock(report);
  const locationSection = buildPhaseLocationSection(t, confluence, keyLevelsBlock);
  const conceptSection = buildThreePartConceptSection(concept, t, confluence);
  const emotional = EMOTIONAL_BLOCKS[scriptNumber % EMOTIONAL_BLOCKS.length];

  const nextPreviewLevel =
    nearestResistance?.price ?? resistances[0]?.price ?? t.currentPrice * 1.05;

  return `# 台本${scriptNumber} BTC分析_${dateStr}

---

## ① 導入（冒頭フック）

${hookDown}

${previousHitBlock}

${episode}

株式・仮想通貨で年間10億円を運用するシロです。

最後まで見れば、上昇・下落どちらに転んでも具体的なエントリーラインが自分で引けるようになります。
今日の動画は、感覚ではなく「条件」だけを持ち帰ってください。

---

## ② 前半CTA（Discord誘導）

また、既に500名近いメンバーが在籍するシロ学長のDiscordコミュニティでは、
今日の狙い目・リアルタイムの市況解説を毎日無料で配信しています！

私が実際のトレードで使っているインジケーターもメンバー限定で無料配布中。
概要欄のリンクからご参加ください！

---

## ③ 目次

今日は3つお話しします。

①BTCの現在地（相場フェーズ：${confluence.phaseLabel}）
②${concept}
③上昇・下落それぞれのトレードプラン

2つ目は今週のチャートで最も効く指標を「学習→分析→実践」で解説します。
3つ目は⑤の条件をそのままエントリーに落とし込みます。

---

${locationSection}

---

${conceptSection}

---

## ⑥ コメント誘導

今の相場、あなたは上昇派ですか？下落派ですか？
コメントで「上」か「下」か教えてください。全部読んでます。

---

## ⑦ 上昇・下落 両シナリオのアクションプラン

では、⑤のアクション示唆を具体的なトレードプランに落とし込みます。
**コンフルエンス要約：** ${confluence.synthesis.replace(/\n/g, " ")}

基本目線は${t.trend === "bearish" ? "下" : t.trend === "bullish" ? "上" : "中立"}（構造レイヤー）ですが、トリガー条件が揃えば両シナリオに対応できます。

${buildScenarioDetail("上昇シナリオ", b, t.trend)}

${buildScenarioDetail("下落シナリオ", s, t.trend)}

条件が揃ったら動く。揃っていなければ待つ。
ポジションサイズは口座の2%まで。これが全ての前提です。

チャートに${formatPrice(nearestSupport?.price ?? t.currentPrice * 0.97)}ドルと${formatPrice(nearestResistance?.price ?? t.currentPrice * 1.03)}ドルの2本を引き、アラームをセットしておいてください。

---

## ⑧ 中盤CTA

こういったリアルタイムの狙い目・毎日の市況は、シロ学長のDiscordコミュニティで無料配信しています。
より早く正確な情報でトレードしたい方は、概要欄のリンクからご参加ください！

また、実際のトレードにはVantageがおすすめです。
手数料が業界最安値クラスで、私も毎日使っています。
Discord内に詳しい手順を載せているので、まずはDiscordに入ってみてください。

---

## ⑨ まとめ（30秒）

今日の内容を30秒でまとめます。

今のビットコインは${formatPrice(t.currentPrice)}ドル付近。フェーズは${confluence.phaseLabel}。
構造＋${concept}のコンフルエンスで、今週の立ち位置が読みやすくなります。

上昇なら：${b.entry} → 利確 ${b.takeProfit1} → ${b.takeProfit2}
下落なら：${s.entry} → 利確 ${s.takeProfit1} → ${s.takeProfit2}

今日やることは1つだけ。
チャートに重要ラインを引いて、アラームをセットしておいてください。

---

## ⑩ エモい話（自己開示）

${emotional}

---

## ⑪ 後半CTA（Discord + 次回予告）

シロ学長のDiscordコミュニティでは
・日々の狙い目
・リアルタイム市況
・相場分析ツール
これらが全て無料で手に入ります。

月額費用など一切かかりませんので、概要欄のリンクからご参加をお願いします！

次回は、${formatPrice(nextPreviewLevel)}ドル付近の攻防と、その後のシナリオをお話しします。
チャンネル登録してお待ちください！

---

## ⑫ 締めの挨拶

最後まで見てくださり、ありがとうございます！
感想・質問などある方は、コメント欄にてお願いします。１つ１つ丁寧に返信させていただきます。

この動画が役に立ったと思ってくれた方は、高評価とチャンネル登録をお願いします！

それではまた次の動画でお会いしましょう！
`;
}

function ensureMinCharCount(markdown: string, report: ReportJson): string {
  let result = markdown;
  const concept = (report.weeklyConcept as Record<string, string>).name;
  const t = report.technical;

  const paddingBlocks = [
    `\n\n補足として、4時間足ではRSIが${t.rsi4h.toFixed(0)}付近です。ただし今日の主役は${concept}であり、RSI単体ではエントリー根拠にしません。`,
    `\n\nトレードの順番は「①ラインを引く → ②アラームをセット → ③形が出るまで待つ」です。この順番を守るだけで、感情トレードの8割は防げます。`,
    `\n\n機関投資家は「今どこにいるか」より「次にどこで反応するか」を先に決めています。今日お伝えしたラインは、そのための地図です。`,
    `\n\n相場が動かない日こそ、チャートにラインを引いて待つ練習をしてください。動いた日に慌てて線を引いても、エントリーは遅れます。`,
  ];

  let i = 0;
  while (countChars(result) < MIN_CHAR_COUNT && i < paddingBlocks.length) {
    const insertBefore = "## ⑥ コメント誘導";
    if (result.includes(insertBefore)) {
      result = result.replace(insertBefore, `${paddingBlocks[i]}\n\n---\n\n${insertBefore}`);
    } else {
      result += paddingBlocks[i];
    }
    i++;
  }

  if (countChars(result) < MIN_CHAR_COUNT) {
    result += `\n\n最後に繰り返します。${formatPrice(t.currentPrice)}ドル付近の攻防が今週の焦点です。${concept}と重要ラインの2つをセットで使えば、感覚トレードから卒業できます。`;
  }

  return result;
}

export async function generateScript(
  report: ReportJson,
  reportMarkdown: string,
  ctx: ExternalContext,
  scriptNumber: number
): Promise<{ markdown: string; episodeUsed: string; conceptUsed: string }> {
  let template = buildScriptTemplate(report, ctx, scriptNumber);
  template = ensureMinCharCount(template, report);

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
    const user = `## ペルソナ\n${ctx.persona.slice(0, 3000)}\n\n## チャンネルルール\n${ctx.channelRules.slice(0, 2000)}\n\n## 台本テンプレートルール\n${ctx.scriptCreationSkill.slice(0, 4000)}\n\n## 過去台本参考\n${ctx.recentScripts.map((s) => s.content.slice(0, 1500)).join("\n---\n")}\n\n## レポート\n${reportMarkdown}\n\n## テンプレート（この構成を維持しつつ文言を磨く。⑤の主題は${conceptUsed}のまま変更禁止。④⑤⑦のコンフルエンス構造を維持。全体4,000文字以上必須）\n${template}`;

    const llmMd = await callLlm(system, user);
    let markdown = llmMd && llmMd.length > 2000 ? llmMd : template;
    markdown = ensureMinCharCount(markdown, report);

    return { markdown, episodeUsed, conceptUsed };
  } catch {
    return { markdown: template, episodeUsed, conceptUsed };
  }
}
