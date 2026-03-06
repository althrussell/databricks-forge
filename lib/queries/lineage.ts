/**
 * Lineage Walker — discovers upstream and downstream tables via BFS
 * traversal of system.access.table_lineage.
 *
 * When a customer selects only a few tables for a scan, this walker
 * follows lineage edges to find all related tables (data sources and
 * consumers), building a complete picture of the data landscape.
 *
 * Graceful fallback: if system tables are not accessible, returns an
 * empty LineageGraph and the scan proceeds with seed tables only.
 */

import { executeSQL } from "@/lib/dbx/sql";
import { logger } from "@/lib/logger";
import type { LineageEdge, LineageGraph } from "@/lib/domain/types";
import { validateFqn } from "@/lib/validation";

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface LineageWalkOptions {
  /** Max hops to walk (default 3, max 5). */
  maxDepth?: number;
  /** Walk direction: "both", "upstream", or "downstream" (default "both"). */
  direction?: "both" | "upstream" | "downstream";
  /** Max tables to discover before stopping (default 500). */
  maxDiscoveredTables?: number;
}

// ---------------------------------------------------------------------------
// Walker
// ---------------------------------------------------------------------------

/**
 * Walk lineage from seed tables using a single recursive CTE.
 *
 * Replaces the previous multi-round-trip BFS loop with a single
 * WITH RECURSIVE query, reducing SQL calls from O(depth) to 1.
 * Falls back gracefully if the workspace does not support recursive
 * CTEs (requires DBR 17.0+ / SQL Pro / Serverless).
 */
export async function walkLineage(
  seedTables: string[],
  options: LineageWalkOptions = {},
): Promise<LineageGraph> {
  const maxDepth = Math.min(options.maxDepth ?? 3, 10);
  const direction = options.direction ?? "both";
  const maxDiscovered = options.maxDiscoveredTables ?? 500;

  const emptyGraph: LineageGraph = {
    edges: [],
    seedTables,
    discoveredTables: [],
    upstreamDepth: 0,
    downstreamDepth: 0,
  };

  if (seedTables.length === 0) return emptyGraph;

  const accessible = await isLineageAccessible();
  if (!accessible) {
    logger.warn("[lineage] system.access.table_lineage is not accessible, skipping lineage walk");
    return emptyGraph;
  }

  logger.info("[lineage] Starting recursive CTE walk", {
    seedCount: seedTables.length,
    maxDepth,
    direction,
    maxDiscovered,
  });

  try {
    const { edges: rawEdges, maxDepthSeen } = await queryLineageRecursive(
      seedTables,
      direction,
      maxDepth,
    );

    const uniqueEdges = deduplicateEdges(rawEdges);

    // Identify discovered tables (those not in the seed set)
    const seedSet = new Set(seedTables.map((t) => t.toLowerCase()));
    const discoveredSet = new Set<string>();
    const discoveredTables: string[] = [];

    for (const edge of uniqueEdges) {
      for (const fqn of [edge.sourceTableFqn, edge.targetTableFqn]) {
        if (fqn && !seedSet.has(fqn.toLowerCase()) && !discoveredSet.has(fqn.toLowerCase())) {
          discoveredSet.add(fqn.toLowerCase());
          discoveredTables.push(fqn);
        }
      }
    }

    // Apply maxDiscoveredTables cap
    const cappedDiscovered = discoveredTables.slice(0, maxDiscovered);
    if (discoveredTables.length > maxDiscovered) {
      logger.warn("[lineage] Capped discovered tables", {
        total: discoveredTables.length,
        cap: maxDiscovered,
      });
    }

    logger.info("[lineage] Recursive CTE walk complete", {
      totalEdges: uniqueEdges.length,
      totalDiscovered: cappedDiscovered.length,
      maxDepthSeen,
    });

    return {
      edges: uniqueEdges,
      seedTables,
      discoveredTables: cappedDiscovered,
      upstreamDepth: direction === "downstream" ? 0 : maxDepthSeen,
      downstreamDepth: direction === "upstream" ? 0 : maxDepthSeen,
    };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error("[lineage] Recursive CTE walk failed", { error: msg });
    return emptyGraph;
  }
}

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

async function isLineageAccessible(): Promise<boolean> {
  try {
    await executeSQL("SELECT 1 FROM system.access.table_lineage LIMIT 1");
    return true;
  } catch {
    return false;
  }
}

function buildAnchorWhere(
  direction: "both" | "upstream" | "downstream",
  quotedFqns: string,
): string {
  if (direction === "upstream") return `l.target_table_full_name IN (${quotedFqns})`;
  if (direction === "downstream") return `l.source_table_full_name IN (${quotedFqns})`;
  return `(l.target_table_full_name IN (${quotedFqns}) OR l.source_table_full_name IN (${quotedFqns}))`;
}

function buildRecursiveJoin(direction: "both" | "upstream" | "downstream"): string {
  if (direction === "upstream") {
    return "l.target_table_full_name = lw.source_fqn";
  }
  if (direction === "downstream") {
    return "l.source_table_full_name = lw.target_fqn";
  }
  return "(l.target_table_full_name IN (lw.source_fqn, lw.target_fqn) OR l.source_table_full_name IN (lw.source_fqn, lw.target_fqn))";
}

async function queryLineageRecursive(
  seedTables: string[],
  direction: "both" | "upstream" | "downstream",
  maxDepth: number,
): Promise<{ edges: LineageEdge[]; maxDepthSeen: number }> {
  const safeFqns: string[] = [];
  for (const fqn of seedTables) {
    try {
      safeFqns.push(validateFqn(fqn, "lineage seed"));
    } catch {
      logger.warn("[lineage] Skipping invalid FQN in seed", { fqn });
    }
  }
  if (safeFqns.length === 0) return { edges: [], maxDepthSeen: 0 };

  const quotedFqns = safeFqns.map((f) => `'${f.replace(/'/g, "''")}'`).join(", ");
  const anchorWhere = buildAnchorWhere(direction, quotedFqns);
  const recursiveJoin = buildRecursiveJoin(direction);

  const sql = `
    WITH RECURSIVE lineage_walk AS (
      SELECT
        1 AS depth,
        l.source_table_full_name AS source_fqn,
        l.target_table_full_name AS target_fqn,
        l.source_type,
        l.target_type,
        l.entity_type,
        MAX(l.event_time) AS last_event_time,
        COUNT(*) AS event_count
      FROM system.access.table_lineage l
      WHERE ${anchorWhere}
        AND l.source_table_full_name IS NOT NULL
        AND l.target_table_full_name IS NOT NULL
      GROUP BY 1, 2, 3, 4, 5, 6

      UNION ALL

      SELECT
        lw.depth + 1,
        l.source_table_full_name,
        l.target_table_full_name,
        l.source_type,
        l.target_type,
        l.entity_type,
        MAX(l.event_time),
        COUNT(*)
      FROM lineage_walk lw
      JOIN system.access.table_lineage l
        ON ${recursiveJoin}
      WHERE lw.depth < ${maxDepth}
        AND l.source_table_full_name IS NOT NULL
        AND l.target_table_full_name IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM lineage_walk prev
          WHERE prev.source_fqn = l.source_table_full_name
            AND prev.target_fqn = l.target_table_full_name
        )
      GROUP BY 1, 2, 3, 4, 5, 6
    )
    SELECT DISTINCT
      source_fqn,
      target_fqn,
      source_type,
      target_type,
      entity_type,
      last_event_time,
      event_count,
      depth
    FROM lineage_walk
  `;

  const result = await executeSQL(sql);

  let maxDepthSeen = 0;
  const edges: LineageEdge[] = result.rows.map((row) => {
    const depth = parseInt(row[7] ?? "1", 10);
    if (depth > maxDepthSeen) maxDepthSeen = depth;

    return {
      sourceTableFqn: row[0] ?? "",
      targetTableFqn: row[1] ?? "",
      sourceType: row[2] ?? "TABLE",
      targetType: row[3] ?? "TABLE",
      entityType: row[4] ?? null,
      lastEventTime: row[5] ?? null,
      eventCount: parseInt(row[6] ?? "1", 10),
    };
  });

  return { edges, maxDepthSeen };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Deduplicate edges by source+target FQN (keep the one with highest event count).
 */
function deduplicateEdges(edges: LineageEdge[]): LineageEdge[] {
  const map = new Map<string, LineageEdge>();
  for (const edge of edges) {
    const key = `${edge.sourceTableFqn}|${edge.targetTableFqn}|${edge.entityType ?? ""}`;
    const existing = map.get(key);
    if (!existing || edge.eventCount > existing.eventCount) {
      map.set(key, edge);
    }
  }
  return Array.from(map.values());
}
