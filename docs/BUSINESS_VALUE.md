# Business Value Engine

> Post-pipeline intelligence that transforms discovered use cases into
> financially-grounded, boardroom-ready deliverables.

## Overview

The Business Value Engine runs as **Pipeline Step 8**, immediately after SQL
generation. It executes four LLM passes over the scored use cases to produce:

1. **Financial Quantification** -- dollar-range estimates per use case
2. **Roadmap Phasing** -- Quick Wins / Foundation / Transformation assignment
3. **Executive Synthesis** -- key findings, strategic recommendations, risk callouts
4. **Stakeholder Analysis** -- organizational impact mapping and champion identification

Results are persisted in Lakebase, surfaced through five dedicated UI pages, and
integrated into the dashboard, run detail, Ask Forge, and exports.

---

## Architecture

```
Pipeline Engine (engine.ts)
  └── runBusinessValueAnalysis(ctx)  [Step 8, ~90% progress]
        ├── Pass 1: Financial Quantification  [fast model, JSON mode]
        ├── Pass 2: Roadmap Phasing           [fast model, JSON mode]
        ├── Pass 3: Executive Synthesis       [fast model, JSON mode]
        └── Pass 4: Stakeholder Analysis      [fast model, JSON mode]
              │
              ▼
        Lakebase (7 tables)
              │
              ▼
        API Routes (/api/business-value/*)
              │
              ▼
        UI Pages (/business-value/*)
```

All four passes use `getFastServingEndpoint()` and `responseFormat: "json_object"`.
Use cases are batched (25 per request) for the financial and roadmap passes to
stay within token limits.

---

## Data Model

### Lakebase Tables

| Model | Table | Purpose |
|-------|-------|---------|
| `ForgeValueEstimate` | `forge_value_estimates` | Per-use-case financial estimates (low/mid/high, type, confidence) |
| `ForgeRoadmapPhase` | `forge_roadmap_phases` | Phase assignment with effort, dependencies, enablers |
| `ForgeUseCaseTracking` | `forge_use_case_tracking` | Lifecycle stage tracking (discovered → measured) |
| `ForgeValueCapture` | `forge_value_captures` | Actual delivered value records |
| `ForgeStrategyDocument` | `forge_strategy_documents` | Uploaded strategy documents with parsed initiatives |
| `ForgeStrategyAlignment` | `forge_strategy_alignments` | Strategy-to-use-case alignment and gap analysis |
| `ForgeStakeholderProfile` | `forge_stakeholder_profiles` | Role/department profiles with champion flags |

The `ForgeRun` model holds `synthesisJson` (executive synthesis output) and has
relations to all seven tables. All relations cascade on delete.

### Domain Types

```
ValueType        = "cost_savings" | "revenue_uplift" | "risk_reduction" | "efficiency_gain"
ValueConfidence  = "low" | "medium" | "high"
RoadmapPhase     = "quick_wins" | "foundation" | "transformation"
EffortEstimate   = "xs" | "s" | "m" | "l" | "xl"
TrackingStage    = "discovered" | "planned" | "in_progress" | "delivered" | "measured"
StrategyGapType  = "supported" | "partial" | "blocked" | "unmatched"
```

Key interfaces: `ValueEstimate`, `RoadmapPhaseAssignment`, `UseCaseTrackingEntry`,
`ValueCaptureEntry`, `StrategyDocument`, `StrategyInitiative`,
`StrategyAlignmentEntry`, `StakeholderProfile`, `ExecutiveSynthesis`,
`BusinessValuePortfolio` (see `lib/domain/types.ts`).

---

## Pipeline Passes

### Pass 1: Financial Quantification

**Prompt:** `FINANCIAL_QUANTIFICATION_PROMPT`
**Persona:** Senior Management Consultant and Financial Analyst

Estimates annual financial impact per use case as a low/mid/high range in USD.
Uses calibration anchors:

- **Cost Savings** -- process automation (1-5% of operating cost), data quality (0.5-2% of revenue)
- **Revenue Uplift** -- targeting/personalization (2-8% of addressable revenue), churn reduction
- **Risk Reduction** -- fraud detection (0.5-2% of transaction value), compliance
- **Efficiency Gain** -- analyst time savings ($100-250K per FTE), faster decision cycles

Estimates are scaled by data estate size, industry, feasibility score, and table
complexity. Conservative by design: low estimate is achievable with poor execution,
high represents ideal execution.

### Pass 2: Roadmap Phasing

**Prompt:** `ROADMAP_PHASING_PROMPT`
**Persona:** Chief Delivery Officer

Assigns each use case to a delivery phase:

| Phase | Timeframe | Criteria |
|-------|-----------|----------|
| Quick Wins | 0-3 months | Feasibility >= 0.7, proven patterns, data readily available |
| Foundation | 3-9 months | Requires data engineering, gold tables, quality improvements |
| Transformation | 9-18 months | ML models, real-time systems, cross-domain analytics |

Includes effort estimates (xs through xl), dependency chains between use cases,
and enabler descriptions.

### Pass 3: Executive Synthesis

**Prompt:** `EXECUTIVE_SYNTHESIS_PROMPT`
**Persona:** Senior Partner at a top-tier management consulting firm

Produces a board-ready briefing:

- **3-5 Key Findings** -- specific to the business, mixing opportunities and risks
- **3-5 Strategic Recommendations** -- concrete actions with expected outcomes
- **2-3 Risk Callouts** -- specific risks with evidence and impact

Stored as `synthesisJson` on the `ForgeRun` record.

### Pass 4: Stakeholder Analysis

**Prompt:** `STAKEHOLDER_ANALYSIS_PROMPT`
**Persona:** Organizational Change Management Consultant

Maps beneficiary and sponsor fields from use cases into structured profiles:
role, department, use case count, domains, type distribution, change complexity,
champion/sponsor flags.

---

## UI Pages

All pages use `PageHeader`, `mx-auto max-w-[1400px] space-y-8` container,
and the established shadcn/ui component patterns.

### `/business-value` -- Portfolio Overview

Server component with `<Suspense>` boundary. Aggregates data across all runs via
`getPortfolioData()`.

- Key Findings banner (from latest synthesis)
- Value Hero Cards: Total Estimated Value, Quick Wins, Delivered Value, Use Case count
- Strategic Themes: top domains by value
- Phase Distribution: Quick Wins / Foundation / Transformation counts
- Domain Heatmap: table with score, feasibility, use case count, value per domain

### `/business-value/roadmap` -- Implementation Roadmap

Server component. Shows phase-level summary with a Recharts `BarChart`
(`DeliveryTimelineChart`) for visual delivery timeline.

### `/business-value/strategy` -- Strategy Alignment

Client component. Upload strategy documents (plain text), which are parsed into
initiatives via LLM (`PARSE_OUTCOME_MAP`). View alignment against discovered
use cases with gap status badges (Supported / Partial / Blocked / Not Assessed).
Supports delete with confirmation dialog.

### `/business-value/stakeholders` -- Stakeholder Intelligence

Server component. Displays recommended champions, department summary cards,
full stakeholder table (role, department, use cases, domains, types, change
complexity, champion/sponsor flags), and skills assessment (aggregate type
distribution).

### `/business-value/tracking` -- Value Tracking

Client component. Kanban-style lifecycle tracking from discovery to measured
value:

- Scorecard: Discovered / Planned + In Progress / Delivered / Measured counts
- Stage Pipeline: visual bar showing distribution across stages
- Tracking Table: per-use-case rows with stage dropdown (PATCH to update)

---

## API Routes

| Method | Endpoint | Purpose |
|--------|----------|---------|
| `GET` | `/api/business-value/portfolio` | Aggregated portfolio data |
| `GET` | `/api/business-value/tracking` | All tracking entries + stage counts |
| `PATCH` | `/api/business-value/tracking` | Update use case stage or owner |
| `POST` | `/api/business-value/value-capture` | Record actual delivered value |
| `GET` | `/api/business-value/strategy` | List strategy documents |
| `POST` | `/api/business-value/strategy` | Create + LLM-parse strategy document |
| `DELETE` | `/api/business-value/strategy?id=` | Delete strategy document |
| `GET` | `/api/business-value/strategy/[id]` | Strategy doc with alignments |
| `GET` | `/api/runs/[runId]/business-value` | Full business value data for a run |

---

## Integration Points

### Dashboard

`BusinessValueSummary` component (client, fetches from portfolio API on mount)
shows Total Estimated Value and Implementation Progress cards, linking into the
business value pages.

### Run Detail

`BusinessValueTab` in `run-completed-tabs.tsx` renders per-run value summary,
executive synthesis (findings/recommendations/risks), value by category, and
roadmap phase distribution.

### Ask Forge

- `strategic` intent added to intent classification (heuristic + LLM)
- `strategic` persona overlay for CDO/CFO/Board-level audience
- Action cards: View Portfolio, Generate Business Case, View Stakeholders,
  View Roadmap, Draft Executive Memo

### Exports

The Excel export includes a "Business Value" sheet with financial estimates,
an "Executive Synthesis" sub-section, and a "Stakeholders" sheet when
business value data is available for the run.

---

## File Map

```
lib/
  ai/
    templates-business-value.ts      4 prompt templates
    templates.ts                     Registers prompts in central registry
    agent.ts                         Default temperatures for BV prompts
  pipeline/
    steps/
      business-value-analysis.ts     Step 8 orchestrator (4 LLM passes)
    engine.ts                        Integrates step 8 into pipeline
  lakebase/
    value-estimates.ts               CRUD for ForgeValueEstimate
    roadmap-phases.ts                CRUD for ForgeRoadmapPhase
    use-case-tracking.ts             CRUD for ForgeUseCaseTracking
    value-captures.ts                CRUD for ForgeValueCapture
    strategy-documents.ts            CRUD for ForgeStrategyDocument + Alignment
    stakeholder-profiles.ts          CRUD for ForgeStakeholderProfile
    portfolio.ts                     Cross-run portfolio aggregation
  domain/
    types.ts                         ValueEstimate, RoadmapPhase, etc.
  assistant/
    intent.ts                        "strategic" intent
    prompts.ts                       "strategic" persona overlay
    engine.ts                        Strategic action cards

app/
  business-value/
    page.tsx                         Portfolio overview
    roadmap/page.tsx                 Roadmap page
    strategy/page.tsx                Strategy alignment
    stakeholders/page.tsx            Stakeholder intelligence
    tracking/page.tsx                Value tracking
  api/
    business-value/
      portfolio/route.ts             GET portfolio
      tracking/route.ts              GET/PATCH tracking
      value-capture/route.ts         POST value capture
      strategy/route.ts              GET/POST/DELETE strategy docs
      strategy/[id]/route.ts         GET strategy with alignments
    runs/[runId]/
      business-value/route.ts        GET per-run business value

components/
  business-value/
    delivery-timeline-chart.tsx      Recharts BarChart for roadmap
  pipeline/
    run-detail/
      business-value-tab.tsx         Run detail BV tab
    sidebar-nav.tsx                  Business Value nav section
  dashboard/
    dashboard-content.tsx            BusinessValueSummary widget

prisma/
  schema.prisma                      7 new models (see Data Model above)
```

---

## Configuration

No additional configuration is required. The Business Value Engine uses the same
model serving endpoints as the rest of the pipeline:

- `serving-endpoint-fast` for all 4 LLM passes (falls back to premium if unset)
- All passes use `temperature: 0.2` except Executive Synthesis (`0.4`)
- Batch size: 25 use cases per LLM request (financial quantification and roadmap)

The engine runs automatically when a pipeline completes scoring. It can be
skipped if no use cases are generated (early exit with log message).
