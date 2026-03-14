# Release Notes -- 2026-03-14

**Databricks Forge v0.36.0**

---

## New Features

### Build Mode Selector

A new shared `BuildModeSelector` component gives users an explicit choice between **Full Engine** (recommended) and **Quick Build** before generating a Genie Space. This replaces the previous behavior where Ask Forge auto-started a fast build and Schema Scan / Upload Requirements pages only offered the full engine.

The selector is now available in all three creation entry points:
- **Ask Forge** (GenieBuilderModal) -- shows a choice screen before building
- **Scan Schema** page -- replaces the single "Generate" button
- **Upload Requirements** page -- replaces the single "Generate" button

Full Engine is highlighted as the recommended default.

---

## Improvements

### Instant space visibility after deployment

Deployed Genie Spaces now appear immediately in the Genie Studio listing without requiring a manual "Sync Spaces". The deploy flow writes the new space to `ForgeGenieSpaceCache` alongside the existing `ForgeGenieSpace` tracking entry.

### Build progress tiles for all build modes

Synchronous fast builds now create an in-memory server-side job, so a progress tile with a progress bar appears on the Genie Studio page while the build runs. Previously, fast builds from Ask Forge were invisible to Genie Studio.

### Accurate card titles after generation

Generate job tiles now show the actual space name from the recommendation instead of the generic "Genie Space Ready" fallback. Title and domain are backfilled from the recommendation on both synchronous and asynchronous completion paths.

### Deploy status propagation

After deploying from the build page or Ask Forge modal, the generate job tile badge correctly updates from "Ready" to "Deployed". Both the build page and GenieBuilderModal now PATCH the generate job with the deployed space ID.

---

## Bug Fixes

- **Card shows "Genie Space Ready" instead of space name** -- Title and domain are now backfilled from the recommendation when the generate job completes.
- **Card stays "Ready" after deployment** -- Both the build page and GenieBuilderModal now mark the generate job as deployed via PATCH.
- **Deployed space invisible until sync** -- `upsertCachedSpaces` is called in `runDeploy()` after `trackGenieSpaceCreated()`.
- **Unused `Zap` imports** -- Removed from Schema Scan and Upload Requirements pages after replacing buttons with `BuildModeSelector`.

---

## Commits (1)

| Hash | Summary |
|---|---|
| *(pending)* | feat: build mode selector + fix Genie Studio card visibility/title/deploy status |

**Uncommitted changes:** `app/api/genie-spaces/generate/route.ts`, `app/api/genie-spaces/route.ts`, `app/genie/build/[jobId]/page.tsx`, `app/genie/create/requirements/page.tsx`, `app/genie/create/schema/page.tsx`, `components/assistant/genie-builder-modal.tsx`, `components/genie/build-mode-selector.tsx` (new), `package.json`.
