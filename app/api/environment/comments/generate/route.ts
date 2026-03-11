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

export const runtime = "nodejs";
export const maxDuration = 300;

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

    // Separate abort controller for the engine -- only fires on explicit
    // user cancellation, NOT when the HTTP connection drops. This ensures
    // generation completes and results are persisted even if the SSE stream
    // is interrupted by a timeout or network glitch.
    const engineAbort = new AbortController();

    // Track whether the SSE stream is still writable
    let streamClosed = false;

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (event: string, data: unknown) => {
          if (streamClosed) return;
          try {
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          } catch {
            streamClosed = true;
          }
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
            signal: engineAbort.signal,
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
          streamClosed = true;
          try {
            controller.close();
          } catch {
            // already closed
          }
        }
      },
      cancel() {
        // Client disconnected -- do NOT abort the engine. The generation
        // will finish in the background and persist results to Lakebase.
        // The user can refresh the page and see the completed job.
        streamClosed = true;
        logger.info("[comment-generate] SSE stream cancelled by client", {
          jobId: effectiveJobId,
        });
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
