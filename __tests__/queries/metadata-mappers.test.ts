import { describe, it, expect } from "vitest";
import {
  mergeTableComments,
  mergeTableTypes,
  buildSchemaMarkdown,
  buildForeignKeyMarkdown,
} from "@/lib/queries/metadata";
import type { TableInfo, ColumnInfo, ForeignKey } from "@/lib/domain/types";

function makeTable(fqn: string, overrides: Partial<TableInfo> = {}): TableInfo {
  const [catalog, schema, tableName] = fqn.split(".");
  return {
    catalog,
    schema,
    tableName,
    fqn,
    tableType: "TABLE",
    comment: null,
    ...overrides,
  };
}

function makeColumn(tableFqn: string, name: string, type = "string"): ColumnInfo {
  return {
    tableFqn,
    columnName: name,
    dataType: type,
    ordinalPosition: 1,
    isNullable: true,
    comment: null,
  };
}

describe("mergeTableComments", () => {
  it("merges matching comments into table objects", () => {
    const tables = [makeTable("cat.s.t1"), makeTable("cat.s.t2")];
    const comments = new Map([["cat.s.t1", "Orders table"]]);

    mergeTableComments(tables, comments);

    expect(tables[0].comment).toBe("Orders table");
    expect(tables[1].comment).toBeNull();
  });

  it("handles empty comments map", () => {
    const tables = [makeTable("cat.s.t1")];
    mergeTableComments(tables, new Map());
    expect(tables[0].comment).toBeNull();
  });
});

describe("mergeTableTypes", () => {
  it("merges types from a simple Map", () => {
    const tables = [makeTable("cat.s.t1"), makeTable("cat.s.t2")];
    const types = new Map([["cat.s.t1", "VIEW"]]);

    mergeTableTypes(tables, types);

    expect(tables[0].tableType).toBe("VIEW");
    expect(tables[1].tableType).toBe("TABLE");
  });

  it("merges types and formats from object form", () => {
    const tables = [makeTable("cat.s.t1")];
    const result = {
      types: new Map([["cat.s.t1", "MATERIALIZED_VIEW"]]),
      formats: new Map([["cat.s.t1", "DELTA"]]),
    };

    mergeTableTypes(tables, result);

    expect(tables[0].tableType).toBe("MATERIALIZED_VIEW");
    expect(tables[0].dataSourceFormat).toBe("DELTA");
  });
});

describe("buildSchemaMarkdown", () => {
  it("formats tables and columns as markdown", () => {
    const tables = [makeTable("cat.s.orders", { comment: "Sales orders" })];
    const columns = [
      makeColumn("cat.s.orders", "id", "int"),
      makeColumn("cat.s.orders", "amount", "double"),
    ];

    const md = buildSchemaMarkdown(tables, columns);

    expect(md).toContain("### cat.s.orders -- Sales orders");
    expect(md).toContain("- id (int)");
    expect(md).toContain("- amount (double)");
  });

  it("handles tables with no columns", () => {
    const tables = [makeTable("cat.s.empty")];
    const md = buildSchemaMarkdown(tables, []);
    expect(md).toContain("(no columns)");
  });

  it("includes column comments", () => {
    const tables = [makeTable("cat.s.t1")];
    const columns = [
      { ...makeColumn("cat.s.t1", "status", "string"), comment: "Order status code" },
    ];

    const md = buildSchemaMarkdown(tables, columns);
    expect(md).toContain("-- Order status code");
  });

  it("handles multiple tables", () => {
    const tables = [makeTable("cat.s.t1"), makeTable("cat.s.t2")];
    const columns = [
      makeColumn("cat.s.t1", "id", "int"),
      makeColumn("cat.s.t2", "name", "string"),
    ];

    const md = buildSchemaMarkdown(tables, columns);
    expect(md).toContain("### cat.s.t1");
    expect(md).toContain("### cat.s.t2");
  });
});

describe("buildForeignKeyMarkdown", () => {
  it("formats foreign keys as a list", () => {
    const fks: ForeignKey[] = [
      {
        constraintName: "fk_order_customer",
        tableFqn: "cat.s.orders",
        columnName: "customer_id",
        referencedTableFqn: "cat.s.customers",
        referencedColumnName: "id",
      },
    ];

    const md = buildForeignKeyMarkdown(fks);
    expect(md).toContain("cat.s.orders.customer_id -> cat.s.customers.id");
  });

  it("returns fallback for empty list", () => {
    expect(buildForeignKeyMarkdown([])).toBe("No foreign key relationships found.");
  });
});
