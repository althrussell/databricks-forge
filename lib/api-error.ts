/**
 * Standardized API error response helper.
 *
 * All API routes should use `apiError()` so that every error response
 * has the shape `{ error: string, code?: string }`.
 */

import { NextResponse } from "next/server";

interface ApiErrorOptions {
  status: number;
  code?: string;
}

export function apiError(message: string, opts: ApiErrorOptions) {
  const body: { error: string; code?: string } = { error: message };
  if (opts.code) body.code = opts.code;
  return NextResponse.json(body, { status: opts.status });
}
