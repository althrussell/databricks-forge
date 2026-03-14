# Release Notes -- 2026-03-14

**Databricks Forge v0.34.1**

---

## Improvements

### Demo Engine SQL Robustness (6 new constraint rules)
Added six critical SQL constraint rules to `DEMO_DATA_SQL_CONSTRAINTS` to prevent recurring LLM-generated SQL failures: INTERVAL+DATE casting, safe modulo with `GREATEST()`, BIGINT overflow prevention, `get()` instead of `element_at()`, `rand()` misuse guard, and self-referencing table prohibition.

### Schema Design Performance
Switched schema design from the `reasoning` endpoint to `generation`, reduced `maxTokens` from 32K to 16K, and simplified the prompt to target 8-12 lean demo tables instead of 35+ enterprise-scale models.

### Inline Table Comments
Table descriptions are now included as `COMMENT` clauses directly in `CREATE TABLE` statements, eliminating redundant post-creation `COMMENT ON TABLE` DDL round-trips.

### Cascading Failure Resilience
Fact table generation now checks if all referenced dimension tables failed, and skips doomed fact tables early instead of generating SQL that references non-existent tables.

### Research Summary Redesign
Replaced the flat stat boxes with a polished editorial layout: icon stat ribbon, numbered priority list, two-column nomenclature grid, and compact header with status indicator.

### Schema Review Redesign
Replaced visual chaos with structured cards: pill-style data asset chips, narrative cards with pattern badges, divided nomenclature table, and accent-bordered demo highlight cards.

### Smart PDF and PPTX Page Breaks
PDF `drawTable()` now paginates rows across pages with header repetition. PDF and PPTX use case detail rendering creates continuation pages/slides instead of silently dropping overflow fields.

---

## Bug Fixes

- **CatalogBrowser catalog selection** -- Schema mode now shows a "Select" button on catalog rows, allowing catalog-level selection in the demo wizard with auto-generated schema name.
- **Generation timer missing** -- Added elapsed timer to `GenerationProgressStep` and total wizard time display on `CompleteStep`.
- **Clickable demo sources** -- Added `url` field to `ResearchSource` interface, populated from website-scrape, strategic-crawl, and IR-crawler passes. Sources on the session detail page are now clickable links to original URLs.

---

## Commits (1)

| Hash | Summary |
|---|---|
| (pending) | fix: demo engine overhaul -- SQL robustness, schema speed, wizard UX, exports |

**Uncommitted changes:** 21 files modified across demo engine, research engine, export, and UI components.
