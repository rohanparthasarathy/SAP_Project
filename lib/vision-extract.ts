import OpenAI from "openai";
import { NutritionExtractedSchema, type NutritionExtracted } from "@/lib/schema";

export type VisionExtractOutcome =
  | { ok: true; extracted: NutritionExtracted }
  | { ok: false; notLabel: true; reason?: string };

const COMBINED_SYSTEM = `You classify images and extract nutrition facts in one JSON reply only. No markdown fences.
First decide: does the image clearly show a Nutrition Facts panel, Nutrition Information table, or equivalent nutrient summary on packaged food?
Set "isNutritionLabel" to true only if such a panel is clearly visible.
If false, set "isNutritionLabel": false and optionally "reason" (short). Omit or null other fields.

If true, extract exactly these keys with numbers as JSON numbers (not strings): productName, servingSize, servingsPerContainer, calories, totalFatG, saturatedFatG, transFatG, cholesterolMg, sodiumMg, totalCarbG, dietaryFiberG, totalSugarsG, addedSugarsG, proteinG, ingredients (string or null), confidenceLow (boolean).
Use null if unreadable. For "<0.1" style values use a small decimal like 0.05 or null.
If two nutrition tables exist, prefer one consistent table (e.g. per serving). Keep answers concise.`;

const COMBINED_USER = `Return one JSON object with isNutritionLabel and, when true, all nutrition keys listed in the instructions.`;

function stripJsonFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```(?:json)?\s*([\s\S]*?)```$/m.exec(trimmed);
  if (fence) return fence[1].trim();
  return trimmed;
}

export type VisionDetail = "low" | "high" | "auto";

export function getVisionDetail(): VisionDetail {
  const v = (process.env.OPENAI_VISION_DETAIL ?? "low").toLowerCase();
  if (v === "high" || v === "low" || v === "auto") return v;
  return "low";
}

/**
 * Single vision API call: gate + extraction (minimizes tokens vs two separate vision calls).
 */
export async function analyzeLabelImageVision(params: {
  base64: string;
  mimeType: string;
}): Promise<VisionExtractOutcome> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  const model = process.env.OPENAI_MODEL ?? "gpt-4o";
  const detail = getVisionDetail();
  const maxTokens = Math.min(
    4096,
    Math.max(400, parseInt(process.env.OPENAI_VISION_MAX_TOKENS ?? "1400", 10) || 1400),
  );

  const client = new OpenAI({ apiKey });

  const response = await client.chat.completions.create({
    model,
    temperature: 0.15,
    max_tokens: maxTokens,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: COMBINED_SYSTEM },
      {
        role: "user",
        content: [
          { type: "text", text: COMBINED_USER },
          {
            type: "image_url",
            image_url: {
              url: `data:${params.mimeType};base64,${params.base64}`,
              detail,
            },
          },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from vision model");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonFence(content));
  } catch {
    throw new Error("Vision model returned non-JSON output");
  }

  const flag = parsed as Record<string, unknown>;
  const isLabel =
    typeof flag.isNutritionLabel === "boolean"
      ? flag.isNutritionLabel
      : String(flag.isNutritionLabel).toLowerCase() === "true";

  if (!isLabel) {
    const reason =
      typeof flag.reason === "string"
        ? flag.reason
        : typeof flag.reason === "number"
          ? String(flag.reason)
          : undefined;
    return { ok: false, notLabel: true, reason };
  }

  const extracted = NutritionExtractedSchema.parse(parsed);
  return { ok: true, extracted };
}
