import { describe, it, expect } from "vitest";
import {
  TABLE_COMMENT_PROMPT,
  COLUMN_COMMENT_PROMPT,
} from "@/lib/ai/templates-comments";

describe("TABLE_COMMENT_PROMPT", () => {
  it("contains all required placeholders", () => {
    expect(TABLE_COMMENT_PROMPT).toContain("{industry_context}");
    expect(TABLE_COMMENT_PROMPT).toContain("{business_context}");
    expect(TABLE_COMMENT_PROMPT).toContain("{table_list}");
    expect(TABLE_COMMENT_PROMPT).toContain("{lineage_context}");
  });

  it("specifies JSON output format", () => {
    expect(TABLE_COMMENT_PROMPT).toContain("JSON array");
    expect(TABLE_COMMENT_PROMPT).toContain("table_fqn");
    expect(TABLE_COMMENT_PROMPT).toContain("description");
  });

  it("includes length guidance", () => {
    expect(TABLE_COMMENT_PROMPT).toMatch(/80.*150|characters/i);
  });

  it("instructs not to repeat table name", () => {
    expect(TABLE_COMMENT_PROMPT).toMatch(/not.*repeat.*table name/i);
  });

  it("all placeholders are replaceable without residual placeholder patterns", () => {
    const replaced = TABLE_COMMENT_PROMPT
      .replace("{industry_context}", "Banking industry")
      .replace("{business_context}", "Retail banking focus")
      .replace("{table_list}", "- cat.sch.tbl: [col1 (STRING)]")
      .replace("{lineage_context}", "");

    // No remaining {placeholder} patterns (JSON braces like {"key": "val"} are fine)
    expect(replaced).not.toMatch(/\{[a-z_]+\}/);
  });
});

describe("COLUMN_COMMENT_PROMPT", () => {
  it("contains all required placeholders", () => {
    expect(COLUMN_COMMENT_PROMPT).toContain("{industry_context}");
    expect(COLUMN_COMMENT_PROMPT).toContain("{table_fqn}");
    expect(COLUMN_COMMENT_PROMPT).toContain("{table_description}");
    expect(COLUMN_COMMENT_PROMPT).toContain("{column_list}");
  });

  it("specifies JSON output format", () => {
    expect(COLUMN_COMMENT_PROMPT).toContain("JSON array");
    expect(COLUMN_COMMENT_PROMPT).toContain("column_name");
    expect(COLUMN_COMMENT_PROMPT).toContain("description");
  });

  it("includes length guidance for columns", () => {
    expect(COLUMN_COMMENT_PROMPT).toMatch(/40.*120|characters/i);
  });

  it("mentions null return for good existing comments", () => {
    expect(COLUMN_COMMENT_PROMPT).toMatch(/null.*description|return null/i);
  });

  it("all placeholders are replaceable without residual placeholder patterns", () => {
    const replaced = COLUMN_COMMENT_PROMPT
      .replace("{industry_context}", "Banking")
      .replace("{table_fqn}", "cat.sch.tbl")
      .replace("{table_description}", "Customer transactions")
      .replace("{column_list}", "- customer_id: STRING\n- amount: DOUBLE");

    expect(replaced).not.toMatch(/\{[a-z_]+\}/);
  });
});
