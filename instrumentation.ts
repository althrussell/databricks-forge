/**
 * Next.js Instrumentation -- runs once when the server starts.
 *
 * Registers a SIGTERM handler so Databricks Apps can gracefully stop
 * the process within its 15-second timeout. Without this, the platform
 * force-kills the process and logs:
 *   "[ERROR] App did not respect SIGTERM timeout of 15 seconds."
 */

export async function onRequestError() {
  // Required export -- Next.js uses this for error reporting instrumentation.
  // We don't need custom behavior here.
}

export function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const expected: [string, string][] = [
      ["DATABRICKS_HOST", "Databricks workspace URL"],
      ["DATABRICKS_WAREHOUSE_ID", "SQL Warehouse resource binding"],
    ];
    const missing = expected.filter(([key]) => !process.env[key]);
    if (missing.length > 0) {
      const list = missing.map(([k, desc]) => `  - ${k} (${desc})`).join("\n");
      console.warn(
        `[startup] Expected environment variables not yet available:\n${list}\n` +
          "These are normally injected by the Databricks Apps platform or set in .env.local for local dev."
      );
    } else {
      console.log("[instrumentation] Environment variables validated.");
    }

    process.on("SIGTERM", async () => {
      console.log("[shutdown] SIGTERM received, closing connections...");

      try {
        // Disconnect Prisma / pg pool if it was initialized
        const globalForPrisma = globalThis as unknown as {
          __prisma: { $disconnect: () => Promise<void> } | undefined;
        };
        if (globalForPrisma.__prisma) {
          await globalForPrisma.__prisma.$disconnect();
          console.log("[shutdown] Prisma disconnected.");
        }
      } catch (err) {
        console.error("[shutdown] Error during cleanup:", err);
      }

      console.log("[shutdown] Exiting.");
      process.exit(0);
    });

    console.log("[instrumentation] SIGTERM handler registered.");

    // Eagerly mark any background jobs left in "generating" state as failed.
    // These are orphans from a previous process that was killed mid-generation.
    // Also set the flag so the lazy check in getPersistedJobStatus doesn't re-run.
    //
    // Wait for the DB to be marked ready by the Prisma singleton before
    // attempting the query. This avoids triggering an immediate credential
    // rotation + SCIM /Me call on a cold start.
    const ORPHAN_CHECK_DELAY = 2_000;
    const ORPHAN_CHECK_MAX_WAIT = 60_000;

    const runOrphanCheck = async () => {
      const { isDatabaseReady } = await import("@/lib/prisma");
      const start = Date.now();

      while (!isDatabaseReady() && Date.now() - start < ORPHAN_CHECK_MAX_WAIT) {
        await new Promise((r) => setTimeout(r, ORPHAN_CHECK_DELAY));
      }

      if (!isDatabaseReady()) return;

      try {
        const { markOrphanedJobsFailed, markOrphanCheckComplete } = await import("@/lib/lakebase/background-jobs");
        await markOrphanedJobsFailed();
        markOrphanCheckComplete();
      } catch {
        // The lazy check in getPersistedJobStatus will catch any remaining orphans.
      }
    };

    setTimeout(() => { void runOrphanCheck(); }, ORPHAN_CHECK_DELAY);
  }
}
