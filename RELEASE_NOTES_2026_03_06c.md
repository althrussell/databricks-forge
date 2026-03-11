# Release Notes -- 2026-03-06

**Databricks Forge v0.11.1**

---

## Bug Fixes

- **Broken health fix workflow** -- The `column_intelligence` fix strategy silently dropped enrichments for columns not already in `column_configs`, set empty descriptions that failed the health check anyway, and always reported a change even when nothing was modified. The fix now creates missing column config entries, guards against empty descriptions, and only reports actual changes.
- **Empty diff in fix preview** -- When no changes were produced, the Optimization Suggestions page showed an identical side-by-side diff with "0 lines added, 0 lines removed". Now shows a clear "No Changes Generated" empty state with guidance.

---

## Improvements

### Smart context-aware fix strategies
All 8 health fix strategies now receive synthesized business context extracted from the space itself (title, description, existing instructions, existing measures/filters, existing joins). LLM-backed strategies generate contextually relevant fixes instead of running blind with empty context.

### Entity matching uses schema-based extraction
The `entity_matching` strategy now uses `extractEntityCandidatesFromSchema` to identify actual entity candidate columns (bounded cardinality, categorical values) instead of blindly enabling entity matching on all string columns.

### LLM-generated sample questions
The `sample_questions` strategy now uses the fast LLM endpoint to generate user-friendly, contextual sample questions based on the space's title, tables, and existing example SQLs -- instead of copying the first 3 example SQLs verbatim.

### Table description generation
The `column_intelligence` strategy now also generates table-level descriptions from table and column names, fixing the gap where `tables-have-descriptions` health check failures could never be addressed.

### Individual benchmark run buttons
Each benchmark question in the test runner now has a Play button for quick single-question runs, instead of requiring "Run All" or checkbox-based selection.

---

## Other Changes

- SQL alias extraction and validation enhancements
- SQL rules hardening and skill updates

---

## Commits (3)

| Hash | Summary |
|---|---|
| `e5c5bec` | Fix broken health fix workflow and make all strategies context-aware |
| `f833302` | Enhance SQL alias extraction and validation |
| `7a43f5c` | skill update and sql hardening |

**Uncommitted changes:** Version bump to 0.11.1 and release notes.
