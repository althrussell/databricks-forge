/**
 * Pass 4: Instruction Generation (LLM, grounded)
 *
 * Generates text instructions for the Genie space including business context,
 * clarification question rules, entity-matching guidance, time period
 * guidance, and summary customization.
 */

import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import type { BusinessContext } from "@/lib/domain/types";
import { DATABRICKS_SQL_RULES_COMPACT } from "@/lib/ai/sql-rules";
import type {
  GenieEngineConfig,
  EntityMatchingCandidate,
  ClarificationRule,
} from "../types";

const TEMPERATURE = 0.3;
const MAX_INSTRUCTION_CHARS = 3000;
const MAX_GLOSSARY_ENTRIES = 10;
const MAX_CLARIFICATION_RULES = 5;
const MAX_FIELD_CHARS = 200;

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

interface JoinSpecInput {
  leftTable: string;
  rightTable: string;
  sql: string;
  relationshipType: string;
}

export interface InstructionGenerationInput {
  domain: string;
  subdomains: string[];
  businessName: string;
  businessContext: BusinessContext | null;
  config: GenieEngineConfig;
  entityCandidates: EntityMatchingCandidate[];
  joinSpecs: JoinSpecInput[];
  endpoint: string;
}

export interface InstructionGenerationOutput {
  instructions: string[];
}

export async function runInstructionGeneration(
  input: InstructionGenerationInput
): Promise<InstructionGenerationOutput> {
  const { domain, subdomains, businessName, businessContext, config, entityCandidates, joinSpecs, endpoint } = input;

  const instructions: string[] = [];

  // 1. Core business context instruction
  instructions.push(buildBusinessContextInstruction(
    domain, subdomains, businessName, businessContext
  ));

  // 2. Entity matching -- detailed per-column guidance lives in table
  //    descriptions via column enrichments; a short hint is sufficient here.
  if (entityCandidates.some((c) => c.sampleValues.length > 0)) {
    instructions.push(
      "When users refer to coded values by their full names or descriptions, " +
      "use the column synonyms and descriptions provided in the table metadata to map to stored codes."
    );
  }

  // 3. Table relationship guidance
  const joinInstruction = buildJoinInstruction(joinSpecs);
  if (joinInstruction) instructions.push(joinInstruction);

  // 4. Time period guidance
  if (config.autoTimePeriods) {
    const fyMonth = MONTH_NAMES[config.fiscalYearStartMonth] || "January";
    instructions.push(
      `This space supports standard financial reporting periods. The fiscal year starts in ${fyMonth}. ` +
      `When users ask about "this year", "YTD", "last quarter", etc., use the fiscal calendar. ` +
      `Calendar-year periods (last 7 days, last 30 days) are also available.`
    );
  }

  // 5. Clarification rules
  const clarificationInstr = buildClarificationInstruction(config.clarificationRules);
  if (clarificationInstr) instructions.push(clarificationInstr);

  // 6. Summary customization
  if (config.summaryInstructions.trim()) {
    instructions.push(
      `Instructions you must follow when providing summaries:\n${config.summaryInstructions}`
    );
  }

  // 7. Glossary-based instruction (capped to avoid bloating context)
  if (config.glossary.length > 0) {
    const glossaryLines = config.glossary.slice(0, MAX_GLOSSARY_ENTRIES).map(
      (g) => `- "${g.term}" means: ${g.definition}${g.synonyms.length > 0 ? ` (also called: ${g.synonyms.join(", ")})` : ""}`
    );
    instructions.push(
      `Business terminology for this space:\n${glossaryLines.join("\n")}`
    );
  }

  // 8. Global instructions from customer
  if (config.globalInstructions.trim()) {
    instructions.push(config.globalInstructions);
  }

  // 9. SQL output quality rules (compact for runtime + instruction-specific)
  instructions.push(
    `SQL output rules:\n${DATABRICKS_SQL_RULES_COMPACT}\n` +
    `- For top-N queries, use ORDER BY ... LIMIT N (not RANK/DENSE_RANK). ` +
    `- Always include identifying columns (name, email) alongside IDs. ` +
    `- Preserve NTILE/RANK ordering direction exactly. ` +
    `- Match the column list from example queries -- do not add extra GROUP BY columns.`
  );

  // 10. LLM-refined instruction (if enabled) -- tracked separately so it
  //    can be dropped first when the total exceeds the character budget.
  let llmRefined: string | null = null;
  if (config.llmRefinement && businessContext) {
    try {
      llmRefined = await generateLLMInstruction(
        domain, subdomains, businessName, businessContext, endpoint
      );
    } catch (err) {
      logger.warn("LLM instruction generation failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (llmRefined) instructions.push(llmRefined);

  return { instructions: applyCharBudget(instructions, llmRefined, config) };
}

function totalChars(blocks: string[]): number {
  return blocks.reduce((sum, s) => sum + s.length, 0);
}

/**
 * Progressively trim instructions to stay within MAX_INSTRUCTION_CHARS.
 * Priority (lowest-value dropped first):
 *   1. LLM-refined instruction
 *   2. Glossary reduced to 5 entries
 *   3. Clarification rules reduced to 3
 */
function applyCharBudget(
  instructions: string[],
  llmRefined: string | null,
  config: GenieEngineConfig
): string[] {
  if (totalChars(instructions) <= MAX_INSTRUCTION_CHARS) return instructions;

  let trimmed = [...instructions];

  // Pass 1: drop LLM-refined block
  if (llmRefined) {
    trimmed = trimmed.filter((s) => s !== llmRefined);
    logger.debug("Instruction budget: dropped LLM-refined block");
    if (totalChars(trimmed) <= MAX_INSTRUCTION_CHARS) return trimmed;
  }

  // Pass 2: reduce glossary to 5
  if (config.glossary.length > 5) {
    const reducedGlossary = config.glossary.slice(0, 5).map(
      (g) => `- "${g.term}" means: ${g.definition}${g.synonyms.length > 0 ? ` (also called: ${g.synonyms.join(", ")})` : ""}`
    );
    const header = "Business terminology for this space:";
    trimmed = trimmed.map((s) =>
      s.startsWith(header) ? `${header}\n${reducedGlossary.join("\n")}` : s
    );
    logger.debug("Instruction budget: reduced glossary to 5 entries");
    if (totalChars(trimmed) <= MAX_INSTRUCTION_CHARS) return trimmed;
  }

  // Pass 3: reduce clarification rules to 3
  if (config.clarificationRules.length > 3) {
    const reducedRules = config.clarificationRules.slice(0, 3).map((r) =>
      `When users ask about ${r.topic} but don't include ${r.missingDetails.join(" or ")}, ` +
      `you must ask a clarification question first. Example: "${r.clarificationQuestion}"`
    );
    const header = "Clarification rules:";
    trimmed = trimmed.map((s) =>
      s.startsWith(header) ? `${header}\n${reducedRules.join("\n")}` : s
    );
    logger.debug("Instruction budget: reduced clarification rules to 3");
  }

  return trimmed;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + "…";
}

function buildBusinessContextInstruction(
  domain: string,
  subdomains: string[],
  businessName: string,
  bc: BusinessContext | null
): string {
  const lines: string[] = [
    `This Genie space serves the ${domain} domain for ${businessName}.`,
  ];

  if (bc) {
    if (bc.industries) lines.push(`Industry: ${bc.industries}.`);
    if (bc.strategicGoals) lines.push(`Strategic goals: ${truncate(bc.strategicGoals, MAX_FIELD_CHARS)}`);
    if (bc.businessPriorities) lines.push(`Business priorities: ${truncate(bc.businessPriorities, MAX_FIELD_CHARS)}`);
    if (bc.valueChain) lines.push(`Value chain: ${truncate(bc.valueChain, MAX_FIELD_CHARS)}`);
  }

  if (subdomains.length > 0) {
    lines.push(`Sub-areas covered: ${subdomains.join(", ")}.`);
  }

  return lines.join("\n");
}

function buildJoinInstruction(joinSpecs: JoinSpecInput[]): string | null {
  if (joinSpecs.length === 0) return null;

  const lines = joinSpecs.slice(0, 15).map((j) => {
    const leftShort = j.leftTable.split(".").pop() ?? j.leftTable;
    const rightShort = j.rightTable.split(".").pop() ?? j.rightTable;
    return `- ${leftShort} joins to ${rightShort} on ${j.sql} (${j.relationshipType})`;
  });

  return `Table relationships for SQL generation:\n${lines.join("\n")}\nAlways use these join conditions when combining these tables.`;
}

function buildClarificationInstruction(rules: ClarificationRule[]): string | null {
  if (rules.length === 0) return null;

  const ruleLines = rules.slice(0, MAX_CLARIFICATION_RULES).map((r) =>
    `When users ask about ${r.topic} but don't include ${r.missingDetails.join(" or ")}, ` +
    `you must ask a clarification question first. Example: "${r.clarificationQuestion}"`
  );

  return `Clarification rules:\n${ruleLines.join("\n")}`;
}

async function generateLLMInstruction(
  domain: string,
  subdomains: string[],
  businessName: string,
  bc: BusinessContext,
  endpoint: string
): Promise<string | null> {
  const systemMessage = `You are writing concise text instructions for a Databricks Genie space. Generate 2-3 sentences of additional analytical guidance specific to this domain. Be concrete and actionable.`;

  const userMessage = `Business: ${businessName}
Domain: ${domain}
Subdomains: ${subdomains.join(", ")}
Industry: ${bc.industries}
Goals: ${bc.strategicGoals}
Priorities: ${bc.businessPriorities}

Write brief analytical guidance for users of this Genie space.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  const result = await chatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    maxTokens: 300,
  });

  const content = result.content?.trim();
  return content && content.length > 20 ? content : null;
}
