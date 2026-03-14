# Release Notes -- 2026-03-14

**Databricks Forge v0.35.0**

---

## New Features

### Auto-Launch Discovery After Demo Data Generation
The Demo Data Wizard now automatically creates and executes a Discovery Pipeline with Environment Scan enabled as soon as data generation completes. Users no longer need to manually click separate "Launch Discovery" and "Run Estate Scan" buttons -- the wizard handles it in one seamless flow, redirecting directly to the run page. A manual fallback button appears if auto-launch fails.

### Strategic Persona Questions in Ask Forge
The Strategic (C-level) persona in Ask Forge now generates context-aware executive questions: total business value, ROI prioritisation, board-level summaries, strategic alignment gaps, and transformation roadmaps. Previously the strategic persona fell through to the analyst branch, producing data-quality and PII questions instead of executive insights.

---

## Improvements

### Shared Strategic Fallback Questions
Moved `FALLBACK_QUESTIONS_STRATEGIC` from the client-side component to the shared `suggested-question-defaults.ts` module so both server-side dynamic question generation and client-side fallbacks use the same set of C-level questions.

### Wizard Step Labels
Updated the final wizard step label from "Done" to "Launch" and the description to "Launching discovery pipeline..." to reflect the new auto-launch behaviour.

---

## Commits (1)

| Hash | Summary |
|---|---|
| *(pending)* | feat: auto-launch discovery after demo generation + fix strategic persona questions |

**Uncommitted changes:** `components/demo/steps/complete-step.tsx` (auto-launch logic), `components/demo/demo-wizard.tsx` (label updates), `lib/assistant/suggested-questions.ts` (strategic branch), `lib/assistant/suggested-question-defaults.ts` (shared fallbacks), `components/assistant/ask-forge-chat.tsx` (import cleanup), `package.json` (version bump).
