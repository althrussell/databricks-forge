# Release Notes -- 2026-03-12

**Databricks Forge AI v0.24.0**

---

## New Features

### Unity Catalog Browser: Include/Exclude Scope Selection
The shared CatalogBrowser component now supports **exclusions** alongside inclusions. Users can include broad scope (entire catalogs or schemas) and then carve out specific items they don't want to scan, generate comments for, or discover use cases from.

- **Tree-based exclusion**: hover over any implicitly-included schema or table to reveal an "Exclude" button. Excluded items show with strikethrough styling and a red icon, with a one-click "Restore" action.
- **Wildcard pattern exclusion**: a new pattern input field allows glob-style exclusions (e.g. `stg_*`, `*_backup`, `__databricks*`). Patterns match at every level -- catalog, schema, and table names. Each pattern appears as a removable pill with a best-effort match count from loaded tree data.
- **Scope Summary panel**: a clear two-section summary below the tree shows green "Included" pills and red "Excluded" pills (both explicit and pattern-based), each removable with one click.

### Shared Scope Selection Module (`lib/domain/scope-selection.ts`)
New pure-logic module with zero framework dependencies, reusable across frontend and backend:
- `ScopeSelection` type (includes, excludes, exclusionPatterns)
- Glob pattern matching (`globMatch`, `globToRegex`, `matchesAnyPattern`)
- Exclusion resolution (`isExcluded`, `isCoveredByExclusion`)
- Serialization helpers for all persistence formats
- Pattern validation (`validateExclusionPattern`)

---

## Improvements

### Backend Exclusion Filtering
All three metadata pipelines now apply exclusion filtering after table discovery:
- **Metadata Fetcher** (`lib/metadata/fetcher.ts`): explicit schema/table exclusions + glob pattern matching
- **Pipeline Metadata Extraction** (`lib/pipeline/steps/metadata-extraction.ts`): exclusion filtering with progress reporting
- **Standalone Scan** (`lib/pipeline/standalone-scan.ts`): exclusion filtering with progress reporting

Column data is also filtered to match excluded tables, preventing orphan column processing.

### Persistence and API Support
- `ForgeRun` and `ForgeEnvironmentScan` Prisma models gain `excluded_scope` and `exclusion_patterns` columns
- `ForgeCommentJob.scopeJson` extended with `excludedSchemas`, `excludedTables`, `exclusionPatterns`
- All four scope-accepting API routes updated: `POST /api/runs`, `POST /api/environment-scan`, `POST /api/environment/comments`, `POST /api/environment/comments/generate`
- `PipelineRunConfig` type extended with `excludedScope` and `exclusionPatterns` fields
- `MetadataScope` type extended with `excludedSchemas`, `excludedTables`, `exclusionPatterns`

### All Consumers Updated
All 8 CatalogBrowser consumers updated for the new callback signature. The three primary entry points (Discovery Runs, Comment Runs, Estate Scans) fully wire exclusion state through to their respective APIs. The five schema-mode consumers (Genie deploy, metric view deploy, etc.) accept the new signature with no behavioral change.

---

## Other Changes

- Zod validation schema `CreateRunSchema` extended with optional `excludedScope` and `exclusionPatterns` fields
- Comment Engine (`lib/ai/comment-generator.ts`) `GenerateCommentsInput` extended to pass exclusions through to `runCommentEngine`
- 23 files changed, ~700 insertions
- Zero typecheck errors, zero lint errors

---

## Commits (1)

| Hash | Summary |
|---|---|
| `124a717` | Add include/exclude scope selection with wildcard patterns to CatalogBrowser |

**Uncommitted changes:** None expected after commit.
