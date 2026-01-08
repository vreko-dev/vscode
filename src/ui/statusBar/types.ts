/**
 * Status bar states for the StatusBarStateMachine
 */
export type StatusBarState =
	| "idle" // No active risk, minimal UI
	| "protected" // Flash state after snapshot (auto-reverts)
	| "ambient-risk" // Low risk detected, pulse animation
	| "recommend" // Medium risk, suggest snapshot
	| "critical" // High risk, urgent action needed
	| "recovering" // Restore in progress
	| "error" // System error state
	| "disabled"; // User disabled protection
