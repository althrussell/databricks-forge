# Testing Rules

- Add unit tests for:
  - prompt template building (snapshot tests in __tests__/ai/)
  - use case scoring logic (__tests__/domain/scoring.test.ts)
  - SQL query mappers -- row-to-type functions (__tests__/queries/)
- Add integration test stubs for:
  - each pipeline step (mock ai_query responses, verify output shape)
  - pipeline engine (mock steps, verify progress updates)
- CI should run lint + typecheck + tests.
- Use deterministic test data -- never call real Databricks APIs in tests.
