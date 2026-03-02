import { describe, expect, it } from "vitest";
import { buildDeterministicExampleQueries } from "@/lib/genie/passes/example-query-generation";
import { buildSchemaAllowlist } from "@/lib/genie/schema-allowlist";
import type { MetadataSnapshot } from "@/lib/domain/types";

const metadata: MetadataSnapshot = {
  cacheKey: "test",
  ucPath: "samples.bakehouse",
  tables: [
    {
      fqn: "samples.bakehouse.sales_customers",
      catalog: "samples",
      schema: "bakehouse",
      tableName: "sales_customers",
      tableType: "MANAGED",
      comment: null,
    },
    {
      fqn: "samples.bakehouse.sales_transactions",
      catalog: "samples",
      schema: "bakehouse",
      tableName: "sales_transactions",
      tableType: "MANAGED",
      comment: null,
    },
  ],
  columns: [
    {
      tableFqn: "samples.bakehouse.sales_customers",
      columnName: "customer_id",
      dataType: "string",
      ordinalPosition: 1,
      isNullable: false,
      comment: null,
    },
    {
      tableFqn: "samples.bakehouse.sales_customers",
      columnName: "customer_segment",
      dataType: "string",
      ordinalPosition: 2,
      isNullable: true,
      comment: null,
    },
    {
      tableFqn: "samples.bakehouse.sales_transactions",
      columnName: "customer_id",
      dataType: "string",
      ordinalPosition: 1,
      isNullable: false,
      comment: null,
    },
    {
      tableFqn: "samples.bakehouse.sales_transactions",
      columnName: "transaction_date",
      dataType: "date",
      ordinalPosition: 2,
      isNullable: true,
      comment: null,
    },
    {
      tableFqn: "samples.bakehouse.sales_transactions",
      columnName: "sales_amount",
      dataType: "double",
      ordinalPosition: 3,
      isNullable: true,
      comment: null,
    },
  ],
  foreignKeys: [],
  metricViews: [],
  schemaMarkdown: "",
  tableCount: 2,
  columnCount: 5,
  cachedAt: new Date().toISOString(),
  lineageDiscoveredFqns: [],
};

describe("example-query-generation", () => {
  it("builds deterministic example queries with join coverage", () => {
    const allowlist = buildSchemaAllowlist(metadata);
    const queries = buildDeterministicExampleQueries(
      "Customer Insights",
      ["samples.bakehouse.sales_customers", "samples.bakehouse.sales_transactions"],
      metadata,
      allowlist,
      [
        {
          leftTable: "samples.bakehouse.sales_transactions",
          rightTable: "samples.bakehouse.sales_customers",
          sql: "samples.bakehouse.sales_transactions.customer_id = samples.bakehouse.sales_customers.customer_id",
        },
      ],
    );

    expect(queries.length).toBeGreaterThan(0);
    expect(queries.some((q) => q.sql.includes("JOIN"))).toBe(true);
  });
});
