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
import {
  validateIdentifier,
  IdentifierValidationError,
} from "@/lib/validation";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get("type") ?? "catalogs";
    const catalogRaw = searchParams.get("catalog");
    const schemaRaw = searchParams.get("schema") ?? undefined;

    switch (type) {
      case "catalogs": {
        const catalogs = await listCatalogs();
        return NextResponse.json({ catalogs });
      }
      case "schemas": {
        if (!catalogRaw) {
          return NextResponse.json(
            { error: "catalog query param is required" },
            { status: 400 }
          );
        }
        const catalog = validateIdentifier(catalogRaw, "catalog");
        const schemas = await listSchemas(catalog);
        return NextResponse.json({ schemas });
      }
      case "tables": {
        if (!catalogRaw) {
          return NextResponse.json(
            { error: "catalog query param is required" },
            { status: 400 }
          );
        }
        const catalog = validateIdentifier(catalogRaw, "catalog");
        const schema = schemaRaw
          ? validateIdentifier(schemaRaw, "schema")
          : undefined;
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
    if (error instanceof IdentifierValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[GET /api/metadata]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch metadata" },
      { status: 500 }
    );
  }
}
