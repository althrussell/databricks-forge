# Release Notes -- 2026-03-05

**Databricks Forge AI v0.8.0**

---

## New Features

### Genie Space Health Check Engine
A deterministic, YAML-driven health check system that scores any Genie Space (Forge-generated or off-platform) against 20 built-in best-practice checks across 4 categories: Data Sources, Instructions, Semantic Richness, and Quality Assurance. Returns a letter grade (A-F) with per-category breakdowns and actionable quick wins.

### Fix Workflow (Automated Remediation)
Health check failures can be automatically remediated via the existing Genie Engine passes. The fixer maps failed checks to 8 fix strategies (column intelligence, semantic expressions, join inference, trusted assets, instruction generation, benchmark generation, entity matching, sample questions), generates improvements, shows a diff preview, and pushes changes back to the Genie Space. Works on off-platform spaces by building MetadataSnapshot from `information_schema`.

### Benchmark Feedback Loop
An iterative quality improvement cycle: run benchmark questions via the Genie Conversation API (with SSE real-time progress), label results as correct/incorrect with optional feedback, generate targeted improvements based on failure patterns, apply fixes, and re-run. All runs are persisted with history and pass rate tracking.

### Health Check Configuration
User-configurable health checks via API: disable built-in checks, adjust thresholds, change severity, add custom checks with any of the 11 evaluator types, and override category weights.

---

## Improvements

### Card Overflow Fix
Fixed a UX bug where long titles caused badges to spill outside the SpaceCard boundary on the `/genie` page. Added `overflow-hidden` to the card root and `flex-wrap` to the badge container.

### Space Caching
Added an in-memory cache with 5-minute TTL for `serialized_space` JSON to avoid redundant API calls during health check, fix, and benchmark workflows.

### Benchmark Run Rate Limiting
Added 2-second delay between benchmark questions to avoid Genie API throttling, plus an in-memory lock to prevent concurrent benchmark runs.

### Clone + Fix for Off-Platform Spaces
New `/api/genie-spaces/[id]/clone` endpoint creates a copy of an off-platform space before applying fixes, leaving the original untouched.

---

## Other Changes
- Added 3 new Prisma models: `ForgeSpaceBenchmarkRun`, `ForgeSpaceHealthScore`, `ForgeHealthCheckConfig`
- Added 71 unit tests across 5 test files covering evaluators, registry, scorer, fix routing, and benchmark feedback
- Created comprehensive documentation: `docs/GENIE_HEALTHCHECK_ENGINE.md`
- Updated `AGENTS.md` with Genie Health Check Engine section
- Added `yaml` npm dependency for YAML parsing

---

## Commits (1)

| Hash | Summary |
|---|---|
| `cdfb55c` | Enhance Fabric integration and add incremental scan support |

**Uncommitted changes:** AGENTS.md, app/genie/page.tsx, package.json, prisma/schema.prisma, plus 25 new files for health check engine, fix workflow, benchmark loop, API routes, UI components, tests, and documentation.
