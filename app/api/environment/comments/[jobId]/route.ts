/**
 * API: /api/environment/comments/[jobId]
 *
 * GET    -- Get job detail with all proposals
 * DELETE -- Delete a comment job and its proposals
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import { getCommentJob, deleteCommentJob } from "@/lib/lakebase/comment-jobs";
import {
  getProposalsForJob,
  getJobTableSummary,
} from "@/lib/lakebase/comment-proposals";
import { logActivity } from "@/lib/lakebase/activity-log";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    const job = await getCommentJob(jobId);
    if (!job) {
      return NextResponse.json({ error: "Job not found" }, { status: 404 });
    }

    const [proposals, tableSummary] = await Promise.all([
      getProposalsForJob(jobId),
      getJobTableSummary(jobId),
    ]);

    return NextResponse.json({ job, proposals, tableSummary });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ jobId: string }> },
) {
  try {
    const { jobId } = await params;
    await deleteCommentJob(jobId);
    logActivity("deleted_comment_job", { resourceId: jobId });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: safeErrorMessage(error) }, { status: 500 });
  }
}
