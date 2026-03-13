# Release Notes -- 2026-03-14

**Databricks Forge v0.32.0**

---

## New Features

### Demo Mode -- Synthetic Data Generator for Field Engineering & Sales

A complete demo data generation system that creates customer-specific synthetic
datasets in Unity Catalog for live demonstrations.

**Research Engine** -- LLM-powered company research with three depth presets
(Quick / Balanced / Full) that scrapes company websites, discovers investor
relations documents, processes uploaded PDFs, auto-detects industry, and runs
multi-pass strategic analysis to identify priorities, data assets, and
customer-specific nomenclature.

**Data Engine** -- SQL-first synthetic data generation that designs relational
schemas from industry outcome maps, generates dimension and fact tables with
embedded data narratives (trends, spikes, anomalies, seasonal patterns), and
writes directly to Unity Catalog managed Delta tables (2,000--10,000 rows).

Key capabilities:
- 6-step wizard accessible from Settings (Company Info, Research Results,
  Catalog Selection, Schema Review, Generation Progress, Complete)
- Auto-industry detection with on-the-fly outcome map generation for
  industries not in the built-in registry
- Demo scoping by division, department, or functional area
- Per-session cleanup (DROP TABLE/SCHEMA + Lakebase record deletion)
- Real-time progress tracking with per-table phase visibility

Enablement: `./deploy.sh --enable-demo-mode` or `FORGE_DEMO_MODE_ENABLED=true`
in `.env.local`.

See `docs/DEMO_MODE.md` for the full team guide.

---

## Other Changes

- Updated `AGENTS.md` with Demo Mode architecture documentation
- Added `ForgeDemoSession` Prisma model and Lakebase CRUD operations
- Extended `ForgeOutcomeMap` with `enrichmentJson` for custom LLM-generated
  industry outcome maps
- Added async `getMasterRepoEnrichmentAsync()` fallback to custom enrichment
- Integrated `demo_research`, `demo_generate`, `demo_cleanup` activity actions
- Added `prisma.forgeDemoSession.deleteMany()` to factory reset

---

## Commits (1)

| Hash | Summary |
|---|---|
| *(pending)* | feat: Demo Mode wizard with Research Engine and Data Engine |

**New files:** 46 | **Modified files:** 12
