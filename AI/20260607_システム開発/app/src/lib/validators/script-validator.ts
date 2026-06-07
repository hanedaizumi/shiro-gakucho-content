import type { ReportJson, ValidationResult } from "@/lib/types";

const NG_WORDS = ["可能性", "かもしれない", "絶対に", "誰でも", "簡単に", "スマホで5分"];
const REQUIRED_SECTIONS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨",
];
const SCENARIO_KEYWORDS = ["エントリー", "損切り", "利確"];

export function validateScript(
  markdown: string,
  report: ReportJson,
  episodeUsed?: string | null,
  usedEpisodes: string[] = []
): ValidationResult {
  const checks: ValidationResult["checks"] = [];
  const charCount = markdown.replace(/\s/g, "").length;

  // Char count
  checks.push({
    id: "char_count",
    label: "文字数（4,000文字以上）",
    passed: charCount >= 4000,
    message: `現在 ${charCount} 文字`,
  });

  // Sections
  for (const sec of REQUIRED_SECTIONS) {
    checks.push({
      id: `section_${sec}`,
      label: `セクション${sec}が存在`,
      passed: markdown.includes(sec),
    });
  }

  // Concept: RSI must not be main topic in ⑤
  const section5 = markdown.split("## ⑤")[1]?.split("## ⑥")[0] ?? "";
  const conceptName = (report.weeklyConcept as Record<string, string>).name ?? "";
  const rsiAsMain =
    /## ⑤[^\n]*RSI(?!ダイバージェンス)/i.test(markdown) ||
    (section5.slice(0, 60).match(/^## ⑤[^\n]*RSI$/m) !== null);
  checks.push({
    id: "concept_not_rsi",
    label: "⑤の主題がRSI単体ではない",
    passed: !rsiAsMain || conceptName.includes("ダイバージェンス"),
    message: rsiAsMain ? "RSI単体が主題になっています" : conceptName,
  });

  checks.push({
    id: "confluence_structure",
    label: "④にコンフルエンス/フェーズ記述あり",
    passed: /コンフルエンス|フェーズ|構造レイヤー/.test(markdown.split("## ⑤")[0] ?? ""),
  });

  checks.push({
    id: "three_part_concept",
    label: "⑤に3段構成（学習・分析・実践）",
    passed: /学習/.test(section5) && /分析/.test(section5) && /実践/.test(section5),
  });

  // NG words
  const ngFound = NG_WORDS.filter((w) => markdown.includes(w));
  checks.push({
    id: "ng_words",
    label: "NGワードなし",
    passed: ngFound.length === 0,
    message: ngFound.length ? `検出: ${ngFound.join(", ")}` : undefined,
  });

  // Scenario fields
  const section7 = markdown.split("## ⑦")[1]?.split("## ⑧")[0] ?? markdown;
  for (const kw of SCENARIO_KEYWORDS) {
    const count = (section7.match(new RegExp(kw, "g")) ?? []).length;
    checks.push({
      id: `scenario_${kw}`,
      label: `⑦に${kw}が2回以上`,
      passed: count >= 2,
      message: `${count}回`,
    });
  }

  // Vantage: mid only
  const vantageCount = (markdown.match(/Vantage/gi) ?? []).length;
  const lastThird = markdown.slice(Math.floor(markdown.length * 0.7));
  const vantageInEnding = /Vantage/i.test(lastThird) && !/Discord/i.test(lastThird.slice(lastThird.search(/Vantage/i) - 50, lastThird.search(/Vantage/i)));
  checks.push({
    id: "vantage_mid",
    label: "Vantageは中盤CTA中心（末尾単独訴求なし）",
    passed: vantageCount <= 3 && !vantageInEnding,
    message: `Vantage言及 ${vantageCount}回`,
  });

  // Comment引导
  checks.push({
    id: "comment_cta",
    label: "コメント誘導（全部読んで）",
    passed: /全部読んで|全部読んでます|全部読んでいます/.test(markdown),
  });

  // Next episode
  checks.push({
    id: "next_preview",
    label: "次回予告あり",
    passed: /次回は/.test(markdown),
  });

  // Authority episode
  checks.push({
    id: "authority_episode",
    label: "権威性エピソードあり",
    passed: /年前|月利|溶かした|野村|感情/.test(markdown.slice(0, 1500)),
  });

  // Episode not repeated
  if (episodeUsed) {
    const repeated = usedEpisodes.some(
      (e) => e.slice(0, 30) === episodeUsed.slice(0, 30)
    );
    checks.push({
      id: "episode_unique",
      label: "エピソードが直近と被っていない",
      passed: !repeated,
    });
  }

  // Price consistency
  const reportPrice = report.technical.currentPrice;
  const pricePattern = /\d{2,3}[,.]?\d{0,3}\s*ドル/g;
  const scriptPrices = [...markdown.matchAll(pricePattern)].map((m) =>
    parseFloat(m[0].replace(/[,ドル\s]/g, ""))
  );
  const nearCurrent = scriptPrices.some(
    (p) => Math.abs(p - reportPrice) / reportPrice < 0.05
  );
  checks.push({
    id: "price_consistency",
    label: "台本に現在価格付近の記述あり",
    passed: nearCurrent,
    message: `レポート価格: ${reportPrice}`,
  });

  const passed = checks.every((c) => c.passed);

  return { passed, checks, charCount, ngWords: ngFound };
}
