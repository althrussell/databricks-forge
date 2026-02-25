/**
 * API: /api/runs/[runId]/genie-engine/[domain]/functions
 *
 * POST -- Execute a trusted function (UDF) DDL statement to create the
 *         function in Unity Catalog, then ensure the domain's serialized
 *         space references the deployed FQN.
 */

import { NextRequest, NextResponse } from "next/server";
import { executeSQL } from "@/lib/dbx/sql";
import { withPrisma } from "@/lib/prisma";
import { getRunById } from "@/lib/lakebase/runs";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string; domain: string }> }
) {
  try {
    const { runId, domain } = await params;
    const decodedDomain = decodeURIComponent(domain);

    const run = await getRunById(runId);
    if (!run) {
      return NextResponse.json({ error: "Run not found" }, { status: 404 });
    }

    const body = (await request.json()) as {
      ddl: string;
      name: string;
    };

    if (!body.ddl || !body.name) {
      return NextResponse.json(
        { error: "Missing required fields: ddl, name" },
        { status: 400 }
      );
    }

    if (
      !body.ddl.toUpperCase().includes("CREATE") ||
      !body.ddl.toUpperCase().includes("FUNCTION")
    ) {
      return NextResponse.json(
        { error: "DDL does not appear to be a valid function statement" },
        { status: 400 }
      );
    }

    await executeSQL(body.ddl);

    // Extract the FQN from the DDL (CREATE [OR REPLACE] FUNCTION catalog.schema.name)
    const fqnMatch = body.ddl.match(
      /FUNCTION\s+(`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?\.`?[a-zA-Z_]\w*`?)/i
    );
    const functionFqn = fqnMatch
      ? fqnMatch[1].replace(/`/g, "")
      : body.name;

    logger.info("Trusted function created via DDL", {
      runId,
      domain: decodedDomain,
      functionName: body.name,
      functionFqn,
    });

    // Update the serialized space so the function identifier matches the
    // actual deployed FQN (may differ from the assembler-assigned name).
    await withPrisma(async (prisma) => {
      const rec = await prisma.forgeGenieRecommendation.findFirst({
        where: { runId, domain: decodedDomain },
      });

      if (rec) {
        try {
          const space = JSON.parse(rec.serializedSpace) as Record<string, unknown>;
          const instructions = (space.instructions ?? {}) as Record<string, unknown>;
          const sqlFunctions = (instructions.sql_functions ?? []) as Array<{
            id: string;
            identifier: string;
          }>;

          // Update an existing entry whose identifier matches the name the
          // assembler originally assigned, or add a new entry if missing.
          const existingIdx = sqlFunctions.findIndex(
            (fn) => fn.identifier.toLowerCase() === body.name.toLowerCase()
              || fn.identifier.toLowerCase() === functionFqn.toLowerCase()
          );

          if (existingIdx >= 0) {
            sqlFunctions[existingIdx].identifier = functionFqn;
          } else {
            const id = crypto.randomUUID().replace(/-/g, "");
            sqlFunctions.push({ id, identifier: functionFqn });
          }

          instructions.sql_functions = sqlFunctions;
          space.instructions = instructions;

          await prisma.forgeGenieRecommendation.update({
            where: { id: rec.id },
            data: {
              serializedSpace: JSON.stringify(space),
            },
          });

          logger.info("Function FQN synced in serialized space", {
            runId,
            domain: decodedDomain,
            functionFqn,
          });
        } catch (parseErr) {
          logger.warn("Failed to update serialized space with function FQN", {
            error: parseErr instanceof Error ? parseErr.message : String(parseErr),
          });
        }
      }
    });

    return NextResponse.json({
      success: true,
      functionName: body.name,
      functionFqn,
      domain: decodedDomain,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Trusted function deployment failed", { error: message });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
