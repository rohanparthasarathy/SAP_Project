import { z } from "zod";

/** Map common model synonyms to our enum */
function normalizeSentiment(val: unknown): unknown {
  if (typeof val !== "string") return val;
  const k = val.toLowerCase().trim();
  const map: Record<string, "good" | "bad" | "neutral"> = {
    good: "good",
    bad: "bad",
    neutral: "neutral",
    positive: "good",
    negative: "bad",
    warning: "bad",
    warn: "bad",
    concern: "bad",
    risk: "bad",
    ok: "good",
    helpful: "good",
    mixed: "neutral",
    factual: "neutral",
    info: "neutral",
  };
  return map[k] ?? val;
}

/** "good" = positive aspect; "bad" = concern or downside; "neutral" = factual or mixed */
export const AdviceSentimentSchema = z.preprocess(
  normalizeSentiment,
  z.enum(["good", "bad", "neutral"]),
);

export const AdviceBulletSchema = z.object({
  text: z.preprocess((v) => (typeof v === "number" ? String(v) : v), z.string()),
  sentiment: AdviceSentimentSchema,
});

export type AdviceBullet = z.infer<typeof AdviceBulletSchema>;
export type AdviceSentiment = z.infer<typeof AdviceSentimentSchema>;

const bulletList = z.array(AdviceBulletSchema).min(1).max(12);

export const AgeAdviceSchema = z.object({
  adults: bulletList,
  childrenUnder12: bulletList,
  teens13to19: bulletList,
});

export type AgeAdvice = z.infer<typeof AgeAdviceSchema>;
