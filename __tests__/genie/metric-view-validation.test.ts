import { describe, it, expect } from "vitest";
import {
  stripFqnPrefixes,
  validateColumnReferences,
  validateMetricViewYaml,
} from "@/lib/genie/passes/metric-view-proposals";
import type { SchemaAllowlist } from "@/lib/genie/schema-allowlist";

function makeAllowlist(
  tables: Record<string, string[]>,
): SchemaAllowlist {
  const tableSet = new Set<string>();
  const columns = new Map<string, Set<string>>();
  const columnTypes = new Map<string, string>();

  for (const [fqn, cols] of Object.entries(tables)) {
    const key = fqn.toLowerCase();
    tableSet.add(key);
    columns.set(key, new Set(cols.map((c) => c.toLowerCase())));
    for (const c of cols) {
      columnTypes.set(`${key}.${c.toLowerCase()}`, "string");
    }
  }

  return { tables: tableSet, columns, columnTypes, metricViews: new Set() };
}

// ---------------------------------------------------------------------------
// stripFqnPrefixes
// ---------------------------------------------------------------------------

describe("stripFqnPrefixes", () => {
  it("strips unquoted 4-part FQN", () => {
    expect(stripFqnPrefixes("SUM(retail.demo.loans.amount)")).toBe("SUM(amount)");
  });

  it("strips backtick-quoted 4-part FQN", () => {
    expect(
      stripFqnPrefixes("SUM(retail.demo.loans.`Origination Quarter`)")
    ).toBe("SUM(`Origination Quarter`)");
  });

  it("strips multiple FQN refs in one expression", () => {
    const sql = "retail.demo.loans.`Total Amount` / retail.demo.loans.count";
    expect(stripFqnPrefixes(sql)).toBe("`Total Amount` / count");
  });

  it("leaves bare column names untouched", () => {
    expect(stripFqnPrefixes("SUM(amount)")).toBe("SUM(amount)");
    expect(stripFqnPrefixes("SUM(`Total Amount`)")).toBe("SUM(`Total Amount`)");
  });
});

// ---------------------------------------------------------------------------
// validateColumnReferences
// ---------------------------------------------------------------------------

describe("validateColumnReferences", () => {
  const allowlist = makeAllowlist({
    "retail.demo.complaints": ["District", "Total Complaints", "Product", "Submitted Via"],
    "retail.demo.loans": ["District", "Loan Status", "Origination Quarter", "amount"],
  });

  it("passes valid unquoted column references", () => {
    const yaml = `
version: 1.1
source: retail.demo.complaints
dimensions:
  - name: District
    expr: source.District
measures:
  - name: Total
    expr: SUM(source.Product)
`;
    const issues = validateColumnReferences(yaml, allowlist);
    expect(issues).toEqual([]);
  });

  it("passes valid backtick-quoted column references", () => {
    const yaml = `
version: 1.1
source: retail.demo.complaints
dimensions:
  - name: Submission Channel
    expr: source.\`Submitted Via\`
measures:
  - name: Complaint Volume
    expr: SUM(CAST(source.\`Total Complaints\` AS BIGINT))
`;
    const issues = validateColumnReferences(yaml, allowlist);
    expect(issues).toEqual([]);
  });

  it("flags hallucinated backtick-quoted column", () => {
    const yaml = `
version: 1.1
source: retail.demo.complaints
measures:
  - name: Defaulted Count
    expr: SUM(source.\`Defaulted Loans\`)
`;
    const issues = validateColumnReferences(yaml, allowlist);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("Defaulted Loans");
    expect(issues[0]).toContain("not found in table");
  });

  it("validates backtick-quoted columns across joins", () => {
    const yaml = `
version: 1.1
source: retail.demo.complaints
joins:
  - name: lending
    source: retail.demo.loans
    on: source.\`District\` = lending.\`District\`
dimensions:
  - name: Loan Status
    expr: lending.\`Loan Status\`
measures:
  - name: Amount
    expr: SUM(lending.amount)
`;
    const issues = validateColumnReferences(yaml, allowlist);
    expect(issues).toEqual([]);
  });

  it("flags hallucinated column in joined table", () => {
    const yaml = `
version: 1.1
source: retail.demo.complaints
joins:
  - name: lending
    source: retail.demo.loans
    on: source.\`District\` = lending.\`District\`
measures:
  - name: Defaulted
    expr: SUM(lending.\`Defaulted Loan Count\`)
`;
    const issues = validateColumnReferences(yaml, allowlist);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues[0]).toContain("Defaulted Loan Count");
  });
});

// ---------------------------------------------------------------------------
// validateMetricViewYaml — measure name shadows column
// ---------------------------------------------------------------------------

describe("validateMetricViewYaml — measure shadowing", () => {
  const allowlist = makeAllowlist({
    "retail.demo.quality": [
      "Total Complaints", "Unique Complainants", "Timely Response Count",
      "District", "Product",
    ],
  });

  it("flags measure names identical to source column names", () => {
    const yaml = `
version: 1.1
source: retail.demo.quality
dimensions:
  - name: District
    expr: District
measures:
  - name: Total Complaints
    expr: SUM(CAST(\`Total Complaints\` AS BIGINT))
  - name: Unique Complainants
    expr: SUM(CAST(\`Unique Complainants\` AS BIGINT))
`;
    const ddl = `CREATE OR REPLACE VIEW retail.demo.mv WITH METRICS LANGUAGE YAML AS $$\n${yaml}\n$$`;
    const result = validateMetricViewYaml(yaml, ddl, allowlist);

    expect(result.status).toBe("error");
    expect(result.issues.some((i) => i.includes("shadows source column"))).toBe(true);
    const shadowIssues = result.issues.filter((i) => i.includes("shadows source column"));
    expect(shadowIssues.length).toBe(2);
  });

  it("passes when measure names differ from column names", () => {
    const yaml = `
version: 1.1
source: retail.demo.quality
dimensions:
  - name: District
    expr: District
measures:
  - name: Total Complaints Sum
    expr: SUM(CAST(\`Total Complaints\` AS BIGINT))
  - name: Complainant Count
    expr: SUM(CAST(\`Unique Complainants\` AS BIGINT))
`;
    const ddl = `CREATE OR REPLACE VIEW retail.demo.mv WITH METRICS LANGUAGE YAML AS $$\n${yaml}\n$$`;
    const result = validateMetricViewYaml(yaml, ddl, allowlist);

    const shadowIssues = result.issues.filter((i) => i.includes("shadows source column"));
    expect(shadowIssues).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// validateMetricViewYaml — nested aggregate detection
// ---------------------------------------------------------------------------

describe("validateMetricViewYaml — nested aggregates", () => {
  const allowlist = makeAllowlist({
    "retail.demo.orders": ["amount", "customer_id", "status"],
  });

  it("flags nested aggregate functions", () => {
    const yaml = `
version: 1.1
source: retail.demo.orders
dimensions:
  - name: Status
    expr: status
measures:
  - name: Avg Order Count
    expr: AVG(COUNT(customer_id))
`;
    const ddl = `CREATE OR REPLACE VIEW retail.demo.mv WITH METRICS LANGUAGE YAML AS $$\n${yaml}\n$$`;
    const result = validateMetricViewYaml(yaml, ddl, allowlist);

    expect(result.status).toBe("error");
    expect(result.issues.some((i) => i.includes("Nested aggregate"))).toBe(true);
  });

  it("passes ratio measures (not nested)", () => {
    const yaml = `
version: 1.1
source: retail.demo.orders
dimensions:
  - name: Status
    expr: status
measures:
  - name: Revenue Per Customer
    expr: SUM(amount) / COUNT(DISTINCT customer_id)
`;
    const ddl = `CREATE OR REPLACE VIEW retail.demo.mv WITH METRICS LANGUAGE YAML AS $$\n${yaml}\n$$`;
    const result = validateMetricViewYaml(yaml, ddl, allowlist);

    const nestedIssues = result.issues.filter((i) => i.includes("Nested aggregate"));
    expect(nestedIssues).toEqual([]);
  });

  it("passes FILTER clause measures (not nested)", () => {
    const yaml = `
version: 1.1
source: retail.demo.orders
dimensions:
  - name: Status
    expr: status
measures:
  - name: Open Amount
    expr: SUM(amount) FILTER (WHERE status = 'OPEN')
`;
    const ddl = `CREATE OR REPLACE VIEW retail.demo.mv WITH METRICS LANGUAGE YAML AS $$\n${yaml}\n$$`;
    const result = validateMetricViewYaml(yaml, ddl, allowlist);

    const nestedIssues = result.issues.filter((i) => i.includes("Nested aggregate"));
    expect(nestedIssues).toEqual([]);
  });
});
