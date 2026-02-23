/**
 * Pass 4: Instruction Generation (rule-based + optional LLM)
 *
 * Generates text instructions for the Genie space following Databricks best
 * practices: text instructions are a last resort, used only for behavioural
 * guidance that cannot be expressed through SQL expressions or example queries.
 *
 * What belongs here (behavioural):
 *   - Domain identity (short)
 *   - Entity matching hint
 *   - Time period / fiscal year guidance
 *   - Clarification question rules
 *   - Summary customisation
 *   - Glossary / business terminology
 *   - Customer global instructions
 *
 * What does NOT belong here (handled by structured API fields):
 *   - SQL quality rules (taught via example SQL queries)
 *   - Join relationships (structured join_specs in SerializedSpace)
 *   - Measures / filters / dimensions (SQL expressions in knowledge store)
 *   - Full business context / value chain / strategic goals
 */

import { chatCompletion, type ChatMessage } from "@/lib/dbx/model-serving";
import { logger } from "@/lib/logger";
import type { BusinessContext } from "@/lib/domain/types";
import type {
  GenieEngineConfig,
  EntityMatchingCandidate,
  ClarificationRule,
} from "../types";

const TEMPERATURE = 0.3;
const MAX_INSTRUCTION_CHARS = 3000;
const MAX_GLOSSARY_ENTRIES = 10;
const MAX_CLARIFICATION_RULES = 5;

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
  signal?: AbortSignal;
}

export interface InstructionGenerationOutput {
  instructions: string[];
}

export async function runInstructionGeneration(
  input: InstructionGenerationInput
): Promise<InstructionGenerationOutput> {
  const { domain, subdomains, businessName, businessContext, config, entityCandidates, endpoint, signal } = input;

  const instructions: string[] = [];

  // 1. Short domain identity
  instructions.push(buildDomainIdentity(domain, subdomains, businessName, businessContext));

  // 2. Entity matching hint
  if (entityCandidates.some((c) => c.sampleValues.length > 0)) {
    instructions.push(
      "When users refer to coded values by their full names or descriptions, " +
      "use the column synonyms and descriptions in the table metadata to map to stored codes."
    );
  }

  // 3. Time period guidance
  if (config.autoTimePeriods) {
    const fyMonth = MONTH_NAMES[config.fiscalYearStartMonth] || "January";
    instructions.push(
      `Fiscal year starts in ${fyMonth}. ` +
      `When users say "this year", "YTD", or "last quarter", use the fiscal calendar. ` +
      `Calendar periods (last 7/30/90 days) are also available.`
    );
  }

  // 4. Clarification rules
  const clarificationInstr = buildClarificationInstruction(config.clarificationRules);
  if (clarificationInstr) instructions.push(clarificationInstr);

  // 5. Summary customisation
  if (config.summaryInstructions.trim()) {
    instructions.push(
      `Instructions you must follow when providing summaries:\n${config.summaryInstructions}`
    );
  }

  // 6. Glossary / business terminology
  if (config.glossary.length > 0) {
    const glossaryLines = config.glossary.slice(0, MAX_GLOSSARY_ENTRIES).map(
      (g) => `- "${g.term}": ${g.definition}${g.synonyms.length > 0 ? ` (aka ${g.synonyms.join(", ")})` : ""}`
    );
    instructions.push(
      `Business terminology:\n${glossaryLines.join("\n")}`
    );
  }

  // 7. Customer global instructions
  if (config.globalInstructions.trim()) {
    instructions.push(config.globalInstructions);
  }

  // 8. LLM-refined domain guidance (optional, dropped first if over budget)
  let llmRefined: string | null = null;
  if (config.llmRefinement && businessContext) {
    try {
      llmRefined = await generateLLMInstruction(
        domain, subdomains, businessName, businessContext, endpoint, signal
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

  if (llmRefined) {
    trimmed = trimmed.filter((s) => s !== llmRefined);
    logger.debug("Instruction budget: dropped LLM-refined block");
    if (totalChars(trimmed) <= MAX_INSTRUCTION_CHARS) return trimmed;
  }

  if (config.glossary.length > 5) {
    const reducedGlossary = config.glossary.slice(0, 5).map(
      (g) => `- "${g.term}": ${g.definition}${g.synonyms.length > 0 ? ` (aka ${g.synonyms.join(", ")})` : ""}`
    );
    const header = "Business terminology:";
    trimmed = trimmed.map((s) =>
      s.startsWith(header) ? `${header}\n${reducedGlossary.join("\n")}` : s
    );
    logger.debug("Instruction budget: reduced glossary to 5 entries");
    if (totalChars(trimmed) <= MAX_INSTRUCTION_CHARS) return trimmed;
  }

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

/**
 * Short domain identity -- just enough for Genie to know the business context.
 * Full strategic goals / value chain are NOT included (per Databricks best practices,
 * text instructions should be minimal behavioural guidance).
 */
function buildDomainIdentity(
  domain: string,
  subdomains: string[],
  businessName: string,
  bc: BusinessContext | null
): string {
  const parts: string[] = [
    `This space serves the ${domain} domain for ${businessName}.`,
  ];

  if (bc?.industries) parts.push(`Industry: ${bc.industries}.`);
  if (subdomains.length > 0) parts.push(`Covers: ${subdomains.join(", ")}.`);

  return parts.join(" ");
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
  endpoint: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const systemMessage = `You are writing a single concise text instruction for a Databricks Genie space. ` +
    `Write 1-2 sentences of domain-specific guidance that helps users ask better questions. ` +
    `Focus on what kinds of analysis this data supports and what key dimensions/metrics to explore. ` +
    `Do NOT include SQL syntax rules, join instructions, or general advice. Be specific to this domain.`;

  const userMessage = `Business: ${businessName}
Domain: ${domain}
Subdomains: ${subdomains.join(", ")}
Industry: ${bc.industries}

Write one brief domain-specific instruction for users of this Genie space.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  const result = await chatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    maxTokens: 150,
    signal,
  });

  const content = result.content?.trim();
  return content && content.length > 20 ? content : null;
}
