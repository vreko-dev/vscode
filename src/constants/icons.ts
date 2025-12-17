/**
 * Unified icon/emoji system for SnapBack
 *
 * RULE: Never use hardcoded emojis elsewhere in the codebase.
 * Always import from this file.
 *
 * This module provides a single source of truth for all visual indicators
 * used throughout the VS Code extension. By centralizing icons/emojis here,
 * we ensure consistency and make it easy to update the visual language.
 */

export const SNAPBACK_ICONS = {
	// Protection Levels
	WATCH: "👁️",
	WARN: "⚠️",
	BLOCK: "🛑",

	// File Health Status
	SHIELD: "🛡️",
	AT_RISK: "⚠️",
	CRITICAL: "🚨",

	// Operation Status
	SUCCESS: "✅",
	IN_PROGRESS: "⏳",
	FAILED: "❌",
	ERROR: "❌",
	WARNING: "⚠️",

	// AI Detection
	AI: "🤖",
	AI_TOOL: "✨",

	// Event Types (for activity labels)
	EVENT_AI: "✨", // AI-detected edits
	EVENT_MANUAL: "💾", // Manual snapshot
	EVENT_AUTO: "⏱️", // Auto-snapshot
	EVENT_PRE_SAVE: "🛡️", // Pre-save protection

	// Snapshots & Sessions
	CAMERA: "📷",
	RESTORE: "↩️",
	SESSION: "📁",
	MANUAL: "📷",

	// UI Elements
	SETTINGS: "⚙️",
	REFRESH: "🔄",
	HELP: "❓",
	ADD: "➕",
	OVERVIEW: "📊",
	SEARCH: "🔍",
	FOLDER: "📦",

	// Cloud Status
	CLOUD_CONNECTED: "✅",
	CLOUD_DISCONNECTED: "☁️",
} as const;

// Type helper for accessing icons
export type IconKey = keyof typeof SNAPBACK_ICONS;
