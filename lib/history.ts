import type { AgeAdvice } from "@/lib/age-advice-schema";
import type { NutritionExtracted } from "@/lib/schema";

const STORAGE_KEY = "sap-health-label-history-v2";
export const MAX_HISTORY_ENTRIES = 40;

export type HistoryEntry = {
  id: string;
  at: string;
  productName: string | null;
  extracted: NutritionExtracted;
  ageAdvice: AgeAdvice;
  /** Small JPEG data URL or omitted to save space */
  thumbnailDataUrl?: string;
};

function safeParse(raw: string | null): HistoryEntry[] {
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as unknown;
    if (!Array.isArray(data)) return [];
    return data.filter(isHistoryEntry);
  } catch {
    return [];
  }
}

function isHistoryEntry(x: unknown): x is HistoryEntry {
  if (typeof x !== "object" || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    typeof o.at === "string" &&
    o.extracted !== undefined &&
    o.ageAdvice !== undefined &&
    typeof o.ageAdvice === "object" &&
    o.ageAdvice !== null
  );
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  return safeParse(window.localStorage.getItem(STORAGE_KEY));
}

export function saveHistory(entries: HistoryEntry[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function appendHistory(entry: Omit<HistoryEntry, "id" | "at"> & { id?: string; at?: string }): HistoryEntry {
  const full: HistoryEntry = {
    ...entry,
    id: entry.id ?? crypto.randomUUID(),
    at: entry.at ?? new Date().toISOString(),
  };
  const prev = loadHistory();
  const next = [full, ...prev.filter((e) => e.id !== full.id)].slice(0, MAX_HISTORY_ENTRIES);
  saveHistory(next);
  return full;
}

export function getHistoryEntry(id: string): HistoryEntry | undefined {
  return loadHistory().find((e) => e.id === id);
}

export function deleteHistoryEntry(id: string): void {
  saveHistory(loadHistory().filter((e) => e.id !== id));
}
