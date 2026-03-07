/**
 * Metric views feature gate.
 *
 * When `FORGE_METRIC_VIEWS_ENABLED` is absent or not `"true"`, all metric
 * view generation, deployment, and UI toggles are suppressed.  Set
 * `FORGE_METRIC_VIEWS_ENABLED=true` to re-enable the feature.
 */
export function isMetricViewsEnabled(): boolean {
  return process.env.FORGE_METRIC_VIEWS_ENABLED === "true";
}
