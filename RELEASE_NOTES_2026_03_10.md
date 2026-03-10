# Release Notes -- 2026-03-10

**Databricks Forge AI v0.21.0**

---

## New Features

### Portfolio Export Infrastructure
Four new export formats available from a dropdown on the Business Value Portfolio page:
- **Portfolio Excel** -- 8-sheet workbook with Executive Summary, Key Findings, Recommendations, Risk Callouts, Domain Performance, Delivery Pipeline, Use Cases (with cost modeling and ROI columns), and Stakeholders.
- **Portfolio PPTX** -- 8-slide Databricks-branded deck with KPI boxes, findings, recommendations, risks, pipeline, domains, and stakeholders.
- **Executive PDF Brief** -- 2-page one-pager for senior stakeholders with value summary, key findings, recommendations, domain heatmap, and risk callouts.
- **D4B Workshop Pack PPTX** -- 5-section deck for Databricks-for-Business workshop facilitation: Case for Change (D4B statistics), Executive Findings, Delivery Roadmap with quick wins, Recommended Genie Spaces, and Workshop Agenda.

### Run PPTX Synthesis Slides
Per-run PPTX exports now include Key Findings, Strategic Recommendations, Risk Callouts, and Value Summary slides when Business Value data is available. Fully backward-compatible -- runs without BV data continue to export as before.

### Use Case Voting
Workshop-style voting/prioritisation on use cases via compact vote buttons in the Portfolio Drill-Down table. Votes are stored in the existing `notes` JSON column (no schema changes). Vote counts appear inline and toggle on/off per user.

### Value Capture Form
New Value Capture dialog component for recording actual delivered value against use cases, with value type selection, dollar amount, and evidence fields.

### Portfolio Velocity Metrics
Conversion funnel on the Portfolio page showing discovery-to-delivery pipeline (Discovered → Planned → In Progress → Delivered → Measured), conversion rate percentage, realization rate (delivered vs estimated), and in-pipeline count.

### Implementation Cost Modeling
New `lib/domain/cost-modeling.ts` module providing T-shirt sizing to dollar estimate conversion, net ROI calculations, and payback period estimates. Integrated into Portfolio Excel export.

### D4B Industry Benchmarks
Financial quantification prompts now include Databricks-for-Business industry benchmarks: ad-hoc report costs ($1,200--$3,500), analyst time savings (3--7 days), BI consolidation savings (15--30%), data quality automation (40--60% error reduction), and governance audit reduction (50--70%).

### Business Value Drill-Down Components
Portfolio, Roadmap, and Stakeholder Intelligence pages now feature interactive drill-down sections that let executives explore use cases grouped by domain or phase without navigating away to individual runs. Expandable accordion cards with animated chevrons reveal detailed tables of use cases including scores, feasibility, effort, and estimated value.

### Redesigned Executive Dashboard Surfaces
All Business Value pages (Portfolio, Roadmap, Stakeholders, Value Tracking) have been redesigned with a consistent KPI card system featuring colored accent bars, hover shadow effects, tabular number alignment, and icon-labelled metrics for a polished executive experience.

---

## Improvements

### Tracking Page Enhancements
- Inline owner editing (click to edit, Enter to save)
- Stalled indicators with amber highlighting for use cases unchanged for 14+ days
- Status column showing days since last update with "Today" / "Stalled" labels
- Stalled alert banner with count and unblock guidance

### Shared Export Branding
New `lib/export/brand.ts` module centralises Databricks brand constants for all export formats (ARGB for Excel, hex for PPTX, hex-with-hash for PDF). Shared `excel-helpers.ts` and `pptx-helpers.ts` extract duplicated styling utilities.

### Pipeline Progress Granularity
Business Value Analysis (step 8) now reports granular progress updates for each of its four sub-steps (financial quantification, roadmap phasing, executive synthesis, stakeholder analysis) and per-batch progress during financial quantification, preventing the UI from appearing stuck at 86%.

### Stakeholder Value Computation
Stakeholder profiles now correctly compute total estimated value by cross-referencing use case IDs from the LLM response with value estimates, resolving the previous $0 display issue.

### Sidebar Navigation Reorganization
Outcome Maps moved under Business Value. Genie Spaces moved under Explore (after Runs). Benchmarks moved to bottom of Business Value. Deploy section removed.

### Value Capture API
Extended with GET (list all captures with use case name/domain) and DELETE endpoints alongside the existing POST.

---

## Bug Fixes
- **Executive Synthesis TypeError** -- Fixed crash caused by snake_case/camelCase mismatch when parsing LLM response; added explicit field mapping with safe defaults.
- **Sidebar Multi-Highlight** -- Parent nav items no longer stay highlighted when a child route is active; uses exact match for parent items.
- **Value Tracking timeStyle Crash** -- Changed `toLocaleDateString()` to `toLocaleString()` to support the `timeStyle` option.
- **Tailwind JIT Dynamic Classes** -- Replaced dynamically constructed class names (e.g. `bg-${color}-500/10`) with literal strings so Tailwind can detect them.

---

## Other Changes
- Removed unused imports across all modified Business Value components
- Added `tabular-nums` to all numeric columns for consistent alignment
- Consistent section heading size (`text-base`) across all Business Value pages
- Strategy page chevron animation aligned with other expandable sections
- 21 new unit tests for cost modeling and brand constants (537 total)

---

## Commits (4)

| Hash | Summary |
|---|---|
| `18a809d` | Add portfolio exports, D4B workshop pack, value tracking enhancements, and use case voting |
| `ff12a25` | Bump version to 0.21.0 and update release notes |
| `49e1e99` | Fix BV pipeline progress, exec synthesis crash, and enhance Business Value UX |
| `bee489c` | Merge pull request #95 from althrussell/fix/bv-progress-and-bugs |

**Uncommitted changes:** Updated release notes and BUSINESS_VALUE.md documentation.
