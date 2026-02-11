# AI Guardrails

- Never send actual row data to ai_query -- only metadata (table/column names, schemas).
- All prompt templates live in /lib/ai/templates.ts -- never inline prompts in components or routes.
- Prompts must include:
  - business context (goals, priorities, value chain)
  - metadata scope (which catalogs/schemas/tables are in scope)
  - output format spec (CSV columns or JSON schema)
  - honesty scoring instruction (where applicable)
- Parse and validate all LLM responses before use:
  - CSV responses: validate column count, handle malformed rows
  - JSON responses: validate against expected schema, extract honesty score
- Require defensive defaults when ai_query fails (e.g. default scores, generic domains).
- Log all ai_query calls with prompt key, input size, and response size for observability.
- Respect token limits: use get_safe_context_limit logic to truncate schema markdown when needed.
