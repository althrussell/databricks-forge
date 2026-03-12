# Release Notes -- 2026-03-12

**Databricks Forge v0.27.1**

---

## Improvements

### Inaccessible Genie Spaces Separated Into "No Access" Tab
Genie Spaces that return 403 PERMISSION_DENIED (e.g. user lacks access to underlying tables) are no longer shown in the Active tab with missing metadata. They now appear in a dedicated "No Access" tab with an amber warning banner and guidance to request permissions from a workspace admin. The Improve Existing page also filters out inaccessible spaces so they cannot be selected for auto-improvement. The space detail API now returns HTTP 403 (instead of 500) for permission errors, providing clearer error semantics.

---

## Commits (1)

| Hash | Summary |
|---|---|
| `9541bb1` | feat: filter inaccessible Genie spaces into separate "No Access" tab |

**Uncommitted changes:** Version bump to 0.27.1, release notes update.
