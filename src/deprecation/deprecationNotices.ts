/**
 * Deprecation Notices
 *
 * Documents migration from manual snapshot patterns to
 * AutoDecisionEngine-driven architecture
 */

export interface DeprecationNotice {
	id: string;
	title: string;
	status: "DEPRECATED" | "PLANNED" | "REMOVED";
	affectedCode: string[];
	replacement: string;
	version: string;
	timeline?: string;
	documentation?: string;
}

export const DEPRECATION_NOTICES: Record<string, DeprecationNotice> = {
	manual_snapshot_creation: {
		id: "manual_snapshot_creation",
		title: "Manual Snapshot Creation",
		status: "DEPRECATED",
		affectedCode: ["extension.createSnapshot()"],
		replacement:
			"AutoDecisionEngine automatically determines when to create snapshots",
		version: "2.0.0",
		timeline: "Removed in v2.1.0",
		documentation: "See migration guide: docs/migration-v1-v2.md",
	},

	direct_state_manipulation: {
		id: "direct_state_manipulation",
		title: "Direct Extension State Access",
		status: "DEPRECATED",
		affectedCode: ["extension.globalState", "context.workspaceState"],
		replacement: "Use ExtensionWiring.getState() for unified state access",
		version: "2.0.0",
		timeline: "Removed in v2.1.0",
	},

	manual_decision_making: {
		id: "manual_decision_making",
		title: "Manual Decision Making",
		status: "DEPRECATED",
		affectedCode: ["custom decision logic", "if-checks for snapshot triggers"],
		replacement: "AutoDecisionEngine provides centralized decision logic",
		version: "2.0.0",
		timeline: "Removed in v2.1.0",
	},

	direct_notification_calls: {
		id: "direct_notification_calls",
		title: "Direct Notification Invocation",
		status: "DEPRECATED",
		affectedCode: ["vscode.window.showInformationMessage"],
		replacement: "Use NotificationAdapter for decision-aware notifications",
		version: "2.0.0",
		timeline: "Removed in v2.1.0",
	},
};

/**
 * Check if code pattern is deprecated
 */
export function isDeprecated(patternId: string): boolean {
	const notice = DEPRECATION_NOTICES[patternId];
	return notice !== undefined && notice.status !== "REMOVED";
}

/**
 * Get deprecation notice for pattern
 */
export function getDeprecationNotice(
	patternId: string,
): DeprecationNotice | undefined {
	return DEPRECATION_NOTICES[patternId];
}

/**
 * Emit deprecation warning
 */
export function emitDeprecationWarning(
	patternId: string,
	context?: string,
): void {
	const notice = DEPRECATION_NOTICES[patternId];

	if (!notice) {
		return;
	}

	const message = [
		`[DEPRECATION] ${notice.title} (${notice.version})`,
		`Replacement: ${notice.replacement}`,
		notice.timeline ? `Timeline: ${notice.timeline}` : null,
		context ? `Context: ${context}` : null,
	]
		.filter(Boolean)
		.join("\n");

	console.warn(message);
}

/**
 * Get all deprecated patterns
 */
export function getDeprecatedPatterns(): DeprecationNotice[] {
	return Object.values(DEPRECATION_NOTICES).filter(
		(n) => n.status === "DEPRECATED",
	);
}

/**
 * Migration helper: check if old pattern should be updated
 */
export function shouldMigrate(patternId: string): boolean {
	const notice = getDeprecationNotice(patternId);
	return notice !== undefined && notice.status === "DEPRECATED";
}
