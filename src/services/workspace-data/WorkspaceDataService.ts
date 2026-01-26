/**
 * WorkspaceDataService - Unified Data Service Coordinator
 *
 * Refactored to follow Single Responsibility Principle.
 * This class is now a coordinator/facade that composes specialized services.
 *
 * Services:
 * - StatsService: Dashboard statistics
 * - ActivityService: Timeline and AI detection
 * - VitalsService: Health, recommendations, guidance
 * - LearningsService: Learnings, violations, patterns
 * - SettingsService: VS Code settings
 *
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { getHeatIntegration } from "../../heat";
import type { HeatTracker } from "../../heat/HeatTracker";
import { logger } from "../../utils/logger";
import { getDaemonBridge } from "../DaemonBridge";
import { ActivityService } from "./ActivityService";
import { LearningsService } from "./LearningsService";
import { SettingsService } from "./SettingsService";
import { StatsService } from "./StatsService";
import type {
	MCPConnectionInfo,
	SnapshotCoordinator,
	VitalsData,
	WorkspaceDataEvent,
	WorkspaceDataSnapshot,
} from "./types";
import { DATA_CHANGE_DEBOUNCE_MS } from "./types";
import { VitalsService } from "./VitalsService";

// Re-export types for backward compatibility
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
	VitalsData,
	WorkspaceDataEvent,
	WorkspaceDataSnapshot,
	WorkspacePattern,
} from "./types";

/**
 * WorkspaceDataService - Coordinator for all workspace data services
 *
 * Per-workspace pattern with factory function.
 * Now delegates to specialized services instead of doing everything itself.
 */
export class WorkspaceDataService implements vscode.Disposable {
	private static instances: Map<string, WorkspaceDataService> = new Map();

	private readonly workspaceId: string;
	private readonly snapbackDir: string;

	// Composed services
	private readonly statsService: StatsService;
	private readonly activityService: ActivityService;
	private readonly vitalsService: VitalsService;
	private readonly learningsService: LearningsService;
	private readonly settingsService: SettingsService;

	// Heat tracker integration
	private heatTrackerWired = false;

	// File watcher
	private fileWatcher: vscode.FileSystemWatcher | null = null;
	private disposables: vscode.Disposable[] = [];

	// Event emitter with debouncing
	private readonly _onDataChange = new vscode.EventEmitter<WorkspaceDataEvent>();
	readonly onDataChange = this._onDataChange.event;
	private dataChangeDebounceTimer: NodeJS.Timeout | null = null;
	private pendingEvents: WorkspaceDataEvent[] = [];

	// ==========================================================================
	// STATIC METHODS (Factory Pattern)
	// ==========================================================================

	/**
	 * Get or create instance per workspace
	 */
	static for(workspaceId: string, workspacePath: string, coordinator: SnapshotCoordinator): WorkspaceDataService {
		if (!WorkspaceDataService.instances.has(workspaceId)) {
			const instance = new WorkspaceDataService(workspaceId, workspacePath, coordinator);
			WorkspaceDataService.instances.set(workspaceId, instance);
		}
		const instance = WorkspaceDataService.instances.get(workspaceId);
		if (!instance) {
			throw new Error(`Failed to create WorkspaceDataService for ${workspaceId}`);
		}
		return instance;
	}

	/**
	 * Dispose all instances
	 */
	static disposeAll(): void {
		for (const instance of WorkspaceDataService.instances.values()) {
			instance.disposeInternal();
		}
		WorkspaceDataService.instances.clear();
	}

	// ==========================================================================
	// CONSTRUCTOR
	// ==========================================================================

	constructor(workspaceId: string, workspacePath: string, coordinator: SnapshotCoordinator) {
		this.workspaceId = workspaceId;
		this.snapbackDir = path.join(workspacePath, ".snapback");

		// Initialize composed services
		this.activityService = new ActivityService(coordinator);
		this.statsService = new StatsService(coordinator, () => this.activityService.getRestoreEvents());
		this.vitalsService = new VitalsService();
		this.learningsService = new LearningsService(this.snapbackDir);
		this.settingsService = new SettingsService();

		// Wire up change callbacks
		this.activityService.setOnChangeCallback((event) => {
			this.fireDataChange({ type: event });
		});
		this.vitalsService.setOnChangeCallback(() => {
			this.fireDataChange({ type: "vitals-updated" });
		});
		this.learningsService.setOnChangeCallback((event) => {
			this.fireDataChange({ type: event });
		});

		this.initialize();
	}

	/**
	 * Initialize service: load data and setup watchers
	 */
	private initialize(): void {
		// Wire heat tracker if available
		this.wireHeatTracker();

		// Initial data load
		this.learningsService.loadAll();

		// Setup file watcher for .snapback/ directory
		this.setupFileWatcher();

		logger.debug("WorkspaceDataService initialized", {
			workspaceId: this.workspaceId,
			snapbackDir: this.snapbackDir,
		});
	}

	/**
	 * Wire heat tracker event listener
	 */
	private wireHeatTracker(): void {
		if (this.heatTrackerWired) {
			return;
		}

		const integration = getHeatIntegration();
		const tracker = integration?.tracker;

		if (!tracker) {
			return;
		}

		this.disposables.push(
			tracker.onHeatChanged((files: string[]) => {
				this.processHeatChange(files, tracker);
			}),
		);
		this.heatTrackerWired = true;
		logger.debug("WorkspaceDataService wired to HeatTracker");
	}

	/**
	 * Process heat changes
	 */
	private processHeatChange(files: string[], tracker: HeatTracker): void {
		for (const filePath of files) {
			const heat = tracker.getRawHeatData(filePath);
			if (heat?.ai.involved && heat.ai.tool) {
				this.activityService.recordAIDetection(heat.ai.tool, heat.ai.confidence);
			}
		}
	}

	/**
	 * Setup file watcher for .snapback/ directory
	 */
	private setupFileWatcher(): void {
		if (!fs.existsSync(this.snapbackDir)) {
			return;
		}

		const pattern = new vscode.RelativePattern(this.snapbackDir, "**/*");
		this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		this.disposables.push(
			this.fileWatcher.onDidCreate(() => this.learningsService.loadAll()),
			this.fileWatcher.onDidChange(() => this.learningsService.loadAll()),
			this.fileWatcher.onDidDelete(() => this.learningsService.loadAll()),
		);
	}

	// ==========================================================================
	// PUBLIC API - Delegated to Services
	// ==========================================================================

	/**
	 * Update vitals from external source
	 */
	updateVitals(vitals: VitalsData): void {
		this.vitalsService.updateVitals(vitals);
	}

	/**
	 * Record snapshot creation time
	 */
	recordSnapshot(): void {
		this.vitalsService.recordSnapshot();
	}

	/**
	 * Record a restore event
	 */
	recordRestore(snapshotId: string, filesRestored: number): void {
		this.activityService.recordRestore(snapshotId, filesRestored);
	}

	/**
	 * Record AI detection
	 */
	recordAIDetection(tool: string, confidence: number): void {
		this.activityService.recordAIDetection(tool, confidence);
	}

	/**
	 * Calculate token cost savings
	 */
	getTokenCostSavings(tokensSaved: number): { gpt4: string; gpt35: string } {
		return this.statsService.getTokenCostSavings(tokensSaved);
	}

	// ==========================================================================
	// MCP CONNECTION STATUS
	// ==========================================================================

	/**
	 * Get MCP connection status from DaemonBridge
	 */
	private getMCPConnection(): MCPConnectionInfo {
		const bridge = getDaemonBridge();
		const state = bridge.getState();
		const daemonVersion = bridge.getDaemonVersion();

		return {
			state,
			daemonVersion,
		};
	}

	// ==========================================================================
	// PUBLIC API - Main Snapshot Method
	// ==========================================================================

	/**
	 * Get complete workspace data snapshot
	 */
	async getSnapshot(): Promise<WorkspaceDataSnapshot> {
		const [stats, activity, settings] = await Promise.all([
			this.statsService.getStats(),
			this.activityService.getActivityData(),
			this.settingsService.getSettingsState(),
		]);

		return {
			stats,
			activity,
			settings,
			vitals: this.vitalsService.getVitals(),
			sessionHealth: this.vitalsService.getSessionHealth(),
			recommendation: this.vitalsService.getSnapshotRecommendation(),
			guidance: this.vitalsService.getAgentGuidance(),
			learnings: this.learningsService.getLearnings(),
			violations: this.learningsService.getViolations(),
			patterns: this.learningsService.getPatterns(),
			mcpConnection: this.getMCPConnection(),
		};
	}

	// ==========================================================================
	// EVENT MANAGEMENT
	// ==========================================================================

	/**
	 * Fire data change event with debouncing
	 */
	private fireDataChange(event: WorkspaceDataEvent): void {
		// Deduplicate by type
		const existingIndex = this.pendingEvents.findIndex((e) => e.type === event.type);
		if (existingIndex >= 0) {
			this.pendingEvents[existingIndex] = event;
		} else {
			this.pendingEvents.push(event);
		}

		if (this.dataChangeDebounceTimer) {
			return;
		}

		this.dataChangeDebounceTimer = setTimeout(() => {
			this.dataChangeDebounceTimer = null;

			if (this.pendingEvents.length > 0) {
				const lastEvent = this.pendingEvents[this.pendingEvents.length - 1];
				this._onDataChange.fire(lastEvent);
			}
			this.pendingEvents = [];
		}, DATA_CHANGE_DEBOUNCE_MS);
	}

	// ==========================================================================
	// LIFECYCLE
	// ==========================================================================

	/**
	 * Internal dispose
	 */
	private disposeInternal(): void {
		if (this.dataChangeDebounceTimer) {
			clearTimeout(this.dataChangeDebounceTimer);
			this.dataChangeDebounceTimer = null;
		}

		this.fileWatcher?.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this._onDataChange.dispose();

		logger.debug("WorkspaceDataService disposed", { workspaceId: this.workspaceId });
	}

	/**
	 * Public dispose
	 */
	dispose(): void {
		this.disposeInternal();
		WorkspaceDataService.instances.delete(this.workspaceId);
	}
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create or retrieve a WorkspaceDataService instance for the given workspace.
 */
export function createWorkspaceDataService(
	workspaceId: string,
	workspacePath: string,
	coordinator: SnapshotCoordinator,
): WorkspaceDataService {
	return WorkspaceDataService.for(workspaceId, workspacePath, coordinator);
}
