/**
 * Vreko Icon Constants
 * Auto-generated from icon font
 */

export const VREKO_ICONS = {
	// Core brand icons
	SHIELD: "$(vreko-shield)", // Shield icon for protection status
	LIGHTNING: "$(vreko-lightning)",
	PULSE: "$(vreko-pulse)",
	BRAIN: "$(vreko-brain)",
	ROLLBACK: "$(vreko-rollback)",
	RISK: "$(vreko-risk)",
	// Status icons
	SUCCESS: "$(check)",
	FAILED: "$(error)",
	ERROR: "$(error)",
	WARNING: "$(warning)",
	CRITICAL: "$(error)",
	// Protection level icons
	BLOCK: "$(vreko-risk)",
	WARN: "$(warning)",
	WATCH: "$(eye)",
	// Activity icons
	OVERVIEW: "$(dashboard)",
	SESSION: "$(history)",
	IN_PROGRESS: "$(sync~spin)",
	AI: "$(vreko-brain)",
	AI_TOOL: "$(vreko-brain)",
	// Event icons
	EVENT_AI: "$(vreko-brain)",
	EVENT_MANUAL: "$(add)",
	REFRESH: "$(refresh)",
	RESTORE: "$(discard)",
	// UI icons
	SETTINGS: "$(gear)",
} as const;

export type VrekoIcon = (typeof VREKO_ICONS)[keyof typeof VREKO_ICONS];
