/**
 * API: /api/metadata
 *
 * GET -- browse Unity Catalog metadata (catalogs, schemas, tables)
 *
 * Query params:
 *   ?type=catalogs             -- list catalogs
 *   ?type=schemas&catalog=X    -- list schemas in catalog X
 *   ?type=tables&catalog=X&schema=Y -- list tables in X.Y
 */

import { NextRequest, NextResponse } from "next/server";
import {
  listCatalogs,
  listSchemas,
  listTables,
} from "@/lib/queries/metadata";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "catalogs";
    const catalog = searchParams.get("catalog");
    const schema = searchParams.get("schema") ?? undefined;

    switch (type) {
      case "catalogs": {
        const catalogs = await listCatalogs();
        return NextResponse.json({ catalogs });
      }
      case "schemas": {
        if (!catalog) {
          return NextResponse.json(
            { error: "catalog query param is required" },
            { status: 400 }
          );
        }
        const schemas = await listSchemas(catalog);
        return NextResponse.json({ schemas });
      }
      case "tables": {
        if (!catalog) {
          return NextResponse.json(
            { error: "catalog query param is required" },
            { status: 400 }
          );
        }
        const tables = await listTables(catalog, schema);
        return NextResponse.json({ tables });
      }
      default:
        return NextResponse.json(
          { error: `Unknown type: ${type}. Use catalogs, schemas, or tables.` },
          { status: 400 }
        );
    }
  } catch (error) {
    console.error("[GET /api/metadata]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch metadata" },
      { status: 500 }
    );
  }
}
