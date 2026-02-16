/**
 * Structured logging utility.
 *
 * Outputs JSON in production for log aggregation, and human-readable
 * formatted output in development.
 *
 * Usage:
 *   import { logger } from "@/lib/logger";
 *   logger.info("Step complete", { runId, step: "scoring", count: 42 });
 *   logger.warn("Retry needed", { attempt: 2, promptKey: "SCORE_USE_CASES" });
 *   logger.error("Pipeline failed", { runId, error: err.message });
 */

type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  [key: string]: unknown;
}

const IS_PRODUCTION = process.env.NODE_ENV === "production";

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const MIN_LEVEL: LogLevel =
  (process.env.LOG_LEVEL as LogLevel) ?? (IS_PRODUCTION ? "info" : "debug");

function shouldLog(level: LogLevel): boolean {
  return LEVEL_PRIORITY[level] >= LEVEL_PRIORITY[MIN_LEVEL];
}

function formatDev(entry: LogEntry): string {
  const { level, message, timestamp, ...rest } = entry;
  const prefix = `[${level.toUpperCase().padEnd(5)}]`;
  const time = timestamp.split("T")[1]?.replace("Z", "") ?? timestamp;
  const extra = Object.keys(rest).length > 0 ? ` ${JSON.stringify(rest)}` : "";
  return `${time} ${prefix} ${message}${extra}`;
}

function emit(level: LogLevel, message: string, meta?: Record<string, unknown>) {
  if (!shouldLog(level)) return;

  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...meta,
  };

  const output = IS_PRODUCTION ? JSON.stringify(entry) : formatDev(entry);

  switch (level) {
    case "error":
      console.error(output);
      break;
    case "warn":
      console.warn(output);
      break;
    default:
      console.log(output);
      break;
  }
}

export const logger = {
  debug: (message: string, meta?: Record<string, unknown>) => emit("debug", message, meta),
  info: (message: string, meta?: Record<string, unknown>) => emit("info", message, meta),
  warn: (message: string, meta?: Record<string, unknown>) => emit("warn", message, meta),
  error: (message: string, meta?: Record<string, unknown>) => emit("error", message, meta),
};
