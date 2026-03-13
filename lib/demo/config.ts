/**
 * Demo Mode feature gate.
 *
 * When `FORGE_DEMO_MODE_ENABLED` is absent or not `"true"`, all demo-specific
 * API routes return 404 and the Settings UI hides the Demo Wizard button.
 */
export function isDemoModeEnabled(): boolean {
  return process.env.FORGE_DEMO_MODE_ENABLED === "true";
}
