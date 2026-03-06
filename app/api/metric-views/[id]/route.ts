/**
 * API: /api/metric-views/[id]
 *
 * GET    -- Fetch a single metric view proposal by ID
 * PATCH  -- Update YAML/DDL of a proposal
 * DELETE -- Delete a proposal
 */

import { NextRequest, NextResponse } from "next/server";
import { safeErrorMessage } from "@/lib/error-utils";
import {
  getMetricViewProposalById,
  updateMetricViewProposal,
  deleteMetricViewProposal,
} from "@/lib/lakebase/metric-view-proposals";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const proposal = await getMetricViewProposalById(id);

    if (!proposal) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    return NextResponse.json({ proposal });
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await request.json();

    const existing = await getMetricViewProposalById(id);
    if (!existing) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    const updateData: Parameters<typeof updateMetricViewProposal>[1] = {};
    if (typeof body.yaml === "string") updateData.yaml = body.yaml;
    if (typeof body.ddl === "string") updateData.ddl = body.ddl;
    if (typeof body.validationStatus === "string")
      updateData.validationStatus = body.validationStatus;
    if (Array.isArray(body.validationIssues)) updateData.validationIssues = body.validationIssues;

    await updateMetricViewProposal(id, updateData);

    const updated = await getMetricViewProposalById(id);
    return NextResponse.json({ proposal: updated });
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const existing = await getMetricViewProposalById(id);
    if (!existing) {
      return NextResponse.json({ error: "Proposal not found" }, { status: 404 });
    }

    await deleteMetricViewProposal(id);
    return NextResponse.json({ deleted: true });
  } catch (err) {
    return NextResponse.json({ error: safeErrorMessage(err) }, { status: 500 });
  }
}
