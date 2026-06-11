import type { CollectedData } from "@/lib/collectors";
import type { ReportJson, TechnicalAnalysis, KeyLevel, TradeScenario } from "@/lib/types";
import { formatPrice } from "@/lib/analysis";
import {
  buildPreviousHitIntro,
  buildPreviousPredictionReport,
  type PreviousScriptContext,
} from "@/lib/external-refs/previous-script";

function buildYouTubeContextBlock(json: ReportJson): string {
  const consensus = json.externalSummary.youtubeConsensus as {
    overallSentiment?: string;
    watchedCount?: number;
    totalCount?: number;
    commonPrices?: number[];
  } | undefined;
  const videos = (json.externalSummary.youtube as Array<{
    channel: string;
    title: string;
    fromWatchedChannel?: boolean;
    sentiment?: string;
    summary?: string;
    mentionedPrices?: number[];
    keyPoints?: string[];
  }>) ?? [];

  if (!videos.length) return "";

  const header = consensus
    ? `**参考動画の市場見立て:** ${consensus.overallSentiment}（ウォッチ${consensus.watchedCount ?? 0}本 / 計${consensus.totalCount ?? 0}本）`
    : "**参考動画の市場見立て:**";
  const priceLine = consensus?.commonPrices?.length
    ? `\n複数動画で言及された価格: ${consensus.commonPrices.map((p) => `${p.toLocaleString()}ドル`).join("、")}`
    : "";

  const lines = videos.slice(0, 3).map((v) => {
    const tag = v.fromWatchedChannel ? "[ウォッチ]" : "";
    const points = v.keyPoints?.slice(0, 2).join(" / ") ?? v.summary ?? "";
    return `- ${tag}[${v.channel}] ${v.title}（${v.sentiment ?? "中立"}）: ${points}`;
  });

  return `\n${header}${priceLine}\n${lines.join("\n")}`;
}

function buildReportJson(
  data: CollectedData,
  technical: TechnicalAnalysis,
  previousScript: PreviousScriptContext | null
): ReportJson {
  const previousPrediction = previousScript
    ? {
        scriptNumber: previousScript.scriptNumber,
        filename: previousScript.filename,
        predictionQuote: previousScript.predictionQuote,
        keyLevels: previousScript.keyLevels,
        conceptUsed: previousScript.conceptUsed,
        source: `02_アーカイブ/過去台本/${previousScript.filename}`,
      }
    : { summary: "前回台本なし" };

  return {
    summary: `BTCは${formatPrice(technical.currentPrice)}ドル付近。${technical.trend === "bearish" ? "下落トレンド継続" : technical.trend === "bullish" ? "上昇トレンド" : "レンジ"}と判断できます。`,
    priceVolatility: {
      currentPrice: technical.currentPrice,
      change24h: technical.change24h,
      change7d: technical.change7d,
      high24h: data.binance.ticker24h.high,
      low24h: data.binance.ticker24h.low,
      marketCap: data.cmc?.marketCap,
      dominance: data.cmc?.dominance,
      cmcChange24h: data.cmc?.change24h,
      cmcRank: data.cmc?.rank,
    },
    marketContext: data.cmc
      ? {
          source: "CoinMarketCap",
          marketCap: data.cmc.marketCap,
          dominance: data.cmc.dominance,
          change24h: data.cmc.change24h,
          rank: data.cmc.rank,
          note: `BTC時価総額${(data.cmc.marketCap / 1e12).toFixed(2)}兆ドル、ドミナンス${data.cmc.dominance.toFixed(1)}%`,
        }
      : null,
    chartAnalysis: {
      trend: technical.trend,
      reasons: technical.trendReasons,
      keyLevels: technical.keyLevels,
      ma200: technical.ma200,
      ma200Divergence: technical.ma200Divergence,
      rsiDaily: technical.rsiDaily,
      rsi4h: technical.rsi4h,
      candleCharacteristics: technical.candleCharacteristics,
      trendReversalCondition: technical.trendReversalCondition,
      volumeSpike: technical.volumeSpike,
    },
    marketPhase: {
      phase: technical.marketPhase,
      label: technical.marketPhaseLabel,
      reasons: technical.phaseReasons,
    },
    confluence: technical.confluence,
    weeklyConcept: {
      name: technical.conceptSuggestion.name,
      reason: technical.conceptSuggestion.reason,
      phase: technical.conceptSuggestion.phase,
      definition: technical.conceptSuggestion.definition,
      chartApplication: technical.conceptSuggestion.chartApplication,
      benefit: technical.conceptSuggestion.benefit,
      entryBridge: technical.conceptSuggestion.entryBridge,
      analogy: technical.conceptSuggestion.analogy,
      ngAction: technical.conceptSuggestion.ngAction,
      commentPrompt: technical.conceptSuggestion.commentPrompt,
      ma200: technical.ma200,
      divergence: technical.ma200Divergence,
      rsi: technical.rsiDaily,
    },
    scenarios: {
      bullish: technical.scenarios.bullish,
      bearish: technical.scenarios.bearish,
      pullback: technical.scenarios.pullback,
    },
    previousPrediction,
    externalSummary: {
      news: data.news.map((n) => ({ title: n.title, source: n.source })),
      youtube: data.youtubeAnalysis.map((a) => ({
        title: a.title,
        channel: a.channel,
        url: a.url,
        publishedAt: a.publishedAt,
        fromWatchedChannel: a.fromWatchedChannel,
        contentSource: a.contentSource,
        sentiment: a.sentiment,
        mentionedPrices: a.mentionedPrices,
        keyPoints: a.keyPoints,
        summary: a.summary,
        excerpt: a.excerpt,
      })),
      youtubeConsensus: data.youtubeConsensus,
    },
    sources: [],
    technical,
  };
}

/**
 * 冒頭フック候補（3案）を生成する。
 * ユーザー指定のバイアス（上昇優先/下落優先）を最優先し、
 * バイアスが中立の場合のみ市場フェーズ・トレンドに従う。
 */
function buildHookCandidates(t: TechnicalAnalysis): string[] {
  const price = formatPrice(t.currentPrice);
  const supports = t.keyLevels.filter((l) => l.type === "support" && l.price <= t.currentPrice).sort((a, b) => b.price - a.price);
  const resistances = t.keyLevels.filter((l) => l.type === "resistance" && l.price >= t.currentPrice).sort((a, b) => a.price - b.price);
  const nearS = supports[0] ? formatPrice(supports[0].price) : formatPrice(t.currentPrice * 0.97);
  const nearR = resistances[0] ? formatPrice(resistances[0].price) : formatPrice(t.currentPrice * 1.03);
  const farS = supports[1] ? formatPrice(supports[1].price) : formatPrice(t.currentPrice * 0.93);
  const farR = resistances[1] ? formatPrice(resistances[1].price) : formatPrice(t.currentPrice * 1.06);

  // バイアス指定を最優先。中立なら日足トレンドに従う
  const direction =
    t.tradingBias !== "neutral" ? t.tradingBias : t.trend;

  const hooks: string[] = [];

  if (direction === "bullish") {
    hooks.push(
      `ビットコイン、反発の条件が揃ってきました！日足RSI${t.rsiDaily.toFixed(0)}の売られすぎ水準からの切り返し。${nearR}ドルを突破できれば、狙いは${farR}ドルです。`,
      `BTCは${price}ドル。ここからの反発、入っていいタイミングは「2つの条件」が揃った時だけです。今日はエントリーポイントを具体的な数字で解説します。`,
      `ビットコイン、底打ちのサインが点灯し始めました。ただ、焦って飛びつくと機関に刈られます。「正しい反発の乗り方」を今日は解説します。`
    );
    if (t.marketPhase === "crash_bottom" || t.rsiDaily < 30) {
      hooks.push(
        `200日MAから${t.ma200Divergence.toFixed(0)}%の歴史的割安圏。過去この水準まで売られた後、BTCは大きく反発しています。今日はその反発シナリオを数字で解説します。`
      );
    }
  } else if (direction === "bearish") {
    hooks.push(
      `ビットコイン${nearS}ドルのライン、崩壊寸前です。最悪のシナリオだと${farS}ドルまで落ちるので警戒してください！`,
      `BTCの下落、まだ終わっていません。ただ「ある条件」が揃えば絶好の反発ポイントになります。今日はその条件を数字で解説します。`,
      `ビットコイン、戻りはここまでです。${nearR}ドルから先は売り圧力の壁。今日は下落シナリオの利確ポイントまで具体的に解説します。`
    );
  } else {
    hooks.push(
      `ビットコイン、${nearS}ドルと${nearR}ドルの間で勝負が決まる1週間です。どちらに抜けるかで戦略が180度変わります。`,
      `今のBTC、非常に難しい局面です。でも「待つべき価格」さえ知っていれば、焦る必要は一切ありません。`,
      `BTCは${price}ドル。上に行くか下に行くか、判断材料は出揃っています。今日はその「分かれ目の1本のライン」を解説します。`
    );
  }

  return hooks.slice(0, 3);
}

/**
 * ④現在地の「結論1文＋根拠」を生成する。
 * バイアス指定がある場合はその方向を主役にし、逆方向は「注意点」として添える。
 */
function buildLocationConclusion(t: TechnicalAnalysis): string {
  const sup = t.keyLevels.filter((l) => l.type === "support" && l.price <= t.currentPrice).sort((a, b) => b.price - a.price)[0];
  const res = t.keyLevels.filter((l) => l.type === "resistance" && l.price >= t.currentPrice).sort((a, b) => a.price - b.price)[0];

  if (t.tradingBias === "bullish") {
    const reasons: string[] = [];
    if (t.rsiDaily < 35) reasons.push(`日足RSI${t.rsiDaily.toFixed(0)}の売られすぎ`);
    if (t.ma200Divergence < -15) reasons.push(`200日MA乖離率${t.ma200Divergence.toFixed(1)}%の歴史的割安水準`);
    if (sup) reasons.push(`${formatPrice(sup.price)}ドルの買い支えライン`);
    if (t.candleCharacteristics.includes("下ヒゲ")) reasons.push("日足の下ヒゲ（下値での買い圧力）");

    const caveat =
      t.trend === "bearish"
        ? `注意点は、日足の大きなトレンドがまだ下落であること。だから「反発の形」（下ヒゲ＋4時間足陽線確定${res ? `、または${formatPrice(res.price)}ドルの上抜け` : ""}）を確認してから入るのが鉄則です。`
        : "トレンドも追い風です。押し目を拾う形でエントリーを狙います。";

    return `結論、今週は「短期反発を狙う」タイミングです。${reasons.length > 0 ? `根拠は${reasons.slice(0, 3).join("、")}。` : ""}${caveat}`;
  }

  if (t.tradingBias === "bearish") {
    const reasons: string[] = [];
    if (t.trend === "bearish") reasons.push("日足の高値・安値の切り下がり（ダウ理論の下落継続）");
    if (res) reasons.push(`${formatPrice(res.price)}ドルの上値の壁`);
    if (t.candleCharacteristics.includes("上ヒゲ")) reasons.push("日足の上ヒゲ（上値での売り圧力）");
    if (t.rsiDaily > 60) reasons.push(`日足RSI${t.rsiDaily.toFixed(0)}の過熱感`);

    const caveat =
      t.rsiDaily < 35
        ? `注意点は、RSI${t.rsiDaily.toFixed(0)}の売られすぎで短期反発が入りやすいこと。戻りを${res ? formatPrice(res.price) : "上値の壁"}ドルまで引き付けてから売るのが鉄則です。`
        : "飛びつきショートではなく、戻りを確認してから入ります。";

    return `結論、今週は「下落継続を前提に戻り売りを狙う」タイミングです。${reasons.length > 0 ? `根拠は${reasons.slice(0, 3).join("、")}。` : ""}${caveat}`;
  }

  // 中立：データのままに語る
  if (t.marketPhase === "crash_bottom") {
    return `結論、今は「売られすぎ＋買い支え待ち」の局面です。大きなトレンドは下落。ただ、歴史的な割安水準まで売られているため、反発の条件が揃いつつあります。`;
  }
  if (t.trend === "bearish") {
    return `結論、今は下落優勢の局面です。ただし一時的な反発もあり得るので、両方のシナリオを準備しておく必要があります。`;
  }
  if (t.trend === "bullish") {
    return `結論、今は上昇優勢の局面です。ただし飛び乗りではなく、押し目を待ってから入るのが正解です。`;
  }
  return `結論、今は方向感を待つ局面です。レンジの上限・下限どちらに抜けるかを見極めるまで、ポジションは軽めが正解です。`;
}

/** バイアスと逆方向の根拠（両論併記用）を2〜3個生成する */
function buildCounterEvidence(t: TechnicalAnalysis): { direction: string; items: string[] } {
  const baseDirection = t.tradingBias !== "neutral" ? t.tradingBias : t.trend;
  const items: string[] = [];

  if (baseDirection === "bearish" || baseDirection === "neutral") {
    // 下目線に対する「まだ100%下とは言えない理由」
    if (t.rsiDaily < 35) {
      items.push(`日足RSIが${t.rsiDaily.toFixed(1)}と売られすぎゾーン。30以下は歴史的にも反発が発生しやすい水準`);
    }
    if (t.ma200Divergence < -15) {
      items.push(`200日MAからの乖離率${t.ma200Divergence.toFixed(1)}%は滅多に出ない割安水準。平均回帰（戻り）の圧力が強まっている`);
    }
    const sup = t.keyLevels.filter((l) => l.type === "support" && l.price <= t.currentPrice).sort((a, b) => b.price - a.price)[0];
    if (sup) {
      const touches = sup.touchDates?.length ?? 0;
      items.push(`すぐ下の${formatPrice(sup.price)}ドルに${touches >= 2 ? `過去${touches}回反発している` : "強い"}サポートがあり、買い支えられる可能性がある`);
    }
    if (t.candleCharacteristics.includes("下ヒゲ")) {
      items.push("直近の日足に下ヒゲが連続。下値で買い注文が入っている証拠");
    }
    return { direction: "下落", items: items.slice(0, 3) };
  }

  // 上目線に対する「まだ100%上とは言えない理由」
  if (t.rsiDaily > 65) {
    items.push(`日足RSIが${t.rsiDaily.toFixed(1)}と買われすぎ圏に接近。短期的な調整が入りやすい`);
  }
  const res = t.keyLevels.filter((l) => l.type === "resistance" && l.price >= t.currentPrice).sort((a, b) => a.price - b.price)[0];
  if (res) {
    const touches = res.touchDates?.length ?? 0;
    items.push(`すぐ上の${formatPrice(res.price)}ドルに${touches >= 2 ? `過去${touches}回跳ね返されている` : "強い"}レジスタンスがあり、上値が重い`);
  }
  if (t.candleCharacteristics.includes("上ヒゲ")) {
    items.push("直近の日足に上ヒゲが連続。上値で売り圧力が出ている証拠");
  }
  if (t.trend === "bearish") {
    items.push("日足の高値・安値はまだ切り下がっており、ダウ理論上は下落トレンドが継続中");
  }
  return { direction: "上昇", items: items.slice(0, 3) };
}

/** ラインの歴史的検証つき表記を生成する */
function formatLevelRow(l: KeyLevel): string {
  const typeLabel = l.type === "resistance" ? "抵抗（レジスタンス）" : "支持（サポート）";
  const history =
    l.touchDates && l.touchDates.length >= 2
      ? `過去${l.touchDates.length}回反応（${l.touchDates.map((d) => d.slice(5).replace("-", "/")).join("、")}）`
      : l.touchDates?.length === 1
      ? `直近${l.touchDates[0].slice(5).replace("-", "/")}に反応`
      : "";
  return `| ${formatPrice(l.price)} | ${typeLabel} | ${l.reason} | ${history} |`;
}

/** 30秒まとめ案を生成する（バイアス指定を主軸に組み立てる） */
function build30sSummary(t: TechnicalAnalysis, conceptName: string): string {
  const sup = t.keyLevels.filter((l) => l.type === "support" && l.price <= t.currentPrice).sort((a, b) => b.price - a.price)[0];
  const res = t.keyLevels.filter((l) => l.type === "resistance" && l.price >= t.currentPrice).sort((a, b) => a.price - b.price)[0];

  let mainLine: string;
  if (t.tradingBias === "bullish") {
    mainLine = `今のビットコインは${formatPrice(t.currentPrice)}ドル付近。${t.trend === "bearish" ? "日足はまだ下落トレンドですが、" : ""}${t.rsiDaily < 35 ? `RSI${t.rsiDaily.toFixed(0)}の売られすぎ` : "条件の揃い方"}${sup ? `と${formatPrice(sup.price)}ドルのサポート` : ""}から、今週の基本戦略は「反発の形を確認してロング」です。
${res ? `${formatPrice(res.price)}ドルを実体で上抜ければ反発本格化。` : ""}逆に${sup ? `${formatPrice(sup.price)}ドル割れなら一旦撤退` : "サポート割れなら一旦撤退"}。ルールはシンプルです。`;
  } else if (t.tradingBias === "bearish") {
    mainLine = `今のビットコインは${formatPrice(t.currentPrice)}ドル付近で下落優勢。
今週の基本戦略は${res ? `「${formatPrice(res.price)}ドルへの戻りを待って売る」` : "「戻り売り」"}です。${t.rsiDaily < 35 ? `ただRSI${t.rsiDaily.toFixed(0)}の売られすぎで短期反発は入りやすいので、飛びつきショートはNG。` : ""}`;
  } else {
    const trendWord = t.trend === "bearish" ? "下落優勢" : t.trend === "bullish" ? "上昇優勢" : "レンジ";
    mainLine = `今のビットコインは${formatPrice(t.currentPrice)}ドル付近で${trendWord}。
重要ラインは${sup ? `下が${formatPrice(sup.price)}ドル` : ""}${sup && res ? "、" : ""}${res ? `上が${formatPrice(res.price)}ドル` : ""}。どちらに抜けるかで戦略が変わります。`;
  }

  return `${mainLine}

今日紹介した「${conceptName}」は、エントリー精度を上げる必須知識。
抜けた瞬間に飛びつくのではなく、形を確認してから入るのが正解です。

エントリーポイント・利確・損切りの数字は何度も復習して、
上昇・下落どちらに転んでも動けるように準備しておいてください。`;
}

/** 次回予告ネタ候補を生成する */
function buildNextTeasers(t: TechnicalAnalysis, conceptName: string): string[] {
  const sup = t.keyLevels.filter((l) => l.type === "support" && l.price <= t.currentPrice).sort((a, b) => b.price - a.price)[0];
  const res = t.keyLevels.filter((l) => l.type === "resistance" && l.price >= t.currentPrice).sort((a, b) => a.price - b.price)[0];

  const teasers: string[] = [];
  if (sup) {
    teasers.push(`次回は、${formatPrice(sup.price)}ドルの攻防の結果と、その後の具体的なエントリーポイントを解説します。`);
  }
  if (res) {
    teasers.push(`次回は、${formatPrice(res.price)}ドルに到達した場合の対応と、その後のシナリオをお話しします。`);
  }
  teasers.push(`次回は、今日の「${conceptName}」と相性の良い指標をもう1つピックアップして、組み合わせ方を解説します。`);
  return teasers.slice(0, 3);
}

function buildScenarioTable(s: TradeScenario): string {
  return `| 項目 | 内容 |
|------|------|
| トリガー | ${s.trigger} |
| エントリー | ${s.entry} |
| 損切り | ${s.stopLoss} |
| 利確① | ${s.takeProfit1} |
| 利確② | ${s.takeProfit2} |
| RR比 | ${s.rrRatio} |
| 注意 | ${s.notes} |`;
}

function buildReportMarkdown(
  json: ReportJson,
  date: string,
  previousScript: PreviousScriptContext | null,
  excludedConceptTopics: string[] = [],
  storyHypothesis = ""
): string {
  const t = json.technical;
  const b = json.scenarios.bullish as Record<string, unknown>;
  const s = json.scenarios.bearish as Record<string, unknown>;
  const ca = json.chartAnalysis as Record<string, unknown>;
  const levels = (ca.keyLevels as KeyLevel[]) ?? [];
  const youtubeBlock = buildYouTubeContextBlock(json);
  const wc = json.weeklyConcept as Record<string, string>;

  const prevSection = buildPreviousPredictionReport(
    previousScript,
    t.currentPrice,
    String(ca.trend),
    String(ca.trendReversalCondition)
  );

  const introSection = previousScript
    ? buildPreviousHitIntro(previousScript, t.currentPrice, t.trend)
    : "（前回台本の入力なし。初回として「今日からこのチャンネルでは毎回ラインとシナリオを共有していきます」の導入を推奨）";

  const biasLabel =
    t.tradingBias === "bullish" ? "上昇優先" :
    t.tradingBias === "bearish" ? "下落優先" : "中立";

  const trend4hLabel =
    t.trend4h === "bullish" ? "上昇" : t.trend4h === "bearish" ? "下落" : "レンジ";
  const trend1hLabel =
    t.trend1h === "bullish" ? "上昇" : t.trend1h === "bearish" ? "下落" : "レンジ";
  const trendDailyLabel =
    t.trend === "bullish" ? "上昇" : t.trend === "bearish" ? "下落" : "レンジ";

  const supportLevels = levels.filter((l) => l.type === "support").sort((a, b) => b.price - a.price).slice(0, 4);
  const resistanceLevels = levels.filter((l) => l.type === "resistance").sort((a, b) => a.price - b.price).slice(0, 4);

  const allLevelsTable = [
    ...[...resistanceLevels].reverse().map(formatLevelRow),
    `| **${formatPrice(t.currentPrice)}** | **← 現在値** |  |  |`,
    ...supportLevels.map(formatLevelRow),
  ].join("\n");

  const hooks = buildHookCandidates(t);
  const conclusion = buildLocationConclusion(t);
  const counter = buildCounterEvidence(t);
  const summary30s = build30sSummary(t, wc.name);
  const teasers = buildNextTeasers(t, wc.name);

  const mainScenario = (t.tradingBias === "bearish" ? s : b) as unknown as TradeScenario;
  const subScenario = (t.tradingBias === "bearish" ? b : s) as unknown as TradeScenario;
  const mainLabel = t.tradingBias === "bearish" ? "下落（メイン）" : "上昇（メイン）";
  const subLabel = t.tradingBias === "bearish" ? "上昇（サブ・警戒用）" : "下落（サブ・警戒用）";
  const pullbackScenario = t.scenarios.pullback;
  const mainDirection = t.tradingBias !== "neutral" ? t.tradingBias : t.trend;
  const pullbackLabel = mainDirection === "bullish" ? "押し目買い（深押しリテスト狙い）" : "戻り売り（リテスト狙い）";

  return `# BTCテクニカルレポート ${date}
> このレポートは台本①〜⑪セクションのインプット素材です。

---

## 【基本情報】
- **現在値**: ${formatPrice(t.currentPrice)}ドル
- **24h変化**: ${t.change24h >= 0 ? "+" : ""}${t.change24h.toFixed(2)}%
- **7d変化**: ${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(2)}%
- **市場フェーズ**: ${(json.marketPhase as Record<string, string>)?.label ?? "未判定"}
- **ATR(14日足)**: ${formatPrice(t.atr14)}ドル（利確幅の基準値）
- **バイアス設定**: ${biasLabel}（フック・結論・シナリオの主軸に反映済み）
${storyHypothesis ? `- **台本仮説（入力）**: ${storyHypothesis}` : ""}
${json.priceVolatility.dominance ? `- **BTCドミナンス**: ${(json.priceVolatility.dominance as number).toFixed(1)}%` : ""}

---

## ① 冒頭フック候補（3案・トーン別）
${hooks.map((h, i) => `**案${i + 1}**\n${h}`).join("\n\n")}

---

## ①-2 前回振り返りパート（導入用・そのまま読める文章）
${introSection}

---

## 【前回予測との照合（データ詳細）】
${prevSection}

---

## ④ BTCの現在地（日足ベース）

### 【結論ファースト】
${conclusion}

### 【指標】
**▼ 固定ベース指標（毎回確認）**
| 指標 | 数値 | 判定 |
|------|------|------|
| 現在値 | ${formatPrice(t.currentPrice)}ドル | — |
| MA200（日足） | ${formatPrice(t.ma200)}ドル | 乖離率 ${t.ma200Divergence >= 0 ? "+" : ""}${t.ma200Divergence.toFixed(1)}% |
| RSI（日足） | ${t.rsiDaily.toFixed(1)} | ${t.rsiDaily > 70 ? "買われすぎ警戒" : t.rsiDaily < 30 ? "売られすぎ（反発注視）" : t.rsiDaily > 55 ? "強め" : t.rsiDaily < 45 ? "弱め" : "中立"} |
| RSI（4H） | ${t.rsi4h.toFixed(1)} | ${t.rsi4h > 60 ? "短期過熱注意" : t.rsi4h < 40 ? "短期売られすぎ" : "中立"} |
| RSI（1H） | ${t.rsi1h.toFixed(1)} | ${t.rsi1h > 60 ? "1H過熱" : t.rsi1h < 40 ? "1H売られすぎ" : "中立"} |
| 7日変化 | ${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(2)}% | — |

**▼ フェーズ別注目指標**
${t.phaseReasons.slice(0, 3).map((r) => `- ${r}`).join("\n")}

### 【ローソク足】
- **日足直近**: ${t.candleCharacteristics}
- **4H足**: ${t.candleCharacteristics4h}
- **1H足**: ${t.candleCharacteristics1h}
- **出来高**: ${t.volumeSpike ? "急増あり（平均比+80%以上）─ 大口の動きが入った可能性" : "通常水準（特筆なし）"}

### 【ライン（水平線・斜め線）】
**▼ 主要ライン（上から下・歴史的検証つき）**
| 価格 | 種別 | 根拠 | 過去の反応実績 |
|------|------|------|----------------|
${allLevelsTable}

**▼ マルチタイムフレーム整合**
| 時間足 | トレンド | 判定 |
|--------|----------|------|
| 日足 | ${trendDailyLabel} | ベース方向 |
| 4時間足 | ${trend4hLabel} | エントリーゾーン |
| 1時間足 | ${trend1hLabel} | トリガー確認用 |

**▼ 総合判断**: 3本の時間足が${
    t.trend === t.trend4h && t.trend4h === t.trend1h
      ? "すべて同方向→方向感が明確"
      : t.trend === t.trend4h
      ? "日足・4Hが一致、1Hは揺れ→エントリー待ちの局面"
      : "時間足間で乖離→慎重にトリガー確認が必要"
  }

### 【両論併記：逆方向の可能性（台本の「でもまだ100%とは言えない」パート用）】
基本目線と逆の「${counter.direction === "下落" ? "反発" : "下落"}」もあり得る理由：
${counter.items.length > 0 ? counter.items.map((c, i) => `${i + 1}. ${c}`).join("\n") : "- 現時点で逆方向の強い根拠は限定的"}

**▼ トレンド転換条件**
${t.trendReversalCondition}
${youtubeBlock}

---

## ⑤ 今週の重要ポイント：${wc.name}
> **選定理由**: ${wc.reason}
> **重複チェック**: 過去に取り上げたテーマ（${["移動平均線", "逆三尊", "リテスト", "VWAP", ...excludedConceptTopics].filter((v, i, a) => a.indexOf(v) === i).join("・")}）は除外して選定済み

**1. 簡単に定義（10秒で「これは〜のことです」）**
${wc.definition ?? wc.reason}

**1-2. 日常の例え（中学生でも分かる翻訳）**
${wc.analogy ?? ""}

**2. 今のBTCチャートでの具体的な見方・使い方**
${wc.chartApplication ?? `現在価格${formatPrice(t.currentPrice)}ドルで確認できる形状に注目します。`}

**3. これが分かると何が良いか？**
${wc.benefit ?? "エントリー根拠の精度が上がります。"}

**3-2. やりがちなNG行動（注意喚起パート用）**
${wc.ngAction ?? ""}

**4. エントリー判断への繋ぎ**
${wc.entryBridge ?? t.trendReversalCondition}

---

## ⑥ コメント誘導（二択質問・そのまま使える）
${wc.commentPrompt ?? "今日の相場、上昇派ですか？下落派ですか？コメントで教えてください。"}

---

## ⑦ シナリオ別アクションプラン

> **バイアス: ${biasLabel}** ｜ ATR(14): ${formatPrice(t.atr14)}ドル（利確幅の基準）｜ 損切りはラインの外側に設置

### 【${mainLabel} シナリオ】
${buildScenarioTable(mainScenario)}

### 【${subLabel} シナリオ】
${buildScenarioTable(subScenario)}

### 【第3シナリオ：${pullbackLabel}】
${buildScenarioTable(pullbackScenario)}

---

## ⑨ 30秒まとめ（そのまま読める文章案）
${summary30s}

---

## ⑪ 次回予告ネタ候補
${teasers.map((tz, i) => `${i + 1}. ${tz}`).join("\n")}

---

## 【補足データ】
${json.externalSummary.news && (json.externalSummary.news as unknown[]).length > 0
  ? `### ファンダメンタルズ（参考ニュース）\n${(json.externalSummary.news as Array<{ title: string }>).slice(0, 5).map((n) => `- ${n.title}`).join("\n")}`
  : ""}
`;
}

export async function generateReport(
  data: CollectedData,
  technical: TechnicalAnalysis,
  previousScript: PreviousScriptContext | null,
  excludedConceptTopics: string[] = [],
  storyHypothesis = ""
): Promise<{ markdown: string; json: ReportJson }> {
  const json = buildReportJson(data, technical, previousScript);
  const date = new Date().toISOString().split("T")[0];
  // 台本構成①〜⑪に対応した構造化フォーマットを確実に出力するため、
  // LLMによる書き直しは行わずルールベースのMarkdownを返す
  const ruleBasedMd = buildReportMarkdown(
    json,
    date,
    previousScript,
    excludedConceptTopics,
    storyHypothesis
  );
  return { markdown: ruleBasedMd, json };
}
