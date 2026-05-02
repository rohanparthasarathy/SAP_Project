import { z } from "zod";
import { parseNullableString, parseNutritionNumber } from "@/lib/parse-nutrition-value";

const nullableStr = z
  .preprocess((v) => parseNullableString(v), z.union([z.string(), z.null()]))
  .transform((v) => v ?? null);

const nullableNum = z
  .preprocess((v) => parseNutritionNumber(v), z.union([z.number(), z.null()]))
  .transform((v) => (v === null || Number.isNaN(v) ? null : v));

/** Parsed nutrition facts + ingredients from a label image (best-effort). */
export const NutritionExtractedSchema = z.object({
  productName: nullableStr,
  servingSize: nullableStr,
  servingsPerContainer: nullableNum,
  calories: nullableNum,
  totalFatG: nullableNum,
  saturatedFatG: nullableNum,
  transFatG: nullableNum,
  cholesterolMg: nullableNum,
  sodiumMg: nullableNum,
  totalCarbG: nullableNum,
  dietaryFiberG: nullableNum,
  totalSugarsG: nullableNum,
  addedSugarsG: nullableNum,
  proteinG: nullableNum,
  ingredients: nullableStr,
  confidenceLow: z
    .preprocess((v) => {
      if (typeof v === "string") {
        const t = v.toLowerCase().trim();
        if (t === "true" || t === "yes" || t === "1") return true;
        if (t === "false" || t === "no" || t === "0") return false;
      }
      return v;
    }, z.boolean())
    .optional()
    .transform((v) => v ?? false),
});

export type NutritionExtracted = z.infer<typeof NutritionExtractedSchema>;
