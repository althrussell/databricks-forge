# Release Notes -- 2026-03-07

**Databricks Forge AI v0.14.1**

---

## Bug Fixes

- **False validation on nested join parent-chain references** -- `validateColumnReferences()` now walks the full join tree so parent-chain refs like `member.employer_dim.industry` (and deeper chains like `customer.nation.region.r_name`) no longer produce false "column not found" errors.

- **Dry-run validation deploying metric views** -- The "dry-run" SQL validation was executing `CREATE OR REPLACE VIEW` DDL, which silently deployed metric views into the user's schema. Now creates a temporary `__forge_validate_` view and drops it in a `finally` block so no artifacts remain.

- **Dimension name vs join alias collision** -- Added `autoRenameShadowedDimensions()` pass and validation check to detect and fix dimension names that shadow join aliases (e.g. dimension `claim_type` colliding with join alias `claim_type`), which causes `INVALID_EXTRACT_BASE_FIELD_TYPE`. Three-layer defence: LLM prompt guidance, programmatic auto-rename, and validation error detection.

---

## Improvements

### Metric view repair route hardened
- Repair route now runs `autoRenameShadowedDimensions` in both pre-LLM and post-LLM repair passes.
- `COLUMN_ERROR_PATTERNS` expanded with `INVALID_EXTRACT_BASE_FIELD_TYPE` and `shadows join alias` so the repair loop triggers for these error classes.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `497acd3` | Fix metric view validation bugs: parent-chain refs, dry-run deploy, dimension-join collisions |

**Uncommitted changes:** version bump + release notes (this file).
