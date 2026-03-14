# Release Notes -- 2026-03-14

**Databricks Forge v0.34.2**

---

## Bug Fixes

- **Lakebase scale-to-zero provisioning** -- Split the combined `no_suspension` + `suspend_timeout_duration` PATCH into two sequential API calls. The Lakebase API requires these fields to be updated independently; the combined update_mask was silently ignored, leaving the timeout at the API default (300s) regardless of the configured value. Now the first call disables suspension, the second sets the custom timeout, with graceful fallback if the timeout call fails.

---

## Commits (1)

| Hash | Summary |
|---|---|
| (pending) | fix: split Lakebase scale-to-zero into two PATCH calls for reliable timeout |

**Uncommitted changes:** `lib/lakebase/provision.ts`, `scripts/provision-lakebase.mjs`, `package.json`
