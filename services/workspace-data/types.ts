/**
 * Workspace Data Types
 *
 * Shared interfaces for workspace data services.
 * Extracted from WorkspaceDataService for modularity.
 *
 * @packageDocumentation
 */

import type { ConnectionState } from "../DaemonBridge";

// =============================================================================
// CONSTANTS (shared across services)
// =============================================================================

export const TOKENS_PER_RESTORE = 1400;
export const TOKENS_PER_LINE = 4;
export const GPT4_COST_PER_1K = 0.03;
export const GPT35_COST_PER_1K = 0.002;
export const LINES_PER_FILE_ESTIMATE = 50;
export const TIMELINE_WINDOW_DAYS = 7;
export const TIMELINE_MAX_SNAPSHOTS = 50;
export const DATA_CHANGE_DEBOUNCE_MS = 500;

export const PRESSURE_THRESHOLDS = {
	moderate: 50,
	high: 70,
	critical: 85,
} as const;

export const TIME_THRESHOLDS = {
	staleSnapshotMinutes: 30,
	optionalSnapshotMinutes: 60,
	pulseWindowSeconds: 60,
	temperatureWindowSeconds: 300,
} as const;

export const OXYGEN_THRESHOLDS = {
	critical: 30,
	low: 50,
	moderate: 70,
	good: 85,
} as const;

// =============================================================================
// STATS TYPES
// =============================================================================

/**
 * Stats aggregation for dashboard
 */
export interface DashboardStats {
	snapshotsToday: number;
	totalSnapshots: number;
	restoresToday: number;
	linesProtected: number;
	tokensSaved: number;
	restoresThisWeek: number;
	efficiencyPercentile: number;
}

// =============================================================================
// ACTIVITY TYPES
// =============================================================================

/**
 * Activity event type classification
 *
 * Types are organized by source:
 * - User-triggered: "ai-edit", "manual-snapshot", "auto-snapshot", "restore"
 * - Service events: "service-snapshot", "service-protection", "service-risk", "service-session"
 *
 * @see ActivityEvent for unified interface
 */
export type ActivityEventType =
	| "ai-edit"
	| "manual-snapshot"
	| "auto-snapshot"
	| "restore"
	| "service-snapshot"
	| "service-protection"
	| "service-risk"
	| "service-session";

/**
 * Activity timeline event
 *
 * UNIFIED TYPE (Phase 1): Consolidates fields from both workspace-data and ux-types
 * definitions to support both service-centric and user-triggered data paths.
 *
 * Service event types (service-*) are injected by ActivityFeedBridge
 * from ProjectionStore projection changes. Privacy contract:
 * only metadata flows to webview (no code content).
 */
export interface ActivityEvent {
	// === REQUIRED FIELDS ===
	/** Unique event identifier */
	id: string;
	/** Event type classification */
	type: ActivityEventType;
	/** Primary file affected (required when not multi-file) */
	file: string;
	/** Event timestamp in milliseconds */
	timestamp: number;

	// === OPTIONAL CONTEXT FIELDS ===
	/** AI tool name if applicable (e.g., "Cursor", "Copilot") */
	aiTool?: string;
	/** Additional event details or description */
	details?: string;

	// === OPTIONAL DISPLAY FIELDS ===
	/** Emoji icon for display (e.g. "✨", "💾", "🔄", "↩️", "🛡️", "⚠️") */
	icon?: string;
	/** Pre-formatted relative time for display (e.g., "5m ago") */
	relativeTime?: string;

	// === OPTIONAL UI-SPECIFIC FIELDS (Phase 1 Additions) ===
	/** Number of files affected (for multi-file events) */
	fileCount?: number;
	/** Source system info (e.g., "Cursor", "Copilot", "user") */
	source?: string;
	/** Line delta for this event (for display and analytics) */
	linesChanged?: number;
	/** Trigger classification for context and analytics */
	trigger?: "save" | "burst" | "manual" | "ai";
}

/**
 * AI detection log entry
 */
export interface AIDetectionEntry {
	tool: string;
	sessions: number;
	accuracy: number;
	lastDetected: number;
}

/**
 * Activity data for activity tab
 */
export interface ActivityData {
	timeline: ActivityEvent[];
	aiDetectionLog: AIDetectionEntry[];
	todayEvents: number;
	yesterdayEvents: number;
	weekEvents: number;
}

/**
 * Internal restore event tracking
 */
export interface RestoreEvent {
	snapshotId: string;
	timestamp: number;
	filesRestored: number;
	tokensEstimate: number;
}

// =============================================================================
// SETTINGS TYPES
// =============================================================================

/**
 * Settings state for settings tab
 */
export interface SettingsState {
	detectedAITool: string | null;
	cliInstalled: boolean;
	cliVersion: string | null;
	protectionThreshold: "low" | "medium" | "high";
	excludePatterns: string[];
	languagePacks: Array<{ name: string; enabled: boolean; builtin: boolean }>;
}

// =============================================================================
// VITALS TYPES
// =============================================================================

/**
 * Vitals data structure
 */
export interface VitalsData {
	pulse: { changesPerMinute: number; level: string };
	temperature: { aiPercentage: number; level: string };
	pressure: { value: number };
	oxygen: { value: number };
	trajectory: string;
}

/**
 * Session health metrics
 */
export interface SessionHealth {
	healthScore: number;
	trajectory: "improving" | "stable" | "degrading" | "critical";
	activeWarnings: string[];
	lastSnapshotMinutesAgo: number | null;
	suggestions: string[];
}

/**
 * Snapshot recommendation
 */
export interface SnapshotRecommendation {
	should: boolean;
	reason: string;
	urgency: "now" | "soon" | "optional";
}

/**
 * Agent guidance for safe operations
 */
export interface AgentGuidance {
	safeOperations: string[];
	blockedOperations: string[];
	suggestion: string;
}

// =============================================================================
// LEARNINGS TYPES
// =============================================================================

/**
 * Learning entry from CLI .vreko/learnings/
 */
export interface Learning {
	id: string;
	type: "pattern" | "pitfall" | "efficiency" | "discovery" | "workflow";
	trigger: string;
	action: string;
	source: string;
	createdAt: string;
}

/**
 * Violation entry from CLI .vreko/patterns/violations.jsonl
 */
export interface Violation {
	type: string;
	file: string;
	message: string;
	count: number;
	date: string;
	prevention?: string;
	promotionStatus: "tracking" | "ready_for_promotion" | "promoted" | "automated";
}

/**
 * Pattern entry from CLI .vreko/patterns/workspace-patterns.json
 */
export interface WorkspacePattern {
	type: string;
	description: string;
	prevention: string;
	occurrences: number;
	promotedAt: string;
	lastSeenAt: string;
}

// =============================================================================
// MCP CONNECTION TYPES
// =============================================================================

/**
 * MCP connection status for dashboard
 */
export interface MCPConnectionInfo {
	state: ConnectionState;
	daemonVersion?: string;
	attempt?: number;
	maxAttempts?: number;
}

// =============================================================================
// AGGREGATE TYPES
// =============================================================================

/**
 * Complete workspace data snapshot
 */
export interface WorkspaceDataSnapshot {
	// Stats
	stats: DashboardStats;
	activity: ActivityData;
	settings: SettingsState;

	// Vitals & Health
	vitals: VitalsData | null;
	sessionHealth: SessionHealth;
	recommendation: SnapshotRecommendation;
	guidance: AgentGuidance;

	// Learnings
	learnings: Learning[];
	violations: Violation[];
	patterns: WorkspacePattern[];

	// MCP connection status
	mcpConnection: MCPConnectionInfo;
}

/**
 * Events emitted by WorkspaceDataService
 */
export type WorkspaceDataEvent =
	| { type: "stats-updated" }
	| { type: "vitals-updated" }
	| { type: "activity-updated" }
	| { type: "restore-recorded" }
	| { type: "ai-detection-recorded" }
	| { type: "learnings-updated" }
	| { type: "violations-updated" }
	| { type: "patterns-updated" }
	| { type: "degraded-changed" };

// =============================================================================
// SERVICE INTERFACES
// =============================================================================

/**
 * Coordinator interface for snapshot access
 */
export interface SnapshotCoordinator {
	listSnapshots(): Promise<
		Array<{
			id: string;
			timestamp: number;
			fileCount: number;
			name: string;
			anchorFile?: string;
		}>
	>;
}

/**
 * Vitals configuration
 */
export interface VitalsConfig {
	pressureThresholds: {
		moderate: number;
		high: number;
		critical: number;
	};
}
