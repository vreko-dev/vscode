/**
 * Unified Types for SnapBack Dashboard Webview
 *
 * These types mirror the WorkspaceDataSnapshot from WorkspaceDataService.
 * Since webviews run in a browser context, they cannot import directly from
 * extension code, so types are re-declared here.
 *
 * @see apps/vscode/src/services/WorkspaceDataService.ts for source definitions
 * @packageDocumentation
 */

// =============================================================================
// DASHBOARD TAB TYPES
// =============================================================================

/**
 * Valid dashboard tabs - matches DashboardTab in UnifiedDashboardPanel.ts
 */
export type DashboardTab = "home" | "vitals" | "activity" | "settings";

/**
 * Tab configuration item
 */
export interface TabConfig {
	id: DashboardTab;
	label: string;
	icon: string;
}

// =============================================================================
// STATS TYPES (from WorkspaceDataService.DashboardStats)
// =============================================================================

/**
 * Stats aggregation for dashboard home tab
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
// ACTIVITY TYPES (from WorkspaceDataService.ActivityData)
// =============================================================================

/**
 * Activity timeline event
 */
export interface ActivityEvent {
	id: string;
	type: "ai-edit" | "manual-snapshot" | "auto-snapshot" | "restore";
	file: string;
	timestamp: number;
	aiTool?: string;
	details?: string;
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

// =============================================================================
// VITALS TYPES
// =============================================================================

/**
 * Backend vitals data structure (nested format from WorkspaceDataService.VitalsData)
 */
export interface BackendVitalsData {
	pulse: { changesPerMinute: number; level: string };
	temperature: { aiPercentage: number; level: string };
	pressure: { value: number };
	oxygen: { value: number };
	trajectory: string;
}

/**
 * UI vitals data structure (flat format for @snapback/ui WorkspaceVitals component)
 * @see packages/ui/src/vitals/WorkspaceVitals.tsx
 */
export interface UIVitalsData {
	pulse: number;
	temperature: number;
	pressure: number;
	oxygen: number;
	score: number;
}

/**
 * Session health metrics (from WorkspaceDataService.SessionHealth)
 */
export interface SessionHealth {
	healthScore: number;
	trajectory: "improving" | "stable" | "degrading" | "critical";
	activeWarnings: string[];
	lastSnapshotMinutesAgo: number | null;
	suggestions: string[];
}

/**
 * Snapshot recommendation (from WorkspaceDataService.SnapshotRecommendation)
 */
export interface SnapshotRecommendation {
	should: boolean;
	reason: string;
	urgency: "now" | "soon" | "optional";
}

/**
 * Agent guidance for safe operations (from WorkspaceDataService.AgentGuidance)
 */
export interface AgentGuidance {
	safeOperations: string[];
	blockedOperations: string[];
	suggestion: string;
}

/**
 * UI guidance format (for @snapback/ui WorkspaceVitals component)
 */
export interface UIGuidance {
	message: string;
}

// =============================================================================
// LEARNINGS / VIOLATIONS / PATTERNS
// =============================================================================

/**
 * Learning entry (from WorkspaceDataService.Learning)
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
 * Violation entry (from WorkspaceDataService.Violation)
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
 * Pattern entry (from WorkspaceDataService.WorkspacePattern)
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
 * MCP connection status (from WorkspaceDataService.MCPConnectionInfo)
 */
export interface MCPConnectionInfo {
	state: "connected" | "disconnected" | "reconnecting" | "cli_missing";
	daemonVersion?: string;
	attempt?: number;
	maxAttempts?: number;
}

// =============================================================================
// MESSAGE PROTOCOL TYPES
// =============================================================================

/**
 * Message from extension to webview (update message payload)
 * Matches the postMessage format in UnifiedDashboardPanel.sendDataToWebview()
 */
export interface UpdateMessagePayload {
	type: "update";
	stats: DashboardStats;
	activity: ActivityData;
	settings: SettingsState;
	vitals: BackendVitalsData | null;
	sessionHealth: SessionHealth;
	recommendation: SnapshotRecommendation;
	guidance: AgentGuidance;
	learnings: Learning[];
	violations: Violation[];
	patterns: WorkspacePattern[];
	mcpConnection: MCPConnectionInfo;
}

/**
 * Navigate message from extension to webview
 */
export interface NavigateMessage {
	type: "navigate";
	tab: DashboardTab;
}

/**
 * Union of all extension-to-webview message types
 */
export type ExtensionMessage = UpdateMessagePayload | NavigateMessage;

// =============================================================================
// SETTINGS STATE (from WorkspaceDataService.SettingsState)
// =============================================================================

/**
 * Settings state for setup tab
 */
export interface SettingsState {
	detectedAITool: string | null;
	cliInstalled: boolean;
	cliVersion: string | null;
	protectionThreshold: "low" | "medium" | "high";
	excludePatterns: string[];
	languagePacks: Array<{ name: string; enabled: boolean; builtin: boolean }>;
}
