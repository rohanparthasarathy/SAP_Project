"use client";

import type { AdviceBullet, AgeAdvice } from "@/lib/age-advice-schema";
import {
  appendHistory,
  deleteHistoryEntry,
  loadHistory,
  type HistoryEntry,
} from "@/lib/history";
import type { NutritionExtracted } from "@/lib/schema";
import { useCallback, useEffect, useState } from "react";

type AnalyzeResponse = {
  extracted: NutritionExtracted;
  ageAdvice: AgeAdvice;
  quota?: {
    remaining: number | null;
    limit: number | null;
    unlimited: boolean;
    resetsInSeconds: number;
  };
  usage?: { totalSuccessfulAnalyzes: number };
};

type QuotaInfo = {
  remaining: number | null;
  limit: number | null;
  used: number | null;
  unlimited: boolean;
  resetsInSeconds: number;
  totalSuccessfulAnalyzes: number | null;
};

function fmtNum(n: number | null | undefined, suffix = ""): string {
  if (n == null || Number.isNaN(n)) return "—";
  const rounded = Math.round(n * 100) / 100;
  return `${rounded}${suffix}`;
}

async function makeThumbnailDataUrl(file: File): Promise<string | undefined> {
  try {
    const bmp = await createImageBitmap(file);
    const maxW = 160;
    const scale = Math.min(1, maxW / bmp.width);
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;
    ctx.drawImage(bmp, 0, 0, w, h);
    bmp.close();
    return canvas.toDataURL("image/jpeg", 0.65);
  } catch {
    return undefined;
  }
}

function formatWhen(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

type Tab = "analyze" | "history";

export default function Home() {
  const [tab, setTab] = useState<Tab>("analyze");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  const [historyList, setHistoryList] = useState<HistoryEntry[]>([]);
  const [historyDetailId, setHistoryDetailId] = useState<string | null>(null);

  const [quota, setQuota] = useState<QuotaInfo | null>(null);

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/quota");
      const data = (await res.json()) as Partial<QuotaInfo>;
      if (typeof data.unlimited === "boolean") {
        setQuota({
          remaining: data.remaining ?? null,
          limit: data.limit ?? null,
          used: data.used ?? null,
          unlimited: data.unlimited,
          resetsInSeconds: data.resetsInSeconds ?? 86400,
          totalSuccessfulAnalyzes:
            typeof data.totalSuccessfulAnalyzes === "number" ? data.totalSuccessfulAnalyzes : null,
        });
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    setHistoryList(loadHistory());
  }, [tab, result]);

  useEffect(() => {
    refreshQuota();
  }, [refreshQuota]);

  const onPick = useCallback((f: File | null) => {
    setError(null);
    setResult(null);
    setFile(f);
    setConfirmed(false);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return f ? URL.createObjectURL(f) : null;
    });
  }, []);

  const onAnalyze = useCallback(async () => {
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    if (!confirmed) {
      setError("Confirm that your photo shows a Nutrition Facts panel.");
      return;
    }
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const body = new FormData();
      body.set("image", file);
      body.set("confirmedNutritionLabel", "true");
      const res = await fetch("/api/analyze", {
        method: "POST",
        body,
      });
      const data = await res.json().catch(() => ({}));

      if (data.quota && typeof data.quota === "object") {
        const q = data.quota as AnalyzeResponse["quota"];
        if (q && typeof q.unlimited === "boolean") {
          setQuota((prev) => ({
            remaining: q.remaining ?? null,
            limit: q.limit ?? null,
            used:
              q.remaining != null && q.limit != null ? q.limit - q.remaining : null,
            unlimited: q.unlimited,
            resetsInSeconds: q.resetsInSeconds ?? 86400,
            totalSuccessfulAnalyzes:
              typeof (data as AnalyzeResponse).usage?.totalSuccessfulAnalyzes === "number"
                ? (data as AnalyzeResponse).usage!.totalSuccessfulAnalyzes
                : (prev?.totalSuccessfulAnalyzes ?? null),
          }));
        }
      }

      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Request failed");
      }
      const payload = data as AnalyzeResponse;
      setResult(payload);

      const thumb = await makeThumbnailDataUrl(file);
      appendHistory({
        productName: payload.extracted.productName,
        extracted: payload.extracted,
        ageAdvice: payload.ageAdvice,
        thumbnailDataUrl: thumb,
      });
      setHistoryList(loadHistory());
      refreshQuota();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
      refreshQuota();
    } finally {
      setLoading(false);
    }
  }, [file, confirmed, refreshQuota]);

  const renderFacts = (ex: NutritionExtracted) => (
    <>
      {ex.confidenceLow && (
        <p className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100">
          Low confidence read — verify numbers against the photo.
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-sm">
          <tbody className="divide-y divide-white/10">
            {[
              { label: "Product", value: ex.productName ?? "—" },
              { label: "Serving size", value: ex.servingSize ?? "—" },
              { label: "Servings / container", value: fmtNum(ex.servingsPerContainer) },
              { label: "Calories", value: fmtNum(ex.calories) },
              { label: "Total fat (g)", value: fmtNum(ex.totalFatG) },
              { label: "Sat. fat (g)", value: fmtNum(ex.saturatedFatG) },
              { label: "Trans fat (g)", value: fmtNum(ex.transFatG) },
              { label: "Cholesterol (mg)", value: fmtNum(ex.cholesterolMg) },
              { label: "Sodium (mg)", value: fmtNum(ex.sodiumMg) },
              { label: "Total carb (g)", value: fmtNum(ex.totalCarbG) },
              { label: "Fiber (g)", value: fmtNum(ex.dietaryFiberG) },
              { label: "Total sugars (g)", value: fmtNum(ex.totalSugarsG) },
              { label: "Added sugars (g)", value: fmtNum(ex.addedSugarsG) },
              { label: "Protein (g)", value: fmtNum(ex.proteinG) },
            ].map((row) => (
              <tr key={row.label} className="bg-black/20">
                <th className="w-2/5 px-4 py-2 font-medium text-slate-400">{row.label}</th>
                <td className="px-4 py-2 text-slate-100">{row.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {ex.ingredients && (
        <div className="mt-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wider text-slate-400">
            Ingredients
          </h3>
          <p className="rounded-lg bg-black/25 p-4 text-sm leading-relaxed text-slate-200">
            {ex.ingredients}
          </p>
        </div>
      )}
    </>
  );

  const renderBulletList = (bullets: AdviceBullet[]) => (
    <ul className="space-y-2.5">
      {bullets.map((b, i) => {
        const tone =
          b.sentiment === "good"
            ? "border-emerald-500/80 bg-emerald-950/40 text-emerald-200"
            : b.sentiment === "bad"
              ? "border-red-500/80 bg-red-950/35 text-red-200"
              : "border-slate-500/50 bg-slate-950/40 text-slate-300";
        const marker =
          b.sentiment === "good" ? "text-emerald-400" : b.sentiment === "bad" ? "text-red-400" : "text-slate-400";
        return (
          <li
            key={i}
            className={`flex gap-2 rounded-lg border px-2.5 py-2 text-sm leading-snug ${tone}`}
          >
            <span className={`mt-0.5 shrink-0 font-bold ${marker}`} aria-hidden>
              •
            </span>
            <span>{b.text}</span>
          </li>
        );
      })}
    </ul>
  );

  const renderAgeSections = (adv: AgeAdvice) => (
    <div className="rounded-2xl border border-white/10 bg-black/25 p-4 sm:p-5">
      <p className="mb-4 flex flex-wrap items-center gap-4 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden />
          Green = positive or helpful
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden />
          Red = concern or downside
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-slate-500" aria-hidden />
          Gray = neutral / factual
        </span>
      </p>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3 lg:gap-5">
        <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="mb-3 border-b border-white/10 pb-2 text-center text-sm font-semibold text-slate-100">
            Adults (20+)
          </h3>
          {renderBulletList(adv.adults)}
        </div>
        <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="mb-1 border-b border-white/10 pb-2 text-center text-sm font-semibold text-slate-100">
            Children (under 12)
          </h3>
          <p className="mb-3 text-center text-[11px] text-slate-500">For parents / caregivers</p>
          {renderBulletList(adv.childrenUnder12)}
        </div>
        <div className="flex min-h-0 flex-col rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <h3 className="mb-3 border-b border-white/10 pb-2 text-center text-sm font-semibold text-slate-100">
            Teens (13–19)
          </h3>
          {renderBulletList(adv.teens13to19)}
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto max-w-6xl px-6 py-10 pb-24">
      <header className="mb-8">
        <h1 className="bg-gradient-to-r from-sky-400 to-indigo-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
          Nutrition label analyzer
        </h1>
        <p className="mt-2 text-slate-400">
          Upload a clear photo of a nutrition facts panel (JPEG, PNG, or WebP). Results are
          educational and not medical advice.
        </p>
        {quota && (
          <div className="mt-3 space-y-2">
            <p className="rounded-lg border border-white/10 bg-white/[0.06] px-4 py-2 text-sm text-slate-300">
              {quota.unlimited ? (
                <span>Analyze quota: unlimited (admin override).</span>
              ) : (
                <span>
                  Analyses remaining today:{" "}
                  <strong className="text-sky-300">{quota.remaining ?? 0}</strong>
                  {quota.limit != null ? (
                    <>
                      {" "}
                      of <strong className="text-slate-200">{quota.limit}</strong>
                    </>
                  ) : null}{" "}
                  (UTC day; resets in about{" "}
                  {Math.max(
                    1,
                    Math.round((quota.resetsInSeconds ?? 0) / 3600),
                  )}{" "}
                  h).
                </span>
              )}
            </p>
            <p className="rounded-lg border border-indigo-500/20 bg-indigo-950/20 px-4 py-2 text-sm text-slate-300">
              Successful analyzes completed (site-wide, all time):{" "}
              <strong className="text-indigo-300">
                {quota.totalSuccessfulAnalyzes != null ? quota.totalSuccessfulAnalyzes.toLocaleString() : "—"}
              </strong>
            </p>
          </div>
        )}
      </header>

      <div className="mb-6 flex gap-2 rounded-xl border border-white/10 bg-black/20 p-1">
        <button
          type="button"
          onClick={() => {
            setTab("analyze");
            setHistoryDetailId(null);
          }}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            tab === "analyze"
              ? "bg-white/15 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          Analyze
        </button>
        <button
          type="button"
          onClick={() => {
            setTab("history");
            setHistoryList(loadHistory());
          }}
          className={`flex-1 rounded-lg py-2 text-sm font-semibold transition ${
            tab === "history"
              ? "bg-white/15 text-white shadow"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          History
        </button>
      </div>

      {tab === "analyze" && (
        <>
          <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.06] p-6 shadow-xl backdrop-blur-md">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="flex-1">
                <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Label image
                </label>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="block w-full text-sm text-slate-200 file:mr-4 file:rounded-lg file:border-0 file:bg-sky-500/90 file:px-4 file:py-2 file:text-sm file:font-semibold file:text-slate-950 hover:file:bg-sky-400"
                  onChange={(e) => onPick(e.target.files?.[0] ?? null)}
                />
              </div>
              <button
                type="button"
                onClick={onAnalyze}
                disabled={
                  loading ||
                  !file ||
                  !confirmed ||
                  (quota !== null && !quota.unlimited && (quota.remaining ?? 0) <= 0)
                }
                className="rounded-xl bg-gradient-to-br from-sky-400 to-indigo-500 px-5 py-2.5 font-semibold text-slate-950 shadow-lg transition enabled:hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? "Analyzing…" : "Analyze label"}
              </button>
            </div>

            <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-slate-300">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
                className="mt-1 h-4 w-4 rounded border-white/20 bg-black/30 text-sky-500 focus:ring-sky-500"
              />
              <span>
                I confirm this image shows a Nutrition Facts panel (or equivalent nutrient summary on
                packaged food).
              </span>
            </label>

            {previewUrl && (
              <div className="mt-6">
                <p className="mb-2 text-xs uppercase tracking-wider text-slate-500">Preview</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={previewUrl}
                  alt="Selected label"
                  className="max-h-64 w-auto rounded-lg border border-white/10 object-contain"
                />
              </div>
            )}

            {error && (
              <p className="mt-4 text-sm text-red-300" role="alert">
                {error}
              </p>
            )}
          </section>

          {result && (
            <>
              <section className="mb-8 rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-md">
                <h2 className="mb-4 text-lg font-semibold text-indigo-300">Age-specific guidance</h2>
                <p className="mb-6 text-sm text-slate-400">
                  Bands are approximate (e.g. ages 12–13). Not medical advice.
                </p>
                {renderAgeSections(result.ageAdvice)}
              </section>

              <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-md">
                <h2 className="mb-4 text-lg font-semibold text-sky-300">Extracted facts</h2>
                {renderFacts(result.extracted)}
              </section>
            </>
          )}
        </>
      )}

      {tab === "history" && (
        <section className="rounded-2xl border border-white/10 bg-white/[0.06] p-6 backdrop-blur-md">
          <h2 className="mb-4 text-lg font-semibold text-sky-300">Past analyses</h2>
          <p className="mb-4 text-sm text-slate-400">
            Stored only in this browser (localStorage). Clearing site data removes history. A future
            version may sync to an account.
          </p>
          {historyList.length === 0 ? (
            <p className="text-slate-500">No saved analyses yet. Run one from the Analyze tab.</p>
          ) : (
            <ul className="space-y-2">
              {historyList.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    onClick={() => setHistoryDetailId(entry.id === historyDetailId ? null : entry.id)}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-left transition hover:border-white/20"
                  >
                    {entry.thumbnailDataUrl && (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img
                        src={entry.thumbnailDataUrl}
                        alt=""
                        className="h-14 w-14 shrink-0 rounded-lg object-cover"
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-100">
                        {entry.productName ?? "Unknown product"}
                      </p>
                      <p className="text-xs text-slate-500">{formatWhen(entry.at)}</p>
                    </div>
                    <span className="text-xs text-slate-500">
                      {historyDetailId === entry.id ? "Hide" : "View"}
                    </span>
                  </button>
                  {historyDetailId === entry.id && (
                    <div className="mt-3 rounded-xl border border-white/10 bg-black/30 p-4">
                      <h3 className="mb-3 text-sm font-semibold text-indigo-300">
                        Saved recommendations
                      </h3>
                      <div className="mb-6">{renderAgeSections(entry.ageAdvice)}</div>
                      <h3 className="mb-3 text-sm font-semibold text-sky-300">Extracted facts</h3>
                      <div className="mb-6">{renderFacts(entry.extracted)}</div>
                      <button
                        type="button"
                        className="mt-4 text-sm text-red-400 underline hover:text-red-300"
                        onClick={() => {
                          deleteHistoryEntry(entry.id);
                          setHistoryList(loadHistory());
                          setHistoryDetailId(null);
                        }}
                      >
                        Remove from history
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <footer className="mt-12 text-center text-xs leading-relaxed text-slate-500">
        <p>
          For education only — not medical or dietary advice. AI can misread labels; confirm important
          values on the package.
        </p>
        <p className="mt-2">
          Legacy tool:{" "}
          <a href="/ist-world-clock.html" className="text-sky-400 underline hover:text-sky-300">
            IST World Clock
          </a>
        </p>
      </footer>
    </div>
  );
}
