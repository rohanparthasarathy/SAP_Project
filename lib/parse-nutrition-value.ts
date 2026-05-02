/**
 * Coerce model / label text into a number for Zod, or null.
 * Handles stringified numbers, thousands separators, and common label forms like "<0.1".
 */
export function parseNutritionNumber(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (typeof value === "boolean") return null;
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "" || s === "—" || s === "-" || /^n\/?a$/i.test(s) || /^nd$/i.test(s) || s === "*") {
      return null;
    }
    const less = s.match(/^<\s*([\d.]+)\s*$/i);
    if (less) {
      const cap = parseFloat(less[1].replace(",", "."));
      if (!Number.isNaN(cap)) {
        // Trace amount: use half the bound for storage (e.g. <0.1 -> 0.05)
        return cap / 2;
      }
    }
    const first = s.match(/-?\d[\d,]*(?:\.\d+)?/);
    if (first) {
      const n = parseFloat(first[0].replace(/,/g, ""));
      if (!Number.isNaN(n)) return n;
    }
  }
  return null;
}

export function parseNullableString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") {
    const t = value.trim();
    return t === "" ? null : t;
  }
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}
