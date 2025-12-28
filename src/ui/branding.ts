/**
 * Emoji Branding Constants - Extension to Signage System
 *
 * Reference: EXTENSION_UX_SPEC.md#emoji-branding
 *
 * This file EXTENDS the signage system (signage/constants.ts) and icon system
 * (constants/icons.ts) with dashboard-specific UI elements and MCP agent voice.
 *
 * DUAL SYSTEM:
 * - MCP Agent Responses: `🧢 SnapBack:` prefix
 * - Product UI: Re-exports from signage + dashboard-specific additions
 * - Status Bar: $(codicons) for VS Code native look
 *
 * RULE: For existing signage categories, always import from signage/constants.ts
 *
 * @packageDocumentation
 */

import { SNAPBACK_ICONS } from "../constants/icons";
import {
	BRAND_SIGNAGE,
	CORE_CONCEPT_SIGNAGE,
	FILE_HEALTH_DECORATIONS,
	PROTECTION_LEVEL_SIGNAGE,
	PULSE_LEVEL_SIGNAGE,
	SESSION_HEALTH_SIGNAGE,
	TEMPERATURE_LEVEL_SIGNAGE,
	TRAJECTORY_SIGNAGE,
} from "../signage/constants";

// =============================================================================
// THE ESSENTIAL 8 - Core Product UI Emojis (Spec Requirement)
// Maps to existing signage where possible
// =============================================================================

/**
 * Core emojis for product UI - keep this set minimal and meaningful
 */
export const ESSENTIAL_EMOJIS = {
	/** Snapshot created - from CORE_CONCEPT_SIGNAGE */
	snapshot: CORE_CONCEPT_SIGNAGE.snapshot.emoji,
	/** Restored/undone - from SNAPBACK_ICONS */
	restore: "⏪",
	/** Protected state - from FILE_HEALTH_DECORATIONS */
	protected: FILE_HEALTH_DECORATIONS.protected.badge,
	/** AI detected - from SNAPBACK_ICONS */
	aiDetected: SNAPBACK_ICONS.AI_TOOL,
	/** Safe/healthy - from SESSION_HEALTH_SIGNAGE */
	safe: "✅",
	/** Needs attention - from FILE_HEALTH_DECORATIONS */
	warning: FILE_HEALTH_DECORATIONS.warning.badge,
	/** Tokens/money saved */
	money: "💰",
	/** Pioneer points */
	pioneer: "🌱",
} as const;

// =============================================================================
// DASHBOARD-SPECIFIC UI EMOJIS (Not in signage system)
// =============================================================================

/**
 * Settings emojis for dashboard
 */
export const SETTINGS_EMOJIS = {
	settings: SNAPBACK_ICONS.SETTINGS,
	install: "📥",
	cli: "💻",
	inject: "💉",
	language: "🌐",
	copy: "📋",
	export: "📤",
} as const;

/**
 * Pioneer program emojis
 */
export const PIONEER_EMOJIS = {
	points: "🌱",
	achievement: "🏆",
	streak: "🔥",
	leaderboard: "📈",
	referral: "🤝",
} as const;

/**
 * Dashboard tab emojis
 */
export const DASHBOARD_TAB_EMOJIS = {
	home: "🏠",
	settings: SNAPBACK_ICONS.SETTINGS,
	activity: SNAPBACK_ICONS.OVERVIEW,
	growth: "📈",
} as const;

// =============================================================================
// UNIFIED BRANDING EXPORT
// =============================================================================

/**
 * Complete branding reference for UI components
 *
 * USAGE:
 * ```typescript
 * import { BRANDING } from './branding';
 * const icon = BRANDING.ui.snapshot; // 📸
 * const prefix = BRANDING.agent.prefix; // 🧢 SnapBack:
 * ```
 */
export const BRANDING = {
	/** Core essential emojis */
	essential: ESSENTIAL_EMOJIS,

	/** UI-specific emojis */
	ui: {
		// Essential 8
		snapshot: ESSENTIAL_EMOJIS.snapshot,
		restore: ESSENTIAL_EMOJIS.restore,
		protected: ESSENTIAL_EMOJIS.protected,
		aiDetected: ESSENTIAL_EMOJIS.aiDetected,
		safe: ESSENTIAL_EMOJIS.safe,
		warning: ESSENTIAL_EMOJIS.warning,
		money: ESSENTIAL_EMOJIS.money,
		pioneer: ESSENTIAL_EMOJIS.pioneer,

		// Activity (from SNAPBACK_ICONS)
		aiEdit: SNAPBACK_ICONS.EVENT_AI,
		manualSnapshot: SNAPBACK_ICONS.EVENT_MANUAL,
		autoSnapshot: SNAPBACK_ICONS.REFRESH,
		restoreAction: SNAPBACK_ICONS.RESTORE,
		configChange: SNAPBACK_ICONS.SETTINGS,

		// Settings
		settings: SETTINGS_EMOJIS.settings,
		install: SETTINGS_EMOJIS.install,
		cli: SETTINGS_EMOJIS.cli,
		inject: SETTINGS_EMOJIS.inject,
		language: SETTINGS_EMOJIS.language,
		copy: SETTINGS_EMOJIS.copy,
		export: SETTINGS_EMOJIS.export,

		// Dashboard tabs
		home: DASHBOARD_TAB_EMOJIS.home,
		activity: DASHBOARD_TAB_EMOJIS.activity,
		growth: DASHBOARD_TAB_EMOJIS.growth,

		// Pioneer
		achievement: PIONEER_EMOJIS.achievement,
		streak: PIONEER_EMOJIS.streak,
		leaderboard: PIONEER_EMOJIS.leaderboard,
		referral: PIONEER_EMOJIS.referral,
	},

	/** MCP agent voice - uses BRAND_SIGNAGE */
	agent: {
		/** Always prefix agent responses with this */
		prefix: `${BRAND_SIGNAGE.logoEmoji} ${BRAND_SIGNAGE.shortLabel}:`,

		/**
		 * Format an agent response
		 *
		 * @example
		 * BRANDING.agent.format("Checkpoint created before refactoring auth.ts")
		 * // "🧢 SnapBack: Checkpoint created before refactoring auth.ts"
		 */
		format: (message: string) => `${BRAND_SIGNAGE.logoEmoji} ${BRAND_SIGNAGE.shortLabel}: ${message}`,
	},

	/** Status bar codicons (not emojis) */
	statusBar: {
		idle: "$(shield)",
		aiSession: "$(sparkle)",
		checkpoint: "$(check)",
		restored: "$(history)",
		warning: "$(warning)",
		sync: "$(sync~spin)",
		heart: "$(heart)",
		zap: "$(zap)",
	},

	/** Heat level decorations - from TEMPERATURE_LEVEL_SIGNAGE */
	heat: {
		none: "",
		warm: "•",
		hot: TEMPERATURE_LEVEL_SIGNAGE.hot.emoji,
		critical: TEMPERATURE_LEVEL_SIGNAGE.burning.emoji,
		aiHot: `${SNAPBACK_ICONS.AI_TOOL}${TEMPERATURE_LEVEL_SIGNAGE.hot.emoji}`,
	},

	/** Protection level badges - from PROTECTION_LEVEL_SIGNAGE */
	protection: {
		block: PROTECTION_LEVEL_SIGNAGE.block.emoji,
		warn: PROTECTION_LEVEL_SIGNAGE.warn.emoji,
		watch: PROTECTION_LEVEL_SIGNAGE.watch.emoji,
	},

	/** Re-export signage for convenience */
	signage: {
		brand: BRAND_SIGNAGE,
		protection: PROTECTION_LEVEL_SIGNAGE,
		sessionHealth: SESSION_HEALTH_SIGNAGE,
		trajectory: TRAJECTORY_SIGNAGE,
		pulse: PULSE_LEVEL_SIGNAGE,
		temperature: TEMPERATURE_LEVEL_SIGNAGE,
		fileHealth: FILE_HEALTH_DECORATIONS,
		coreConcepts: CORE_CONCEPT_SIGNAGE,
	},
} as const;

// =============================================================================
// TYPE EXPORTS
// =============================================================================

export type EssentialEmoji = keyof typeof ESSENTIAL_EMOJIS;
export type SettingsEmoji = keyof typeof SETTINGS_EMOJIS;
export type PioneerEmoji = keyof typeof PIONEER_EMOJIS;
export type DashboardTabEmoji = keyof typeof DASHBOARD_TAB_EMOJIS;
