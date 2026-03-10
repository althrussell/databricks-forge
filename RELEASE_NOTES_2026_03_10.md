# Release Notes -- 2026-03-10

**Databricks Forge AI v0.21.0**

---

## New Features

### Business Value Drill-Down Components
Portfolio, Roadmap, and Stakeholder Intelligence pages now feature interactive drill-down sections that let executives explore use cases grouped by domain or phase without navigating away to individual runs. Expandable accordion cards with animated chevrons reveal detailed tables of use cases including scores, feasibility, effort, and estimated value.

### Redesigned Executive Dashboard Surfaces
All Business Value pages (Portfolio, Roadmap, Stakeholders, Value Tracking) have been redesigned with a consistent KPI card system featuring colored accent bars, hover shadow effects, tabular number alignment, and icon-labelled metrics for a polished executive experience.

---

## Improvements

### Pipeline Progress Granularity
Business Value Analysis (step 8) now reports granular progress updates for each of its four sub-steps (financial quantification, roadmap phasing, executive synthesis, stakeholder analysis) and per-batch progress during financial quantification, preventing the UI from appearing stuck at 86%.

### Stakeholder Value Computation
Stakeholder profiles now correctly compute total estimated value by cross-referencing use case IDs from the LLM response with value estimates, resolving the previous $0 display issue.

### Sidebar Navigation Reorganization
Outcome Maps moved under Business Value. Genie Spaces moved under Explore (after Runs). Benchmarks moved to bottom of Business Value. Deploy section removed.

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

---

## Commits (2)

| Hash | Summary |
|---|---|
| `49e1e99` | Fix BV pipeline progress, exec synthesis crash, and enhance Business Value UX |
| `800f933` | Merge pull request #94 from althrussell/fix/sql-gen-prompt-logs |

**Uncommitted changes:** Version bump to 0.21.0 in package.json, updated release notes.
