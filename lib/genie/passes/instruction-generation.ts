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
import type {
  GenieEngineConfig,
  EntityMatchingCandidate,
  ClarificationRule,
} from "../types";

const TEMPERATURE = 0.3;

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
  endpoint: string;
}

export interface InstructionGenerationOutput {
  instructions: string[];
}

export async function runInstructionGeneration(
  input: InstructionGenerationInput
): Promise<InstructionGenerationOutput> {
  const { domain, subdomains, businessName, businessContext, config, entityCandidates, endpoint } = input;

  const instructions: string[] = [];

  // 1. Core business context instruction
  instructions.push(buildBusinessContextInstruction(
    domain, subdomains, businessName, businessContext
  ));

  // 2. Entity matching guidance
  const entityGuidance = buildEntityMatchingGuidance(entityCandidates);
  if (entityGuidance) instructions.push(entityGuidance);

  // 3. Time period guidance
  if (config.autoTimePeriods) {
    const fyMonth = MONTH_NAMES[config.fiscalYearStartMonth] || "January";
    instructions.push(
      `This space supports standard financial reporting periods. The fiscal year starts in ${fyMonth}. ` +
      `When users ask about "this year", "YTD", "last quarter", etc., use the fiscal calendar. ` +
      `Calendar-year periods (last 7 days, last 30 days) are also available.`
    );
  }

  // 4. Clarification rules
  const clarificationInstr = buildClarificationInstruction(config.clarificationRules);
  if (clarificationInstr) instructions.push(clarificationInstr);

  // 5. Summary customization
  if (config.summaryInstructions.trim()) {
    instructions.push(
      `Instructions you must follow when providing summaries:\n${config.summaryInstructions}`
    );
  }

  // 6. Glossary-based instruction
  if (config.glossary.length > 0) {
    const glossaryLines = config.glossary.map(
      (g) => `- "${g.term}" means: ${g.definition}${g.synonyms.length > 0 ? ` (also called: ${g.synonyms.join(", ")})` : ""}`
    );
    instructions.push(
      `Business terminology for this space:\n${glossaryLines.join("\n")}`
    );
  }

  // 7. Global instructions from customer
  if (config.globalInstructions.trim()) {
    instructions.push(config.globalInstructions);
  }

  // 8. LLM-refined instruction (if enabled)
  if (config.llmRefinement && businessContext) {
    try {
      const refined = await generateLLMInstruction(
        domain, subdomains, businessName, businessContext, endpoint
      );
      if (refined) instructions.push(refined);
    } catch (err) {
      logger.warn("LLM instruction generation failed", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { instructions };
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
    if (bc.strategicGoals) lines.push(`Strategic goals: ${bc.strategicGoals}`);
    if (bc.businessPriorities) lines.push(`Business priorities: ${bc.businessPriorities}`);
    if (bc.valueChain) lines.push(`Value chain: ${bc.valueChain}`);
  }

  if (subdomains.length > 0) {
    lines.push(`Sub-areas covered: ${subdomains.join(", ")}.`);
  }

  return lines.join("\n");
}

function buildEntityMatchingGuidance(candidates: EntityMatchingCandidate[]): string | null {
  const withValues = candidates.filter((c) => c.sampleValues.length > 0);
  if (withValues.length === 0) return null;

  const lines = withValues.slice(0, 15).map((c) => {
    const colRef = `${c.tableFqn}.${c.columnName}`;
    const vals = c.sampleValues.slice(0, 10).join(", ");
    return `- Column ${colRef} stores coded values: [${vals}]. When users refer to these using full names or descriptions, map to the stored codes.`;
  });

  return `Entity matching guidance:\n${lines.join("\n")}`;
}

function buildClarificationInstruction(rules: ClarificationRule[]): string | null {
  if (rules.length === 0) return null;

  const ruleLines = rules.map((r) =>
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
