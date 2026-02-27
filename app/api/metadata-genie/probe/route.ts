/**
 * API: GET /api/metadata-genie/probe
 *
 * Lightweight endpoint that checks system.information_schema access and
 * returns the list of available catalogs for catalog scope selection.
 */

import { NextResponse } from "next/server";
import { probeSystemInformationSchema } from "@/lib/metadata-genie/probe";

export async function GET() {
  try {
    const probe = await probeSystemInformationSchema();
    return NextResponse.json({
      accessible: probe.accessible,
      lineageAccessible: probe.lineageAccessible,
      catalogs: probe.catalogs ?? [],
      error: probe.error,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
