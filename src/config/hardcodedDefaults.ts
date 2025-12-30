/**
 * Hardcoded Defaults Module
 *
 * These values were previously user-configurable settings.
 * They've been hardcoded because:
 * 1. Users don't know what "6" means for thresholds
 * 2. These are internal optimizations, not user choices
 * 3. Picking smart defaults provides magic, not configuration panels
 *
 * Rule: "If there's an obvious right answer, don't ask the user."
 *
 * Settings reduction: 56 → 8 (86% fewer settings)
 */

// =============================================================================
// PROTECTION LEVELS (was: snapback.protectionLevels.*)
// =============================================================================
export const PROTECTION_DEFAULTS = {
	/** Default protection level for new files */
	defaultLevel: "watch" as const,
	/** Always show level badges in explorer - this is core UX */
	showLevelBadges: true,
	/** Always show file health decorations */
	showFileHealthDecorations: true,
} as const;

// =============================================================================
// SNAPSHOT SETTINGS (was: snapback.snapshot.*)
// =============================================================================
export const SNAPSHOT_DEFAULTS = {
	/** Always use git context for intelligent naming */
	useGitNaming: true,
	/** Git command timeout - 5s is plenty */
	gitTimeout: 5000,
	/** Always deduplicate - >90% space savings */
	deduplicationEnabled: true,
	/** Cache size for dedup hashes */
	deduplicationCacheSize: 500,
	/** Always confirm before delete - safety first */
	confirmDelete: true,
	/** Auto cleanup disabled by default - users don't want surprise deletions */
	autoCleanup: {
		enabled: false,
		olderThanDays: 30,
		keepProtected: true,
		minimumSnapshots: 10,
	},
	/** AI detection is core value prop - always on unless main toggle is off */
	aiDetectionEnabled: true,
	/** Don't auto-restore - too disruptive */
	autoRestoreOnDetection: false,
} as const;

// =============================================================================
// NOTIFICATION SETTINGS (was: snapback.notifications.*)
// =============================================================================
export const NOTIFICATION_DEFAULTS = {
	/** Show snapshot created notifications - core feedback */
	showSnapshotCreated: true,
	/** 3 seconds is optimal - visible but not annoying */
	duration: 3000,
	/** Config sync is silent by default */
	showConfigSync: false,
} as const;

// =============================================================================
// GUARDIAN SETTINGS (was: snapback.guardian.*)
// =============================================================================
export const GUARDIAN_DEFAULTS = {
	/** Default protection level for AI-generated code */
	protectionLevel: "warn" as const,
	/** All plugins ON by default - why would user disable? */
	plugins: {
		secretDetection: true,
		mockReplacement: true,
		phantomDependency: true,
	},
	/** Thresholds on 0-10 scale - tuned through testing */
	thresholds: {
		warn: 6,
		block: 8,
	},
} as const;

// =============================================================================
// AI DETECTION SETTINGS (was: snapback.aiDetection.*)
// =============================================================================
export const AI_DETECTION_DEFAULTS = {
	/** Show session badge in status bar */
	showSessionBadge: true,
	/** Confidence threshold - tuned for low false positives */
	confidenceThreshold: 6,
} as const;

// =============================================================================
// API & URL SETTINGS (was: snapback.api.*, snapback.apiBaseUrl, snapback.webBaseUrl)
// =============================================================================
export const API_DEFAULTS = {
	/** Main API endpoint */
	baseUrl: "https://api.snapback.dev/api",
	/** Legacy API base (for tree explorer) */
	apiBaseUrl: "https://api.snapback.dev",
	/** Web console URL */
	webBaseUrl: "https://console.snapback.dev",
	/** Always prefer OAuth - more secure */
	preferOAuth: true,
} as const;

// =============================================================================
// MCP SETTINGS (was: snapback.mcp.* except enabled and serverUrl)
// =============================================================================
export const MCP_DEFAULTS = {
	/** Auto-enable MCP for detected AI assistants */
	autoEnable: true,
	/** Use npx by default - auto updates */
	preferBinary: false,
	/** Default auth type */
	authType: "bearer" as const,
	/** Connection timeout */
	timeout: 5000,
} as const;

// =============================================================================
// CONFIG SETTINGS (was: snapback.config.*)
// =============================================================================
export const CONFIG_DEFAULTS = {
	/** Executable configs disabled by default - security */
	enableExecutableConfigs: false,
} as const;

// =============================================================================
// VITALS SETTINGS (was: snapback.vitals.*)
// =============================================================================
export const VITALS_DEFAULTS = {
	/** Status bar vitals off by default - power user mode */
	showInStatusBar: false,
	/** Recommendations always enabled */
	enableRecommendations: true,
	/** Threshold for showing recommendations */
	recommendationThreshold: 70,
} as const;

// =============================================================================
// ONBOARDING SETTINGS (was: snapback.onboarding.*)
// =============================================================================
export const ONBOARDING_DEFAULTS = {
	/** Always show welcome on first run */
	showWelcome: true,
	/** Always auto-detect critical files */
	autoDetectCriticalFiles: true,
} as const;

// =============================================================================
// AUTO DECISION SETTINGS (was: snapback.autoDecision.*)
// =============================================================================
export const AUTO_DECISION_DEFAULTS = {
	/** Risk score threshold for automatic snapshots (0-100) */
	riskThreshold: 60,
	/** Risk score threshold for notifications (0-100) */
	notifyThreshold: 40,
	/** Min files for burst detection */
	minFilesForBurst: 3,
	/** Rate limit: max snapshots per minute */
	maxSnapshotsPerMinute: 4,
} as const;

// =============================================================================
// TELEMETRY SETTINGS (was: snapback.telemetry.* except enabled)
// =============================================================================
export const TELEMETRY_DEFAULTS = {
	/** PostHog endpoint - hardcoded */
	endpoint: "https://us.i.posthog.com",
	/** Sample all traces */
	sampleRate: 1.0,
	/** Console output off by default */
	console: false,
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get a hardcoded default value by path
 * Useful for migration from config.get() calls
 */
export function getHardcodedDefault<T>(path: string): T {
	const parts = path.split(".");
	let current: unknown = {
		protection: PROTECTION_DEFAULTS,
		snapshot: SNAPSHOT_DEFAULTS,
		notifications: NOTIFICATION_DEFAULTS,
		guardian: GUARDIAN_DEFAULTS,
		aiDetection: AI_DETECTION_DEFAULTS,
		api: API_DEFAULTS,
		mcp: MCP_DEFAULTS,
		config: CONFIG_DEFAULTS,
		vitals: VITALS_DEFAULTS,
		onboarding: ONBOARDING_DEFAULTS,
		autoDecision: AUTO_DECISION_DEFAULTS,
		telemetry: TELEMETRY_DEFAULTS,
	};

	for (const part of parts) {
		if (current && typeof current === "object" && part in current) {
			current = (current as Record<string, unknown>)[part];
		} else {
			throw new Error(`Unknown hardcoded default path: ${path}`);
		}
	}

	return current as T;
}

/**
 * Type-safe getter for protection defaults
 */
export function getProtectionDefault<K extends keyof typeof PROTECTION_DEFAULTS>(
	key: K,
): (typeof PROTECTION_DEFAULTS)[K] {
	return PROTECTION_DEFAULTS[key];
}

/**
 * Type-safe getter for snapshot defaults
 */
export function getSnapshotDefault<K extends keyof typeof SNAPSHOT_DEFAULTS>(key: K): (typeof SNAPSHOT_DEFAULTS)[K] {
	return SNAPSHOT_DEFAULTS[key];
}

/**
 * Type-safe getter for guardian defaults
 */
export function getGuardianDefault<K extends keyof typeof GUARDIAN_DEFAULTS>(key: K): (typeof GUARDIAN_DEFAULTS)[K] {
	return GUARDIAN_DEFAULTS[key];
}

/**
 * Type-safe getter for API defaults
 */
export function getApiDefault<K extends keyof typeof API_DEFAULTS>(key: K): (typeof API_DEFAULTS)[K] {
	return API_DEFAULTS[key];
}

/**
 * Type-safe getter for MCP defaults
 */
export function getMcpDefault<K extends keyof typeof MCP_DEFAULTS>(key: K): (typeof MCP_DEFAULTS)[K] {
	return MCP_DEFAULTS[key];
}

/**
 * Type-safe getter for auto decision defaults
 */
export function getAutoDecisionDefault<K extends keyof typeof AUTO_DECISION_DEFAULTS>(
	key: K,
): (typeof AUTO_DECISION_DEFAULTS)[K] {
	return AUTO_DECISION_DEFAULTS[key];
}
