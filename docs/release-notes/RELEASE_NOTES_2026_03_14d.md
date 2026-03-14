# Release Notes -- 2026-03-14

**Databricks Forge v0.34.0**

---

## New Features

### Mining & Resources Industry Outcome Map
Added a dedicated industry outcome map for **Mining & Resources**, covering the strategic priorities of major miners such as BHP Group, Rio Tinto, Fortescue, and South32.

- **Base outcome map** (`mining.ts`) with 6 strategic objectives, 10 priorities, and 30 reference use cases spanning mine operations, safety, logistics, ESG, exploration, and business functions.
- **Enrichment data** (`mining.enrichment.ts`) with 30 benchmarked use cases (KPI targets, benchmark impacts, model types, data asset criticality mappings) and 30 Reference Data Assets covering the full mining value chain.
- **Sub-verticals**: Iron Ore, Coal, Copper & Base Metals, Gold & Precious Metals, Lithium & Battery Minerals, Alumina & Aluminium, Nickel & Cobalt, Manganese & Alloys.
- **Industry aliases** updated so "mining", "metals and mining", "iron ore", "base metals", "precious metals", "battery minerals", etc. now resolve to the dedicated mining outcome map instead of falling back to Energy & Utilities.
- "Mining" removed from Energy & Utilities sub-verticals to avoid overlap.

---

## Commits (1)

| Hash | Summary |
|---|---|
| *(pending)* | feat: add Mining & Resources industry outcome map with enrichment |

**Uncommitted changes:** `package.json` (version bump), `mining.ts`, `mining.enrichment.ts`, `index.ts`, `master-repo-registry.ts`, `industry-outcomes-server.ts`, `energy-utilities.ts`.
