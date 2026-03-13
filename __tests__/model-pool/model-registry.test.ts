import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getModelPool,
  getEndpointsForTier,
  isMultiEndpointPool,
  resetModelPool,
  type TaskTier,
} from "@/lib/dbx/model-registry";

const mockLog = {
  info: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
  error: vi.fn(),
  child: vi.fn(),
  timed: vi.fn(),
  context: {},
};
mockLog.child.mockReturnValue(mockLog);
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
  createScopedLogger: () => mockLog,
  apiLogger: () => mockLog,
}));

const ENV_KEYS = [
  "DATABRICKS_SERVING_ENDPOINT",
  "DATABRICKS_SERVING_ENDPOINT_FAST",
  "DATABRICKS_REVIEW_ENDPOINT",
  "DATABRICKS_SERVING_ENDPOINT_REASONING_2",
  "DATABRICKS_SERVING_ENDPOINT_GENERATION",
  "DATABRICKS_SERVING_ENDPOINT_SQL",
  "DATABRICKS_ALLOWED_MODELS",
] as const;

function saveEnv(): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const k of ENV_KEYS) {
    saved[k] = process.env[k];
  }
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const k of ENV_KEYS) {
    if (saved[k] !== undefined) {
      process.env[k] = saved[k];
    } else {
      delete process.env[k];
    }
  }
}

function clearEnv(): void {
  for (const k of ENV_KEYS) {
    delete process.env[k];
  }
}

describe("model-registry", () => {
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv();
    clearEnv();
    resetModelPool();
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  describe("Default pool", () => {
    it("when no env vars set, pool has 1 endpoint (hardcoded default)", () => {
      const pool = getModelPool();
      expect(pool).toHaveLength(1);
      expect(pool[0].name).toBe("databricks-claude-opus-4-6");
    });
  });

  describe("Legacy env vars", () => {
    it("when DATABRICKS_SERVING_ENDPOINT, _FAST, _REVIEW are set, pool has up to 3 endpoints", () => {
      process.env.DATABRICKS_SERVING_ENDPOINT = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_SERVING_ENDPOINT_FAST = "databricks-claude-sonnet-4-6";
      process.env.DATABRICKS_REVIEW_ENDPOINT = "databricks-gpt-5-4";

      const pool = getModelPool();
      expect(pool.length).toBeGreaterThanOrEqual(1);
      expect(pool.length).toBeLessThanOrEqual(3);
      const names = pool.map((ep) => ep.name);
      expect(names).toContain("databricks-claude-opus-4-6");
      expect(names).toContain("databricks-claude-sonnet-4-6");
      expect(names).toContain("databricks-gpt-5-4");
    });
  });

  describe("Extended pool", () => {
    it("when _REASONING_2, _GENERATION, _SQL are also set, pool has up to 6 endpoints", () => {
      process.env.DATABRICKS_SERVING_ENDPOINT = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_SERVING_ENDPOINT_FAST = "databricks-claude-sonnet-4-6";
      process.env.DATABRICKS_REVIEW_ENDPOINT = "databricks-gpt-5-4";
      process.env.DATABRICKS_SERVING_ENDPOINT_REASONING_2 = "databricks-claude-opus-4-5";
      process.env.DATABRICKS_SERVING_ENDPOINT_GENERATION = "databricks-claude-sonnet-4-5";
      process.env.DATABRICKS_SERVING_ENDPOINT_SQL = "databricks-gpt-5-3-codex";

      const pool = getModelPool();
      expect(pool.length).toBeGreaterThanOrEqual(3);
      expect(pool.length).toBeLessThanOrEqual(6);
      const names = new Set(pool.map((ep) => ep.name));
      expect(names).toContain("databricks-claude-opus-4-6");
      expect(names).toContain("databricks-claude-sonnet-4-6");
      expect(names).toContain("databricks-gpt-5-4");
      expect(names).toContain("databricks-claude-opus-4-5");
      expect(names).toContain("databricks-claude-sonnet-4-5");
      expect(names).toContain("databricks-gpt-5-3-codex");
    });
  });

  describe("Deduplication", () => {
    it("when two env vars point to the same endpoint name, pool deduplicates", () => {
      process.env.DATABRICKS_SERVING_ENDPOINT = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_SERVING_ENDPOINT_FAST = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_REVIEW_ENDPOINT = "databricks-claude-opus-4-6";

      const pool = getModelPool();
      const opusCount = pool.filter((ep) => ep.name === "databricks-claude-opus-4-6").length;
      expect(opusCount).toBe(1);
    });
  });

  describe("Allowlist", () => {
    it("when DATABRICKS_ALLOWED_MODELS is set, only matching endpoints survive", () => {
      process.env.DATABRICKS_SERVING_ENDPOINT = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_SERVING_ENDPOINT_FAST = "databricks-claude-sonnet-4-6";
      process.env.DATABRICKS_REVIEW_ENDPOINT = "databricks-gpt-5-4";
      process.env.DATABRICKS_ALLOWED_MODELS = "databricks-claude-opus-4-6,databricks-gpt-5-4";

      const pool = getModelPool();
      const names = pool.map((ep) => ep.name);
      expect(names).toContain("databricks-claude-opus-4-6");
      expect(names).toContain("databricks-gpt-5-4");
      expect(names).not.toContain("databricks-claude-sonnet-4-6");
      expect(pool).toHaveLength(2);
    });
  });

  describe("Empty allowlist", () => {
    it("when allowlist filters everything, falls back to first configured endpoint", () => {
      process.env.DATABRICKS_SERVING_ENDPOINT = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_SERVING_ENDPOINT_FAST = "databricks-claude-sonnet-4-6";
      process.env.DATABRICKS_ALLOWED_MODELS = "nonexistent-model,other-model";

      const pool = getModelPool();
      expect(pool).toHaveLength(1);
      expect(pool[0].name).toBe("databricks-claude-opus-4-6");
    });
  });

  describe("getEndpointsForTier", () => {
    it("returns endpoints sorted by priority for a given tier", () => {
      process.env.DATABRICKS_SERVING_ENDPOINT = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_SERVING_ENDPOINT_REASONING_2 = "databricks-claude-opus-4-5";

      const reasoning = getEndpointsForTier("reasoning" as TaskTier);
      expect(reasoning.length).toBeGreaterThanOrEqual(1);
      const priorities = reasoning.map((ep) => ep.priority);
      expect(priorities).toEqual([...priorities].sort((a, b) => a - b));
    });

    it("returns only endpoints that support the tier", () => {
      process.env.DATABRICKS_SERVING_ENDPOINT = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_SERVING_ENDPOINT_FAST = "databricks-claude-sonnet-4-6";
      process.env.DATABRICKS_REVIEW_ENDPOINT = "databricks-gpt-5-3-codex";

      const sqlEndpoints = getEndpointsForTier("sql" as TaskTier);
      const names = sqlEndpoints.map((ep) => ep.name);
      expect(names).toContain("databricks-gpt-5-3-codex");
      expect(names).not.toContain("databricks-claude-opus-4-6");
      expect(names).not.toContain("databricks-claude-sonnet-4-6");
    });
  });

  describe("isMultiEndpointPool", () => {
    it("returns false when pool has 1 endpoint", () => {
      clearEnv();
      expect(isMultiEndpointPool()).toBe(false);
    });

    it("returns true when pool has more than 1 endpoint", () => {
      process.env.DATABRICKS_SERVING_ENDPOINT = "databricks-claude-opus-4-6";
      process.env.DATABRICKS_SERVING_ENDPOINT_FAST = "databricks-claude-sonnet-4-6";
      expect(isMultiEndpointPool()).toBe(true);
    });
  });
});
