import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getCurrentUserEmail } from "@/lib/dbx/client";
import { safeParseBody, UpdateBenchmarkLifecycleSchema } from "@/lib/validation";
import { deleteBenchmarkRecord, updateBenchmarkLifecycle } from "@/lib/lakebase/benchmarks";

function isBenchmarkAdmin(email: string | null): boolean {
  if (!email) return false;
  const allow = (process.env.FORGE_BENCHMARK_ADMINS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return true;
  return allow.includes(email.toLowerCase());
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ benchmarkId: string }> },
) {
  const userEmail = await getCurrentUserEmail();
  if (!isBenchmarkAdmin(userEmail)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = await safeParseBody(request, UpdateBenchmarkLifecycleSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { benchmarkId } = await params;
  await ensureMigrated();
  const updated = await updateBenchmarkLifecycle(
    benchmarkId,
    parsed.data.lifecycle_status,
    userEmail,
  );
  if (!updated) {
    return NextResponse.json({ error: "Benchmark not found" }, { status: 404 });
  }
  return NextResponse.json(updated);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ benchmarkId: string }> },
) {
  const userEmail = await getCurrentUserEmail();
  if (!isBenchmarkAdmin(userEmail)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { benchmarkId } = await params;
  await ensureMigrated();
  const ok = await deleteBenchmarkRecord(benchmarkId);
  return NextResponse.json({ success: ok });
}
