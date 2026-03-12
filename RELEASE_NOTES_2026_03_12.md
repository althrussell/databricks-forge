# Release Notes -- 2026-03-12

**Databricks Forge v0.25.0**

---

## New Features

### Genie Studio
Genie Spaces page transformed into a unified **Genie Studio** hub with 4 entry point cards for creating, managing, and improving Genie Spaces. Promoted to its own top-level sidebar navigation section.

### Scan Schema -- Create from Schema
New wizard (`/genie/create/schema`) scans a Unity Catalog schema, profiles key columns (cardinality, date ranges), uses AI to select the most analytically valuable tables, and generates a Genie Space via the ad-hoc engine. Includes step indicator, select-all/clear controls, and AI-detected business context display.

### Upload Requirements -- Create from Requirements
New wizard (`/genie/create/requirements`) parses uploaded PDF, Markdown, or plain text documents. LLM extracts tables, business questions, SQL examples, instructions, join hints, glossary terms, and domain context. Supports drag-and-drop with visual feedback, text paste, and confidence scoring.

### Result-Based Benchmark Scoring
Benchmark runner upgraded from Jaccard SQL text similarity to a 3-tier comparison:
1. SQL similarity fast-pass (>95% = pass immediately)
2. Execute both expected and actual SQL, compare result sets
3. LLM judge for semantic equivalence when results differ

Each failure is categorized: `wrong_join`, `wrong_filter`, `wrong_aggregation`, `wrong_column`, `missing_data`, `wrong_sort`, `extra_data`, `timeout`, `execution_error`.

### Auto-Improve Loop
New iterative engine (`lib/genie/auto-improve.ts`) runs benchmarks, maps failure categories to targeted fix strategies, applies fixes via the space fixer, and re-benchmarks -- repeating until a target score is reached, max iterations are exhausted, or improvement stagnates. Progress callback for real-time UI updates.

---

## Improvements

### Parallel Semantic Expression Generation
Single LLM call split into 3 parallel workers:
- **Worker A**: Foundation aggregate measures (SUM, COUNT, AVG per column)
- **Worker B**: Ratio and derived KPI measures (revenue per customer, conversion rates)
- **Worker C**: Filters and dimensions (WHERE conditions, GROUP BY expressions)

Results are merged and deduplicated, producing richer and more diverse measures.

### Instruction Quality Evaluator
New `instruction_quality` evaluator added to the health check system. Scores instructions on three axes: specificity (40 pts -- table/column references, SQL keywords), structure (30 pts -- headers, lists, formatting), and clarity (30 pts -- absence of vague terms, action verbs). Includes actionable improvement suggestions.

### Failure-Category-Aware Fix Routing
Benchmark feedback analysis upgraded with a two-tier strategy: failure categories from result-based scoring map directly to fix strategies (precise), with fallback to text-pattern heuristics. New `summarizeFailureCategories()` utility for human-readable failure summaries.

### Smart Improve Existing Card
The "Improve Existing" entry card in Genie Studio now shows dynamic descriptions based on available space count, disables gracefully when no spaces exist, and navigates to the space with the lowest health grade for maximum impact.

---

## Other Changes

- Added `validateIdentifier()` SQL injection protection to scan-schema API route
- Added activity logging (`logActivity()`) to all 3 new API routes with 4 new `ActivityAction` types: `scanned_schema`, `parsed_requirements`, `started_auto_improve`, `completed_auto_improve`
- Step indicator component on both wizard pages for guided UX
- Drag-over visual highlight on requirements file upload drop zone
- 22 new unit tests (805 total): failure category mapping, instruction quality scoring, summarization

---

## Commits (2)

| Hash | Summary |
|---|---|
| `132d494` | feat: Genie Studio -- unified hub for creating, managing, and improving Genie Spaces |
| `43aa0ef` | Merge pull request #123 from althrussell/feat/genie-studio |

**Uncommitted changes:** package.json version bump to 0.25.0, RELEASE_NOTES_2026_03_12.md update.
