import { NextResponse } from "next/server";
import { getClientIp, getQuotaState, getSuccessfulAnalyzeTotal } from "@/lib/analyze-quota";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const ip = getClientIp(request.headers);
  const q = await getQuotaState(ip);
  const totalSuccessfulAnalyzes = await getSuccessfulAnalyzeTotal();

  return NextResponse.json({
    remaining: q.unlimited ? null : q.remaining,
    limit: q.unlimited ? null : q.limit,
    used: q.unlimited ? null : q.used,
    unlimited: q.unlimited,
    resetsInSeconds: q.resetsInSeconds,
    totalSuccessfulAnalyzes,
  });
}
