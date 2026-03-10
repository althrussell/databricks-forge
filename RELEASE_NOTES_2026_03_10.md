# Release Notes -- 2026-03-10

**Databricks Forge AI v0.20.0**

---

## New Features

### Business Value Engine

A new post-pipeline intelligence layer that transforms discovered use cases into financially-grounded, boardroom-ready deliverables. Pipeline Step 8 runs four LLM passes automatically after scoring completes.

**Financial Quantification:**
- Per-use-case dollar-range estimates (low / mid / high) across four value types: cost savings, revenue uplift, risk reduction, and efficiency gain.
- Calibrated against industry benchmarks with confidence ratings and documented assumptions.
- Batched processing (25 use cases per LLM request) for token efficiency.

**Roadmap Phasing:**
- Automatic assignment to Quick Wins (0-3 months), Foundation (3-9 months), or Transformation (9-18 months) phases.
- Includes effort estimates (XS-XL), dependency chains between use cases, and enabler descriptions.

**Executive Synthesis:**
- Board-ready briefing with 3-5 key findings, 3-5 strategic recommendations, and 2-3 risk callouts.
- Specific to the customer's business context -- not generic advice.

**Stakeholder Analysis:**
- Maps use case beneficiaries and sponsors into structured role/department profiles.
- Identifies champions and sponsors, assesses change complexity per stakeholder.

### Business Value UI (5 new pages)

- **Portfolio Overview** (`/business-value`) -- value hero cards, key findings, strategic themes, phase distribution, and domain heatmap.
- **Implementation Roadmap** (`/business-value/roadmap`) -- phase summary cards with delivery timeline bar chart.
- **Strategy Alignment** (`/business-value/strategy`) -- upload strategy documents, LLM-parsed initiatives, gap analysis (supported / partial / blocked).
- **Stakeholder Intelligence** (`/business-value/stakeholders`) -- champion cards, department summary, full stakeholder table with change complexity badges.
- **Value Tracking** (`/business-value/tracking`) -- lifecycle tracking from discovered → planned → in progress → delivered → measured, with inline stage updates.

---

## Improvements

### Dashboard Integration
- New Business Value Summary widget on the main dashboard showing Total Estimated Value and Implementation Progress, linking to the dedicated pages.

### Run Detail Enhancement
- New "Business Value" tab on the run detail page displaying per-run value summary, executive synthesis, value by category, and roadmap phase distribution.

### Ask Forge Strategic Intelligence
- New `strategic` intent classification for questions about ROI, business cases, stakeholder impact, and executive summaries.
- New `strategic` persona overlay tuned for CDO/CFO/Board-level audience with consulting language and financial framing.
- Five new action cards: View Portfolio, Generate Business Case, View Stakeholders, View Roadmap, Draft Executive Memo.

### Enhanced Exports
- Excel exports now include a "Business Value" sheet with financial estimates, an "Executive Synthesis" section, and a "Stakeholders" sheet when data is available.

### Sidebar Navigation
- New "Business Value" section in the sidebar with five navigation items (Portfolio, Roadmap, Strategy, Stakeholders, Value Tracking).

---

## Other Changes

- Added 7 new Lakebase tables (`forge_value_estimates`, `forge_roadmap_phases`, `forge_use_case_tracking`, `forge_value_captures`, `forge_strategy_documents`, `forge_strategy_alignments`, `forge_stakeholder_profiles`) with cascade deletes from `ForgeRun`.
- Added `synthesisJson` field to `ForgeRun` for executive synthesis persistence.
- Added `formatCurrency` utility function for consistent K/M/B currency formatting.
- New comprehensive documentation at `docs/BUSINESS_VALUE.md`.
- All new pages use `PageHeader` component and established styling patterns (`mx-auto max-w-[1400px]`, `rounded-xl` skeletons, `font-semibold` section headings).

---

## Commits (1)

| Hash | Summary |
|---|---|
| `dac3937` | Add Business Value Engine: financial quantification, roadmap phasing, executive synthesis, and stakeholder analysis |

**Uncommitted changes:** Version bump to 0.20.0, this release notes file.
