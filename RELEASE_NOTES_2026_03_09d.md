# Release Notes -- 2026-03-09

**Databricks Forge AI v0.17.1**

---

## Bug Fixes

- **False-positive hallucination flags on AI use case SQL** -- The column validator was rejecting valid SQL that used `from_json()` struct field access (e.g. `parsed.confidence`, `parsed_result.field`). The validator now recognises column-alias prefixes as struct field access and skips them during validation.

- **String literal content matched as column references** -- Prose inside SQL string literals (e.g. `'...e.g. some example...'` in `CONCAT()` for AI prompts) was being matched by the column reference regex, flagging `e.g` as a hallucinated column. Added `stripStringLiterals()` to the extraction pipeline.

- **Reviewer fixes introducing new hallucinated columns** -- The SQL reviewer fix prompt now includes an explicit column-grounding constraint, preventing the reviewer from inventing or renaming columns when generating fixes.

---

## Improvements

### LATERAL VIEW EXPLODE Deprecation
Added rules across all prompt surfaces (SQL gen, SQL rules, compact rules) warning against `LATERAL VIEW EXPLODE` (deprecated Hive syntax that causes parse errors when combined with JOINs). The prompts now guide the LLM to use `EXPLODE()` inside CTEs with comma-join or `CROSS JOIN LATERAL` syntax instead.

### Canonical `from_json()` Alias Naming
Enforced `ai_result` and `parsed_result` as the mandatory alias names for `ai_query()` and `from_json()` outputs respectively. Added explicit WRONG/CORRECT examples to the SQL gen prompt and added the convention to both the full and compact SQL rules, plus the review checklist.

### Targeted Fix Guidance for `from_json` Violations
When the hallucination fixer detects `parsed.*` prefix patterns in flagged columns, the error message now includes specific instructions about canonical `from_json()` alias naming to guide the fix LLM.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `246a27d` | Fix false-positive hallucination flags and tighten SQL generation quality |

**Uncommitted changes:** Version bump to 0.17.1, release notes file.
