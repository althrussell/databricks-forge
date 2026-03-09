# Release Notes -- 2026-03-09

**Databricks Forge AI v0.18.0**

---

## Improvements

### Parallelized pipeline steps for faster execution
Domain-clustering (Step 5) and scoring/dedup (Step 6) now process domains in parallel with bounded concurrency, and LLM batches within each step run concurrently via `Promise.all`. Metadata extraction (Step 2) runs all per-scope queries in parallel. Expected 3-5x speedup on steps 2, 5, and 6.

### Genie Engine pass reordering and concurrency
Metric view proposals now run in parallel with Phase 3 passes (trusted assets, instructions, benchmarks) instead of sequentially before them. Genie LLM concurrency default raised from 3 to 6. Metric view SQL reviews now run in parallel.

### Run-level sample data cache
SQL generation (Step 7) now caches sample data per table FQN across use cases within a run, eliminating 50-80% of redundant warehouse queries when multiple use cases share tables.

### Parallelized embedding batches
Embedding generation now runs up to 3 batches concurrently with increased batch size (32, up from 16), reducing embedding phase latency by 2-3x.

### SQL reviewer LLM cache for Genie surfaces
SQL review calls for `genie-*` surfaces are now routed through the Genie LLM cache, avoiding redundant model serving calls when re-reviewing identical SQL across iterative fix cycles.

### Buffered prompt log inserts
Prompt log entries are now buffered in memory and flushed via `createMany` every 20 entries or 2 seconds, reducing DB round-trips from 100+ individual inserts to a handful of batched writes per pipeline run.

### Progress update throttling
`updateRunMessage` calls are now debounced to at most one write per 500ms, reducing rapid DB writes during fast pipeline phases.

### Reduced SQL generation wave delay
Default `SQL_GEN_WAVE_DELAY_MS` reduced from 2000ms to 500ms. The global LLM semaphore already provides rate-limit protection.

### Frontend polling backoff
All status polling (run progress, Genie generation, dashboard generation) now uses progressive backoff (starting at 2s, scaling to 8-10s) instead of fixed intervals, reducing unnecessary requests on long-running operations.

### Cache-Control headers on read-heavy API routes
Added `s-maxage` + `stale-while-revalidate` headers to environment/table, table-coverage, outcome-maps, genie-spaces, and aggregate ERD endpoints.

### Lazy-loaded CodeMirror editor
The SQL editor component is now dynamically imported with `ssr: false`, removing ~200KB from the initial Ask Forge bundle.

### Batched N+1 update in enrich-pbi
Individual `prisma.update` calls in the Power BI enrichment loop replaced with a single `prisma.$transaction` batch.

### Deduplicated aggregate estate view queries
Added a 30-second in-memory TTL cache for `getAggregateEstateView()`, preventing duplicate DB queries when the environment page loads both aggregate and ERD endpoints simultaneously.

---

## Other Changes
- Fixed misleading concurrency comment in `agent.ts` (said "default: 4", actual default is 64)

---

## Commits (1)

| Hash | Summary |
|---|---|
| `307032e` | Improve pipeline and engine performance across 17 areas |

**Uncommitted changes:** None.
