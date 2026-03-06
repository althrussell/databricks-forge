# Release Notes -- 2026-03-06

**Databricks Forge AI v0.12.0**

---

## New Features

### Standalone Metric Views
Metric views are now first-class, independently deployable artifacts. A new
`ForgeMetricViewProposal` persistence layer tracks proposals across pipeline
runs, ad-hoc generation, and standalone creation. New REST API endpoints
(`/api/metric-views/*`) support CRUD, generation, and deployment without
requiring a full Genie Engine run.

### Metric Views Tab
A dedicated **Metric Views** tab on the run detail page (between Use Cases and
Genie Spaces) lets users browse, filter, validate, and deploy metric view
proposals per domain with status badges and bulk actions.

### Two-Phase Genie Engine
The Genie Engine now runs in two phases: **Phase A** generates and persists
metric views first, then **Phase B** assembles Genie spaces, trusted assets,
instructions, and benchmarks in parallel. This ensures metric views are
available for downstream consumers before space assembly begins.

---

## Improvements

### Deployment Dependency Validation
Genie space and dashboard deploy routes now auto-detect referenced metric views
and deploy any missing ones as a pre-flight step, preventing deployment
failures from unresolved metric view dependencies.

### Dashboard Engine Reads from New Table
The dashboard engine reads metric view data from the new
`ForgeMetricViewProposal` table first, falling back to legacy
`GenieEngineRecommendation` records for backward compatibility.

---

## Bug Fixes
- **Snowflake schema join nesting** -- Fixed `UNRESOLVED_COLUMN` errors in
  metric view YAML by implementing `nestSnowflakeJoins()` deterministic
  auto-fix, enhanced LLM prompt guidance for nested joins, and
  `detectFlatSnowflakeJoins()` validation.

---

## Other Changes
- Genie workbench accordion shows read-only metric view references with a
  pointer to the dedicated Metric Views tab
- Genie deploy modal includes an informational banner about automatic metric
  view dependency deployment
- Ad-hoc Genie engine applies the same two-phase pattern for consistency
- `sanitizeMetricViewDdl` applies `nestSnowflakeJoins` before deployment
- 8 new unit tests for `nestSnowflakeJoins` and `detectFlatSnowflakeJoins`

---

## Commits (1)

| Hash | Summary |
|---|---|
| `d7bf1a4` | Elevate metric views to first-class standalone artifacts with nested snowflake join support |

**Uncommitted changes:** Version bump to 0.12.0, this release notes file.
