/**
 * API: GET /api/metadata-genie/probe
 *
 * Probes system.information_schema access and returns available catalogs
 * and a sample of table names for industry detection.
 */

import { NextResponse } from "next/server";
import { probeSystemInformationSchema } from "@/lib/metadata-genie/probe";

export async function GET() {
  try {
    const result = await probeSystemInformationSchema();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { accessible: false, error: message },
      { status: 500 }
    );
  }
}
