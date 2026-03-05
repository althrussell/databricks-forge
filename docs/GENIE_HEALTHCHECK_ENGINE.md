# Genie Health Check Engine

> Technical guide for the deterministic Space Health Check, Fix Workflow,
> and Benchmark Feedback Loop in Databricks Forge AI.

The Health Check Engine scores any Genie Space -- Forge-generated or
off-platform -- against a configurable checklist of best practices, offers
automated fixes via the existing Genie Engine passes, and supports an
iterative benchmark feedback loop to validate real-world accuracy.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Health Check Pipeline](#health-check-pipeline)
3. [YAML Check DSL](#yaml-check-dsl)
4. [Evaluator Functions](#evaluator-functions)
5. [Registry & Merge Logic](#registry--merge-logic)
6. [Scoring Algorithm](#scoring-algorithm)
7. [Custom Check Configuration](#custom-check-configuration)
8. [Fix Workflow](#fix-workflow)
9. [Fix Strategy Router](#fix-strategy-router)
10. [Metadata Building for Off-Platform Spaces](#metadata-building-for-off-platform-spaces)
11. [Benchmark Feedback Loop](#benchmark-feedback-loop)
12. [Improvement Logic (Feedback-to-Fix)](#improvement-logic-feedback-to-fix)
13. [Critical User Journeys (CUJs)](#critical-user-journeys-cujs)
14. [Data Model](#data-model)
15. [API Reference](#api-reference)
16. [UI Components](#ui-components)
17. [Hardening & Performance](#hardening--performance)
18. [File Reference](#file-reference)

---

## Architecture Overview

The system is split into three interconnected pipelines forming an
iterative improvement cycle:

```
┌─────────────────────────────────────────────────────────────────┐
│                    IMPROVEMENT PIPELINE                          │
│                                                                 │
│  ┌──────────────┐    ┌──────────────┐    ┌───────────────────┐  │
│  │ DIAGNOSE     │───▶│ FIX          │───▶│ VERIFY            │  │
│  │ Health Check │    │ Engine Passes │    │ Benchmark Loop    │  │
│  │ (pure func)  │    │ (LLM + det.) │    │ (Conversation API)│  │
│  └──────────────┘    └──────────────┘    └────────┬──────────┘  │
│        ▲                                          │             │
│        └──────────────────────────────────────────┘             │
│                   (iterate until satisfied)                      │
└─────────────────────────────────────────────────────────────────┘
```

### Health Check Layer (Diagnose)

```
┌─────────────────────────────────────────────────────┐
│  Check Definitions (YAML)                           │
│  ┌─────────────────┐  ┌──────────────────────────┐  │
│  │ default-checks  │  │ user-custom-checks       │  │
│  │ .yaml (built-in)│  │ (Lakebase / settings UI) │  │
│  └────────┬────────┘  └────────────┬─────────────┘  │
│           └──────────┬─────────────┘                │
│                      ▼                              │
│  ┌─────────────────────────────────────────┐        │
│  │  Registry (merges defaults + overrides) │        │
│  └────────────────────┬────────────────────┘        │
│                       ▼                             │
│  ┌─────────────────────────────────────────┐        │
│  │  Evaluator Engine (deterministic)       │        │
│  │  count | exists | length | ratio |      │        │
│  │  pattern | range | unique | jsonpath    │        │
│  └────────────────────┬────────────────────┘        │
│                       ▼                             │
│  ┌─────────────────────────────────────────┐        │
│  │  SpaceHealthReport                      │        │
│  └─────────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

Key design decisions:
- **No LLM calls** for evaluation -- all checks are deterministic pure functions
- **YAML-driven** -- checks are declarative and user-configurable
- **Extensible** -- users add custom checks via settings UI or YAML import
- **Additive-only** fixes -- the fixer never removes existing space content

---

## Health Check Pipeline

Step-by-step flow from API call to `SpaceHealthReport`:

1. **Fetch space** -- `getGenieSpace(spaceId)` returns `serialized_space` JSON
2. **Load config** -- `getHealthCheckConfig()` loads user overrides from Lakebase
3. **Resolve registry** -- `resolveRegistry(overrides, custom, weights)` merges
   defaults + user overrides + custom checks
4. **Run evaluators** -- for each enabled check, call `runEvaluator(space, check)`
5. **Compute category scores** -- `passed / total * 100` per category
6. **Compute overall score** -- weighted average of category scores
7. **Assign grade** -- A (90+), B (80-89), C (70-79), D (60-69), F (<60)
8. **Collect quick wins** -- from failed checks, sorted by severity, capped at 5
9. **Return report** -- `SpaceHealthReport` with all results

The entire pipeline is a **pure function** with no side effects. Health score
persistence is fire-and-forget after the report is returned.

---

## YAML Check DSL

Each check is a declarative YAML block in `lib/genie/health-checks/default-checks.yaml`.

### Check Definition Fields

| Field | Type | Required | Description |
|---|---|---|---|
| `id` | string | Yes | Unique identifier for the check |
| `category` | string | Yes | Must match a defined category key |
| `description` | string | Yes | Human-readable description shown in UI |
| `severity` | `critical` \| `warning` \| `info` | Yes | Determines ordering and UI treatment |
| `fixable` | boolean | Yes | Whether the fix workflow can address this |
| `fix_strategy` | string | If fixable | Maps to a fix strategy in `space-fixer.ts` |
| `evaluator` | string | Yes | One of the 11 registered evaluator types |
| `path` | string | Depends | JSONPath-like dot notation into `serialized_space` |
| `paths` | string[] | For `no_empty_field` | Multiple paths to check |
| `field` | string | For `ratio`/`nested_ratio` | Field to check on each item |
| `params` | object | Yes | Evaluator-specific parameters |
| `quick_win` | string | No | Actionable text shown when check fails |
| `condition_path` | string | For `conditional_count` | Path to check before evaluating |
| `condition_min` | number | For `conditional_count` | Minimum count to trigger evaluation |

### Category Definitions

```yaml
categories:
  data_sources:
    label: "Data Sources"
    weight: 25
  instructions:
    label: "Instructions"
    weight: 25
  semantic_richness:
    label: "Semantic Richness"
    weight: 25
  quality_assurance:
    label: "Quality Assurance"
    weight: 25
```

Weights determine how much each category contributes to the overall score.
Users can override weights via the settings API.

---

## Evaluator Functions

Located in `lib/genie/health-checks/evaluators.ts`. Each evaluator is a pure
function: `(space, checkDef) => CheckResult`.

### `count`
Count items at `path` and check against `min` / `max`.
- **Params:** `min` (default 0), `max` (optional)
- **Pass:** `count >= min && count <= max`
- **Example:** Check for at least 5 example SQL pairs

### `range`
Like `count` with an additional `warn_above` threshold.
- **Params:** `min`, `max`, `warn_above`
- **Pass:** within range AND below warn threshold

### `exists`
Check if a path resolves to a non-null value.
- **Pass:** at least one value found at path

### `length`
Check string length at a path.
- **Params:** `min`, `max`

### `ratio`
What fraction of items at `path` have a non-empty `field`.
- **Params:** `min_ratio` (0.0 to 1.0)
- **Pass:** `ratio >= min_ratio`
- **Edge case:** Empty arrays vacuously pass

### `nested_ratio`
Like `ratio` but for nested arrays (e.g., `tables[*].column_configs`).
Flattens the resolved array before counting.
- **Params:** `min_ratio`

### `pattern`
Validate all values match a regex.
- **Params:** `regex`
- **Special path:** `__all_ids__` collects all `id` fields recursively

### `unique`
Check all values are unique (no duplicates).
- **Special path:** `__all_ids__` collects all `id` fields recursively

### `no_empty_field`
Verify no items have empty/missing values at given paths.
- **Uses `paths`** (array) instead of single `path`

### `conditional_count`
Only evaluate if a condition is met (e.g., only check join specs if >= 2 tables).
- **Params:** inherits from `count`, plus `condition_path`, `condition_min`
- **Pass:** if condition not met, check is skipped (passes)

### `jsonpath`
Reserved for advanced user-defined checks using arbitrary JSONPath expressions.

---

## Registry & Merge Logic

Located in `lib/genie/health-checks/registry.ts`.

### Merge Precedence

1. Load `default-checks.yaml` (bundled, immutable, cached in memory)
2. Load user overrides from Lakebase `ForgeHealthCheckConfig` table
3. Merge rules:
   - User `enabled: false` disables a built-in check
   - User `params` are shallow-merged (override individual thresholds)
   - User `severity` replaces the default severity
   - Custom checks are appended after built-in checks
4. Category weight overrides applied to category definitions
5. Validation: custom checks must reference valid categories and evaluators

### Cache Behavior

Default checks are parsed once from YAML and cached in a module-level variable.
Call `clearRegistryCache()` to force a reload (used in tests).

---

## Scoring Algorithm

```
overallScore = Σ(categoryScore × categoryWeight) / Σ(categoryWeight)

categoryScore = (passedChecks / totalChecks) × 100  (or 100 if no checks)

grade:
  90-100 → A
  80-89  → B
  70-79  → C
  60-69  → D
  0-59   → F
```

Quick wins are collected from failed checks that have `quick_win` defined,
sorted by severity (critical → warning → info), and capped at 5.

---

## Custom Check Configuration

Users can configure health checks via:

1. **Settings API** (`PUT /api/genie-spaces/health-config`) -- programmatic
2. **YAML import** -- upload a YAML file with check definitions

### Override Types

```typescript
interface UserCheckOverride {
  checkId: string;
  enabled?: boolean;
  params?: Record<string, unknown>;
  severity?: "critical" | "warning" | "info";
}

interface UserCustomCheck {
  id: string;
  category: string;
  description: string;
  severity: Severity;
  evaluator: EvaluatorType;
  path: string;
  field?: string;
  params: Record<string, unknown>;
  quick_win?: string;
}
```

---

## Fix Workflow

When health checks reveal issues, the Fix Workflow generates improvements
using Forge's existing Genie Engine passes.

### Fix Execution Flow

1. User clicks "Fix" (individual or "Fix All")
2. API receives list of failed check IDs
3. `resolveFixStrategies()` groups checks by `fix_strategy`
4. For off-platform spaces, `buildMetadataForSpace()` queries `information_schema`
5. Relevant engine passes run (using existing pass modules)
6. Results are merged into the space (**additive only** -- nothing removed)
7. API returns diff preview (original vs updated serialized_space)
8. User reviews and clicks "Apply"
9. `updateGenieSpace()` pushes changes to Databricks
10. Health check re-runs automatically, score refreshes

---

## Fix Strategy Router

Located in `lib/genie/space-fixer.ts`.

| Fix Strategy | Engine Pass | LLM? |
|---|---|---|
| `column_intelligence` | Pass 1 (Column Intelligence) | Yes (fast) |
| `semantic_expressions` | Pass 2 (Semantic Expressions) | Yes (premium) |
| `join_inference` | Join Inference | Yes (fast) |
| `trusted_assets` | Pass 3 (Trusted Assets) | Yes (premium) |
| `instruction_generation` | Pass 4 (Instruction Generation) | Yes (fast) |
| `benchmark_generation` | Pass 5 (Benchmark Generation) | Yes (premium) |
| `entity_matching` | Deterministic enablement | No |
| `sample_questions` | Generate from existing examples | No |

---

## Metadata Building for Off-Platform Spaces

Off-platform spaces have no Forge `MetadataSnapshot`. Before running engine
passes:

1. Extract table FQNs from `serialized_space.data_sources.tables[*].identifier`
2. Query `information_schema.columns` for each table
3. Build a `MetadataSnapshot` with `tables`, `columns`, empty `foreignKeys`
4. Build `SchemaAllowlist` via `buildSchemaAllowlist()`
5. This enables grounded generation for all LLM passes

---

## Benchmark Feedback Loop

An iterative cycle for validating and improving Genie Space quality:

```
┌─────────┐    ┌─────────┐    ┌──────────┐    ┌──────────┐
│ Run     │───▶│ Label   │───▶│ Improve  │───▶│ Apply    │
│benchmarks│   │results  │    │(targeted │    │+ re-score│
└─────────┘    └─────────┘    │ passes)  │    └────┬─────┘
     ▲                        └──────────┘         │
     └─────────────────────────────────────────────┘
                  (repeat until satisfied)
```

### Components

1. **Benchmark questions** -- loaded from `serialized_space.benchmarks.questions`
2. **Run** -- each question sent to Genie Conversation API with 2s delay
3. **Results** -- per-question pass/fail based on Jaccard similarity
4. **Label** -- user marks correct/incorrect with optional feedback
5. **Improve** -- feedback analyzed for patterns, targeted fixes generated
6. **Apply** -- improvements pushed to space, health check re-runs
7. **History** -- all runs persisted in `ForgeSpaceBenchmarkRun`

---

## Improvement Logic (Feedback-to-Fix)

Located in `lib/genie/benchmark-feedback.ts`.

The `analyzeFeedbackForFixes()` function maps labeled failures to check IDs:

| Failure Pattern | Detected Via | Fix Check ID |
|---|---|---|
| Join issues | "join" in feedback or expected SQL | `join-specs-for-multi-table` |
| Time/date issues | "time", "date", "period" in feedback | `filters-defined` |
| Aggregation issues | "sum", "count", "average" in feedback | `measures-defined` |
| User-provided SQL | `expectedSql` present | `example-sqls-minimum` |
| Multiple failures (3+) | Count of failures | `text-instruction-exists` |
| No specific pattern | Fallback | `measures-defined`, `filters-defined`, `example-sqls-minimum` |

---

## Critical User Journeys (CUJs)

### CUJ 1: Diagnose and Fix an Off-Platform Space

1. User navigates to `/genie` and sees health grade badges on all space cards
2. An off-platform space shows a **D** grade with "3 fixable issues"
3. User clicks the grade badge to open the Health Detail Sheet
4. Sheet shows: Quick Wins, category breakdown, individual check results
5. User clicks **Fix All** -- API runs relevant engine passes
6. Diff preview shows added descriptions, measures, and join specs
7. User clicks **Apply** -- changes pushed to Databricks
8. Score refreshes: **D → B** with animation
9. Banner: "Score improved! Run benchmarks to validate accuracy."
10. User clicks **Run Benchmarks** -- redirected to benchmark page
11. Benchmarks run (SSE real-time progress), 7/10 pass
12. User labels 3 failures with feedback
13. User clicks **Improve** -- targeted fixes applied
14. Re-runs benchmarks: 9/10 pass (95%)

### CUJ 2: Customize Health Checks for Organization

1. Admin calls `PUT /api/genie-spaces/health-config` with overrides:
   - Disable `column-synonyms-defined` (not relevant for their use case)
   - Raise `example-sqls-minimum` threshold from 5 to 10
   - Add custom check: "At least 3 metric views configured"
2. All spaces are re-scored with the new configuration
3. Spaces that previously scored A might now show B due to stricter thresholds

### CUJ 3: Iterate on a Forge-Generated Space

1. User deploys a Genie Space from the pipeline -- sees **B** grade
2. Runs benchmarks: 7/10 pass
3. Labels 3 failures: "Wrong join", "Missing time filter", "Sum vs Count"
4. Clicks **Improve** -- join inference, filter, and measure passes run
5. Applies improvements, re-runs benchmarks: 10/10 pass
6. Health score: **A**

---

## Data Model

### ForgeSpaceBenchmarkRun

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `spaceId` | string | Genie Space ID |
| `runAt` | datetime | When the run was executed |
| `totalQuestions` | int | Number of benchmark questions |
| `passedCount` | int | Questions that passed |
| `failedCount` | int | Questions that failed |
| `errorCount` | int | Questions with errors |
| `resultsJson` | JSON string | `BenchmarkResult[]` |
| `feedbackJson` | JSON string | User labels + feedback text |
| `improvementsApplied` | boolean | Whether improvements were applied from this run |
| `improvementSummary` | string | Description of improvements made |

### ForgeSpaceHealthScore

| Field | Type | Description |
|---|---|---|
| `id` | UUID | Primary key |
| `spaceId` | string | Genie Space ID |
| `score` | int | 0-100 overall score |
| `grade` | string | A through F |
| `checksJson` | JSON string | `HealthCheckItem[]` |
| `triggeredBy` | string | "manual", "post_fix", "post_benchmark" |
| `measuredAt` | datetime | When the score was recorded |

### ForgeHealthCheckConfig

| Field | Type | Description |
|---|---|---|
| `id` | string | Always "singleton" |
| `overridesJson` | JSON string | `UserCheckOverride[]` |
| `customChecksJson` | JSON string | `UserCustomCheck[]` |
| `categoryWeightsJson` | JSON string | `Record<string, number>` |
| `updatedAt` | datetime | Last update timestamp |

---

## API Reference

### Health Check

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/genie-spaces/[id]/health` | Run health check on a single space |
| `POST` | `/api/genie-spaces/health-batch` | Batch health check for multiple spaces |
| `GET` | `/api/genie-spaces/[id]/health-history` | Health score trending data |

### Fix Workflow

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/genie-spaces/[id]/fix` | Generate fixes for failed checks |
| `POST` | `/api/genie-spaces/[id]/apply` | Apply fixed serialized_space |
| `POST` | `/api/genie-spaces/[id]/clone` | Clone space for safe fixing |

### Benchmark Feedback Loop

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/genie-spaces/[id]/benchmarks` | Load benchmark questions |
| `POST` | `/api/genie-spaces/[id]/benchmarks/run` | Run benchmarks (SSE stream) |
| `POST` | `/api/genie-spaces/[id]/benchmarks/feedback` | Save labeled results |
| `POST` | `/api/genie-spaces/[id]/benchmarks/improve` | Generate improvements from feedback |
| `GET` | `/api/genie-spaces/[id]/benchmarks/history` | Past benchmark runs |

### Configuration

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/genie-spaces/health-config` | Get health check configuration |
| `PUT` | `/api/genie-spaces/health-config` | Update health check configuration |

---

## UI Components

### Space Card Updates (`app/genie/page.tsx`)

- **Health grade badge** -- circular A-F badge, color-coded (green/amber/red)
- **Fixable count** -- "3 fixable issues" text when applicable
- **Test button** -- links to `/genie/[spaceId]/benchmarks`
- **Health detail sheet** -- slide-out panel with full report

### Health Detail Sheet (`components/genie/health-detail-sheet.tsx`)

- Overall score + grade with colored background
- Quick wins section
- Fix All / Run Benchmarks CTAs
- Category breakdown with progress bars
- Individual checks grouped by category with pass/fail icons
- Per-check Fix buttons for fixable items

### Benchmark Page (`app/genie/[spaceId]/benchmarks/page.tsx`)

- **Run tab** -- load questions, run with SSE progress, results with label UI
- **History tab** -- past runs with pass rate badges
- Thumbs up/down labeling with optional feedback textarea
- Improve button triggers targeted fix generation

---

## Hardening & Performance

| Concern | Implementation |
|---|---|
| **Space caching** | In-memory 5min TTL cache in `lib/genie/space-cache.ts` |
| **Rate limiting** | 2s delay between benchmark questions, in-memory lock for concurrent runs |
| **Health check cache** | Invalidated on fix apply and benchmark improve |
| **Clone + Fix** | `/api/genie-spaces/[id]/clone` creates a copy before modifying off-platform spaces |
| **Health trending** | `ForgeSpaceHealthScore` persisted on every check, sparkline via history API |
| **Audit trail** | `triggeredBy` field on scores, structured logging via `lib/logger.ts` |
| **Input validation** | `isSafeId()` on all space ID parameters |
| **Batch limits** | 50 max for health-batch endpoint |

---

## File Reference

| File | Purpose |
|---|---|
| `lib/genie/health-checks/default-checks.yaml` | Built-in check definitions (20 checks, 4 categories) |
| `lib/genie/health-checks/types.ts` | TypeScript types for checks, results, reports |
| `lib/genie/health-checks/evaluators.ts` | 11 deterministic evaluator functions |
| `lib/genie/health-checks/registry.ts` | YAML parser, merge logic, validation |
| `lib/genie/space-health-check.ts` | Scorer -- runs checks, computes scores and grades |
| `lib/genie/space-fixer.ts` | Fix strategy router, metadata builder, pass invocation |
| `lib/genie/space-cache.ts` | In-memory serialized_space cache with TTL |
| `lib/genie/benchmark-feedback.ts` | Feedback analysis and pass rate comparison |
| `lib/genie/benchmark-runner.ts` | Existing benchmark runner (Conversation API) |
| `lib/lakebase/space-health.ts` | CRUD for health scores, benchmark runs, config |
| `components/genie/health-detail-sheet.tsx` | Health report slide-out panel |
| `app/genie/page.tsx` | Space cards with health badges and Test button |
| `app/genie/[spaceId]/benchmarks/page.tsx` | Benchmark test runner page |
| `app/api/genie-spaces/[spaceId]/health/route.ts` | Health check API |
| `app/api/genie-spaces/health-batch/route.ts` | Batch health check API |
| `app/api/genie-spaces/health-config/route.ts` | Health config API |
| `app/api/genie-spaces/[spaceId]/fix/route.ts` | Fix generation API |
| `app/api/genie-spaces/[spaceId]/apply/route.ts` | Apply fix API |
| `app/api/genie-spaces/[spaceId]/clone/route.ts` | Clone space API |
| `app/api/genie-spaces/[spaceId]/benchmarks/route.ts` | Load benchmarks API |
| `app/api/genie-spaces/[spaceId]/benchmarks/run/route.ts` | Run benchmarks (SSE) API |
| `app/api/genie-spaces/[spaceId]/benchmarks/feedback/route.ts` | Feedback API |
| `app/api/genie-spaces/[spaceId]/benchmarks/improve/route.ts` | Improve from feedback API |
| `app/api/genie-spaces/[spaceId]/benchmarks/history/route.ts` | Benchmark history API |
| `app/api/genie-spaces/[spaceId]/health-history/route.ts` | Health score trending API |
| `__tests__/genie/health-checks/evaluators.test.ts` | Evaluator unit tests |
| `__tests__/genie/health-checks/registry.test.ts` | Registry merge logic tests |
| `__tests__/genie/health-checks/space-health-check.test.ts` | End-to-end scorer tests |
| `__tests__/genie/space-fixer.test.ts` | Fix strategy routing tests |
| `__tests__/genie/benchmark-feedback.test.ts` | Feedback analysis tests |
| `__tests__/genie/health-checks/fixtures/spaces.ts` | Test fixture spaces |
