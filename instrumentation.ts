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
    const required: [string, string][] = [
      ["DATABASE_URL", "Lakebase connection string"],
      ["DATABRICKS_HOST", "Databricks workspace URL"],
      ["DATABRICKS_WAREHOUSE_ID", "SQL Warehouse resource binding"],
    ];
    const missing = required.filter(([key]) => !process.env[key]);
    if (missing.length > 0) {
      const list = missing.map(([k, desc]) => `  - ${k} (${desc})`).join("\n");
      console.error(
        `[startup] Missing required environment variables:\n${list}\n` +
          "The app cannot start without these. Check your app.yaml resource bindings and .env.local for local dev."
      );
      process.exit(1);
    }
    console.log("[instrumentation] Environment variables validated.");

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
  }
}
