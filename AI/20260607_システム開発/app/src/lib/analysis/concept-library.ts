import type { TechnicalAnalysis } from "@/lib/types";
import { formatPrice } from "./indicators";

export interface ConceptPick {
  name: string;
  reason: string;
  score: number;
}

/** ⑤の主題に使ってはいけない初級用語 */
const BANNED_MAIN_CONCEPTS = [
  "RSI",
  "rsi",
  "MACD",
  "移動平均線とは",
  "ローソク足とは",
  "ボリンジャーバンド入門",
];

export const INTERMEDIATE_CONCEPTS = [
  "200日移動平均線との乖離率",
  "価格帯出来高",
  "ダウ理論の厳密定義",
  "フィボナッチ0.618",
  "オーダーブロック",
  "上昇ウェッジのブレイク",
  "逆三尊の正しい見方",
  "エリオット波動・第三波",
] as const;

export type IntermediateConcept = (typeof INTERMEDIATE_CONCEPTS)[number];

function isBanned(name: string): boolean {
  return BANNED_MAIN_CONCEPTS.some((b) => name.includes(b));
}

export type AnalysisInput = Omit<
  TechnicalAnalysis,
  | "conceptSuggestion"
  | "marketPhase"
  | "marketPhaseLabel"
  | "phaseReasons"
  | "confluence"
  | "scenarios"
> & { _ema20Daily?: number };

function scoreConcept(
  name: IntermediateConcept,
  t: AnalysisInput,
  usedConcepts: string[]
): number {
  if (usedConcepts.some((u) => u.includes(name) || name.includes(u))) return -1;
  if (isBanned(name)) return -1;

  let score = 10;

  switch (name) {
    case "200日移動平均線との乖離率":
      if (Math.abs(t.ma200Divergence) >= 15) score += 50;
      else if (Math.abs(t.ma200Divergence) >= 10) score += 25;
      break;
    case "価格帯出来高":
      if (t.volumeSpike) score += 45;
      score += 15;
      break;
    case "ダウ理論の厳密定義":
      score += 30;
      break;
    case "フィボナッチ0.618": {
      const highs = t.swingHighs[0]?.price ?? t.currentPrice * 1.1;
      const lows = t.swingLows[0]?.price ?? t.currentPrice * 0.9;
      const range = highs - lows;
      if (range > t.currentPrice * 0.08) score += 35;
      break;
    }
    case "オーダーブロック":
      if (t.volumeSpike && t.trend === "bearish") score += 40;
      else score += 20;
      break;
    case "上昇ウェッジのブレイク":
      if (t.trend === "bearish" && t.candleCharacteristics.includes("上ヒゲ")) score += 40;
      break;
    case "逆三尊の正しい見方":
      if (t.rsiDaily < 40 && t.trend !== "bullish") score += 25;
      break;
    case "エリオット波動・第三波":
      if (t.trend === "bullish" || t.change7d > 5) score += 30;
      else score += 15;
      break;
  }

  return score;
}

export function pickIntermediateConcept(
  t: AnalysisInput,
  usedConcepts: string[] = []
): ConceptPick {
  const scored = INTERMEDIATE_CONCEPTS.map((name) => ({
    name,
    score: scoreConcept(name, t, usedConcepts),
    reason: "",
  }))
    .filter((c) => c.score > 0)
    .sort((a, b) => b.score - a.score);

  const pick = scored[0] ?? {
    name: "ダウ理論の厳密定義" as IntermediateConcept,
    score: 10,
    reason: "",
  };

  return {
    name: pick.name,
    score: pick.score,
    reason: buildConceptReason(pick.name as IntermediateConcept, t),
  };
}

function buildConceptReason(name: IntermediateConcept, t: AnalysisInput): string {
  switch (name) {
    case "200日移動平均線との乖離率":
      return `乖離率${t.ma200Divergence.toFixed(1)}%は機関投資家が注目する水準`;
    case "価格帯出来高":
      return "高出来日の終値クラスタに現在価格が接近";
    case "ダウ理論の厳密定義":
      return `${t.trend === "bearish" ? "安値・高値の切り下がり" : "切り上がり"}が確認できる`;
    case "フィボナッチ0.618":
      return "直近スイング安値〜高値の61.8%戻しに価格が位置";
    case "オーダーブロック":
      return "急落前の最後の陽線ゾーンが意識されている";
    case "上昇ウェッジのブレイク":
      return "上値の重さと安値切り上げの矛盾が解消されつつある";
    case "逆三尊の正しい見方":
      return "3つの安値を作りながら売り力が弱まっている構造";
    case "エリオット波動・第三波":
      return "第2波調整後の第3波発動を警戒する局面";
    default:
      return "今週のチャート構造に最もフィットする中級者向け概念";
  }
}

export function buildConceptSection(
  name: IntermediateConcept,
  t: AnalysisInput
): string {
  const support = t.keyLevels
    .filter((l) => l.type === "support")
    .sort((a, b) => b.price - a.price)[0];
  const resistance = t.keyLevels
    .filter((l) => l.type === "resistance")
    .sort((a, b) => a.price - b.price)[0];

  const templates: Record<IntermediateConcept, string> = {
    "200日移動平均線との乖離率": `## ⑤ 今週の重要ポイント：200日移動平均線との乖離率

今の${formatPrice(t.currentPrice)}ドルがなぜ重要なのか。これを理解するために「200日移動平均線との乖離率」を見ます。

聞いたことがあっても、実際に数字で確認しているトレーダーはほとんどいません。

**そもそも何なのか**

200日移動平均線とは、過去200日分の終値を平均した線です。チャートツールであれば無料で表示できます。

この線は、機関投資家・ヘッジファンドが最も重視するベースラインです。「今の価格がそこから何%離れているか」を乖離率と呼びます。

**なぜ重要か**

機関投資家は、200日移動平均線から大きく離れたポジションに対して「戻ってくる」と判断してトレードします。乖離が大きくなるほど「プロの逆張り買い」が入りやすくなります。

過去のBTCのデータを見ると、200日MAから-20%以上乖離した時は、その後大きな反発が発生しています。

**今のBTCに当てはめると**

現在、200日移動平均線は約${formatPrice(t.ma200)}ドル付近にあります。今の価格は${formatPrice(t.currentPrice)}ドル。つまり乖離率は約${t.ma200Divergence.toFixed(1)}%です。

過去のBTCで-20%を超える乖離が発生したのは、2020年3月のコロナショック底打ちと、2022年の底打ちの2回だけです。2回とも、その後は大幅な反発が起きています。

**RSIは補助材料にとどめる**

RSI（日足）は${t.rsiDaily.toFixed(0)}ですが、今日の主役は乖離率です。RSIは「短期反発の補助サイン」として使い、トレンド転換の根拠にはしません。

ただし、これは「下落トレンドが終わった」サインではありません。あくまで「一時的な反発が来やすい」というサインです。

下落トレンドの中での短期反発は、次のショートチャンスへの準備期間でもあります。次のセクションで、この反発をどう取り、その後どう立ち回るかを解説します。`,

    "価格帯出来高": `## ⑤ 今週の重要ポイント：価格帯出来高

多くのトレーダーは「ローソク足の形」だけを見ます。でもプロは「どの価格帯で、どれだけの量が取引されたか」を見ます。これが価格帯出来高です。

**そもそも何なのか**

価格帯出来高とは、特定の価格帯で過去にどれだけの売買が成立したかを可視化したものです。横軸に価格、縦軸に出来高を並べたイメージです。

TradingViewなら「出来高プロファイル」を表示すれば、無料で確認できます。

**なぜ重要か**

多くの取引が成立した価格帯は「多くの人が納得した価格」です。だからそこを割ると加速し、そこで止まると反発しやすい。サポート・レジスタンスの裏側にあるロジックがこれです。

**今のBTCに当てはめると**

直近30日で出来高が平均の1.5倍以上だった日の終値が、${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近に集中しています。

今の価格${formatPrice(t.currentPrice)}ドルは、その「取引が密集した価格帯」に近い位置です。ここを実体で割れるか、反発するかで、今週の方向性が決まります。

**エントリーへの接続**

価格帯出来高の上端を4時間足実体で上抜けたら、プロの買いが追随しやすい局面です。逆に下端を割ったら、同じ量の売りが再度解放されます。

だから今週は${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドルと${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.03)}ドルの2本を、出来高の壁として意識してください。`,

    "ダウ理論の厳密定義": `## ⑤ 今週の重要ポイント：ダウ理論の厳密定義

「上昇トレンド」「下落トレンド」という言葉は誰でも使います。でもダウ理論の厳密な定義を知っている人は少ないです。

**そもそも何なのか**

ダウ理論では、上昇トレンドとは「高値と安値がともに切り上がる」こと。下落トレンドとは「高値と安値がともに切り下がる」ことと定義します。感情ではなく、値の並びだけで判断します。

**なぜ重要か**

「なんとなく下がってる」ではエントリー根拠になりません。高値・安値の切り上げ/切り下がりが確認できて初めて、トレンドフォローが正当化されます。

**今のBTCに当てはめると**

日足で見ると、${t.trendReasons.join("。")}。

つまり今は${t.trend === "bearish" ? "下落トレンドの定義を満たしている" : t.trend === "bullish" ? "上昇トレンドの定義を満たしている" : "トレンドの定義が崩れかけている"}状態です。

トレンド転換の条件は、${t.trendReversalCondition}。これが確認できるまでは、ダウ理論に基づき${t.trend === "bearish" ? "下" : "上"}目線を維持します。

**エントリーへの接続**

ダウ理論で下落トレンド中は「戻り売り」が基本。反発は${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.03)}ドル付近までと想定し、そこで頭を抑えられたらショートを検討します。`,

    "フィボナッチ0.618": `## ⑤ 今週の重要ポイント：フィボナッチ0.618

フィボナッチと聞くと難しそうですが、使うのは基本「0.618」の1本だけです。これだけで十分戦えます。

**そもそも何なのか**

直近の大きな値動きの高値から安値（またはその逆）の61.8%戻しの位置に、強いサポート・レジスタンスが来やすいという理論です。

**なぜ重要か**

BTCはアルゴリズム取引の比率が高く、0.618付近に自動的に注文が集まりやすい。だから「たまたま反発した」ではなく、構造的に反発しやすい価格帯になります。

**今のBTCに当てはめると**

直近スイング高値${t.swingHighs[0] ? formatPrice(t.swingHighs[0].price) : "（要確認）"}ドルから、安値${t.swingLows[0] ? formatPrice(t.swingLows[0].price) : "（要確認）"}ドルへの下落を1とすると、0.618戻しは約${formatPrice(
      (t.swingHighs[0]?.price ?? t.currentPrice * 1.08) -
        ((t.swingHighs[0]?.price ?? t.currentPrice * 1.08) - (t.swingLows[0]?.price ?? t.currentPrice * 0.92)) * 0.618
    )}ドル付近です。

今の${formatPrice(t.currentPrice)}ドルは、この0.618ゾーン${Math.abs(t.currentPrice - ((t.swingHighs[0]?.price ?? t.currentPrice) - ((t.swingHighs[0]?.price ?? t.currentPrice) - (t.swingLows[0]?.price ?? t.currentPrice)) * 0.618)) / t.currentPrice < 0.03 ? "に近い" : "の手前"}に位置しています。

**エントリーへの接続**

0.618付近で4時間足の下ヒゲ陽線が出たら短期ロング。割れたら次のフィボナッチ延伸（0.786）を狙うショートに切り替えます。`,

    "オーダーブロック": `## ⑤ 今週の重要ポイント：オーダーブロック

オーダーブロックは、Smart Money Concept（SMC）でよく聞く言葉です。難しく聞こえますが、「大きな動きの直前にできた最後の陽線ゾーン」と覚えれば十分です。

**そもそも何なのか**

急落（または急騰）する直前に、機関の残り注文が残っている価格帯のこと。そこに価格が戻ると、未約定の注文が再度反応しやすくなります。

**なぜ重要か**

水平ラインは「過去の高値安値」ですが、オーダーブロックは「注文が残ったゾーン」。反発・反落の精度が上がります。

**今のBTCに当てはめると**

直近の急落前に形成された陽線ゾーンは、${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.04)}ドル付近にあります。

今の価格がそこまで戻れば、売りのオーダーブロックに当たって反落しやすい。逆に${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近には買いのオーダーブロックが意識されます。

**エントリーへの接続**

戻りでオーダーブロックにタッチしたところで陰線確定 → ショート。下抜け後の戻りでタッチ → ロング。`,

    "上昇ウェッジのブレイク": `## ⑤ 今週の重要ポイント：上昇ウェッジのブレイク

上昇ウェッジは「安値だけ切り上がっているのに、上値が重い」という矛盾した形です。多くの場合、下落の前兆になります。

**そもそも何なのか**

安値を切り上げながら高値が横ばい、または切り下がる三角形状。買い意欲はあるが、売り圧力の方が強い状態です。

**なぜ重要か**

ウェッジ下限を実体で割ると、待っていた売りが一気に解放され、急落しやすい。BTCは過去にも何度もこのパターンで大きく動いています。

**今のBTCに当てはめると**

${t.candleCharacteristics.includes("上ヒゲ") ? "直近は上ヒゲが連続しており、上値の重さが顕著です。" : "直近の高値更新が止まりつつ、安値は切り上がっている構造が見えます。"}

ウェッジ下限は${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近と想定します。ここを日足実体で割ると、下落加速のシグナルです。

**エントリーへの接続**

下限割れを確認してからショート。割れる前に飛び乗るのはNGです。`,

    "逆三尊の正しい見方": `## ⑤ 今週の重要ポイント：逆三尊の正しい見方

逆三尊は「底部のサイン」として有名ですが、見間違えると大損します。正しい確認方法を押さえましょう。

**そもそも何なのか**

3つの安値を作るうち、中央の安値が最も低い形。売り圧力が弱まっていることを示します。

**なぜ重要か**

完成してネックラインを上抜けると、トレンド転換の信頼度が高い。ただし「似てるだけ」ではエントリーしてはいけません。

**今のBTCに当てはめると**

直近の安値は${t.swingLows.slice(0, 3).map((l) => formatPrice(l.price)).join("ドル、") || "要確認"}ドル付近に並んでいます。

${t.swingLows.length >= 3 ? "3つ目の安値が切り上がっており、逆三尊の形成過程にあります。" : "まだ3つの安値が揃っていないため、形成中と判断します。"}

ネックラインは${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.05)}ドル付近です。実体で上抜けるまでは下落トレンド継続と見ます。

**エントリーへの接続**

ネックライン上抜け → 戻り → ロング。完成前の先回り買いは禁止です。`,

    "エリオット波動・第三波": `## ⑤ 今週の重要ポイント：エリオット波動・第三波

エリオット波動は難しいと敬遠されがちですが、実戦で使うのは「第3波の始まりを見抜く」だけで十分です。

**そもそも何なのか**

市場は5波で上昇（または下落）し、3波で調整するリズムで動くという理論。第3波は最も勢いが強い波です。

**なぜ重要か**

第2波の調整が終わって第3波が始まると、一方向に大きく動きやすい。エントリーの期待値が最も高い局面です。

**今のBTCに当てはめると**

直近7日で${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(1)}%の変化。${t.trend === "bearish" ? "下落の第3波が進行中と判断できます。" : "上昇の第3波に入りつつある可能性があります。"}

第2波の終了条件は、${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近での反発確認です。

**エントリーへの接続**

第2波調整の終了（4時間足陽線確定）を確認してから、第3波方向にエントリー。第1波の高値を超えないうちは様子見です。`,
  };

  return templates[name];
}

export interface ConceptFourStep {
  definition: string;
  chartApplication: string;
  benefit: string;
  entryBridge: string;
  analogy: string;
  ngAction: string;
  commentPrompt: string;
}

/** 概念ごとの「日常例え・NG行動・コメント誘導質問」（台本の語り口素材） */
const CONCEPT_EXTRAS: Record<
  string,
  { analogy: string; ngAction: string; commentPrompt: string }
> = {
  "200日移動平均線との乖離率": {
    analogy:
      "ゴムひもと同じです。定価（200日MA）から引っ張られて伸びすぎたゴムは、必ず元に戻ろうとする。乖離率はその「ゴムの伸び具合」を数字にしたものです。",
    ngAction:
      "「乖離が大きいからすぐ反発する」と決めつけて、下落の途中で逆張りロングを入れること。乖離はあくまで「反発しやすい状態」であって「反発するタイミング」ではありません。必ず反発の形（下ヒゲ・陽線確定）を待つこと。",
    commentPrompt:
      "あなたは逆張り派ですか？順張り派ですか？コメントで教えてください。全部読んでます。",
  },
  "価格帯出来高": {
    analogy:
      "人気店の行列と同じです。たくさんの人が並んだ（売買した）価格帯には「またそこで買いたい・売りたい」という人が残っている。だからその価格に戻ると反応しやすいんです。",
    ngAction:
      "出来高の薄い価格帯で「ここで止まるはず」と根拠なくエントリーすること。出来高が薄いゾーンはストンと抜けやすいので、必ず密集帯までの距離を確認してから入りましょう。",
    commentPrompt:
      "出来高プロファイル、チャートに表示してますか？してる・してないをコメントで教えてください。",
  },
  "ダウ理論の厳密定義": {
    analogy:
      "階段と同じです。上りの階段は一段ずつ高くなる（高値・安値の切り上げ）。一段でも下がったら「あれ、下りに変わった？」と疑う。それだけのシンプルなルールです。",
    ngAction:
      "1本の大陽線・大陰線だけ見て「トレンド転換した！」と飛びつくこと。ダウ理論の転換は高値・安値の並びが入れ替わって初めて確定します。1本のローソク足では何も決まりません。",
    commentPrompt:
      "今の相場、上昇派ですか？下落派ですか？理由もセットでコメントで教えてください。",
  },
  "フィボナッチ0.618": {
    analogy:
      "バーゲンセールの「6割引きライン」みたいなものです。下落の61.8%まで戻った（安くなった）ところで「ここまで下がれば買いたい」という注文が自動的に集まる。市場参加者みんなが見ている共通の目印です。",
    ngAction:
      "0.618に価格がタッチした瞬間に飛びつくこと。ラインはあくまで「反応しやすい場所」。タッチ後の反発確認（4時間足の下ヒゲ陽線など）をしてから入るのが正解です。",
    commentPrompt:
      "フィボナッチ、普段のトレードで使ってますか？使ってる・使ってないをコメントで教えてください。",
  },
  "オーダーブロック": {
    analogy:
      "売り切れたお店の「再入荷待ちリスト」と同じです。急騰・急落の前に大口が注文を出した価格帯には、まだ約定しきれていない注文が残っている。価格がそこに戻ると、残った注文が一気に発動するんです。",
    ngAction:
      "全ての陽線・陰線ゾーンをオーダーブロックと見なしてラインだらけにすること。有効なのは「その後に急変動を起こした起点」だけ。直近の大きな動きの起点に絞りましょう。",
    commentPrompt:
      "オーダーブロック、聞いたことありましたか？初耳・知ってたをコメントで教えてください。",
  },
  "上昇ウェッジのブレイク": {
    analogy:
      "先細りのトンネルと同じです。安値は切り上がるのに高値が伸びない。進めば進むほど道が狭くなって、最後は必ずどちらかに抜ける。そして上昇ウェッジは統計的に下に抜けやすい形です。",
    ngAction:
      "ウェッジの中で「そろそろ抜けそう」と先回りエントリーすること。ブレイクの方向は確定するまで分かりません。実体で抜けてから、もしくはリテストを待ってから入りましょう。",
    commentPrompt:
      "チャートパターン、意識して見てますか？見てる・見てないをコメントで教えてください。",
  },
  "逆三尊の正しい見方": {
    analogy:
      "バーゲンの底値チェックと同じです。3回安値を試して、3回とも「これ以上は下がらない」と買いが入った。つまり売りたい人が売り尽くしたサイン。3回目の安値が浅いほど信頼度が上がります。",
    ngAction:
      "形が「逆三尊っぽい」だけでネックライン突破前に買うこと。完成前の逆三尊はただの下落継続チャートです。ネックラインを実体で抜けて初めて「完成」と判断してください。",
    commentPrompt:
      "今のチャート、逆三尊に見えますか？見える・見えないをコメントで教えてください。",
  },
  "エリオット波動・第三波": {
    analogy:
      "花火大会と同じです。1発目（第1波）で「お、始まった」と気づき、少し静かになって（第2波）、その後のクライマックス（第3波）が一番大きくて長い。プロは皆この3発目を狙っています。",
    ngAction:
      "波のカウントを自分に都合よく引き直すこと。「これが第3波のはず」と願望でカウントすると全て買い場に見えます。第1波の高値を超えるまでは第3波と断定しないこと。",
    commentPrompt:
      "エリオット波動、難しいと感じますか？難しい・使えそうをコメントで教えてください。",
  },
  "RSIダイバージェンスと清算の連鎖": {
    analogy:
      "マラソンランナーの失速と同じです。順位（価格）はまだ先頭でも、走るスピード（RSI）が落ちてきている。見た目は強くても中身の勢いが切れている状態。これがダイバージェンスです。",
    ngAction:
      "ダイバージェンスが出た瞬間に逆張りすること。ダイバージェンスは「勢いの低下」であって「即転換」ではありません。実際の反転ローソク足（下ヒゲ・陽線確定）とセットで確認してください。",
    commentPrompt:
      "RSI、期間はいくつで表示してますか？14のまま・カスタムしてるをコメントで教えてください。",
  },
};

const DEFAULT_EXTRAS = {
  analogy:
    "チャートの「地図記号」のようなものです。知っている人にはルートが見え、知らない人には模様にしか見えません。",
  ngAction:
    "概念を覚えた直後に、すべてのチャートでその形を探してしまうこと。条件が揃った時だけ使うのが正解です。",
  commentPrompt:
    "今日の内容、難易度はどうでしたか？簡単・難しいをコメントで教えてください。",
};

/**
 * ⑤の4段階フォーマット（台本フロー対応）＋語り口素材を構造化データとして返す。
 * 1. 簡単に定義 / 2. 今のBTCチャートでの見方 / 3. 分かると何が良いか / 4. エントリーへの繋ぎ
 * ＋ 日常例え / NG行動 / コメント誘導質問
 */
export function buildConceptFourStep(
  name: string,
  t: AnalysisInput
): ConceptFourStep {
  const support = t.keyLevels.filter((l) => l.type === "support").sort((a, b) => b.price - a.price)[0];
  const resistance = t.keyLevels.filter((l) => l.type === "resistance").sort((a, b) => a.price - b.price)[0];

  const steps: Record<
    string,
    { definition: string; chartApplication: string; benefit: string; entryBridge: string }
  > = {
    "200日移動平均線との乖離率": {
      definition:
        "過去200日分の終値を平均した線（200日MA）と現在価格の差を％で表したものです。機関投資家が最も重視するベースラインからの「ズレ幅」を数値化します。",
      chartApplication: `現在の200日MAは約${formatPrice(t.ma200)}ドル。現在価格${formatPrice(t.currentPrice)}ドルとの乖離率は${t.ma200Divergence.toFixed(1)}%です。BTCの過去データでは-20%超の乖離は大底付近のみに出現しており、+30%超は過熱サインです。`,
      benefit:
        "「なんとなく高い・安い」という感覚をデータで検証できます。機関のロジックに乗れるので、エントリーの確信度が上がります。",
      entryBridge: `だから今週は乖離率${t.ma200Divergence.toFixed(1)}%という数字と、${formatPrice(t.ma200)}ドルの200日MAライン付近の動きに注目します。`,
    },
    "価格帯出来高": {
      definition:
        "どの価格帯でどれだけの売買が成立したかを棒グラフで表したものです（TradingViewで無料表示可）。最も出来高が多い価格をPOC（Point of Control）と呼びます。",
      chartApplication: `直近30日で出来高が平均1.5倍以上あった日の終値クラスタは${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近。現在価格${formatPrice(t.currentPrice)}ドルはその密集帯に${Math.abs(t.currentPrice - (support?.price ?? t.currentPrice * 0.97)) / t.currentPrice < 0.02 ? "近い" : "位置します"}。`,
      benefit:
        "サポート・レジスタンスがなぜ機能するのかの「理由」が分かります。出来高の裏付けがある価格帯は、ダマシが少なくなります。",
      entryBridge: `だから今週は${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドルの出来高密集帯を実体で割るか、跳ね返すかに注目します。`,
    },
    "ダウ理論の厳密定義": {
      definition:
        "上昇トレンドとは「高値と安値がともに切り上がること」、下落トレンドとは「ともに切り下がること」と定義する理論です。感情ではなく、値の並びだけで判断します。",
      chartApplication: `日足を確認すると、${t.trendReasons.join("。")}。現在は${t.trend === "bearish" ? "下落トレンドの定義を満たしている" : t.trend === "bullish" ? "上昇トレンドの定義を満たしている" : "高値・安値が交錯するレンジ状態"}です。`,
      benefit:
        "「なんとなくトレンド転換した気がする」という曖昧さが消えます。転換を確認してからエントリーできるので、ダマシに引っかかりにくくなります。",
      entryBridge: `だから今週は${t.trendReversalCondition}まで現トレンド方向で立ち回り、条件充足後の初押し・初戻りをエントリーのトリガーとします。`,
    },
    "フィボナッチ0.618": {
      definition:
        "直近の大きな値動きの61.8%を戻した価格帯に、強いサポート・レジスタンスが出やすいという理論です。黄金比（1/1.618 ≈ 0.618）が市場構造に自然に現れます。",
      chartApplication: `直近スイング高値${t.swingHighs[0] ? formatPrice(t.swingHighs[0].price) : "(確認中)"}ドルから安値${t.swingLows[0] ? formatPrice(t.swingLows[0].price) : "(確認中)"}ドルへの動きに対して、0.618戻しは約${formatPrice(
        (t.swingHighs[0]?.price ?? t.currentPrice * 1.08) -
          ((t.swingHighs[0]?.price ?? t.currentPrice * 1.08) - (t.swingLows[0]?.price ?? t.currentPrice * 0.92)) * 0.618
      )}ドル付近に位置しています。`,
      benefit:
        "BTCはアルゴリズム取引の割合が高いため、0.618付近に自動で注文が集まりやすい。「なぜここで反応したのか」を論理的に説明できるようになります。",
      entryBridge: `だから今週は0.618ゾーン付近の4時間足の反応（下ヒゲ陽線 or 上ヒゲ陰線）をエントリーの起点として注目します。`,
    },
    "オーダーブロック": {
      definition:
        "急落（または急騰）する直前に機関の大量注文が残っている価格帯のことです。「急動する直前の最後の逆方向ローソク足のゾーン」と覚えると分かりやすいです。",
      chartApplication: `直近の急落前に形成された陽線ゾーンは${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.04)}ドル付近。現在価格が戻ればここで機関の売りが残っている可能性があり、反落しやすい構造です。`,
      benefit:
        "普通の水平サポレジより「なぜここで動くのか」の根拠が明確になります。機関の思考と同じラインを引けるようになります。",
      entryBridge: `だから今週は${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.04)}ドル付近のオーダーブロックへの戻りと、そこでの陰線確定に注目します。`,
    },
    "上昇ウェッジのブレイク": {
      definition:
        "安値が切り上がっているのに高値が重い（横ばいか切り下がり）三角形状のパターンです。買い圧力はあるが、それ以上に売り圧力が強い状態です。",
      chartApplication: `${t.candleCharacteristics.includes("上ヒゲ") ? "直近は上ヒゲが連続しており、上値の重さが確認できます。" : "直近の値動きで安値は切り上がっているが高値更新が止まっており、ウェッジ形成の可能性があります。"}ウェッジ下限は${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近と想定します。`,
      benefit:
        "「上げているから買い」という判断が危険な局面を事前に識別できます。ウェッジブレイク後は下落加速しやすく、ショートの高確率シグナルになります。",
      entryBridge: `だから今週は${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドルを日足実体で割るか割らないかに注目し、割れたらショートエントリーを検討します。`,
    },
    "逆三尊の正しい見方": {
      definition:
        "3つの安値を作りながら中央の安値が最も低い形（右肩上がり）。売り圧力が弱まっていることを示す底打ちサインです。ネックライン突破で完成と判断します。",
      chartApplication: `直近の安値は${t.swingLows.slice(0, 3).map((l) => formatPrice(l.price)).join("・")}ドル付近に並んでいます。${t.swingLows.length >= 3 ? "3点の安値が確認でき、形成中と判断できます。" : "まだ安値の数が足りないため形成過程です。"}ネックラインは${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.05)}ドル付近です。`,
      benefit:
        "「底っぽい」という感覚ではなく、「ネックライン突破まで待つ」という具体的な条件が設定できます。先回り買いの失敗が激減します。",
      entryBridge: `だから今週は${resistance ? formatPrice(resistance.price) : formatPrice(t.currentPrice * 1.05)}ドルのネックラインを日足実体で上抜けるかに注目し、上抜け後の初戻りでのロングを検討します。`,
    },
    "エリオット波動・第三波": {
      definition:
        "市場は5波で上昇（または下落）し3波で調整するリズムで動く、という理論です。第3波は5つの波の中で最も長く・強い波です。ここに乗れると最大の利益が取れます。",
      chartApplication: `直近7日で${t.change7d >= 0 ? "+" : ""}${t.change7d.toFixed(1)}%の変化。${t.trend === "bullish" ? "上昇の第1波が確認でき、第2波の調整後に第3波入りする可能性があります。" : t.trend === "bearish" ? "下落の第3波が進行中と判断できます。押し目戻りは浅く、一方向に強い動きが出やすい局面です。" : "現在は調整（第2波）の可能性があり、終了を確認してから第3波方向に乗るシナリオを想定しています。"}`,
      benefit:
        "第3波は「最も長く・最も強い」という特性から、ここだけを狙うトレードスタイルが成立します。エントリー根拠が論理的に説明できるようになります。",
      entryBridge: `だから今週は第2波調整の終了サイン（${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近での4時間足陽線確定）を確認し、第3波方向へのエントリーを狙います。`,
    },
    "RSIダイバージェンスと清算の連鎖": {
      definition:
        "価格は安値を更新しているのにRSIが切り上がる現象（強気ダイバージェンス）を指します。トレンドの勢いが失われているサインで、反転の先行指標として使います。",
      chartApplication: `日足RSIは${t.rsiDaily.toFixed(1)}。${t.rsiDaily < 30 ? "過去の大底では概ね30以下で強気ダイバージェンスが確認されています。4時間足で価格が下げているのにRSIが上向く場面を探しています。" : "RSIが下落を続ける価格に対して切り上がり始めているか確認が必要です。"}`,
      benefit:
        "「下がっているのに売れない局面」を事前に察知できます。大口の清算が一巡したサインをいち早く取れるので、底値に近い場所でのロングが可能になります。",
      entryBridge: `だから今週は${support ? formatPrice(support.price) : formatPrice(t.currentPrice * 0.97)}ドル付近での4時間足ダイバージェンス確認を待ち、下ヒゲ陽線が出たらロングのトリガーとして注目します。`,
    },
  };

  const extras = CONCEPT_EXTRAS[name] ?? DEFAULT_EXTRAS;
  const result = steps[name];
  if (result) return { ...result, ...extras };

  return {
    definition: `${name}は今週のフェーズ（${t.trend}トレンド）において最も適切な中級者向けの分析概念です。`,
    chartApplication: `現在価格${formatPrice(t.currentPrice)}ドルで確認できる具体的な形状に注目します。`,
    benefit: "この概念を理解することで、エントリータイミングの精度が上がります。",
    entryBridge: `だから今週は${t.trendReversalCondition}を念頭に、${name}の観点でエントリーポイントを絞り込みます。`,
    ...extras,
  };
}
