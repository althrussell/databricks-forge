/**
 * Auto-generated from default-checks.yaml.
 * Keep in sync: when you edit the YAML, update this constant.
 *
 * Embedded as a string so the registry works in bundled environments
 * (Next.js production, Databricks Apps) where __dirname / readFileSync
 * cannot resolve the source-tree YAML file.
 */

export const DEFAULT_CHECKS_YAML = `
# Genie Space Health Check -- Default Check Definitions
#
# Each check is evaluated deterministically against a SerializedSpace v2 JSON.
# Users can override thresholds, disable checks, or add custom checks via settings.

categories:
  data_sources:
    label: "Data Sources"
    weight: 25
  instructions:
    label: "Instructions"
    weight: 25
  semantic_richness:
    label: "Semantic Richness"
    weight: 25
  quality_assurance:
    label: "Quality Assurance"
    weight: 25

checks:
  # ---------------------------------------------------------------------------
  # Data Sources
  # ---------------------------------------------------------------------------
  - id: tables-configured
    category: data_sources
    description: "At least one table is configured"
    severity: critical
    fixable: false
    evaluator: count
    path: "data_sources.tables"
    params:
      min: 1
    quick_win: "Add at least one table to the space."

  - id: table-count-range
    category: data_sources
    description: "Table count is within recommended range (1-30)"
    severity: warning
    fixable: false
    evaluator: range
    path: "data_sources.tables"
    params:
      min: 1
      max: 30
      warn_above: 15

  - id: tables-have-descriptions
    category: data_sources
    description: "Tables have descriptions defined"
    severity: warning
    fixable: true
    fix_strategy: column_intelligence
    evaluator: ratio
    path: "data_sources.tables"
    field: "description"
    params:
      min_ratio: 0.8

  - id: columns-have-descriptions
    category: data_sources
    description: "Columns have descriptions across all tables"
    severity: warning
    fixable: true
    fix_strategy: column_intelligence
    evaluator: nested_ratio
    path: "data_sources.tables[*].column_configs"
    field: "description"
    params:
      min_ratio: 0.5

  - id: entity-matching-configured
    category: data_sources
    description: "Filterable columns have entity matching enabled"
    severity: info
    fixable: true
    fix_strategy: entity_matching
    evaluator: nested_ratio
    path: "data_sources.tables[*].column_configs"
    field: "enable_entity_matching"
    params:
      min_ratio: 0.2

  # ---------------------------------------------------------------------------
  # Instructions
  # ---------------------------------------------------------------------------
  - id: text-instruction-exists
    category: instructions
    description: "Text instruction is configured"
    severity: warning
    fixable: true
    fix_strategy: instruction_generation
    evaluator: count
    path: "instructions.text_instructions"
    params:
      min: 1
      max: 1

  - id: example-sqls-minimum
    category: instructions
    description: "At least 5 example question-SQL pairs exist"
    severity: critical
    fixable: true
    fix_strategy: trusted_assets
    evaluator: count
    path: "instructions.example_question_sqls"
    params:
      min: 5
    quick_win: "Add example SQL pairs covering your most common business questions."

  - id: join-specs-for-multi-table
    category: instructions
    description: "Join specifications defined for multi-table spaces"
    severity: critical
    fixable: true
    fix_strategy: join_inference
    evaluator: conditional_count
    condition_path: "data_sources.tables"
    condition_min: 2
    path: "instructions.join_specs"
    params:
      min: 1
    quick_win: "Add join specs so Genie knows how to combine your tables."

  - id: measures-defined
    category: instructions
    description: "SQL snippet measures are defined"
    severity: warning
    fixable: true
    fix_strategy: semantic_expressions
    evaluator: count
    path: "instructions.sql_snippets.measures"
    params:
      min: 1

  - id: filters-defined
    category: instructions
    description: "SQL snippet filters are defined"
    severity: warning
    fixable: true
    fix_strategy: semantic_expressions
    evaluator: count
    path: "instructions.sql_snippets.filters"
    params:
      min: 1

  # ---------------------------------------------------------------------------
  # Semantic Richness
  # ---------------------------------------------------------------------------
  - id: column-synonyms-defined
    category: semantic_richness
    description: "Key columns have synonyms defined"
    severity: info
    fixable: true
    fix_strategy: column_intelligence
    evaluator: nested_ratio
    path: "data_sources.tables[*].column_configs"
    field: "synonyms"
    params:
      min_ratio: 0.3

  - id: measures-have-display-names
    category: semantic_richness
    description: "Measures have display names"
    severity: info
    fixable: false
    evaluator: ratio
    path: "instructions.sql_snippets.measures"
    field: "display_name"
    params:
      min_ratio: 0.8

  - id: filters-have-synonyms
    category: semantic_richness
    description: "Filters have synonyms for user terminology"
    severity: info
    fixable: false
    evaluator: ratio
    path: "instructions.sql_snippets.filters"
    field: "synonyms"
    params:
      min_ratio: 0.5

  - id: expressions-defined
    category: semantic_richness
    description: "Reusable expressions are defined"
    severity: info
    fixable: true
    fix_strategy: semantic_expressions
    evaluator: count
    path: "instructions.sql_snippets.expressions"
    params:
      min: 1

  # ---------------------------------------------------------------------------
  # Quality Assurance
  # ---------------------------------------------------------------------------
  - id: benchmarks-exist
    category: quality_assurance
    description: "Benchmark questions exist (5+ recommended, 10+ strong)"
    severity: warning
    fixable: true
    fix_strategy: benchmark_generation
    evaluator: count
    path: "benchmarks.questions"
    params:
      min: 5
    quick_win: "Add benchmark questions to measure and track Genie accuracy."

  - id: sample-questions-defined
    category: quality_assurance
    description: "Sample questions are defined for the chat UI"
    severity: info
    fixable: true
    fix_strategy: sample_questions
    evaluator: count
    path: "config.sample_questions"
    params:
      min: 2

  - id: valid-ids
    category: quality_assurance
    description: "All IDs are valid 32-character hex strings"
    severity: critical
    fixable: false
    evaluator: pattern
    path: "__all_ids__"
    params:
      regex: "^[a-f0-9]{32}$"

  - id: no-empty-sql
    category: quality_assurance
    description: "No empty SQL fields in snippets"
    severity: critical
    fixable: false
    evaluator: no_empty_field
    paths:
      - "instructions.sql_snippets.measures[*].sql"
      - "instructions.sql_snippets.filters[*].sql"
      - "instructions.sql_snippets.expressions[*].sql"

  - id: unique-ids
    category: quality_assurance
    description: "All IDs within the space are unique"
    severity: critical
    fixable: false
    evaluator: unique
    path: "__all_ids__"
`;
