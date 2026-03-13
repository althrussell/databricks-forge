# Release Notes -- 2026-03-13

**Databricks Forge v0.29.0**

---

## New Features

### Async Fire-and-Forget Genie Space Builds from Ask Forge
Ask Forge Genie Space creation is now fully asynchronous, eliminating SSE/upstream request timeouts. When a user triggers "Create Genie Space" from Ask Forge, the build starts in the background and the user can continue their conversation immediately. A persistent progress toast in the bottom-right shows real-time build status with cancel, retry, and deploy actions. Completed builds can be deployed directly from the toast or from Genie Studio.

### Build Progress Toast with Cancel Support
A new persistent `sonner` toast component tracks Genie Space builds across the application. The toast displays a progress bar, current step message, and percentage. Users can cancel running builds at any time. On completion, the toast transitions to a deploy-ready state with one-click deployment or a link to Genie Studio.

### Genie Deploy Dialog
A lightweight deploy dialog extracted from the original GenieBuilderModal provides quality gate enforcement, metric view schema selection, and a streamlined deploy flow. Reuses shared deploy logic for consistent behavior across all build surfaces.

### Source Badges on Genie Studio Job Tiles
Build jobs in Genie Studio now display their origin (Ask Forge, Schema Scan, or Requirements) as a compact badge. Completed jobs also show whether they have been deployed, and conversation context is displayed when available.

### Build-in-Progress Sidebar Indicator
The Genie Studio navigation item shows a pulsing violet dot when any Genie Space build is actively running, giving users visibility across the entire application.

### Page Refresh Resilience
Active build job IDs are persisted in localStorage. When the page reloads, the layout-level provider restores progress toasts for any still-running or completed-but-undeployed builds.

---

## Improvements

### AbortSignal Threading in Fast Genie Engine
`runFastGenieEngine` now correctly destructures and threads `AbortSignal` through all four async LLM calls (expressions, instructions, example queries, title generation) with step-boundary abort checks. This fixes a bug where cancelling a fast build had no effect.

### Shared Deploy Utilities
Deploy logic (API call, polling, quality gate, metric view payload, embeddings backfill) has been extracted into `lib/genie/deploy-utils.ts` with both a pure function (`deployGenieSpace`) and a React hook (`useGenieDeploy`). The `PATCH /api/genie-spaces/generate` endpoint allows writing `deployedSpaceId` back to the job store for cross-surface coordination.

### Unified Build Job Provider
A new `GenieBuildProvider` React context replaces local polling in the Genie Studio page with a shared `useGenieBuildJobs` hook. This eliminates duplicate polling and provides consistent job state across Ask Forge, Genie Studio, and the sidebar nav.

### Progress Callbacks in Fast Engine
`runFastGenieEngine` now reports progress via `onProgress` callbacks at each step (metadata scraping, expression generation, instruction generation, query generation, assembly, quality checks), enabling real-time progress feedback in the async toast.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `f4be01c` | feat: async fire-and-forget Genie Space builds from Ask Forge |

**Uncommitted changes:** Version bump to 0.29.0 and release notes.
