/**
 * WorkspaceDataService - Unified Data Service for Webview Consolidation
 *
 * Consolidates data aggregation from:
 * - DashboardDataService: stats, activity, settings, AI detection
 * - UnifiedDataService: vitals, learnings, violations, patterns
 *
 * This is the single source of truth for all dashboard/webview data.
 *
 * @packageDocumentation
 */

import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";
import { getHeatIntegration } from "../heat";
import type { HeatTracker } from "../heat/HeatTracker";
import { getCliStatusSync } from "../utils/cli-status";
import { logger } from "../utils/logger";
import { getDaemonBridge } from "./DaemonBridge";

// =============================================================================
// CONSTANTS
// =============================================================================

const TOKENS_PER_RESTORE = 1400; // Estimated tokens saved per restore vs re-prompting
const TOKENS_PER_LINE = 4; // Approximate tokens per line of code
const GPT4_COST_PER_1K = 0.03; // GPT-4 cost per 1K tokens
const GPT35_COST_PER_1K = 0.002; // GPT-3.5 cost per 1K tokens
const LINES_PER_FILE_ESTIMATE = 50; // Estimated lines per file for stats
const TIMELINE_WINDOW_DAYS = 7; // Days to keep in timeline
const TIMELINE_MAX_SNAPSHOTS = 50; // Max snapshots in timeline
const DATA_CHANGE_DEBOUNCE_MS = 500; // Debounce for data change events

// Pressure thresholds (from @snapback/intelligence)
const PRESSURE_THRESHOLDS = {
	moderate: 50,
	high: 70,
	critical: 85,
};

// =============================================================================
// TYPES
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

/**
 * Learning entry from CLI .snapback/learnings/
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
 * Violation entry from CLI .snapback/patterns/violations.jsonl
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
 * Pattern entry from CLI .snapback/patterns/workspace-patterns.json
 */
export interface WorkspacePattern {
	type: string;
	description: string;
	prevention: string;
	occurrences: number;
	promotedAt: string;
	lastSeenAt: string;
}

/**
 * MCP connection status for dashboard
 */
export interface MCPConnectionInfo {
	state: "connected" | "disconnected" | "reconnecting" | "cli_missing";
	daemonVersion?: string;
	attempt?: number;
	maxAttempts?: number;
}

/**
 * Complete workspace data snapshot
 */
export interface WorkspaceDataSnapshot {
	// From DashboardDataService
	stats: DashboardStats;
	activity: ActivityData;
	settings: SettingsState;

	// From UnifiedDataService
	vitals: VitalsData | null;
	sessionHealth: SessionHealth;
	recommendation: SnapshotRecommendation;
	guidance: AgentGuidance;
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
	| { type: "patterns-updated" };

/**
 * Coordinator interface (minimal for testing)
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
 * Internal restore event tracking
 */
interface RestoreEvent {
	snapshotId: string;
	timestamp: number;
	filesRestored: number;
	tokensEstimate: number;
}

// =============================================================================
// WORKSPACE DATA SERVICE
// =============================================================================

/**
 * WorkspaceDataService - Unified data aggregation for dashboards
 *
 * Per-workspace singleton pattern with factory function.
 */
export class WorkspaceDataService implements vscode.Disposable {
	private static instances: Map<string, WorkspaceDataService> = new Map();

	private readonly workspaceId: string;
	private readonly coordinator: SnapshotCoordinator;
	private readonly snapbackDir: string;

	// Data caches
	private restoreEvents: RestoreEvent[] = [];
	private aiDetectionHistory: Map<string, AIDetectionEntry> = new Map();
	private activityEvents: ActivityEvent[] = [];
	private learnings: Learning[] = [];
	private violations: Violation[] = [];
	private patterns: WorkspacePattern[] = [];
	private lastVitals: VitalsData | null = null;
	private lastSnapshotTime: number | null = null;

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
	 * Get or create instance per workspace (static accessor)
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
		this.coordinator = coordinator;
		this.snapbackDir = path.join(workspacePath, ".snapback");

		this.initialize();
	}

	/**
	 * Initialize service: load data and setup watchers
	 */
	private initialize(): void {
		// Wire heat tracker if available
		this.wireHeatTracker();

		// Initial data load
		this.loadAllSnapbackData();

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
				this.recordAIDetection(heat.ai.tool, heat.ai.confidence);
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
			this.fileWatcher.onDidCreate(() => this.loadAllSnapbackData()),
			this.fileWatcher.onDidChange(() => this.loadAllSnapbackData()),
			this.fileWatcher.onDidDelete(() => this.loadAllSnapbackData()),
		);
	}

	/**
	 * Load all data from .snapback/ directory
	 */
	private loadAllSnapbackData(): void {
		this.loadLearnings();
		this.loadViolations();
		this.loadPatterns();
	}

	// ==========================================================================
	// LEARNINGS / VIOLATIONS / PATTERNS (from UnifiedDataService)
	// ==========================================================================

	/**
	 * Load learnings from .snapback/learnings/
	 */
	private loadLearnings(): void {
		const learningsDir = path.join(this.snapbackDir, "learnings");
		const files = ["user-learnings.jsonl", "learnings.jsonl"];

		for (const file of files) {
			const filePath = path.join(learningsDir, file);
			if (fs.existsSync(filePath)) {
				this.parseLearningsFile(filePath);
				return;
			}
		}

		this.learnings = [];
	}

	/**
	 * Parse JSONL learnings file
	 */
	private parseLearningsFile(filePath: string): void {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			const lines = content.trim().split("\n").filter(Boolean);

			this.learnings = lines
				.map((line) => {
					try {
						return JSON.parse(line) as Learning;
					} catch {
						return null;
					}
				})
				.filter((l): l is Learning => l !== null);

			this.fireDataChange({ type: "learnings-updated" });
		} catch {
			this.learnings = [];
		}
	}

	/**
	 * Load violations from .snapback/patterns/violations.jsonl
	 */
	private loadViolations(): void {
		const violationsFile = path.join(this.snapbackDir, "patterns", "violations.jsonl");

		if (!fs.existsSync(violationsFile)) {
			this.violations = [];
			return;
		}

		try {
			const content = fs.readFileSync(violationsFile, "utf-8");
			const lines = content.trim().split("\n").filter(Boolean);

			const violationMap = new Map<string, Violation>();

			for (const line of lines) {
				try {
					const entry = JSON.parse(line);
					const key = `${entry.type}:${entry.file}`;

					if (violationMap.has(key)) {
						const existing = violationMap.get(key);
						if (existing) {
							existing.count++;
							existing.date = entry.date || existing.date;
						}
					} else {
						violationMap.set(key, {
							type: entry.type,
							file: entry.file,
							message: entry.message || entry.whatHappened || "",
							count: 1,
							date: entry.date || new Date().toISOString(),
							prevention: entry.prevention,
							promotionStatus: this.getPromotionStatus(1),
						});
					}
				} catch {
					// Skip malformed lines
				}
			}

			// Update promotion status
			for (const violation of violationMap.values()) {
				violation.promotionStatus = this.getPromotionStatus(violation.count);
			}

			this.violations = Array.from(violationMap.values());
			this.fireDataChange({ type: "violations-updated" });
		} catch {
			this.violations = [];
		}
	}

	/**
	 * Get promotion status based on occurrence count
	 */
	private getPromotionStatus(count: number): Violation["promotionStatus"] {
		if (count >= 5) {
			return "automated";
		}
		if (count >= 3) {
			return "promoted";
		}
		if (count >= 2) {
			return "ready_for_promotion";
		}
		return "tracking";
	}

	/**
	 * Load patterns from .snapback/patterns/workspace-patterns.json
	 */
	private loadPatterns(): void {
		const patternsFile = path.join(this.snapbackDir, "patterns", "workspace-patterns.json");

		if (!fs.existsSync(patternsFile)) {
			this.patterns = [];
			return;
		}

		try {
			const content = fs.readFileSync(patternsFile, "utf-8");
			this.patterns = JSON.parse(content) as WorkspacePattern[];
			this.fireDataChange({ type: "patterns-updated" });
		} catch {
			this.patterns = [];
		}
	}

	// ==========================================================================
	// VITALS INTEGRATION (from UnifiedDataService)
	// ==========================================================================

	/**
	 * Update vitals from external source
	 */
	updateVitals(vitals: VitalsData): void {
		this.lastVitals = vitals;
		this.fireDataChange({ type: "vitals-updated" });
	}

	/**
	 * Record snapshot creation time
	 */
	recordSnapshot(): void {
		this.lastSnapshotTime = Date.now();
	}

	/**
	 * Get session health based on vitals
	 */
	private getSessionHealth(): SessionHealth {
		if (!this.lastVitals) {
			return {
				healthScore: 100,
				trajectory: "stable",
				activeWarnings: [],
				lastSnapshotMinutesAgo: null,
				suggestions: ["Enable vitals monitoring for real-time health tracking"],
			};
		}

		const vitals = this.lastVitals;

		// Health score is inverse of pressure
		const healthScore = Math.max(0, 100 - vitals.pressure.value);

		// Map trajectory
		const trajectoryMap: Record<string, SessionHealth["trajectory"]> = {
			stable: "stable",
			escalating: "degrading",
			critical: "critical",
			recovering: "improving",
		};
		const trajectory = trajectoryMap[vitals.trajectory] || "stable";

		// Build warnings
		const warnings: string[] = [];
		if (vitals.pulse.level === "racing" || vitals.pulse.level === "critical") {
			warnings.push(`High code velocity: ${vitals.pulse.changesPerMinute} changes/min`);
		}
		if (vitals.temperature.level === "hot" || vitals.temperature.level === "burning") {
			warnings.push(`High AI change density: ${vitals.temperature.aiPercentage}%`);
		}
		if (vitals.pressure.value >= PRESSURE_THRESHOLDS.high) {
			warnings.push(`Pressure at ${vitals.pressure.value}% - snapshot recommended`);
		}

		// Calculate last snapshot time
		const lastSnapshotMinutesAgo = this.lastSnapshotTime
			? Math.floor((Date.now() - this.lastSnapshotTime) / 60000)
			: null;

		// Build suggestions
		const suggestions: string[] = [];
		if (healthScore < 50) {
			suggestions.push("Create a snapshot to release pressure");
		}
		if (warnings.length > 2) {
			suggestions.push("Consider slowing down to review changes");
		}

		return {
			healthScore,
			trajectory,
			activeWarnings: warnings,
			lastSnapshotMinutesAgo,
			suggestions,
		};
	}

	/**
	 * Get snapshot recommendation
	 */
	private getSnapshotRecommendation(): SnapshotRecommendation {
		if (!this.lastVitals) {
			return {
				should: false,
				reason: "Vitals not available",
				urgency: "optional",
			};
		}

		const vitals = this.lastVitals;
		const health = this.getSessionHealth();

		// Critical state
		if (vitals.trajectory === "critical" || health.healthScore < 30) {
			return {
				should: true,
				reason: "Critical workspace state - immediate snapshot recommended",
				urgency: "now",
			};
		}

		// High pressure
		if (vitals.pressure.value >= PRESSURE_THRESHOLDS.critical) {
			return {
				should: true,
				reason: `High pressure (${vitals.pressure.value}%) - snapshot recommended`,
				urgency: "now",
			};
		}

		if (vitals.pressure.value >= PRESSURE_THRESHOLDS.high) {
			return {
				should: true,
				reason: `High pressure (${vitals.pressure.value}%) - snapshot recommended`,
				urgency: "soon",
			};
		}

		return {
			should: false,
			reason: "Workspace healthy - no snapshot needed",
			urgency: "optional",
		};
	}

	/**
	 * Get agent guidance for safe operations
	 */
	private getAgentGuidance(): AgentGuidance {
		if (!this.lastVitals) {
			return {
				safeOperations: ["read", "analyze", "search"],
				blockedOperations: [],
				suggestion: "Enable vitals for guidance",
			};
		}

		const vitals = this.lastVitals;
		const safeOps: string[] = ["read files", "analyze code", "search codebase"];
		const blockedOps: string[] = [];
		let suggestion = "";

		if (vitals.pressure.value >= PRESSURE_THRESHOLDS.high) {
			blockedOps.push("refactor large files", "delete files", "major restructuring");
			suggestion = "High pressure - complete current changes before major refactoring";
		} else if (vitals.pressure.value >= PRESSURE_THRESHOLDS.moderate) {
			safeOps.push("small edits", "add comments", "fix typos");
			blockedOps.push("large refactoring");
			suggestion = "Moderate pressure - keep changes small";
		} else {
			safeOps.push("refactor", "add features", "restructure");
			suggestion = "Workspace healthy - all operations safe";
		}

		if (vitals.trajectory === "critical") {
			blockedOps.push(...safeOps.filter((op) => op !== "read files"));
			safeOps.length = 0;
			safeOps.push("read files only");
			suggestion = "CRITICAL - snapshot immediately before any changes";
		}

		return {
			safeOperations: safeOps,
			blockedOperations: blockedOps,
			suggestion,
		};
	}

	// ==========================================================================
	// STATS AGGREGATION (from DashboardDataService)
	// ==========================================================================

	/**
	 * Get dashboard stats
	 */
	private async getStats(): Promise<DashboardStats> {
		try {
			const snapshots = await this.coordinator.listSnapshots();
			const now = Date.now();
			const todayStart = new Date().setHours(0, 0, 0, 0);
			const weekStart = now - 7 * 24 * 60 * 60 * 1000;

			const todaySnapshots = snapshots.filter((s) => s.timestamp >= todayStart);
			const todayRestores = this.restoreEvents.filter((r) => r.timestamp >= todayStart);
			const weekRestores = this.restoreEvents.filter((r) => r.timestamp >= weekStart);

			const tokensSaved = weekRestores.reduce((sum, r) => sum + r.tokensEstimate, 0);
			const linesProtected = snapshots.reduce((sum, s) => sum + (s.fileCount || 0) * LINES_PER_FILE_ESTIMATE, 0);
			const efficiencyPercentile = Math.min(20 + snapshots.length + weekRestores.length * 5, 95);

			return {
				snapshotsToday: todaySnapshots.length,
				totalSnapshots: snapshots.length,
				restoresToday: todayRestores.length,
				linesProtected,
				tokensSaved: tokensSaved || weekRestores.length * TOKENS_PER_RESTORE,
				restoresThisWeek: weekRestores.length,
				efficiencyPercentile,
			};
		} catch (error) {
			logger.error("Failed to get stats", error as Error);
			return {
				snapshotsToday: 0,
				totalSnapshots: 0,
				restoresToday: 0,
				linesProtected: 0,
				tokensSaved: 0,
				restoresThisWeek: 0,
				efficiencyPercentile: 0,
			};
		}
	}

	// ==========================================================================
	// ACTIVITY TRACKING (from DashboardDataService)
	// ==========================================================================

	/**
	 * Get activity data
	 */
	private async getActivityData(): Promise<ActivityData> {
		const now = Date.now();
		const todayStart = new Date().setHours(0, 0, 0, 0);
		const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
		const weekStart = now - TIMELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

		const timeline = await this.buildTimeline();
		const aiDetectionLog = this.getAIDetectionLog();

		const todayEvents = timeline.filter((e) => e.timestamp >= todayStart).length;
		const yesterdayEvents = timeline.filter(
			(e) => e.timestamp >= yesterdayStart && e.timestamp < todayStart,
		).length;
		const weekEvents = timeline.filter((e) => e.timestamp >= weekStart).length;

		return {
			timeline,
			aiDetectionLog,
			todayEvents,
			yesterdayEvents,
			weekEvents,
		};
	}

	/**
	 * Build activity timeline from various sources
	 */
	private async buildTimeline(): Promise<ActivityEvent[]> {
		const events: ActivityEvent[] = [...this.activityEvents];
		const now = Date.now();
		const windowStart = now - TIMELINE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

		try {
			const snapshots = await this.coordinator.listSnapshots();
			const recentSnapshots = snapshots.filter((s) => s.timestamp > windowStart).slice(0, TIMELINE_MAX_SNAPSHOTS);

			for (const snapshot of recentSnapshots) {
				events.push({
					id: snapshot.id,
					type: "auto-snapshot",
					file: snapshot.anchorFile || snapshot.name || "snapshot",
					timestamp: snapshot.timestamp,
					details: `${snapshot.fileCount} files`,
				});
			}

			// Add restore events
			for (const restore of this.restoreEvents) {
				if (restore.timestamp > windowStart) {
					events.push({
						id: `restore-${restore.snapshotId}-${restore.timestamp}`,
						type: "restore",
						file: `Restored ${restore.filesRestored} files`,
						timestamp: restore.timestamp,
						details: `~${restore.tokensEstimate} tokens saved`,
					});
				}
			}
		} catch (error) {
			logger.error("Failed to build timeline", error as Error);
		}

		// Deduplicate and sort
		const uniqueEvents = new Map<string, ActivityEvent>();
		for (const event of events) {
			if (!uniqueEvents.has(event.id)) {
				uniqueEvents.set(event.id, event);
			}
		}

		return Array.from(uniqueEvents.values()).sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Get AI detection log
	 */
	private getAIDetectionLog(): AIDetectionEntry[] {
		return Array.from(this.aiDetectionHistory.values()).sort((a, b) => b.sessions - a.sessions);
	}

	// ==========================================================================
	// SETTINGS STATE (from DashboardDataService)
	// ==========================================================================

	/**
	 * Get settings state
	 */
	private async getSettingsState(): Promise<SettingsState> {
		const config = vscode.workspace.getConfiguration("snapback");
		const sensitivity = config.get<string>("snapshot.sensitivity", "medium");
		const excludePatterns = config.get<string[]>("snapshot.excludePatterns", ["node_modules", "dist", ".git"]);

		const languagePacks = this.getLanguagePacks();

		// Get actual CLI status instead of hardcoding
		const cliStatus = getCliStatusSync();

		return {
			detectedAITool: null, // Would detect from workspace
			cliInstalled: cliStatus.installed,
			cliVersion: cliStatus.version,
			protectionThreshold: sensitivity as "low" | "medium" | "high",
			excludePatterns,
			languagePacks,
		};
	}

	/**
	 * Get language pack status
	 */
	private getLanguagePacks(): SettingsState["languagePacks"] {
		const config = vscode.workspace.getConfiguration("snapback");
		const enabledLanguages = config.get<string[]>("languages.enabled", ["typescript", "javascript"]);

		return [
			{
				name: "TypeScript / JavaScript",
				enabled: enabledLanguages.some((l) => ["typescript", "javascript"].includes(l.toLowerCase())),
				builtin: true,
			},
			{
				name: "React / JSX",
				enabled: enabledLanguages.some((l) => ["typescriptreact", "javascriptreact"].includes(l.toLowerCase())),
				builtin: true,
			},
			{
				name: "Python",
				enabled: enabledLanguages.includes("python"),
				builtin: false,
			},
			{
				name: "Go",
				enabled: enabledLanguages.includes("go"),
				builtin: false,
			},
			{
				name: "Rust",
				enabled: enabledLanguages.includes("rust"),
				builtin: false,
			},
		];
	}

	// ==========================================================================
	// PUBLIC API - Event Recording
	// ==========================================================================

	/**
	 * Record a restore event
	 */
	recordRestore(snapshotId: string, filesRestored: number): void {
		const tokensEstimate = filesRestored * LINES_PER_FILE_ESTIMATE * TOKENS_PER_LINE + TOKENS_PER_RESTORE;

		this.restoreEvents.push({
			snapshotId,
			timestamp: Date.now(),
			filesRestored,
			tokensEstimate,
		});

		// Prune old events (keep last 30 days)
		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
		this.restoreEvents = this.restoreEvents.filter((e) => e.timestamp > thirtyDaysAgo);

		this.fireDataChange({ type: "restore-recorded" });
		logger.debug("Restore recorded", { snapshotId, filesRestored, tokensEstimate });
	}

	/**
	 * Record AI detection
	 */
	recordAIDetection(tool: string, confidence: number): void {
		const existing = this.aiDetectionHistory.get(tool) || {
			tool,
			sessions: 0,
			accuracy: confidence * 100,
			lastDetected: 0,
		};

		existing.sessions++;
		existing.lastDetected = Date.now();
		existing.accuracy = Math.round((existing.accuracy + confidence * 100) / 2);

		this.aiDetectionHistory.set(tool, existing);
		this.fireDataChange({ type: "ai-detection-recorded" });
	}

	/**
	 * Calculate token cost savings
	 */
	getTokenCostSavings(tokensSaved: number): { gpt4: string; gpt35: string } {
		return {
			gpt4: ((tokensSaved / 1000) * GPT4_COST_PER_1K).toFixed(2),
			gpt35: ((tokensSaved / 1000) * GPT35_COST_PER_1K).toFixed(2),
		};
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
			this.getStats(),
			this.getActivityData(),
			this.getSettingsState(),
		]);

		return {
			stats,
			activity,
			settings,
			vitals: this.lastVitals,
			sessionHealth: this.getSessionHealth(),
			recommendation: this.getSnapshotRecommendation(),
			guidance: this.getAgentGuidance(),
			learnings: [...this.learnings],
			violations: [...this.violations],
			patterns: [...this.patterns],
			mcpConnection: this.getMCPConnection(),
		};
	}

	// ==========================================================================
	// EVENT MANAGEMENT
	// ==========================================================================

	/**
	 * Fire data change event with debouncing
	 * Coalesces rapid updates into single event per type
	 *
	 * NOTE: All events are now debounced including vitals-updated.
	 * Previously vitals bypassed debouncing which contributed to webview crashes
	 * from frequent postMessage payloads overwhelming the renderer.
	 * The panel also has a 1-second throttle as a second layer of protection.
	 */
	private fireDataChange(event: WorkspaceDataEvent): void {
		// Debounce all events - deduplicate by type
		const existingIndex = this.pendingEvents.findIndex((e) => e.type === event.type);
		if (existingIndex >= 0) {
			// Replace existing event of same type (coalesce)
			this.pendingEvents[existingIndex] = event;
		} else {
			this.pendingEvents.push(event);
		}

		if (this.dataChangeDebounceTimer) {
			return;
		}

		this.dataChangeDebounceTimer = setTimeout(() => {
			this.dataChangeDebounceTimer = null;

			// Fire one consolidated event (the last pending event)
			// This coalesces multiple rapid updates into single notification
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
	 * Internal dispose (called from static disposeAll)
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
	 * Public dispose (removes from instances map)
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
 *
 * @param workspaceId - Unique identifier for the workspace
 * @param workspacePath - File system path to the workspace
 * @param coordinator - Snapshot coordinator for accessing snapshot data
 * @returns The WorkspaceDataService instance for this workspace
 */
export function createWorkspaceDataService(
	workspaceId: string,
	workspacePath: string,
	coordinator: SnapshotCoordinator,
): WorkspaceDataService {
	return WorkspaceDataService.for(workspaceId, workspacePath, coordinator);
}
