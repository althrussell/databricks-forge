# Release Notes -- 2026-03-10

**Databricks Forge AI v0.19.0**

---

## New Features

### Score Insights -- Rationale and Sub-Factor Breakdowns

Users previously saw opaque score percentages (e.g. "66% Feasibility") with no explanation of how they were derived. The LLM was already reasoning through detailed sub-factors internally but was instructed to discard that reasoning. This release surfaces it.

**LLM-Generated Rationale:**
- Each score dimension (Priority, Feasibility, Impact) now includes a brief natural-language rationale explaining the key drivers behind the score.
- Priority scores include 4 sub-factor scores: ROI, Strategic Alignment, Time to Value, and Reusability (with weights).
- Feasibility scores include 8 sub-factor scores: Data Availability, Data Accessibility, Architecture Fitness, Team Skills, Domain Knowledge, People Allocation, Budget Allocation, and Time to Production.

**Consulting Quality Signals:**
- The deterministic consulting scorecard (Strategic Alignment, Measurable Value, Implementation Feasibility, Evidence Strength, Novelty, Boardroom Defensibility) is now persisted and surfaced in the UI.

**UI:**
- New "Score Insights" panel in the use case detail sheet with expandable per-dimension sections showing rationale text and horizontal factor-score bars (green/amber/red by tier).

**Exports:**
- Excel, CSV, PDF, and PPTX exports now include score rationale text so insights travel with the deliverable.

**Backward Compatible:**
- Both new database columns are nullable; existing use cases display as they do today (no insights section when rationale is absent). Runs created before this version are unaffected.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `3d78b58` | Add score insights: surface rationale and sub-factor breakdowns behind use case scores |

**Uncommitted changes:** Version bump to 0.19.0, this release notes file.
