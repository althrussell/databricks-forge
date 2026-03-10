# Release Notes -- 2026-03-10

**Databricks Forge AI v0.20.1**

---

## Bug Fixes

- **SQL gen prompt: contradictory structured-output example** -- The `ai_query()` / `from_json()` example in `USE_CASE_SQL_GEN_PROMPT` showed sibling alias reuse in a single SELECT block, directly contradicting the rule that forbids it. The LLM followed the example over the rule, causing 9 of 16 generated queries to fail SQL review with score 42. Replaced with a correct multi-CTE pattern and added explicit WRONG/CORRECT callouts.

---

## Improvements

### Quieter SQL review logs
- Verbose review detail (`issueCategories`, `topIssues`, `sqlPreview`) demoted from `info` to `debug` in `sql-reviewer.ts`. Production logs now show a clean one-liner per review: verdict, score, issue count, and whether a fix was included.
- `"SQL review applied fix"` log in the pipeline no longer reports the misleading pre-fix quality score (the fix had already been applied and passed EXPLAIN).
- `"Skipping EXPLAIN validation for pipe-syntax query"` demoted from `info` to `debug` -- routine and not actionable.

---

## Commits (5)

| Hash | Summary |
|---|---|
| `c8ca804` | Fix contradictory ai_query/from_json example in SQL gen prompt and quiet review logs |
| `9e3aa97` | Merge pull request #93 from althrussell/feat/business-value-section |
| `dd2689e` | Fix exhaustive return in getPersonaWeights for strategic persona |
| `03b8731` | Fix pipeline resume flow, add toast feedback, and update AGENTS.md |
| `dac3937` | Add Business Value Engine: financial quantification, roadmap phasing, executive synthesis, and stakeholder analysis |

**Uncommitted changes:** Version bump to 0.20.1, this release notes file.
