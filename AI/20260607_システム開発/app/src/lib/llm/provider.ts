export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * 使用するプロバイダーを決定する。
 * LLM_PROVIDER 指定があり、かつそのAPIキーが存在すればそれを使用。
 * そうでなければ「キーが設定されているプロバイダー」を Anthropic > OpenAI > Gemini の優先順で自動選択。
 */
function resolveProvider(): "anthropic" | "openai" | "gemini" {
  const pref = process.env.LLM_PROVIDER;
  const hasKey = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
  };

  if (pref === "anthropic" && hasKey.anthropic) return "anthropic";
  if (pref === "openai" && hasKey.openai) return "openai";
  if (pref === "gemini" && hasKey.gemini) return "gemini";

  if (hasKey.anthropic) return "anthropic";
  if (hasKey.openai) return "openai";
  if (hasKey.gemini) return "gemini";

  return (pref as "anthropic" | "openai" | "gemini") ?? "openai";
}

export async function callLlm(
  systemPrompt: string,
  userPrompt: string
): Promise<string> {
  switch (resolveProvider()) {
    case "anthropic":
      return callAnthropic(systemPrompt, userPrompt);
    case "gemini":
      return callGemini(systemPrompt, userPrompt);
    default:
      return callOpenAI(systemPrompt, userPrompt);
  }
}

async function callOpenAI(system: string, user: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return fallbackGeneration(system, user);
  }

  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL ?? "gpt-4o",
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.4,
      max_tokens: 8000,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`OpenAI API error: ${res.status} ${err}`);
  }

  const json = (await res.json()) as {
    choices: Array<{ message: { content: string } }>;
  };
  return json.choices[0]?.message?.content ?? "";
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return fallbackGeneration(system, user);

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
      max_tokens: 8000,
      system,
      messages: [{ role: "user", content: user }],
    }),
  });

  if (!res.ok) throw new Error(`Anthropic API error: ${res.status}`);
  const json = (await res.json()) as {
    content: Array<{ type: string; text: string }>;
  };
  return json.content.find((c) => c.type === "text")?.text ?? "";
}

async function callGemini(system: string, user: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return fallbackGeneration(system, user);

  const model = process.env.GEMINI_MODEL ?? "gemini-2.0-flash";
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ parts: [{ text: user }] }],
        generationConfig: { temperature: 0.4, maxOutputTokens: 8000 },
      }),
    }
  );

  if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);
  const json = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  return json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
}

function fallbackGeneration(_system: string, user: string): string {
  // Rule-based fallback when no API key — extracts context from user prompt
  try {
    const match = user.match(/"technical"\s*:\s*(\{[\s\S]*?\})\s*,\s*"/);
    if (match) {
      const technical = JSON.parse(match[1]) as {
        currentPrice: number;
        trend: string;
        scenarios: Record<string, Record<string, string>>;
        conceptSuggestion: { name: string };
      };
      return buildFallbackFromTechnical(technical, user.includes("台本"));
    }
  } catch {
    // continue
  }
  throw new Error(
    "LLM APIキーが未設定です。.env に OPENAI_API_KEY 等を設定してください。"
  );
}

function buildFallbackFromTechnical(
  t: {
    currentPrice: number;
    trend: string;
    scenarios: Record<string, Record<string, string>>;
    conceptSuggestion: { name: string };
  },
  isScript: boolean
): string {
  if (isScript) {
    const b = t.scenarios.bullish;
    const s = t.scenarios.bearish;
    return `# 台本（フォールバック生成）\n\n## ① 導入\n\n今のビットコイン、${t.currentPrice.toLocaleString()}ドル。${t.trend === "bearish" ? "下落優勢" : "方向感が出ています"}。\n\n## ④ BTCの現在地\n\n現在${t.currentPrice.toLocaleString()}ドル付近。\n\n## ⑤ ${t.conceptSuggestion.name}\n\n## ⑦ アクションプラン\n\n**上昇**: ${b.entry}\n損切り: ${b.stopLoss}\n利確: ${b.takeProfit1} / ${b.takeProfit2}\n\n**下落**: ${s.entry}\n損切り: ${s.stopLoss}\n利確: ${s.takeProfit1} / ${s.takeProfit2}`;
  }

  const b = t.scenarios.bullish;
  const s = t.scenarios.bearish;
  return `# BTC市況レポート\n\n## 1. サマリー\nBTCは${t.currentPrice.toLocaleString()}ドル付近で推移。\n\n## 5. シナリオ\n### 上昇\n- エントリー: ${b.entry}\n- 損切り: ${b.stopLoss}\n- 利確1: ${b.takeProfit1}\n- 利確2: ${b.takeProfit2}\n\n### 下落\n- エントリー: ${s.entry}\n- 損切り: ${s.stopLoss}\n- 利確1: ${s.takeProfit1}\n- 利確2: ${s.takeProfit2}`;
}
