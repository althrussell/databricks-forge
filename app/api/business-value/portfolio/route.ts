/**
 * GET /api/business-value/portfolio
 *
 * Returns aggregated portfolio data across all runs for the Business Value dashboard.
 */

import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { getPortfolioData } from "@/lib/lakebase/portfolio";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const portfolio = await getPortfolioData();
    return NextResponse.json(portfolio);
  } catch (err) {
    logger.error("[api/business-value/portfolio] Failed", { error: String(err) });
    return NextResponse.json({ error: "Failed to load portfolio data" }, { status: 500 });
  }
}
