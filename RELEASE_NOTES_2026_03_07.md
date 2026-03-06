# Release Notes -- 2026-03-07

**Databricks Forge AI v0.12.2**

---

## Improvements

### LLM 429 Rate-Limit Endpoint Fallback

When the primary Model Serving endpoint exhausts its 429 retry budget, the app now automatically falls back to the review endpoint instead of failing. This applies to Genie Engine LLM cache calls and both streaming and non-streaming pipeline agent calls. A centralized `getFallbackEndpoint()` helper resolves the alternate endpoint while avoiding self-fallback loops.

### Metric Views Tab Width Fix

The Metric Views tab no longer breaks the app layout when YAML contains long fully-qualified table names. Added `min-w-0` and `overflow-hidden` constraints through the flex ancestor chain, plus `break-words` on `<pre>` elements and FQN badges.

### YAML Copy Buttons on Metric Views

Every YAML preview and DDL code block in the Metric Views tab now has a hover-to-reveal "Copy" button using `navigator.clipboard`, with a 2-second "Copied" confirmation state.

### Dedicated Outcome Map Tab

Industry Outcome Map coverage analysis has been promoted from a buried collapsible section inside the Overview tab to a dedicated top-level "Outcome Map" tab. The new tab features:

- **Hero section** with an SVG coverage ring, industry name, and matched/gap badges
- **Opportunity Insight banner** highlighting the business value of uncovered gaps
- **Overall Alignment card** with a progress bar and headline stats
- **Strategic Objectives** collapsible cards with per-priority coverage breakdowns, matched use cases, gap details (including business value, data entities, and source systems)
- **Data Gap Analysis card** with top data entities and source systems to onboard, each with popover drill-through showing which reference use cases they unlock

The summary Coverage card now navigates directly to the Outcome Map tab when an industry is configured.

---

## Commits (2)

| Hash | Summary |
|---|---|
| `3dd4ce5` | Add 429 rate-limit endpoint fallback to review model |
| `2935f50` | UX fixes: contain metric views width, add YAML copy buttons, promote outcome map to dedicated tab |

**Uncommitted changes:** None.
