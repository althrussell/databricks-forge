import { validateReadOnlySql } from "@/lib/assistant/sql-proposer";

export interface AssistantEvalInput {
  question: string;
  answer: string;
  sourceCount: number;
  retrievalTopScore: number | null;
  sqlBlocks: string[];
}

export interface AssistantEvalResult {
  groundingScore: number; // 0-100
  citationScore: number; // 0-100
  actionSafetyScore: number; // 0-100
  confidenceScore: number; // 0-100
  overallScore: number; // 0-100
  findings: string[];
}

function clampScore(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function hasCitationMarkers(answer: string): boolean {
  return /\[\d+\]/.test(answer);
}

function scoreActionSafety(sqlBlocks: string[], findings: string[]): number {
  if (sqlBlocks.length === 0) return 100;

  let valid = 0;
  for (const sql of sqlBlocks) {
    const err = validateReadOnlySql(sql);
    if (!err) valid++;
    else findings.push(`Unsafe SQL proposal detected: ${err}`);
  }
  return clampScore((valid / sqlBlocks.length) * 100);
}

export function scoreAssistantResponse(input: AssistantEvalInput): AssistantEvalResult {
  const findings: string[] = [];
  const citationPresent = hasCitationMarkers(input.answer);
  const citationScore = citationPresent ? 100 : 0;

  if (input.sourceCount > 0 && !citationPresent) {
    findings.push("Answer has sources but no citation markers.");
  }

  let groundingScore = 100;
  if (input.sourceCount === 0) {
    groundingScore = 30;
    findings.push("No sources were attached to the answer.");
  } else if ((input.retrievalTopScore ?? 0) < 0.5) {
    groundingScore = 60;
    findings.push("Top retrieval score is below 0.5; grounding confidence is limited.");
  }

  const confidenceScore = input.retrievalTopScore == null
    ? 30
    : clampScore(input.retrievalTopScore * 100);
  if (input.retrievalTopScore == null) {
    findings.push("No retrieval score available for confidence estimation.");
  }

  const actionSafetyScore = scoreActionSafety(input.sqlBlocks, findings);
  const overallScore = clampScore(
    citationScore * 0.2 +
    groundingScore * 0.35 +
    actionSafetyScore * 0.3 +
    confidenceScore * 0.15,
  );

  return {
    groundingScore,
    citationScore,
    actionSafetyScore,
    confidenceScore,
    overallScore,
    findings,
  };
}
