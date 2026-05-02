import OpenAI from "openai";
import { AgeAdviceSchema, type AgeAdvice } from "@/lib/age-advice-schema";
import type { NutritionExtracted } from "@/lib/schema";

export type { AgeAdvice };

const ADVICE_SYSTEM = `You are a careful nutrition literacy assistant. You receive structured data parsed from a food label (may be incomplete or wrong).
Output a single JSON object with exactly these keys: adults, childrenUnder12, teens13to19.
Each value is an array of 3 to 6 objects. Each object has:
- "text": one concise bullet (max ~20 words), plain language, no HTML
- "sentiment": exactly one of "good", "bad", "neutral"
  - "good" = a positive or helpful aspect (e.g. reasonable portions, useful protein, lower sugar for context)
  - "bad" = a concern (e.g. high sodium/sugar, trans fat, very high calories for a small serving, lots of added sugar)
  - "neutral" = purely factual or mixed, not clearly good or bad

Do not diagnose disease. Do not invent numbers not in the JSON. If data is missing, use neutral bullets saying so.
Audiences: adults = 20+; childrenUnder12 = under 12 (write for parents/caregivers); teens13to19 = 13–19.`;

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  if (fence) return fence[1].trim();
  return trimmed;
}

export async function generateAgeGroupAdvice(
  extracted: NutritionExtracted,
): Promise<AgeAdvice> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL_ADVICE ?? "gpt-4o-mini";
  const client = new OpenAI({ apiKey });

  const payload = JSON.stringify(extracted, null, 0);

  const response = await client.chat.completions.create({
    model,
    temperature: 0.4,
    max_tokens: Math.min(4096, parseInt(process.env.OPENAI_ADVICE_MAX_TOKENS ?? "1200", 10) || 1200),
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: ADVICE_SYSTEM },
      {
        role: "user",
        content: `Label data (JSON): ${payload}

Return JSON: adults, childrenUnder12, teens13to19 as arrays of { "text", "sentiment" } as specified.`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from age-advice model");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    throw new Error("Age-advice model returned non-JSON output");
  }

  return AgeAdviceSchema.parse(parsed);
}
