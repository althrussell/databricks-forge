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

import { type ChatMessage } from "@/lib/dbx/model-serving";
import { cachedChatCompletion } from "../llm-cache";
import { logger } from "@/lib/logger";
import type { BusinessContext, MetadataSnapshot } from "@/lib/domain/types";
import type {
  GenieEngineConfig,
  EntityMatchingCandidate,
  ClarificationRule,
  JoinSpecInput,
} from "../types";
import { buildCompactColumnsBlock } from "../schema-allowlist";
import { sanitizeUserContext } from "./title-generation";

const TEMPERATURE = 0.3;
const MAX_INSTRUCTION_CHARS = 3000;
const MAX_GLOSSARY_ENTRIES = 10;
const MAX_CLARIFICATION_RULES = 5;

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface InstructionGenerationInput {
  domain: string;
  subdomains: string[];
  businessName: string;
  businessContext: BusinessContext | null;
  config: GenieEngineConfig;
  entityCandidates: EntityMatchingCandidate[];
  joinSpecs: JoinSpecInput[];
  endpoint: string;
  fallbackEndpoint?: string;
  metadata?: MetadataSnapshot;
  tableFqns?: string[];
  conversationSummary?: string;
  sensitiveColumns?: Set<string>;
  signal?: AbortSignal;
}

export interface InstructionGenerationOutput {
  instructions: string[];
}

export async function runInstructionGeneration(
  input: InstructionGenerationInput
): Promise<InstructionGenerationOutput> {
  const {
    domain,
    subdomains,
    businessName,
    businessContext,
    config,
    entityCandidates,
    endpoint,
    fallbackEndpoint,
    metadata,
    tableFqns,
    conversationSummary,
    sensitiveColumns,
    signal,
  } = input;

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

  // 8. LLM-refined domain guidance
  let llmRefined: string | null = null;
  if (config.llmRefinement) {
    try {
      llmRefined = await generateLLMInstruction(
        domain,
        subdomains,
        businessName,
        businessContext,
        endpoint,
        metadata,
        tableFqns,
        input.joinSpecs,
        conversationSummary,
        sensitiveColumns,
        signal,
      );
    } catch (err) {
      logger.warn("LLM instruction generation failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (!llmRefined && fallbackEndpoint && fallbackEndpoint !== endpoint) {
    try {
      llmRefined = await generateLLMInstruction(
        domain,
        subdomains,
        businessName,
        businessContext,
        fallbackEndpoint,
        metadata,
        tableFqns,
        input.joinSpecs,
        conversationSummary,
        sensitiveColumns,
        signal,
      );
      if (llmRefined) {
        instructions.push("Instruction generation degraded: fast endpoint unavailable; used fallback endpoint.");
      }
    } catch (err) {
      logger.warn("Fallback LLM instruction generation failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (llmRefined) instructions.push(llmRefined);

  const sanitized = instructions.map(sanitizeInstructionText).filter(Boolean);
  return { instructions: applyInstructionCharBudget(sanitized, llmRefined, config) };
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
export function applyInstructionCharBudget(
  instructions: string[],
  llmRefined: string | null,
  config: GenieEngineConfig
): string[] {
  if (totalChars(instructions) <= MAX_INSTRUCTION_CHARS) return instructions;

  const alwaysKeep = instructions.slice(0, 4);
  let optional = instructions.slice(4);

  if (llmRefined) {
    optional = optional.filter((s) => s !== llmRefined);
    logger.debug("Instruction budget: dropped LLM-refined block");
    if (totalChars([...alwaysKeep, ...optional]) <= MAX_INSTRUCTION_CHARS) return [...alwaysKeep, ...optional];
  }

  if (config.glossary.length > 5) {
    const reducedGlossary = config.glossary.slice(0, 5).map(
      (g) => `- "${g.term}": ${g.definition}${g.synonyms.length > 0 ? ` (aka ${g.synonyms.join(", ")})` : ""}`
    );
    const header = "Business terminology:";
    optional = optional.map((s) =>
      s.startsWith(header) ? `${header}\n${reducedGlossary.join("\n")}` : s
    );
    logger.debug("Instruction budget: reduced glossary to 5 entries");
    if (totalChars([...alwaysKeep, ...optional]) <= MAX_INSTRUCTION_CHARS) return [...alwaysKeep, ...optional];
  }

  if (config.clarificationRules.length > 3) {
    const reducedRules = config.clarificationRules.slice(0, 3).map((r) =>
      `When users ask about ${r.topic} but don't include ${r.missingDetails.join(" or ")}, ` +
      `you must ask a clarification question first. Example: "${r.clarificationQuestion}"`
    );
    const header = "Clarification rules:";
    optional = optional.map((s) =>
      s.startsWith(header) ? `${header}\n${reducedRules.join("\n")}` : s
    );
    logger.debug("Instruction budget: reduced clarification rules to 3");
  }

  const merged = [...alwaysKeep, ...optional];
  if (totalChars(merged) <= MAX_INSTRUCTION_CHARS) return merged;
  let budget = MAX_INSTRUCTION_CHARS;
  const finalBlocks: string[] = [];
  for (const block of merged) {
    if (budget <= 0) break;
    if (block.length <= budget) {
      finalBlocks.push(block);
      budget -= block.length;
    } else {
      finalBlocks.push(block.slice(0, budget));
      break;
    }
  }
  return finalBlocks;
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
  bc: BusinessContext | null,
  endpoint: string,
  metadata: MetadataSnapshot | undefined,
  tableFqns: string[] | undefined,
  joins: JoinSpecInput[],
  conversationSummary: string | undefined,
  sensitiveColumns: Set<string> | undefined,
  signal?: AbortSignal,
): Promise<string | null> {
  const systemMessage = [
    "You are writing one concise instruction block for a Databricks Genie space.",
    "Return plain text only.",
    "Include: business focus, key entities to group by, recommended time windows, and ambiguity handling.",
    "Do not include dataset marketing language, product pitch text, or generic platform instructions.",
    "Do not include SQL syntax lessons; keep this analyst-facing and operational.",
  ].join(" ");
  const compactColumns = metadata ? buildCompactColumnsBlock(metadata, tableFqns).slice(0, 1600) : "";
  const joinHints = joins
    .slice(0, 6)
    .map((j) => `${j.leftTable} <-> ${j.rightTable}`)
    .join(", ");
  const safeConversation = sanitizeUserContext(conversationSummary);
  const context = [
    `Business: ${businessName}`,
    `Domain: ${domain}`,
    `Subdomains: ${subdomains.join(", ") || "none"}`,
    `Industry: ${bc?.industries || "unknown"}`,
    safeConversation ? `User intent summary (quoted user text): ${safeConversation}` : "",
    joinHints ? `Join hints: ${joinHints}` : "",
    sensitiveColumns && sensitiveColumns.size > 0
      ? `Sensitive columns to avoid in guidance: ${Array.from(sensitiveColumns).slice(0, 25).join(", ")}`
      : "",
    compactColumns ? compactColumns : "",
  ]
    .filter(Boolean)
    .join("\n");

  const userMessage = `${context}

Write 4-6 short bullet points as plain text paragraphs (no markdown bullets) that guide users toward relevant analysis.`;

  const messages: ChatMessage[] = [
    { role: "system", content: systemMessage },
    { role: "user", content: userMessage },
  ];

  const result = await cachedChatCompletion({
    endpoint,
    messages,
    temperature: TEMPERATURE,
    maxTokens: 2048,
    signal,
  });

  const content = sanitizeInstructionText(result.content?.trim() ?? "");
  return content && content.length > 20 ? content : null;
}

export function sanitizeInstructionText(input: string): string {
  if (!input) return "";
  const bannedPatterns = [
    /sample dataset/i,
    /dataset simulates/i,
    /simulates a .* business/i,
    /synthetically curated/i,
    /suitable for any databricks workload/i,
    /building data pipelines with delta live tables/i,
    /exploring ai and machine learning capabilities/i,
  ];
  const lines = input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !bannedPatterns.some((p) => p.test(line)));
  return lines.join("\n").slice(0, 1800);
}
