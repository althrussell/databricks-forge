# AI Guardrails

- Never send actual row data to Model Serving -- only metadata (table/column names, schemas).
- All prompt templates live in /lib/ai/templates.ts -- never inline prompts in components or routes.
- Prompts must include:
  - business context (goals, priorities, value chain)
  - metadata scope (which catalogs/schemas/tables are in scope)
  - output format spec (JSON schema)
  - honesty scoring instruction (where applicable)
- Use `responseFormat: "json_object"` for all structured LLM outputs.
- Parse and validate all LLM responses before use:
  - JSON responses: validate against expected schema, extract honesty score
  - Use Zod schemas for validation, drop malformed items gracefully
- Require defensive defaults when Model Serving calls fail (e.g. default scores, generic domains).
- Log all LLM calls with prompt key, input size, response size, and token usage for observability.
- Respect token limits: use get_safe_context_limit logic to truncate schema markdown when needed.
