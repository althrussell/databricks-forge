# Release Notes -- 2026-03-14

**Databricks Forge v0.33.0**

---

## New Features

### Launch Discovery & Estate Scan from Demo Sessions
After demo data generation completes, users can now launch a Discovery Pipeline
or Estate Scan directly from both the wizard completion step and the session
detail page. Buttons call the existing `/api/runs` and `/api/environment-scan`
endpoints with the generated schema scope, customer name, and industry pre-filled.

### Session Detail Page Redesign
The demo session detail page has been redesigned with:
- Dark hero banner with customer name, industry badge, schema FQN, and live KPI stats
- Sticky command bar with Launch Discovery, Estate Scan, and Export actions
- Collapsible research sections with accent-colored borders and contextual icons
- SWOT analysis rendered as a 2x2 color-coded grid
- Market forces with urgency badges, demo flow as a vertical timeline
- Killer moments, competitive positioning, and executive talking points sections

---

## Bug Fixes

- **Data Engine cascade failure** -- Failed dimension tables (e.g. `dim_date`) are
  now filtered out before fact generation, preventing cascading
  `TABLE_OR_VIEW_NOT_FOUND` errors across all downstream fact tables.
- **Spark datetime pattern errors** -- Added explicit rules to demo SQL constraints
  and global `DATABRICKS_SQL_RULES` forbidding `'u'`, `'e'`, `'c'`, `'L'` patterns
  in `DATE_FORMAT()` which cause `DATETIME_PATTERN_RECOGNITION` errors on Databricks.
- **Smart fact retry** -- The `TABLE_OR_VIEW_NOT_FOUND` retry in fact generation now
  parses the missing table name, removes it from the dimension context, and adds an
  explicit constraint telling the LLM not to reference it.
- **Export 500 errors** -- Added try-catch with structured logging to the demo export
  API route. Both PPTX and PDF generators now use optional chaining on all
  LLM-parsed array properties (priorities, urgency signals, SWOT, market forces,
  benchmarks, asset details) preventing crashes on partial research results.

---

## Commits (1)

| Hash | Summary |
|---|---|
| *(uncommitted)* | fix: demo engine robustness, export null safety, session detail UX redesign |

**Uncommitted changes:** `engine.ts`, `fact-generation.ts`, `prompts.ts`, `sql-rules.ts`, `export/route.ts`, `demo-research-pptx.ts`, `demo-research-pdf.ts`, `page.tsx`, `complete-step.tsx`, `demo-wizard.tsx`, `package.json`
