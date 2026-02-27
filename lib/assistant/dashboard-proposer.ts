/**
 * Dashboard proposer for the Ask Forge assistant.
 *
 * CRITICAL CONSTRAINT: This is a thin wrapper that delegates to the existing
 * dashboard engine. It does NOT define new dashboard prompts. All dashboard
 * generation uses:
 *   - runDashboardEngine (lib/dashboard/engine.ts)
 *   - assembleLakeviewDashboard (lib/dashboard/assembler.ts)
 *   - createDashboard + publishDashboard (lib/dbx/dashboards.ts)
 *
 * The proposer builds the required DashboardEngineInput from the assistant's
 * context and delegates entirely to the proven engine.
 */

import { logger } from "@/lib/logger";

export interface DashboardProposal {
  title: string;
  description: string;
  tables: string[];
  widgetDescriptions: string[];
}

/**
 * Extract dashboard design intent from the assistant's markdown response.
 * The assistant may describe widgets, charts, or visualisations inline.
 */
export function extractDashboardIntent(markdown: string): DashboardProposal | null {
  const hasDashboardContent =
    /\b(dashboard|chart|widget|visuali[sz]ation|trend|bar chart|pie chart|line chart|table widget)\b/i.test(markdown);

  if (!hasDashboardContent) return null;

  const tables: string[] = [];
  const fqnRegex = /`([a-zA-Z_]\w*\.[a-zA-Z_]\w*\.[a-zA-Z_]\w*)`/g;
  let match;
  while ((match = fqnRegex.exec(markdown)) !== null) {
    if (!tables.includes(match[1])) tables.push(match[1]);
  }

  const widgetDescriptions: string[] = [];
  const listRegex = /[-*]\s+(.+(?:chart|widget|trend|metric|KPI|visual).+)/gi;
  while ((match = listRegex.exec(markdown)) !== null) {
    widgetDescriptions.push(match[1].trim());
  }

  logger.debug("[assistant/dashboard] Extracted dashboard intent", {
    tables: tables.length,
    widgets: widgetDescriptions.length,
  });

  return {
    title: "Assistant-Generated Dashboard",
    description: "Dashboard generated from Ask Forge conversation",
    tables,
    widgetDescriptions,
  };
}
