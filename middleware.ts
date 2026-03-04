/**
 * Next.js middleware -- authentication guard + rate limiting for API routes.
 *
 * In a Databricks Apps deployment the proxy injects `x-forwarded-access-token`
 * for every authenticated user. In local dev, `DATABRICKS_TOKEN` acts as
 * a substitute. If neither is available, the request is rejected.
 *
 * Rate limiting uses an in-memory sliding window. LLM-calling routes
 * (assistant, pipeline, genie, scans) have a tighter limit.
 *
 * Excluded routes: /api/health (used by load-balancer probes).
 */

import { NextRequest, NextResponse } from "next/server";
import { checkRateLimit } from "@/lib/rate-limit";

const PUBLIC_ROUTES = new Set(["/api/health"]);

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (!pathname.startsWith("/api/") || PUBLIC_ROUTES.has(pathname)) {
    return NextResponse.next();
  }

  // --- Authentication ---
  const userToken = req.headers.get("x-forwarded-access-token");
  const hasPat = !!process.env.DATABRICKS_TOKEN || !!process.env.DATABRICKS_API_TOKEN;
  const hasOAuth =
    !!process.env.DATABRICKS_CLIENT_ID &&
    !!process.env.DATABRICKS_CLIENT_SECRET;

  if (!userToken && !hasPat && !hasOAuth) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 },
    );
  }

  // --- Rate limiting ---
  const clientKey =
    req.headers.get("x-forwarded-email") ??
    req.headers.get("x-forwarded-for") ??
    "unknown";

  const rateLimitResult = checkRateLimit(pathname, clientKey);
  if (rateLimitResult) {
    const retryAfterSec = Math.ceil(rateLimitResult.retryAfterMs / 1000);
    return NextResponse.json(
      { error: rateLimitResult.error },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) },
      },
    );
  }

  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
