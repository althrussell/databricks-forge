# Release Notes -- 2026-03-09

**Databricks Forge v0.16.0**

---

## New Features

### LLM Skills System
Introduced a structured knowledge injection framework (`lib/skills/`) that enriches all AI surfaces with domain-specific expertise. Skills are registered in a central registry and resolved at prompt-build time based on context signals (industry, data patterns, intent). Ships with five built-in skill packs: Databricks SQL Patterns, Genie Space Design, Industry Enrichment, Metric View Patterns, and System Tables. Skills are embedded into the vector store for RAG retrieval and injected directly into LLM prompts, improving generation quality across the Genie Engine, Ask Forge, and pipeline steps.

### Genie Space Detail Page Uplift
Completely redesigned the Genie Space detail page (`app/genie/[spaceId]/page.tsx`) with a tab-based layout featuring a new hero section (`space-detail-hero.tsx`), Overview tab (`space-overview-tab.tsx`) with table/instruction/expression summaries, Health tab (`space-health-tab.tsx`) with inline health checks and fix actions, Benchmarks tab (`space-benchmarks-tab.tsx`), and a refreshed Config Viewer. The page now matches the app's Precision Intelligence design language.

### Genie Space Improvement Workflow
Added a background improvement job system (`lib/genie/improve-jobs.ts`) with new API routes (`/api/genie-spaces/[spaceId]/improve` and `/api/genie-spaces/improve-status`). Users can trigger space improvements from the detail page and poll for progress, with status indicators and result surfacing in the UI.

### SQL Extraction in Space Fixer
Enhanced the space fixer (`lib/genie/space-fixer.ts`) with SQL extraction and reference handling capabilities, enabling more precise automated fixes when resolving health check failures.

---

## Improvements

### Design Restoration -- Outcomes & Ask Forge
Restored the design-overhaul UX to the Outcomes page, Use-Case Table, and Ask Forge chat interface that had been lost during branch merges. The Outcomes page now features the branded tile layout, refined state management, and consistent spacing. Ask Forge restores the redesigned chat bubbles, context panel, conversation history, and embedding status components.

### Dynamic Application Naming
Updated `lib/lakebase/provision.ts` to support a `FORGE_APP_NAME` environment variable for `PROJECT_ID_BASE` and display name, enabling flexible application identification across multiple deployments.

### Layout & Spacing Consistency
Updated layout and spacing across multiple pages (Fabric, Environment, Metadata Genie, Run Detail) for consistent margins, padding, and content constraints matching the design system.

### Trusted Assets Pass Enhancements
Expanded the trusted assets pass (`lib/genie/passes/trusted-assets.ts`) with richer generation logic and better handling of SQL patterns, improving the quality of generated Genie Space trusted assets.

### Benchmark Generation Improvements
Enhanced the benchmark generation pass with more robust question generation and better context handling for improved Genie Space benchmark coverage.

---

## Commits (9)

| Hash | Summary |
|---|---|
| `167dbd5` | Restore design-overhaul UX for outcomes page and use-case table |
| `3552a07` | Restore Ask Forge design overhaul from stashed design-system-overhaul branch |
| `18f3c85` | Update PROJECT_ID_BASE and DISPLAY_NAME logic in provision.ts for dynamic app naming |
| `1e299e5` | Uplift Genie Space detail tabs to match app design quality |
| `9e012eb` | Add LLM skills system for structured knowledge injection across all AI surfaces |
| `d95c7b9` | Add SQL extraction and reference handling in space fixer |
| `1884492` | Implement improvement polling and status handling in Genie pages |
| `5b179cb` | Update layout and spacing for consistency across multiple pages |
| `29dcd04` | Refactor OutcomesPage and IngestOutcomeMapPage for improved state management and UI consistency |

**Uncommitted changes:** None.
