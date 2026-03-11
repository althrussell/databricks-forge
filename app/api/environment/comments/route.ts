/**
 * API: /api/environment/comments
 *
 * GET  -- List all comment jobs
 * POST -- Create a new comment job
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import { listCommentJobs, createCommentJob } from "@/lib/lakebase/comment-jobs";
import { logActivity } from "@/lib/lakebase/activity-log";

export async function GET() {
  try {
    const jobs = await listCommentJobs();
    return NextResponse.json({ jobs });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { catalogs, schemas, tables, industryId, scanId, runId, excludedSchemas, excludedTables, exclusionPatterns } = body;

    if (!catalogs || !Array.isArray(catalogs) || catalogs.length === 0) {
      return NextResponse.json({ error: "At least one catalog is required" }, { status: 400 });
    }

    const scopeJson = JSON.stringify({
      catalogs,
      schemas,
      tables,
      ...(excludedSchemas?.length && { excludedSchemas }),
      ...(excludedTables?.length && { excludedTables }),
      ...(exclusionPatterns?.length && { exclusionPatterns }),
    });
    const job = await createCommentJob({
      scopeJson,
      industryId: industryId ?? undefined,
      scanId: scanId ?? undefined,
      runId: runId ?? undefined,
    });

    logActivity("created_comment_job", {
      resourceId: job.id,
      metadata: { catalogs, industryId },
    });

    return NextResponse.json({ job }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
