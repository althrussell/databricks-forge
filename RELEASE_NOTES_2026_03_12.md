# Release Notes -- 2026-03-12

**Databricks Forge v0.24.1**

---

## Improvements

### Comprehensive Documentation Cleanup
All major documentation files updated to reflect the current 10-step pipeline scope. Key corrections:

- **QUICKSTART.md** -- corrected `--endpoint` default from `databricks-claude-sonnet-4-6` to `databricks-claude-opus-4-6`; added 5 missing flags (`--full`, `--review-endpoint`, `--enable-metric-views`, `--lakebase-scale-to-zero-timeout`, `--lakebase-no-scale-to-zero`); fixed intro text to distinguish premium vs fast endpoints.
- **WHY_FORGE.md** -- major rewrite adding Business Value Intelligence, Genie Space management (health checks, benchmarks, fix workflow), AI/BI Dashboard Recommendations, AI Catalog Comments, Value Tracking, Knowledge Base, Fabric/Power BI Migration, Industry Benchmarks, and portfolio exports. Added screenshot placeholders for 6 new features.
- **README.md** -- pipeline updated from 7 to 10 steps (added Asset Discovery, Business Value Analysis, renumbered Genie to Step 10); expanded "What It Does" to 5-phase lifecycle; added 12 key features (Business Value, Genie health, Dashboards, AI Comments, Ask Forge, Estate Intelligence, Benchmarks, Knowledge Base, Fabric migration); fixed model defaults; added portfolio export table; expanded Further Documentation to 22 entries.
- **docs/GENIE_ENGINE.md** -- Step 8 to Step 10; fixed join inference threshold (2 to 3); fixed domain concurrency (3 to 10); updated toolkit paths (`lib/toolkit/` not `lib/genie/`); added 12 new file references; added health check cross-references; expanded UI components table.
- **docs/BUSINESS_VALUE.md** -- Step 8 to Step 9 throughout (prose, diagram, file map).
- **docs/PIPELINE.md** -- updated from 7+1 optional steps to 10 steps; added Asset Discovery (Step 3) and Business Value Analysis (Step 9); renumbered Genie to Step 10 (background); added Dashboard Engine as parallel background step; fixed progress percentages; updated Model Routing table.

### New Engine Documentation
Three new comprehensive documentation files:

- **docs/COMMENT_ENGINE.md** -- documents the 4-phase AI Comment Engine (schema context, table comments, column comments, consistency review), configuration, DI, progress tracking, DDL execution, API routes, and UI.
- **docs/DASHBOARD_ENGINE.md** -- documents the Dashboard Engine in both pipeline and ad-hoc modes, SQL validation (3-stage), Lakeview assembler, deployment, API routes, and UI.
- **docs/SKILLS_KNOWLEDGE_BASE.md** -- documents the Skills system (9 static modules, registry, resolver, relevance targeting), Knowledge Base (upload flow, categories, embedding), and RAG integration (scopes, retrieval, provenance reranking).

---

## Commits (2)

| Hash | Summary |
|---|---|
| `4233215` | Comprehensive documentation cleanup to match current 10-step pipeline scope |
| `(pending)` | Bump version to 0.24.1, update release notes |

**Uncommitted changes:** package.json version bump, RELEASE_NOTES_2026_03_12.md update.
