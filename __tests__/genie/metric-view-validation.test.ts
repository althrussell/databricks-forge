import { describe, it, expect } from "vitest";
import {
  stripFqnPrefixes,
  nestSnowflakeJoins,
  detectFlatSnowflakeJoins,
  validateColumnReferences,
  validateMetricViewYaml,
} from "@/lib/genie/passes/metric-view-proposals";
import type { SchemaAllowlist } from "@/lib/genie/schema-allowlist";

function makeAllowlist(tables: Record<string, string[]>): SchemaAllowlist {
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
    expect(stripFqnPrefixes("SUM(retail.demo.loans.`Origination Quarter`)")).toBe(
      "SUM(`Origination Quarter`)",
    );
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
      "Total Complaints",
      "Unique Complainants",
      "Timely Response Count",
      "District",
      "Product",
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

// ---------------------------------------------------------------------------
// nestSnowflakeJoins
// ---------------------------------------------------------------------------

describe("nestSnowflakeJoins", () => {
  it("restructures flat snowflake joins into nested joins", () => {
    const yaml = `version: 1.1
source: catalog.schema.fact_orders
joins:
  - name: member
    source: catalog.schema.dim_member
    on: source.member_id = member.member_id
  - name: location
    source: catalog.schema.dim_location
    on: member.location_id = location.location_id
  - name: segment
    source: catalog.schema.dim_segment
    on: member.segment_id = segment.segment_id
dimensions:
  - name: state
    expr: location.state
`;
    const result = nestSnowflakeJoins(yaml);

    // location and segment should be nested under member
    expect(result).toContain("- name: member");
    expect(result).toContain("    joins:");
    expect(result).toContain("      - name: location");
    expect(result).toContain("      - name: segment");
    // location and segment should NOT appear at the same indent as member
    // Extract the joins block and check only top-level join items in it
    const joinsSection = result.split("joins:")[1].split("dimensions:")[0];
    const topJoinNames = [...joinsSection.matchAll(/^  - name: (\w+)/gm)].map((m) => m[1]);
    expect(topJoinNames).toEqual(["member"]);
  });

  it("preserves star schema joins (no nesting needed)", () => {
    const yaml = `version: 1.1
source: catalog.schema.fact_orders
joins:
  - name: customer
    source: catalog.schema.dim_customer
    on: source.customer_id = customer.customer_id
  - name: product
    source: catalog.schema.dim_product
    on: source.product_id = product.product_id
dimensions:
  - name: cust_name
    expr: customer.name
`;
    const result = nestSnowflakeJoins(yaml);

    // Both joins should remain at top level
    expect(result).toContain("- name: customer");
    expect(result).toContain("- name: product");
    // No nested joins: block should be added
    expect(result).not.toMatch(/^\s+joins:\s*$/m);
  });

  it("handles multi-level nesting (fact -> A -> B -> C)", () => {
    const yaml = `version: 1.1
source: catalog.schema.fact
joins:
  - name: dim_a
    source: catalog.schema.dim_a
    on: source.a_id = dim_a.id
  - name: dim_b
    source: catalog.schema.dim_b
    on: dim_a.b_id = dim_b.id
  - name: dim_c
    source: catalog.schema.dim_c
    on: dim_b.c_id = dim_c.id
dimensions:
  - name: col
    expr: dim_c.col
`;
    const result = nestSnowflakeJoins(yaml);

    // dim_b should be under dim_a, dim_c should be under dim_b
    expect(result).toContain("- name: dim_a");
    expect(result).toContain("      - name: dim_b");
    expect(result).toContain("          - name: dim_c");
  });

  it("returns input unchanged when no joins block exists", () => {
    const yaml = `version: 1.1
source: catalog.schema.fact
dimensions:
  - name: col
    expr: col
measures:
  - name: cnt
    expr: COUNT(1)
`;
    expect(nestSnowflakeJoins(yaml)).toBe(yaml);
  });

  it("returns input unchanged for a single join", () => {
    const yaml = `version: 1.1
source: catalog.schema.fact
joins:
  - name: dim
    source: catalog.schema.dim
    on: source.dim_id = dim.id
dimensions:
  - name: col
    expr: dim.col
`;
    expect(nestSnowflakeJoins(yaml)).toBe(yaml);
  });

  it("preserves already-nested joins without producing duplicate joins: keys", () => {
    const yaml = `version: 1.1
source: catalog.schema.fact_accounts
joins:
  - name: account_type
    source: catalog.schema.dim_account_type
    on: source.type_id = account_type.type_id
    joins:
      - name: fee_schedule
        source: catalog.schema.dim_fee_schedule
        on: account_type.schedule_id = fee_schedule.schedule_id
dimensions:
  - name: type_name
    expr: account_type.name
`;
    const result = nestSnowflakeJoins(yaml);

    // Should not contain duplicate joins: keys (the bug produced two adjacent joins: lines)
    expect(result).not.toMatch(/joins:\s*\n\s*joins:/);
    // fee_schedule should still be nested under account_type
    expect(result).toContain("- name: fee_schedule");
    expect(result).toContain("- name: account_type");
  });

  it("completes partially-nested joins without duplicating existing joins: key", () => {
    const yaml = `version: 1.1
source: catalog.schema.fact_orders
joins:
  - name: member
    source: catalog.schema.dim_member
    on: source.member_id = member.member_id
    joins:
      - name: location
        source: catalog.schema.dim_location
        on: member.location_id = location.location_id
  - name: segment
    source: catalog.schema.dim_segment
    on: member.segment_id = segment.segment_id
dimensions:
  - name: state
    expr: location.state
`;
    const result = nestSnowflakeJoins(yaml);

    // segment should be nested under member alongside location
    expect(result).not.toMatch(/joins:\s*\n\s*joins:/);
    expect(result).toContain("- name: member");
    expect(result).toContain("- name: location");
    expect(result).toContain("- name: segment");
    // Only member should be a top-level join
    const joinsSection = result.split("joins:")[1].split("dimensions:")[0];
    const topJoinNames = [...joinsSection.matchAll(/^  - name: (\w+)/gm)].map((m) => m[1]);
    expect(topJoinNames).toEqual(["member"]);
  });
});

// ---------------------------------------------------------------------------
// detectFlatSnowflakeJoins
// ---------------------------------------------------------------------------

describe("detectFlatSnowflakeJoins", () => {
  it("flags flat joins referencing sibling aliases", () => {
    const yaml = `
version: 1.1
source: catalog.schema.fact
joins:
  - name: member
    source: catalog.schema.dim_member
    on: source.member_id = member.member_id
  - name: location
    source: catalog.schema.dim_location
    on: member.location_id = location.location_id
`;
    const issues = detectFlatSnowflakeJoins(yaml);
    expect(issues.length).toBe(1);
    expect(issues[0]).toContain("location");
    expect(issues[0]).toContain("member");
    expect(issues[0]).toContain("nested");
  });

  it("passes star schema joins (all reference source)", () => {
    const yaml = `
version: 1.1
source: catalog.schema.fact
joins:
  - name: customer
    source: catalog.schema.dim_customer
    on: source.customer_id = customer.customer_id
  - name: product
    source: catalog.schema.dim_product
    on: source.product_id = product.product_id
`;
    const issues = detectFlatSnowflakeJoins(yaml);
    expect(issues).toEqual([]);
  });

  it("passes when no joins block exists", () => {
    const yaml = `
version: 1.1
source: catalog.schema.fact
dimensions:
  - name: col
    expr: col
`;
    const issues = detectFlatSnowflakeJoins(yaml);
    expect(issues).toEqual([]);
  });
});
