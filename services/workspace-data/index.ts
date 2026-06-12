/**
 * Workspace Data Services
 *
 * Decomposed workspace data management following Single Responsibility Principle.
 *
 * @packageDocumentation
 */

export { ActivityService } from "./ActivityService";
export { LearningsService } from "./LearningsService";
export { SettingsService } from "./SettingsService";
// Individual services (for direct use in testing or specialized scenarios)
export { StatsService } from "./StatsService";
// Types
export type {
	ActivityData,
	ActivityEvent,
	AgentGuidance,
	AIDetectionEntry,
	DashboardStats,
	Learning,
	MCPConnectionInfo,
	RestoreEvent,
	SessionHealth,
	SettingsState,
	SnapshotCoordinator,
	SnapshotRecommendation,
	Violation,
	VitalsConfig,
	VitalsData,
	WorkspaceDataEvent,
	WorkspaceDataSnapshot,
	WorkspacePattern,
} from "./types";
// Constants
export {
	DATA_CHANGE_DEBOUNCE_MS,
	GPT4_COST_PER_1K,
	GPT35_COST_PER_1K,
	LINES_PER_FILE_ESTIMATE,
	PRESSURE_THRESHOLDS,
	TIMELINE_MAX_SNAPSHOTS,
	TIMELINE_WINDOW_DAYS,
	TOKENS_PER_LINE,
	TOKENS_PER_RESTORE,
} from "./types";
export { VitalsService } from "./VitalsService";
// Main coordinator (backward compatible export)
export {
	createWorkspaceDataService,
	WorkspaceDataService,
} from "./WorkspaceDataService";
