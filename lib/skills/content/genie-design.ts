/**
 * Genie Space Design skill.
 *
 * Distilled from databricks-genie skill:
 *   - spaces.md (creation workflow, table selection, descriptions, sample questions)
 *   - SKILL.md (best practices, common issues)
 *
 * Provides knowledge for Genie instruction generation, benchmark creation,
 * and general Genie space quality.
 */

import type { SkillDefinition } from "../types";
import { registerSkill } from "../registry";

const TABLE_SELECTION_RULES = `Genie Table Selection Rules:
- Use Silver or Gold layer tables; avoid Bronze (raw data has quality issues that confuse Genie)
- Include related tables together (e.g. customers + orders + products) for join coverage
- Use tables with descriptive column names (customer_lifetime_value not clv)
- Ensure tables have COMMENT metadata on both tables and key columns
- Define PRIMARY KEY and FOREIGN KEY constraints for relationship discovery
- Include proper DATE/TIMESTAMP columns for time-based queries
- Prefer tables with low null rates on important columns`;

const DESCRIPTION_PATTERNS = `Genie Space Description Patterns:
- Explain table relationships and join logic (e.g. "Tables join on customer_id and product_id")
- List key columns by role: date columns for time filters, metric columns for aggregation, dimension columns for grouping, FK columns for joins
- Describe the business context and data time range (e.g. "Last 6 months of e-commerce transactions")
- Include the grain of each table (e.g. "One row per order line item")
- Mention any important filters or caveats (e.g. "Only active customers, excludes test accounts")`;

const SAMPLE_QUESTION_PATTERNS = `Genie Sample Question Best Practices:
- Reference actual column names from the schema (helps Genie learn the data vocabulary)
- Cover the most common analytical use cases the space supports
- Use natural language, not SQL terms (say "top 10 customers by revenue" not "SELECT ... ORDER BY ... LIMIT 10")
- Include time-based questions ("last month", "Q4", "year over year")
- Include comparison questions ("by region", "by segment", "by category")
- Include top-N questions ("top 10", "bottom 5", "highest", "lowest")
- Include aggregation questions ("total", "average", "count of distinct")`;

const INSTRUCTION_BEST_PRACTICES = `Genie Instruction Best Practices:
- Keep instructions analyst-facing and operational (not technical SQL lessons)
- Focus on business entities, key dimensions, and recommended time windows
- Include ambiguity handling guidance (e.g. "When users say 'revenue', use the total_amount column")
- Mention the fiscal calendar if relevant (fiscal year start month, YTD interpretation)
- Avoid dataset marketing language, product pitch text, or generic platform instructions
- Avoid SQL syntax lessons in text instructions (teach SQL via example queries and knowledge store expressions instead)
- Keep total instruction text under 3000 characters for optimal Genie performance`;

const skill: SkillDefinition = {
  id: "genie-design",
  name: "Genie Space Design Patterns",
  description:
    "Table selection, description writing, sample question design, and " +
    "instruction best practices for creating high-quality Databricks Genie Spaces.",
  relevance: {
    intents: ["business"],
    geniePasses: ["instructions", "benchmarks", "columnIntelligence"],
  },
  chunks: [
    {
      id: "genie-table-selection",
      title: "Table Selection Rules",
      content: TABLE_SELECTION_RULES,
      category: "rules",
    },
    {
      id: "genie-descriptions",
      title: "Description Patterns",
      content: DESCRIPTION_PATTERNS,
      category: "patterns",
    },
    {
      id: "genie-sample-questions",
      title: "Sample Question Patterns",
      content: SAMPLE_QUESTION_PATTERNS,
      category: "patterns",
    },
    {
      id: "genie-instruction-practices",
      title: "Instruction Best Practices",
      content: INSTRUCTION_BEST_PRACTICES,
      category: "rules",
    },
  ],
};

registerSkill(skill);

export default skill;
