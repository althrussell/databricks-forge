/**
 * Table Health Score Algorithm.
 *
 * Rule-based scoring (0-100) that evaluates table maintenance,
 * data freshness, documentation, and configuration. Deducts points
 * for identified issues and generates actionable recommendations.
 */

import type {
  TableDetail,
  TableHistorySummary,
  TableHealthInsight,
} from "@/lib/domain/types";

// ---------------------------------------------------------------------------
// Scoring rules
// ---------------------------------------------------------------------------

interface HealthRule {
  id: string;
  deduction: number;
  check: (detail: TableDetail, history: TableHistorySummary | null) => boolean;
  issue: string;
  recommendation: string;
}

const HEALTH_RULES: HealthRule[] = [
  {
    id: "no_optimize_30d",
    deduction: 15,
    check: (_, h) => {
      if (!h || !h.lastOptimizeTimestamp) return true;
      return daysSince(h.lastOptimizeTimestamp) > 30;
    },
    issue: "No OPTIMIZE run in the last 30 days",
    recommendation: "Schedule regular OPTIMIZE to compact small files and improve query performance.",
  },
  {
    id: "no_vacuum_30d",
    deduction: 15,
    check: (_, h) => {
      if (!h || !h.lastVacuumTimestamp) return true;
      return daysSince(h.lastVacuumTimestamp) > 30;
    },
    issue: "No VACUUM run in the last 30 days",
    recommendation: "Schedule regular VACUUM to remove stale data files and reduce storage costs.",
  },
  {
    id: "small_file_problem",
    deduction: 20,
    check: (d) => {
      if (!d.sizeInBytes || !d.numFiles || d.numFiles === 0) return false;
      const avgFileSize = d.sizeInBytes / d.numFiles;
      return avgFileSize < 33_554_432; // 32MB
    },
    issue: "Small file problem detected (average file size < 32MB)",
    recommendation: "Run OPTIMIZE to compact small files. Consider enabling auto-optimize for streaming tables.",
  },
  {
    id: "no_comment",
    deduction: 10,
    check: (d) => !d.comment,
    issue: "No table description/comment set",
    recommendation: "Add a COMMENT ON TABLE to document the table's purpose and contents.",
  },
  {
    id: "high_partition_count",
    deduction: 10,
    check: (d) => d.partitionColumns.length > 100,
    issue: "Extremely high partition column count (> 100)",
    recommendation: "Review partitioning strategy. Consider liquid clustering for better performance.",
  },
  {
    id: "stale_data_90d",
    deduction: 15,
    check: (_, h) => {
      if (!h || !h.lastWriteTimestamp) return false; // Can't determine staleness without history
      return daysSince(h.lastWriteTimestamp) > 90;
    },
    issue: "Stale data: no writes in the last 90 days",
    recommendation: "Verify if this table is still actively used. Consider archiving or dropping if abandoned.",
  },
  {
    id: "no_cdf_with_streaming",
    deduction: 10,
    check: (d, h) => {
      if (!h || !h.hasStreamingWrites) return false;
      return d.tableProperties["delta.enableChangeDataFeed"] !== "true";
    },
    issue: "Streaming writes detected but Change Data Feed (CDF) is not enabled",
    recommendation: "Enable CDF with ALTER TABLE SET TBLPROPERTIES ('delta.enableChangeDataFeed' = true) for downstream consumers.",
  },
  {
    id: "outdated_delta_protocol",
    deduction: 5,
    check: (d) => {
      if (d.deltaMinReaderVersion == null) return false;
      return d.deltaMinReaderVersion < 2;
    },
    issue: "Outdated Delta protocol version (reader version < 2)",
    recommendation: "Upgrade Delta protocol to enable features like column mapping and deletion vectors.",
  },
];

// ---------------------------------------------------------------------------
// Scoring function
// ---------------------------------------------------------------------------

/**
 * Compute health score and insights for a single table.
 */
export function computeTableHealth(
  detail: TableDetail,
  history: TableHistorySummary | null
): TableHealthInsight {
  let score = 100;
  const issues: string[] = [];
  const recommendations: string[] = [];

  for (const rule of HEALTH_RULES) {
    if (rule.check(detail, history)) {
      score -= rule.deduction;
      issues.push(rule.issue);
      recommendations.push(rule.recommendation);
    }
  }

  return {
    tableFqn: detail.fqn,
    healthScore: Math.max(0, score),
    issues,
    recommendations,
  };
}

/**
 * Compute health scores for all tables.
 */
export function computeAllTableHealth(
  details: TableDetail[],
  histories: Map<string, TableHistorySummary>
): Map<string, TableHealthInsight> {
  const results = new Map<string, TableHealthInsight>();
  for (const detail of details) {
    const history = histories.get(detail.fqn) ?? null;
    results.set(detail.fqn, computeTableHealth(detail, history));
  }
  return results;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysSince(isoTimestamp: string): number {
  try {
    return Math.floor(
      (Date.now() - new Date(isoTimestamp).getTime()) / 86_400_000
    );
  } catch {
    return 999;
  }
}
