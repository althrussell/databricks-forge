/**
 * Pipeline run embedding orchestrator.
 *
 * Called after use cases are persisted (post-scoring/SQL) to embed:
 *   - All use cases (name, statement, solution, businessValue, etc.)
 *   - Business context (strategic goals, value chain, priorities)
 *
 * Also provides Genie recommendation embedding (called after engine completes)
 * and outcome map embedding (called on create/update).
 *
 * Embedding is best-effort — failures are logged but do not fail the run.
 */

import { generateEmbeddings } from "./client";
import { insertEmbeddings, deleteEmbeddingsByKindAndRun, deleteEmbeddingsBySource } from "./store";
import {
  composeUseCase,
  composeBusinessContext,
  composeGenieRecommendation,
  composeGenieQuestion,
  composeOutcomeMap,
} from "./compose";
import type { EmbeddingInput } from "./types";
import { isEmbeddingEnabled } from "./config";
import { logger } from "@/lib/logger";

function parseTables(val: string[] | string | undefined): string[] {
  if (Array.isArray(val)) return val;
  if (typeof val !== "string" || !val) return [];
  try { return JSON.parse(val); } catch { return []; }
}

// ---------------------------------------------------------------------------
// Use case + business context embedding
// ---------------------------------------------------------------------------

interface UseCaseLike {
  id: string;
  name: string;
  type?: string;
  analyticsTechnique?: string;
  statement: string;
  solution: string;
  businessValue: string;
  beneficiary?: string;
  sponsor?: string;
  domain: string;
  subdomain?: string;
  tablesInvolved?: string[] | string;
  overallScore?: number;
}

/**
 * Embed all use cases and business context for a pipeline run.
 * Deletes existing embeddings for the run first.
 */
export async function embedRunResults(
  runId: string,
  useCases: UseCaseLike[],
  businessContext?: string | null,
  businessName?: string,
): Promise<void> {
  if (!isEmbeddingEnabled()) {
    logger.debug("[embed-pipeline] Embedding disabled, skipping run embedding");
    return;
  }

  const startTime = Date.now();

  try {
    await deleteEmbeddingsByKindAndRun("use_case", runId);
    await deleteEmbeddingsByKindAndRun("business_context", runId);

    const inputs: EmbeddingInput[] = [];
    const texts: string[] = [];

    for (const uc of useCases) {
      const text = composeUseCase(uc);
      texts.push(text);
      inputs.push({
        kind: "use_case",
        sourceId: uc.id,
        runId,
        contentText: text,
        metadataJson: {
          domain: uc.domain,
          subdomain: uc.subdomain,
          type: uc.type,
          technique: uc.analyticsTechnique,
          tables: parseTables(uc.tablesInvolved),
        },
        embedding: [],
      });
    }

    if (businessContext) {
      try {
        const ctx = JSON.parse(businessContext);
        const text = composeBusinessContext(ctx, businessName);
        texts.push(text);
        inputs.push({
          kind: "business_context",
          sourceId: runId,
          runId,
          contentText: text,
          metadataJson: { businessName },
          embedding: [],
        });
      } catch {
        // businessContext might not be valid JSON
      }
    }

    if (texts.length === 0) return;

    const embeddings = await generateEmbeddings(texts);
    for (let i = 0; i < inputs.length; i++) {
      inputs[i].embedding = embeddings[i];
    }

    await insertEmbeddings(inputs);

    logger.info("[embed-pipeline] Run embedding complete", {
      runId,
      useCases: useCases.length,
      totalRecords: inputs.length,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    logger.warn("[embed-pipeline] Embedding failed (non-fatal)", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Genie recommendation embedding
// ---------------------------------------------------------------------------

interface GenieRecLike {
  domain: string;
  title: string;
  description: string;
  tables?: string[];
  metricViews?: string[];
  changeSummary?: string | null;
  recommendationType?: string | null;
  serializedSpace?: string;
}

/**
 * Embed Genie recommendations and their sample questions.
 */
export async function embedGenieRecommendations(
  runId: string,
  recommendations: GenieRecLike[],
): Promise<void> {
  if (!isEmbeddingEnabled()) {
    logger.debug("[embed-pipeline] Embedding disabled, skipping genie embedding");
    return;
  }

  const startTime = Date.now();

  try {
    await deleteEmbeddingsByKindAndRun("genie_recommendation", runId);
    await deleteEmbeddingsByKindAndRun("genie_question", runId);

    const inputs: EmbeddingInput[] = [];
    const texts: string[] = [];

    for (const rec of recommendations) {
      // Embed the recommendation itself
      const recText = composeGenieRecommendation(rec);
      texts.push(recText);
      inputs.push({
        kind: "genie_recommendation",
        sourceId: `${runId}:${rec.domain}`,
        runId,
        contentText: recText,
        metadataJson: { domain: rec.domain, title: rec.title, tables: rec.tables ?? [] },
        embedding: [],
      });

      // Extract and embed individual sample questions + trusted queries
      if (rec.serializedSpace) {
        try {
          const space = JSON.parse(rec.serializedSpace);

          // Sample questions
          const sampleQuestions = space.config?.sample_questions ?? [];
          for (const sq of sampleQuestions) {
            const qTexts = Array.isArray(sq.question) ? sq.question : [sq.question];
            for (const qText of qTexts) {
              if (!qText) continue;
              const text = composeGenieQuestion(qText, rec.domain);
              texts.push(text);
              inputs.push({
                kind: "genie_question",
                sourceId: `${runId}:${rec.domain}:q:${sq.id || qText.slice(0, 30)}`,
                runId,
                contentText: text,
                metadataJson: { domain: rec.domain, spaceTitle: rec.title },
                embedding: [],
              });
            }
          }

          // Trusted query questions (example_question_sqls)
          const trustedQueries = space.instructions?.example_question_sqls ?? [];
          for (const tq of trustedQueries) {
            const qTexts = Array.isArray(tq.question) ? tq.question : [tq.question];
            const sqlText = Array.isArray(tq.sql) ? tq.sql.join("\n") : tq.sql;
            for (const qText of qTexts) {
              if (!qText) continue;
              const text = composeGenieQuestion(qText, rec.domain, sqlText);
              texts.push(text);
              inputs.push({
                kind: "genie_question",
                sourceId: `${runId}:${rec.domain}:tq:${tq.id || qText.slice(0, 30)}`,
                runId,
                contentText: text,
                metadataJson: { domain: rec.domain, spaceTitle: rec.title, hasSql: true },
                embedding: [],
              });
            }
          }
        } catch {
          // serializedSpace might not be valid JSON
        }
      }
    }

    if (texts.length === 0) return;

    const embeddings = await generateEmbeddings(texts);
    for (let i = 0; i < inputs.length; i++) {
      inputs[i].embedding = embeddings[i];
    }

    await insertEmbeddings(inputs);

    logger.info("[embed-pipeline] Genie embedding complete", {
      runId,
      recommendations: recommendations.length,
      totalRecords: inputs.length,
      durationMs: Date.now() - startTime,
    });
  } catch (err) {
    logger.warn("[embed-pipeline] Genie embedding failed (non-fatal)", {
      runId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ---------------------------------------------------------------------------
// Outcome map embedding
// ---------------------------------------------------------------------------

interface OutcomeMapLike {
  id: string;
  name: string;
  objectives?: Array<{
    name: string;
    whyChange?: string;
    priorities?: Array<{
      name: string;
      useCases?: Array<{ name: string; description?: string }>;
    }>;
  }>;
  suggestedDomains?: string[];
  suggestedPriorities?: string[];
}

/**
 * Embed an outcome map (industry objectives and use cases).
 */
export async function embedOutcomeMap(map: OutcomeMapLike): Promise<void> {
  if (!isEmbeddingEnabled()) return;

  try {
    await deleteEmbeddingsBySource(map.id);

    const text = composeOutcomeMap(map);
    const [embedding] = await generateEmbeddings([text]);

    await insertEmbeddings([
      {
        kind: "outcome_map",
        sourceId: map.id,
        contentText: text,
        metadataJson: { name: map.name },
        embedding,
      },
    ]);

    logger.debug("[embed-pipeline] Outcome map embedded", { id: map.id, name: map.name });
  } catch (err) {
    logger.warn("[embed-pipeline] Outcome map embedding failed (non-fatal)", {
      id: map.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
