import { NextRequest, NextResponse } from "next/server";
import { ensureMigrated } from "@/lib/lakebase/schema";
import { getCurrentUserEmail } from "@/lib/dbx/client";
import { safeParseBody, UpdateBenchmarkSchema } from "@/lib/validation";
import {
  deleteBenchmarkRecord,
  updateBenchmarkLifecycle,
  updateBenchmarkSourceContent,
} from "@/lib/lakebase/benchmarks";
import { logger } from "@/lib/logger";

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

  const parsed = await safeParseBody(request, UpdateBenchmarkSchema);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const { benchmarkId } = await params;
  await ensureMigrated();

  // Handle manual paste of source_content
  if (parsed.data.source_content !== undefined) {
    const result = await updateBenchmarkSourceContent(benchmarkId, {
      sourceContent: parsed.data.source_content,
      sourceFetchStatus: "manual",
    });
    if (!result) {
      return NextResponse.json({ error: "Benchmark not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  }

  const updated = await updateBenchmarkLifecycle(
    benchmarkId,
    parsed.data.lifecycle_status!,
    userEmail,
  );
  if (!updated) {
    return NextResponse.json({ error: "Benchmark not found" }, { status: 404 });
  }

  try {
    if (parsed.data.lifecycle_status === "published") {
      let sourceContent = updated.sourceContent;
      let fetchStatus = updated.sourceFetchStatus;

      // Auto-fetch source content if not already available
      if (!sourceContent) {
        const { fetchAndConvertSource } = await import("@/lib/benchmarks/source-fetcher");
        const markdown = await fetchAndConvertSource(updated.sourceUrl);
        if (markdown) {
          sourceContent = markdown;
          fetchStatus = "fetched";
        } else {
          fetchStatus = "failed";
        }
      }

      const { embedBenchmarkRecords } = await import("@/lib/embeddings/embed-pipeline");
      const chunkCount = await embedBenchmarkRecords([{
        benchmarkId: updated.benchmarkId,
        kind: updated.kind,
        title: updated.title,
        summary: updated.summary,
        sourceUrl: updated.sourceUrl,
        publisher: updated.publisher,
        industry: updated.industry,
        region: updated.region,
        publishedAt: updated.publishedAt,
        ttlDays: updated.ttlDays,
        sourceContent,
      }]);

      await updateBenchmarkSourceContent(benchmarkId, {
        sourceContent,
        sourceFetchStatus: fetchStatus as "pending" | "fetched" | "failed" | "manual",
        sourceChunkCount: chunkCount,
      });
    } else {
      const { deleteEmbeddingsBySource } = await import("@/lib/embeddings/store");
      await deleteEmbeddingsBySource(benchmarkId);
    }
  } catch (err) {
    logger.warn("[benchmarks] Embedding sync failed (non-fatal)", {
      benchmarkId,
      status: parsed.data.lifecycle_status,
      error: err instanceof Error ? err.message : String(err),
    });
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
  if (ok) {
    try {
      const { deleteEmbeddingsBySource } = await import("@/lib/embeddings/store");
      await deleteEmbeddingsBySource(benchmarkId);
    } catch {
      // non-fatal
    }
  }
  return NextResponse.json({ success: ok });
}
