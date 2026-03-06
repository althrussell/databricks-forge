/**
 * LLM-as-reviewer for SQL quality.
 *
 * Uses the dedicated review endpoint (serving-endpoint-review, default
 * databricks-gpt-5-4) to perform multi-dimensional quality assessment
 * on generated SQL, returning structured verdicts and optional auto-fixes.
 *
 * Three entry points:
 *   - reviewSql()        -- single SQL review (read-only verdict)
 *   - reviewAndFixSql()  -- review + auto-fix on failure
 *   - reviewBatch()      -- batch review for short expressions
 */

import { getReviewEndpoint, isReviewEnabled } from "@/lib/dbx/client";
import { chatCompletion } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import {
  DATABRICKS_SQL_RULES,
  DATABRICKS_SQL_REVIEW_CHECKLIST,
} from "./sql-rules";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReviewIssue {
  category:
    | "correctness"
    | "performance"
    | "readability"
    | "security"
    | "databricks_idiom";
  severity: "error" | "warning" | "info";
  message: string;
  lineRef?: string;
}

export interface ReviewResult {
  verdict: "pass" | "warn" | "fail";
  qualityScore: number;
  issues: ReviewIssue[];
  fixedSql?: string;
  suggestions: string[];
}

export interface ReviewOptions {
  /** Schema context (CREATE TABLE DDL or markdown) injected into the prompt. */
  schemaContext?: string;
  /** Surface name for logging and feature-gating. */
  surface?: string;
  /** Whether to request a fixed SQL on failure. */
  requestFix?: boolean;
  /** Maximum tokens for the reviewer response. */
  maxTokens?: number;
}

export interface BatchReviewItem {
  id: string;
  sql: string;
  context?: string;
}

export interface BatchReviewResult {
  id: string;
  result: ReviewResult;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildReviewPrompt(
  sql: string,
  opts: ReviewOptions,
): string {
  const schemaBlock = opts.schemaContext
    ? `\n## Available Schema\n\`\`\`\n${opts.schemaContext}\n\`\`\`\n`
    : "";

  const fixInstruction = opts.requestFix
    ? opts.schemaContext
      ? `If the verdict is "warn" or "fail", include a "fixed_sql" field with the corrected SQL. The fix must ONLY use columns from the schema above.`
      : `If the verdict is "warn" or "fail", include a "fixed_sql" field with the corrected SQL. Preserve the original table/column references since no schema is available for validation.`
    : `Do NOT include a "fixed_sql" field.`;

  return `You are a senior Databricks SQL reviewer. Evaluate the SQL below against the quality rules and checklist.

IMPORTANT DIALECT CONTEXT: This is Databricks SQL (based on Spark SQL / ANSI SQL). The following standard SQL features are NOT available or behave differently:
- No STRING_AGG() — use array_join(collect_list(col), ',')
- No MEDIAN() — use PERCENTILE_APPROX(col, 0.5)
- No ISNULL() as a function — use IS NULL predicate or COALESCE
- No TOP N — use ORDER BY ... LIMIT N
- No DATEADD(datepart, n, date) — use DATE_ADD(date, n) or date + INTERVAL 'n' DAY
- QUALIFY clause IS supported for per-group deduplication
- Pipe syntax (|>) IS supported for chaining transformations
- TIMESTAMP_NTZ IS supported for timezone-independent timestamps
- MERGE INTO IS supported with WHEN MATCHED AND / WHEN NOT MATCHED
- CREATE OR REPLACE TABLE/VIEW IS supported

## SQL to Review
\`\`\`sql
${sql}
\`\`\`
${schemaBlock}
## Quality Rules
${DATABRICKS_SQL_RULES}

${DATABRICKS_SQL_REVIEW_CHECKLIST}

## Instructions
1. Evaluate each checklist dimension and identify concrete issues.
2. Assign a quality score from 0 to 100.
3. Set verdict: "pass" (score >= 80, no errors), "warn" (score 50-79 or warnings only), "fail" (score < 50 or any error-severity issue).
4. ${fixInstruction}
5. Provide actionable improvement suggestions even when the SQL passes.

Output ONLY valid JSON with this structure (no markdown fences, no explanation):
{
  "verdict": "pass" | "warn" | "fail",
  "quality_score": <number 0-100>,
  "issues": [
    {
      "category": "correctness" | "performance" | "readability" | "security" | "databricks_idiom",
      "severity": "error" | "warning" | "info",
      "message": "<description>",
      "line_ref": "<optional line reference>"
    }
  ],
  "suggestions": ["<improvement suggestion>"],
  ${opts.requestFix ? '"fixed_sql": "<corrected SQL or null if pass>"' : '"fixed_sql": null'}
}`;
}

function buildBatchReviewPrompt(
  items: BatchReviewItem[],
  schemaContext?: string,
): string {
  const sqlBlocks = items
    .map(
      (item, i) =>
        `### Item ${i + 1} (id: ${item.id})\n\`\`\`sql\n${item.sql}\n\`\`\`${item.context ? `\nContext: ${item.context}` : ""}`,
    )
    .join("\n\n");

  const schemaBlock = schemaContext
    ? `\n## Available Schema\n\`\`\`\n${schemaContext}\n\`\`\`\n`
    : "";

  return `You are a senior Databricks SQL reviewer. Evaluate each SQL expression below against the quality rules and checklist.

${sqlBlocks}
${schemaBlock}
## Quality Rules
${DATABRICKS_SQL_RULES}

${DATABRICKS_SQL_REVIEW_CHECKLIST}

## Instructions
Review each item independently. For short expressions, focus on correctness, Databricks idiom adherence, and potential runtime errors.${schemaContext ? " Verify all table/column references exist in the provided schema." : ""}

Output ONLY valid JSON with this structure (no markdown fences):
{
  "reviews": [
    {
      "id": "<item id>",
      "verdict": "pass" | "warn" | "fail",
      "quality_score": <number 0-100>,
      "issues": [
        {
          "category": "correctness" | "performance" | "readability" | "security" | "databricks_idiom",
          "severity": "error" | "warning" | "info",
          "message": "<description>"
        }
      ],
      "suggestions": ["<improvement suggestion>"]
    }
  ]
}`;
}

// ---------------------------------------------------------------------------
// Response Parsing
// ---------------------------------------------------------------------------

function parseReviewResponse(raw: string, requestedFix: boolean): ReviewResult {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    logger.warn("Failed to parse review response as JSON, treating as warn", {
      rawLength: raw.length,
    });
    return {
      verdict: "warn",
      qualityScore: 50,
      issues: [
        {
          category: "correctness" as const,
          severity: "warning" as const,
          message: "SQL review response could not be parsed — review was inconclusive",
        },
      ],
      suggestions: ["Review response could not be parsed; manual review recommended"],
    };
  }

  const verdict = (["pass", "warn", "fail"] as const).includes(parsed.verdict)
    ? parsed.verdict
    : "warn";

  const qualityScore =
    typeof parsed.quality_score === "number"
      ? Math.max(0, Math.min(100, parsed.quality_score))
      : 50;

  const issues: ReviewIssue[] = (parsed.issues ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((i: any) => i && i.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((i: any) => ({
      category: i.category ?? "correctness",
      severity: i.severity ?? "warning",
      message: String(i.message),
      lineRef: i.line_ref ?? undefined,
    }));

  const suggestions: string[] = (parsed.suggestions ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => typeof s === "string" && s.length > 0);

  const fixedSql =
    requestedFix && typeof parsed.fixed_sql === "string" && parsed.fixed_sql.length > 10
      ? parsed.fixed_sql
      : undefined;

  return { verdict, qualityScore, issues, fixedSql, suggestions };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseBatchReviewResponse(raw: string, items: BatchReviewItem[]): BatchReviewResult[] {
  const cleaned = raw
    .replace(/^```(?:json)?\s*/m, "")
    .replace(/\s*```\s*$/m, "")
    .trim();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let parsed: any;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    logger.warn("Failed to parse batch review response, treating all as warn");
    return items.map((item) => ({
      id: item.id,
      result: {
        verdict: "warn" as const,
        qualityScore: 50,
        issues: [
          {
            category: "correctness" as const,
            severity: "warning" as const,
            message: "Batch review response could not be parsed — review was inconclusive",
          },
        ],
        suggestions: ["Batch review response could not be parsed; manual review recommended"],
      },
    }));
  }

  const reviews = parsed.reviews ?? [];
  return items.map((item) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const match = reviews.find((r: any) => r.id === item.id);
    if (!match) {
      return {
        id: item.id,
        result: {
          verdict: "pass" as const,
          qualityScore: 50,
          issues: [],
          suggestions: [],
        },
      };
    }

    return {
      id: item.id,
      result: {
        verdict: (["pass", "warn", "fail"] as const).includes(match.verdict)
          ? match.verdict
          : "warn",
        qualityScore:
          typeof match.quality_score === "number"
            ? Math.max(0, Math.min(100, match.quality_score))
            : 50,
        issues: (match.issues ?? [])
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .filter((i: any) => i && i.message)
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .map((i: any) => ({
            category: i.category ?? "correctness",
            severity: i.severity ?? "warning",
            message: String(i.message),
            lineRef: i.line_ref ?? undefined,
          })),
        suggestions: (match.suggestions ?? []).filter(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (s: any) => typeof s === "string",
        ),
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const PASS_THROUGH_RESULT: ReviewResult = {
  verdict: "pass",
  qualityScore: 100,
  issues: [],
  suggestions: [],
};

/**
 * Review a single SQL statement. Returns a structured verdict without fixing.
 * If the review endpoint is not configured or disabled for this surface,
 * returns a pass-through result.
 */
export async function reviewSql(
  sql: string,
  opts: ReviewOptions = {},
): Promise<ReviewResult> {
  if (!isReviewEnabled(opts.surface)) return PASS_THROUGH_RESULT;
  if (!sql || sql.trim().length < 10) return PASS_THROUGH_RESULT;

  const endpoint = getReviewEndpoint();
  const prompt = buildReviewPrompt(sql, { ...opts, requestFix: false });

  try {
    const response = await chatCompletion({
      endpoint,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      maxTokens: opts.maxTokens ?? 4096,
      responseFormat: "json_object",
    });

    const result = parseReviewResponse(response.content, false);

    logger.info("SQL review complete", {
      surface: opts.surface,
      verdict: result.verdict,
      qualityScore: result.qualityScore,
      issueCount: result.issues.length,
      endpoint,
    });

    return result;
  } catch (err) {
    logger.warn("SQL review failed, passing through", {
      surface: opts.surface,
      error: err instanceof Error ? err.message : String(err),
    });
    return PASS_THROUGH_RESULT;
  }
}

/**
 * Review a single SQL statement and auto-fix if the verdict is warn or fail.
 * Returns the original or fixed SQL alongside the review result.
 */
export async function reviewAndFixSql(
  sql: string,
  opts: ReviewOptions = {},
): Promise<ReviewResult> {
  if (!isReviewEnabled(opts.surface)) return PASS_THROUGH_RESULT;
  if (!sql || sql.trim().length < 10) return PASS_THROUGH_RESULT;

  const endpoint = getReviewEndpoint();
  const prompt = buildReviewPrompt(sql, { ...opts, requestFix: true });

  try {
    const response = await chatCompletion({
      endpoint,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      maxTokens: opts.maxTokens ?? 8192,
      responseFormat: "json_object",
    });

    const result = parseReviewResponse(response.content, true);

    logger.info("SQL review+fix complete", {
      surface: opts.surface,
      verdict: result.verdict,
      qualityScore: result.qualityScore,
      issueCount: result.issues.length,
      hasFix: !!result.fixedSql,
      endpoint,
    });

    return result;
  } catch (err) {
    logger.warn("SQL review+fix failed, passing through", {
      surface: opts.surface,
      error: err instanceof Error ? err.message : String(err),
    });
    return PASS_THROUGH_RESULT;
  }
}

/**
 * Batch-review multiple short SQL expressions in a single LLM call.
 * Best for semantic expressions, filters, measures, and join conditions.
 * Falls back to per-item pass-through if the endpoint is disabled.
 */
export async function reviewBatch(
  items: BatchReviewItem[],
  surface?: string,
  schemaContext?: string,
): Promise<BatchReviewResult[]> {
  if (!isReviewEnabled(surface) || items.length === 0) {
    return items.map((item) => ({
      id: item.id,
      result: PASS_THROUGH_RESULT,
    }));
  }

  const endpoint = getReviewEndpoint();
  const prompt = buildBatchReviewPrompt(items, schemaContext);

  try {
    const response = await chatCompletion({
      endpoint,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      maxTokens: Math.min(items.length * 1024, 16384),
      responseFormat: "json_object",
    });

    const results = parseBatchReviewResponse(response.content, items);

    const failCount = results.filter((r) => r.result.verdict === "fail").length;
    logger.info("SQL batch review complete", {
      surface,
      totalItems: items.length,
      failCount,
      endpoint,
    });

    return results;
  } catch (err) {
    logger.warn("SQL batch review failed, passing through", {
      surface,
      error: err instanceof Error ? err.message : String(err),
    });
    return items.map((item) => ({
      id: item.id,
      result: PASS_THROUGH_RESULT,
    }));
  }
}
