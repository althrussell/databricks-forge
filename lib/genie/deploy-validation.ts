import { fetchColumnsBatch, fetchTableInfoBatch } from "@/lib/queries/metadata";
import { buildSchemaAllowlist, validateSqlExpression } from "@/lib/genie/schema-allowlist";
import type { SerializedSpace } from "@/lib/genie/types";
import type { MetadataSnapshot } from "@/lib/domain/types";

export interface SerializedSpaceValidationFailure {
  ok: false;
  error: string;
  code:
    | "invalid_json"
    | "no_tables"
    | "invalid_join_sql"
    | "missing_multitable_joins"
    | "invalid_example_sql";
  diagnostics?: Record<string, unknown>;
}

export interface SerializedSpaceValidationSuccess {
  ok: true;
}

export type SerializedSpaceValidationResult =
  | SerializedSpaceValidationFailure
  | SerializedSpaceValidationSuccess;

export async function revalidateSerializedSpace(
  serializedSpace: string,
): Promise<SerializedSpaceValidationResult> {
  let parsed: SerializedSpace;
  try {
    parsed = JSON.parse(serializedSpace) as SerializedSpace;
  } catch {
    return { ok: false, error: "Invalid serializedSpace JSON", code: "invalid_json" };
  }

  const tableFqns = parsed?.data_sources?.tables?.map((t) => t.identifier) ?? [];
  if (!Array.isArray(tableFqns) || tableFqns.length === 0) {
    return {
      ok: false,
      error: "Cannot create a Genie Space with no tables. At least one table is required.",
      code: "no_tables",
    };
  }

  const [tables, columns] = await Promise.all([
    fetchTableInfoBatch(tableFqns),
    fetchColumnsBatch(tableFqns),
  ]);

  const metadata: MetadataSnapshot = {
    cacheKey: `deploy-validate-${Date.now()}`,
    ucPath: tableFqns.map((t) => t.split(".").slice(0, 2).join(".")).join(", "),
    tables,
    columns,
    foreignKeys: [],
    metricViews: [],
    schemaMarkdown: "",
    tableCount: tables.length,
    columnCount: columns.length,
    cachedAt: new Date().toISOString(),
    lineageDiscoveredFqns: [],
  };
  const allowlist = buildSchemaAllowlist(metadata);

  for (const join of parsed.instructions.join_specs ?? []) {
    for (const sql of join.sql ?? []) {
      if (!sql || sql.startsWith("--rt=")) continue;
      if (!validateSqlExpression(allowlist, sql, `deploy_join:${join.id}`, true)) {
        return {
          ok: false,
          error: "Schema drift detected: one or more join conditions are no longer valid. Regenerate before deploy.",
          code: "invalid_join_sql",
          diagnostics: { joinId: join.id, joinLeft: join.left?.identifier, joinRight: join.right?.identifier, sql },
        };
      }
    }
  }

  if (tableFqns.length > 1 && (parsed.instructions.join_specs?.length ?? 0) === 0) {
    return {
      ok: false,
      error: "Quality gate: multi-table spaces must include at least one validated join before deploy.",
      code: "missing_multitable_joins",
      diagnostics: { tableCount: tableFqns.length, tables: tableFqns.slice(0, 20) },
    };
  }

  for (const ex of parsed.instructions.example_question_sqls ?? []) {
    const sql = ex.sql?.join("\n") ?? "";
    if (sql && !validateSqlExpression(allowlist, sql, `deploy_example_sql:${ex.id}`, true)) {
      return {
        ok: false,
        error: "Schema drift detected: one or more sample SQL queries are no longer valid. Regenerate before deploy.",
        code: "invalid_example_sql",
        diagnostics: { exampleId: ex.id, question: ex.question?.join(" "), sql: sql.slice(0, 1000) },
      };
    }
  }

  return { ok: true };
}
