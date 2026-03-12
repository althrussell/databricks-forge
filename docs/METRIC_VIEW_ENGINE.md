# Metric View Engine

> Subdomain-level metric view generation, validation, and deployment.

## Overview

The Metric View Engine generates Databricks Unity Catalog
[metric views](https://docs.databricks.com/en/sql/language-manual/sql-ref-syntax-ddl-create-metric-view.html)
(YAML v1.1) from pipeline results. It discovers existing metric views in scope,
classifies them as reuse/improve/new, generates proposals with multi-table joins,
validates against the schema allowlist, and deploys via DDL execution.

The engine is **feature-gated** behind `FORGE_METRIC_VIEWS_ENABLED=true`
(set via `./deploy.sh --enable-metric-views`).

---

## Architecture

```
Discovery                    Planning                   Generation
discoverExisting ──►  LLM classify per subdomain ──►  LLM generate YAML v1.1
  MetricViews()        (reuse / improve / new)           proposals
                                                            │
                                                            ▼
                                                     Post-processing
                                                     ├── Strip FQN prefixes
                                                     ├── Nest snowflake joins
                                                     ├── Qualify nested alias refs
                                                     ├── Auto-fix collisions
                                                     ▼
                                                     Validation
                                                     ├── Schema allowlist
                                                     ├── Column references
                                                     ├── Dry-run DDL (temp view)
                                                     ├── Optional LLM repair
                                                     ▼
                                                     Persistence + Deploy
```

---

## Engine Flow

### Phase 1: Discovery

`discoverExistingMetricViews(scope)` in `lib/metric-views/discovery.ts`:

1. Queries `information_schema` for tables with `table_type = 'METRIC_VIEW'`
2. Runs `SHOW CREATE TABLE` per metric view to extract the YAML body
3. Parses YAML to extract dimensions, measures, join targets, and source table
4. Returns `ExistingMetricViewDetail[]`

`filterRelevantExistingViews()` narrows the list to views whose source tables
overlap with the current scope.

### Phase 2: Planning (Engine V2)

`runMetricViewEngineV2()` in `lib/metric-views/engine.ts`:

1. Groups use cases by subdomain via `mapSubdomainsToTables()`
2. Runs a planning pre-pass where the LLM classifies each subdomain's needs:
   - **reuse** -- existing metric view is sufficient
   - **improve** -- existing view needs enhancement
   - **new** -- no existing view covers this subdomain
3. Generates proposals per subdomain
4. Merges all proposals into the output

### Phase 3: Generation

`runMetricViewProposals()` in `lib/genie/passes/metric-view-proposals.ts`:

1. Builds schema and column context from metadata
2. LLM generates 1-3 proposals per domain (YAML v1.1 format)
3. Post-processing pipeline:
   - Strip FQN prefixes from SQL
   - Nest snowflake joins (detect and restructure flat joins)
   - Qualify nested alias references
4. Auto-fix pass:
   - Rename shadowed measures, dimensions, join aliases
   - Fix materialization references
5. Validate against schema allowlist and column references
6. LLM repair for remaining column/alias errors
7. Dry-run DDL via temporary view (`EXPLAIN`)
8. Optional SQL review when `isReviewEnabled("genie-metric-views")`

### Phase 4: Deployment

Proposals can be deployed individually or in batch:

1. `sanitizeMetricViewDdl()` rewrites DDL for the target schema
2. Execute `CREATE OR REPLACE VIEW ... WITH METRICS LANGUAGE YAML AS $$...$$`
3. Update deployment status in Lakebase
4. `patchSpaceWithMetricViews()` adds deployed FQNs to the Genie Space's
   `data_sources.metric_views`

---

## Metric View Proposal Shape

```typescript
interface MetricViewProposal {
  name: string;                    // snake_case identifier
  description: string;
  yaml: string;                    // YAML body (version 1.1)
  ddl: string;                     // Full CREATE OR REPLACE VIEW DDL
  sourceTables: string[];
  hasJoins: boolean;
  hasFilteredMeasures: boolean;
  hasWindowMeasures: boolean;
  hasMaterialization: boolean;
  validationStatus: "valid" | "warning" | "error";
  validationIssues: string[];
  classification?: "reuse" | "improve" | "new";
  rationale?: string;
  existingFqn?: string;            // For reuse/improve
  subdomain?: string;
}
```

YAML v1.1 supports: `version`, `source`, `filter`, `dimensions`, `measures`,
`joins` (star and snowflake patterns), and optional `materialization`.

---

## Genie Engine Integration

The Metric View Engine runs as a parallel pass within the Genie Engine when
`isMetricViewsEnabled()` and `config.generateMetricViews` are both true:

1. `discoverExistingMetricViews()` for the schema scope
2. `runMetricViewEngineV2()` with measures, dimensions, and joins from earlier
   Genie passes (column intelligence, semantic expressions)
3. `saveMetricViewProposals()` persists proposals to Lakebase
4. The Genie assembler converts proposals to `DataSourceMetricView[]` and adds
   them to `data_sources.metric_views` in the serialized space (capped at ~30%
   of `MAX_DATA_OBJECTS`)

### Dependency Management

Before deploying a Genie Space that references metric views:

- `checkMetricViewDependencies(fqns)` identifies which are deployed vs missing
- `ensureMetricViewsDeployed(fqns, targetSchema)` auto-deploys missing proposals
- `extractMetricViewFqnsFromSpace()` extracts FQNs from the serialized space
- `rewriteDashboardMetricViewFqns()` handles FQN rewrites when target schema differs

---

## Lightweight Seed

`buildLightweightSeed()` in `lib/metric-views/seed.ts` provides a deterministic
fallback when LLM generation is not available:

- Numeric columns -> SUM/AVG measures
- Date columns -> DATE_TRUNC dimensions
- String columns -> categorical dimensions
- Adds a `row_count` measure

---

## Feature Gate

| Setting | Source | Default |
|---------|--------|---------|
| `FORGE_METRIC_VIEWS_ENABLED` | `deploy.sh --enable-metric-views` | `false` |
| `GenieEngineConfig.generateMetricViews` | Per-run Genie config | `true` (when feature enabled) |
| `/api/health` | Health endpoint | Reports `metricViewsEnabled` |

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/metric-views` | GET | List proposals by `runId` or `schemaScope` |
| `/api/metric-views/generate` | POST | Standalone generation from tables |
| `/api/metric-views/[id]` | GET | Get proposal by ID |
| `/api/metric-views/[id]` | PATCH | Update YAML, DDL, validation status |
| `/api/metric-views/[id]` | DELETE | Delete proposal |
| `/api/metric-views/[id]/deploy` | POST | Deploy proposal to target schema |
| `/api/metric-views/[id]/repair` | POST | Auto-fix + optional LLM repair |
| `/api/metric-views/check-dependencies` | POST | Check deployment dependencies |
| `/api/runs/[runId]/genie-engine/[domain]/metric-views` | POST | Execute DDL and add to Genie Space |

---

## UI

| Component | Purpose |
|-----------|---------|
| `components/pipeline/metric-views-tab.tsx` | Run-level proposals: list, deploy, repair, expand YAML/DDL |
| `components/pipeline/metric-view-deploy-modal.tsx` | Deploy multiple proposals with schema selection |
| `components/pipeline/metric-view-dependency-modal.tsx` | Resolve missing metric views before Genie deploy |
| `components/genie/genie-defaults-settings.tsx` | Settings toggle for metric views |

---

## Data Model

| Table | Purpose |
|-------|---------|
| `ForgeMetricViewProposal` | Proposal record: run, domain, schema, YAML, DDL, status, deployed FQN |

Metric view data also appears in:
- `ForgeGenieRecommendation.metricViewProposals` (JSON) -- proposals per Genie recommendation
- `ForgeGenieSpace.metricViews` -- deployed metric views per space
- `ForgeEnvironmentScan.metricViewCount` -- discovery counts
- `ForgeDiscoveredAsset` -- metric views as discovered assets

---

## File Reference

| File | Purpose |
|------|---------|
| `lib/metric-views/engine.ts` | V2 engine orchestrator (planning + generation) |
| `lib/metric-views/types.ts` | All TypeScript types |
| `lib/metric-views/discovery.ts` | Discover existing metric views from UC |
| `lib/metric-views/config.ts` | Feature gate (`isMetricViewsEnabled`) |
| `lib/metric-views/seed.ts` | Lightweight deterministic seed |
| `lib/metric-views/subdomain-mapper.ts` | Use case to subdomain grouping |
| `lib/metric-views/index.ts` | Public API |
| `lib/genie/passes/metric-view-proposals.ts` | LLM generation, validation, auto-fix, repair |
| `lib/genie/deploy.ts` | DDL deployment and space patching |
| `lib/genie/metric-view-dependencies.ts` | Dependency checking and auto-deploy |
| `lib/lakebase/metric-view-proposals.ts` | Persistence CRUD |
