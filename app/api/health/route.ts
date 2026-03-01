/**
 * API: /api/health
 *
 * GET -- health check for load balancers and monitoring.
 *
 * Checks:
 *   - Database connectivity (Prisma)
 *   - Databricks SQL Warehouse reachability
 *   - Application version
 */

import { NextResponse } from "next/server";
import { getDatabaseAuthRuntimeState, getPrisma } from "@/lib/prisma";
import { executeSQL } from "@/lib/dbx/sql";
import { getCurrentUserEmail, getConfig } from "@/lib/dbx/client";
import packageJson from "@/package.json";

interface HealthCheck {
  status: "healthy" | "degraded" | "unhealthy";
  version: string;
  uptime: number;
  timestamp: string;
  checks: {
    database: CheckResult;
    warehouse: CheckResult;
  };
  authRuntime?: {
    ready: boolean;
    authMode: "oauth" | "native_password";
    poolerFailoverCount: number;
    poolerConsecutiveSuccesses: number;
    lastSelectedEndpointKind: "pooler" | "direct" | null;
    requirePooler: boolean;
    runtimeMode: string;
    enablePoolerExperiment: boolean;
    poolerAttemptEnabled: boolean;
    poolerReadinessSuccessTarget: number;
    poolerReadinessGatePassed: boolean;
  };
}

interface CheckResult {
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}

const startTime = Date.now();

export async function GET() {
  const checks = await Promise.allSettled([checkDatabase(), checkWarehouse()]);

  const database: CheckResult =
    checks[0].status === "fulfilled"
      ? checks[0].value
      : { status: "error", latencyMs: 0, error: String(checks[0].reason) };

  const warehouse: CheckResult =
    checks[1].status === "fulfilled"
      ? checks[1].value
      : { status: "error", latencyMs: 0, error: String(checks[1].reason) };

  const overallStatus =
    database.status === "ok" && warehouse.status === "ok"
      ? "healthy"
      : database.status === "ok" || warehouse.status === "ok"
        ? "degraded"
        : "unhealthy";

  let userEmail: string | null = null;
  let host: string | null = null;
  try {
    userEmail = await getCurrentUserEmail();
    host = getConfig().host;
  } catch {
    // Non-critical
  }

  const health: HealthCheck & { userEmail?: string | null; host?: string | null } = {
    status: overallStatus,
    version: packageJson.version,
    uptime: Math.floor((Date.now() - startTime) / 1000),
    timestamp: new Date().toISOString(),
    checks: { database, warehouse },
    authRuntime: getDatabaseAuthRuntimeState(),
    userEmail,
    host,
  };

  const httpStatus = overallStatus === "unhealthy" ? 503 : 200;
  return NextResponse.json(health, {
    status: httpStatus,
    headers: {
      "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
    },
  });
}

async function checkDatabase(): Promise<CheckResult> {
  const start = Date.now();
  try {
    const prisma = await getPrisma();
    await prisma.$queryRawUnsafe("SELECT 1");
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Database unreachable",
    };
  }
}

async function checkWarehouse(): Promise<CheckResult> {
  const start = Date.now();
  try {
    await executeSQL("SELECT 1");
    return { status: "ok", latencyMs: Date.now() - start };
  } catch (error) {
    return {
      status: "error",
      latencyMs: Date.now() - start,
      error: error instanceof Error ? error.message : "Warehouse unreachable",
    };
  }
}
