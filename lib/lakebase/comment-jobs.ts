/**
 * CRUD operations for AI Comment generation jobs -- backed by Lakebase (Prisma).
 */

import { withPrisma } from "@/lib/prisma";

export type CommentJobStatus =
  | "draft"
  | "generating"
  | "ready"
  | "applying"
  | "completed"
  | "failed";

export interface CommentJob {
  id: string;
  scanId: string | null;
  runId: string | null;
  scopeJson: string;
  industryId: string | null;
  status: CommentJobStatus;
  tableCount: number;
  columnCount: number;
  appliedCount: number;
  errorMessage: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export async function createCommentJob(input: {
  scopeJson: string;
  industryId?: string;
  scanId?: string;
  runId?: string;
}): Promise<CommentJob> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeCommentJob.create({
      data: {
        scopeJson: input.scopeJson,
        industryId: input.industryId ?? null,
        scanId: input.scanId ?? null,
        runId: input.runId ?? null,
        status: "draft",
      },
    });
    return row as CommentJob;
  });
}

export async function getCommentJob(jobId: string): Promise<CommentJob | null> {
  return withPrisma(async (prisma) => {
    const row = await prisma.forgeCommentJob.findUnique({ where: { id: jobId } });
    return (row as CommentJob) ?? null;
  });
}

export async function listCommentJobs(): Promise<CommentJob[]> {
  return withPrisma(async (prisma) => {
    const rows = await prisma.forgeCommentJob.findMany({
      orderBy: { createdAt: "desc" },
    });
    return rows as CommentJob[];
  });
}

export async function updateCommentJobStatus(
  jobId: string,
  status: CommentJobStatus,
  extra?: { tableCount?: number; columnCount?: number; appliedCount?: number; errorMessage?: string },
): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeCommentJob.update({
      where: { id: jobId },
      data: {
        status,
        ...(extra?.tableCount !== undefined && { tableCount: extra.tableCount }),
        ...(extra?.columnCount !== undefined && { columnCount: extra.columnCount }),
        ...(extra?.appliedCount !== undefined && { appliedCount: extra.appliedCount }),
        ...(extra?.errorMessage !== undefined && { errorMessage: extra.errorMessage }),
      },
    });
  });
}

export async function deleteCommentJob(jobId: string): Promise<void> {
  await withPrisma(async (prisma) => {
    await prisma.forgeCommentJob.delete({ where: { id: jobId } });
  });
}
