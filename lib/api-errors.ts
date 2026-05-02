import type { ZodError } from "zod";

const COPY = {
  extract: {
    title: "We couldn’t parse the nutrition numbers from this photo.",
    hint: "This often happens with glossy bags, two nutrition tables on one package (per 100 g vs per serving), mixed energy units (kJ vs kcal), or values written as less-than such as <0.1 for fat. Try: lay the pack flat, use even lighting, avoid fingers or glare on the numbers, and crop so one nutrition table fills the frame—then tap Analyze label again.",
  },
  advice: {
    title: "Label facts were read, but age-specific tips couldn’t be finalized.",
    hint: "Tap Analyze label again. If it keeps failing, zoom in so only the nutrition panel is visible.",
  },
} as const;

export function validationErrorPayload(stage: keyof typeof COPY, err: ZodError) {
  const block = COPY[stage];
  const includeIssues = process.env.NODE_ENV === "development";
  return {
    error: `${block.title} ${block.hint}`,
    code: `VALIDATION_${stage.toUpperCase()}`,
    stage,
    ...(includeIssues ? { issues: err.flatten() } : {}),
  };
}
