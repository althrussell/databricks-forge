/**
 * Next.js middleware -- rate limiting for API routes.
 *
 * Uses an in-memory sliding window counter per IP.
 * Sufficient for single-instance Databricks Apps deployment.
 */

import { NextRequest, NextResponse } from "next/server";

const WINDOW_MS = 60_000;
const MAX_REQUESTS = 100;

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

// Periodic cleanup to prevent memory leaks
let lastCleanup = Date.now();
const CLEANUP_INTERVAL = 5 * 60_000;

function cleanup(): void {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of windows) {
    if (entry.resetAt <= now) windows.delete(key);
  }
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function proxy(request: NextRequest): NextResponse | undefined {
  if (!request.nextUrl.pathname.startsWith("/api/")) {
    return undefined;
  }

  // Skip rate limiting for health checks
  if (request.nextUrl.pathname === "/api/health") {
    return undefined;
  }

  cleanup();

  const ip = getClientIp(request);
  const now = Date.now();

  let entry = windows.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + WINDOW_MS };
    windows.set(ip, entry);
  }

  entry.count++;

  if (entry.count > MAX_REQUESTS) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          "Retry-After": String(retryAfter),
          "X-RateLimit-Limit": String(MAX_REQUESTS),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(entry.resetAt / 1000)),
        },
      }
    );
  }

  const response = NextResponse.next();
  response.headers.set("X-RateLimit-Limit", String(MAX_REQUESTS));
  response.headers.set("X-RateLimit-Remaining", String(MAX_REQUESTS - entry.count));
  response.headers.set("X-RateLimit-Reset", String(Math.ceil(entry.resetAt / 1000)));
  return response;
}

export const config = {
  matcher: "/api/:path*",
};
