import { describe, it, expect } from "vitest";
import { scoreAssistantResponse } from "@/lib/assistant/evaluation";

describe("Ask Forge evaluation framework", () => {
  it("scores grounded and cited responses highly", () => {
    const result = scoreAssistantResponse({
      question: "Which finance tables have stale writes?",
      answer: "The most stale tables are `main.finance.ar_ledger` and `main.finance.ap_invoice` [1].",
      sourceCount: 3,
      retrievalTopScore: 0.82,
      sqlBlocks: [
        "SELECT table_fqn, last_write_timestamp FROM main.ops.table_health WHERE domain = 'finance';",
      ],
    });

    expect(result.overallScore).toBeGreaterThan(80);
    expect(result.findings).toHaveLength(0);
  });

  it("flags missing citations and low retrieval confidence", () => {
    const result = scoreAssistantResponse({
      question: "What should we optimize next?",
      answer: "You should optimize several large tables this week.",
      sourceCount: 2,
      retrievalTopScore: 0.41,
      sqlBlocks: [],
    });

    expect(result.citationScore).toBe(0);
    expect(result.groundingScore).toBe(60);
    expect(result.findings.some((f) => f.includes("no citation markers"))).toBe(true);
  });

  it("penalizes unsafe SQL actions", () => {
    const result = scoreAssistantResponse({
      question: "Can you clean up old data?",
      answer: "Use this maintenance statement [1].",
      sourceCount: 1,
      retrievalTopScore: 0.7,
      sqlBlocks: ["DELETE FROM main.sales.orders WHERE order_date < date_sub(current_date(), 365);"],
    });

    expect(result.actionSafetyScore).toBe(0);
    expect(result.findings.some((f) => f.includes("Unsafe SQL proposal"))).toBe(true);
  });
});
