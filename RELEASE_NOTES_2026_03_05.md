# Release Notes -- 2026-03-05

**Databricks Forge AI v0.6.1**

---

## Improvements

### Shared SQL Column Validation Module
Extracted a new shared validation module (`lib/validation/sql-columns.ts`) that centralises all SQL column-reference checking across the application. Previously, each consumer (pipeline SQL generation, Genie schema-allowlist, dashboard engine, Ask Forge assistant) implemented its own alias detection and column validation regex -- leading to inconsistent coverage and missed edge cases. The shared module provides:
- **`extractSqlAliases`** -- detects table aliases, column aliases (including backtick-quoted aliases like `` AS `Age Group` ``), and CTE names.
- **`extractColumnReferences`** -- extracts all `alias.column` patterns, both plain identifiers and backtick-quoted (e.g. `` s.`Total Count` ``).
- **`validateColumnReferences`** -- validates extracted references against a known-columns set, filtering out SQL keywords, FQN parts, CTE/alias names, and AI function return fields.
- **`stripSqlComments`** -- removes `--` line comments and `/* */` block comments before extraction to prevent false positives from prose text.

### Dashboard Adhoc Engine SQL Validation
The adhoc dashboard engine (`lib/dashboard/adhoc-engine.ts`) now validates LLM-generated dataset SQL against the schema allowlist before assembling dashboards. Datasets with hallucinated column references are dropped with a warning rather than producing broken dashboards.

### Ask Forge Static Column Pre-Check
The Ask Forge assistant engine (`lib/assistant/engine.ts`) now performs a static column-reference check before the `EXPLAIN` dry-run round-trip. Hallucinated columns are caught immediately and sent to the LLM fix cycle with an explicit schema violation message, reducing latency compared to waiting for SQL execution errors.

### SQL Fix Prompt Hardened
The `USE_CASE_SQL_FIX_PROMPT` in `lib/ai/templates.ts` now includes `DATABRICKS_SQL_RULES` and clarifies that removing references to non-existent columns is a valid fix -- preventing the LLM from substituting guessed alternatives during repair cycles.

### Schema Markdown Column Cap Removed
`buildSchemaMarkdown` in `lib/queries/metadata.ts` no longer caps columns at 40 per table. All columns are now injected into LLM prompts, eliminating a source of hallucinated column names when tables had more than 40 columns.

### SQL Engine Documentation
Added comprehensive `docs/SQL_ENGINE.md` covering metadata sourcing, schema injection, the validation pipeline, fix cycles, prompt architecture, and how to wire new consumers into the SQL engine.

---

## Bug Fixes

- **Backtick-quoted CTE aliases invisible to validator** -- `extractSqlAliases` now detects `` AS `Age Group` `` style aliases by running a dedicated regex on the original SQL before backtick stripping. Previously, CTE-computed columns with spaces (e.g. `s.`Age Group``, `s.`Avg Complaints Per Client``) were incorrectly flagged as hallucinated columns, causing valid dashboard datasets to be dropped.
- **SQL comments cause false-positive column flags** -- `extractColumnReferences` now strips `--` line comments and `/* */` block comments before scanning for `alias.column` patterns. Previously, prose in comments like `-- e.g. some example` was matched as prefix=`e`, column=`g`, producing spurious unknown-column warnings.
- **AI function return fields flagged as hallucinations** -- `ai_query()` struct fields (`result`, `errorMessage`) are now allowlisted via `AI_FUNCTION_RETURN_FIELDS` across all validation surfaces, not just the pipeline SQL step.
- **Genie schema-allowlist duplicated validation logic** -- `findInvalidIdentifiers` now delegates 2-part `alias.column` checking to the shared validation module, eliminating divergent regex patterns.

---

## Other Changes

- Added 29 unit tests for the shared SQL column validation module (`__tests__/validation/sql-columns.test.ts`) covering alias extraction, comment stripping, backtick-quoted references, AI function fields, and the exact dashboard scenario from production logs.
- Refactored pipeline `validateSqlOutput` to delegate column checking to the shared module, removing ~70 lines of inline validation logic.

---

## Commits (1)

| Hash | Summary |
|------|---------|
| `4121414` | Enhance SQL validation and error handling across components |

**Uncommitted changes:** Backtick-quoted alias detection and SQL comment stripping in `lib/validation/sql-columns.ts`; new test file `__tests__/validation/sql-columns.test.ts` (29 tests); version bump to 0.6.1 in `package.json`.
