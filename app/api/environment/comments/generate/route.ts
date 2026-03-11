/**
 * API: /api/environment/comments/generate
 *
 * POST -- Start comment generation for a job. Returns SSE stream with progress.
 */

import { NextRequest } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import { getCommentJob, createCommentJob } from "@/lib/lakebase/comment-jobs";
import { generateComments } from "@/lib/ai/comment-generator";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { jobId, catalogs, schemas, tables, industryId, scanId, runId, businessContext } = body;

    // Either use an existing job or create one
    let effectiveJobId = jobId;
    if (!effectiveJobId) {
      if (!catalogs || !Array.isArray(catalogs) || catalogs.length === 0) {
        return new Response(JSON.stringify({ error: "catalogs required" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }
      const job = await createCommentJob({
        scopeJson: JSON.stringify({ catalogs, schemas, tables }),
        industryId,
        scanId,
        runId,
      });
      effectiveJobId = job.id;
    } else {
      const existing = await getCommentJob(effectiveJobId);
      if (!existing) {
        return new Response(JSON.stringify({ error: "Job not found" }), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // Parse scope from the job or from the request
    const job = await getCommentJob(effectiveJobId);
    if (!job) {
      return new Response(JSON.stringify({ error: "Job not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const scope = JSON.parse(job.scopeJson) as {
      catalogs: string[];
      schemas?: string[];
      tables?: string[];
    };

    // SSE stream with abort propagation
    const abortController = new AbortController();
    request.signal.addEventListener("abort", () => abortController.abort());

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        };

        try {
          send("started", { jobId: effectiveJobId });

          const result = await generateComments({
            jobId: effectiveJobId,
            catalogs: scope.catalogs,
            schemas: scope.schemas,
            tables: scope.tables,
            industryId: job.industryId ?? undefined,
            businessContext: businessContext ?? undefined,
            signal: abortController.signal,
            onProgress: (phase, pct, detail) => {
              send("progress", { phase, pct, detail });
            },
          });

          send("complete", {
            jobId: effectiveJobId,
            tableCount: result.tableCount,
            columnCount: result.columnCount,
          });
        } catch (err) {
          logger.error("[comment-generate] Generation failed", {
            jobId: effectiveJobId,
            error: err instanceof Error ? err.message : String(err),
          });
          send("error", {
            message: err instanceof Error ? err.message : "Generation failed",
          });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  } catch (error) {
    logger.error("[comment-generate] Request failed", { error: safeErrorMessage(error) });
    return new Response(JSON.stringify({ error: safeErrorMessage(error) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
