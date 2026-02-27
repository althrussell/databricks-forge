/**
 * API: /api/knowledge-base
 *
 * GET    -- List all uploaded documents
 * DELETE -- Delete a document by ID (query param: id)
 */

import { NextRequest, NextResponse } from "next/server";
import { listDocuments, deleteDocument } from "@/lib/lakebase/documents";
import { isEmbeddingEnabled } from "@/lib/embeddings/config";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const enabled = isEmbeddingEnabled();
    if (!enabled) {
      return NextResponse.json({ documents: [], enabled: false });
    }

    const documents = await listDocuments();
    return NextResponse.json({ documents, enabled: true });
  } catch (error) {
    logger.error("[api/knowledge-base] GET failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to list documents" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { error: "Document ID required" },
        { status: 400 },
      );
    }

    const deleted = await deleteDocument(id);
    if (!deleted) {
      return NextResponse.json(
        { error: "Document not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[api/knowledge-base] DELETE failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 },
    );
  }
}
