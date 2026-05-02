import { NextResponse } from "next/server";
import { ZodError } from "zod";
import {
  assertQuotaAllows,
  consumeAnalyzeQuota,
  getClientIp,
  getQuotaState,
} from "@/lib/analyze-quota";
import { validationErrorPayload } from "@/lib/api-errors";
import { generateAgeGroupAdvice } from "@/lib/age-advice";
import { analyzeLabelImageVision } from "@/lib/vision-extract";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

function isConfirmed(value: FormDataEntryValue | null): boolean {
  if (value == null) return false;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    return v === "true" || v === "1" || v === "on" || v === "yes";
  }
  return false;
}

async function quotaPayload(request: Request) {
  const ip = getClientIp(request.headers);
  const q = await getQuotaState(ip);
  return {
    quota: {
      remaining: q.unlimited ? null : q.remaining,
      limit: q.unlimited ? null : q.limit,
      unlimited: q.unlimited,
      resetsInSeconds: q.resetsInSeconds,
    },
  };
}

export async function POST(request: Request) {
  const ip = getClientIp(request.headers);

  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error: "Server is missing OPENAI_API_KEY. Add it in .env.local (local) or Vercel env vars.",
          ...(await quotaPayload(request)),
        },
        { status: 500 },
      );
    }

    const quotaCheck = await assertQuotaAllows(ip);
    if (!quotaCheck.ok) {
      return NextResponse.json(
        {
          error: `Daily analyze limit reached (${quotaCheck.limit} per day, UTC). Try again after reset.`,
          code: "QUOTA_EXCEEDED",
          ...(await quotaPayload(request)),
        },
        { status: 429 },
      );
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json(
        { error: "Expected multipart/form-data with an image field.", ...(await quotaPayload(request)) },
        { status: 415 },
      );
    }

    const form = await request.formData();

    const confirmed = isConfirmed(form.get("confirmedNutritionLabel"));
    if (!confirmed) {
      return NextResponse.json(
        {
          error:
            "Confirm that your photo shows a Nutrition Facts panel (or equivalent) using the checkbox before analyzing.",
          ...(await quotaPayload(request)),
        },
        { status: 400 },
      );
    }

    const file = form.get("image");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'Attach one file under the field name "image".', ...(await quotaPayload(request)) },
        { status: 400 },
      );
    }

    if (file.size === 0) {
      return NextResponse.json({ error: "Empty file.", ...(await quotaPayload(request)) }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        {
          error: `File too large (max ${MAX_BYTES / (1024 * 1024)} MB).`,
          ...(await quotaPayload(request)),
        },
        { status: 413 },
      );
    }

    const mimeType = file.type || "image/jpeg";
    if (!ALLOWED.has(mimeType)) {
      return NextResponse.json(
        {
          error: "Only JPEG, PNG, or WebP images are supported.",
          ...(await quotaPayload(request)),
        },
        { status: 415 },
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const base64 = buf.toString("base64");

    let vision: Awaited<ReturnType<typeof analyzeLabelImageVision>>;
    try {
      vision = await analyzeLabelImageVision({ base64, mimeType });
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { ...validationErrorPayload("extract", err), ...(await quotaPayload(request)) },
          { status: 422 },
        );
      }
      throw err;
    }

    await consumeAnalyzeQuota(ip);
    const quotaAfter = await quotaPayload(request);

    if (!vision.ok && vision.notLabel) {
      return NextResponse.json(
        {
          error:
            vision.reason?.trim() ||
            "This image does not appear to show a nutrition facts panel. Try a clearer photo of the label.",
          code: "GATE_REJECTED",
          ...quotaAfter,
        },
        { status: 400 },
      );
    }

    if (!vision.ok) {
      return NextResponse.json({ error: "Unexpected vision outcome.", ...quotaAfter }, { status: 500 });
    }

    const { extracted } = vision;

    let ageAdvice: Awaited<ReturnType<typeof generateAgeGroupAdvice>>;
    try {
      ageAdvice = await generateAgeGroupAdvice(extracted);
    } catch (err) {
      if (err instanceof ZodError) {
        return NextResponse.json(
          { ...validationErrorPayload("advice", err), ...quotaAfter },
          { status: 422 },
        );
      }
      throw err;
    }

    return NextResponse.json({ extracted, ageAdvice, ...quotaAfter });
  } catch (err) {
    if (err instanceof ZodError) {
      return NextResponse.json(
        {
          error:
            "The response didn’t pass validation. Try a flatter, well-lit photo with the nutrition table filling most of the frame, then analyze again.",
          code: "VALIDATION_UNKNOWN",
          issues: process.env.NODE_ENV === "development" ? err.flatten() : undefined,
          ...(await quotaPayload(request)),
        },
        { status: 422 },
      );
    }
    const message = err instanceof Error ? err.message : "Unexpected error";
    return NextResponse.json({ error: message, ...(await quotaPayload(request)) }, { status: 500 });
  }
}
