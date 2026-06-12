/**
 * Local telemetry constants for VSCode extension
 * Copied from @vreko/contracts to avoid runtime dependency
 *
 * @see packages/contracts/src/events/core.ts (source)
 * @see packages/contracts/src/telemetry/events.ts (legacy source)
 */

export const EVENT_VERSION = "1.0.0";

/**
 * Core telemetry events (modern snake_case format)
 */
export const CORE_TELEMETRY_EVENTS = {
	SAVE_ATTEMPT: "save_attempt",
	SNAPSHOT_CREATED: "snapshot_created",
	SESSION_FINALIZED: "session_finalized",
	ISSUE_CREATED: "issue_created",
	ISSUE_RESOLVED: "issue_resolved",
	SESSION_RESTORED: "session_restored",
	POLICY_CHANGED: "policy_changed",
	AUTH_PROVIDER_SELECTED: "auth.provider.selected",
	AUTH_BROWSER_OPENED: "auth.browser.opened",
	AUTH_CODE_ENTRY: "auth.code.entry",
	AUTH_APPROVAL_RECEIVED: "auth.approval.received",
	WELCOME_FEATURE_VIEWED: "welcome.feature.viewed",
	WELCOME_ACTION_TRIGGERED: "welcome.action.triggered",
} as const;

/**
 * Legacy telemetry events (dot notation format)
 * @deprecated Use CORE_TELEMETRY_EVENTS for new code
 */
export const TELEMETRY_EVENTS = {
	EXTENSION_ACTIVATED: "extension.activated",
	EXTENSION_DEACTIVATED: "extension.deactivated",
	COMMAND_EXECUTION: "command.execution",
	SNAPSHOT_CREATED: "snapshot.created",
	VREKO_USED: "vreko.used",
	RISK_DETECTED: "risk.detected",
	VIEW_ACTIVATED: "view.activated",
	NOTIFICATION_SHOWN: "notification.shown",
	FEATURE_USED: "feature.used",
	ERROR: "error",
	WALKTHROUGH_STEP_COMPLETED: "walkthrough.step.completed",
	ONBOARDING_PROTECTION_ASSIGNED: "onboarding.protection.assigned",
	ONBOARDING_PHASE_PROGRESSED: "onboarding.phase.progressed",
	ONBOARDING_CONTEXTUAL_PROMPT_SHOWN: "onboarding.contextualPrompt.shown",
	SIGNATURE_VERIFICATION_SUCCESS: "signature.verification.success",
	SIGNATURE_VERIFICATION_FAILED: "signature.verification.failed",
	RULES_CACHED_FALLBACK: "rules.cached.fallback",
	VITALS_TRAJECTORY_CHANGED: "vitals_trajectory_changed",
	VITALS_CRITICAL_STATE: "vitals_critical_state",
	VITALS_AUTO_SNAPSHOT: "vitals_auto_snapshot",
	VITALS_NUDGE_SHOWN: "vitals_nudge_shown",
} as const;

export type TelemetryEventName = (typeof TELEMETRY_EVENTS)[keyof typeof TELEMETRY_EVENTS];
export type CoreTelemetryEventName = (typeof CORE_TELEMETRY_EVENTS)[keyof typeof CORE_TELEMETRY_EVENTS];
