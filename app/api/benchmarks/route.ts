import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getCurrentUserEmail } from "@/lib/dbx/client";
import { safeParseBody, CreateBenchmarkSchema } from "@/lib/validation";
import { listBenchmarkRecords, upsertBenchmarkRecord } from "@/lib/lakebase/benchmarks";

function isBenchmarkAdmin(email: string | null): boolean {
  if (!email) return false;
  const allow = (process.env.FORGE_BENCHMARK_ADMINS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return true;
  return allow.includes(email.toLowerCase());
}

export async function GET(request: NextRequest) {
  try {
    await ensureMigrated();
    const { searchParams } = request.nextUrl;
    const lifecycleStatus = searchParams.get("lifecycleStatus") ?? undefined;
    const industry = searchParams.get("industry") ?? undefined;
    const kind = searchParams.get("kind") ?? undefined;
    const includeExpired = searchParams.get("includeExpired") === "true";
    const items = await listBenchmarkRecords({
      lifecycleStatus: lifecycleStatus as "draft" | "reviewed" | "published" | "deprecated" | undefined,
      industry,
      kind: kind as "kpi" | "benchmark_principle" | "advisory_theme" | "platform_best_practice" | undefined,
      includeExpired,
      limit: 400,
    });
    return NextResponse.json(items);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to list benchmarks" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const userEmail = await getCurrentUserEmail();
  if (!isBenchmarkAdmin(userEmail)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await safeParseBody(request, CreateBenchmarkSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  try {
    await ensureMigrated();
    const row = await upsertBenchmarkRecord(parsed.data, {
      createdBy: userEmail,
      lifecycleStatus: "draft",
    });
    try {
      const { embedBenchmarkRecords } = await import("@/lib/embeddings/embed-pipeline");
      await embedBenchmarkRecords([
        {
          benchmarkId: row.benchmarkId,
          kind: row.kind,
          title: row.title,
          summary: row.summary,
          sourceUrl: row.sourceUrl,
          publisher: row.publisher,
          industry: row.industry,
          region: row.region,
          publishedAt: row.publishedAt,
          ttlDays: row.ttlDays,
        },
      ]);
    } catch {
      // non-fatal
    }
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to create benchmark" },
      { status: 500 },
    );
  }
}
