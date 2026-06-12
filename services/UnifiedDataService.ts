/**
 * UnifiedDataService
 *
 * Consolidates all data sources for the VS Code extension:
 * - WorkspaceVitals via AutoDecisionIntegration (types via intelligence package)
 * - CLI data from daemon via DaemonBridge (learnings, violations, patterns)
 * - Session health metrics
 * - Snapshot recommendations
 *
 * This service bridges the gap between CLI/MCP capabilities and extension UI.
 * All data flows through the daemon for consistency across surfaces.
 *
 * @see CLI_MCP_INTEGRATION_GAP_ANALYSIS.md for full gap analysis
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { VitalsSnapshot } from "@vreko/contracts";

import * as vscode from "vscode";
import { logger } from "../utils/logger";
import type { DaemonBridge } from "./DaemonBridge";
// All thresholds imported from canonical extension location (workspace-data/types.ts)
import { OXYGEN_THRESHOLDS, PRESSURE_THRESHOLDS, TIME_THRESHOLDS } from "./workspace-data/types.js";

// ============================================================================
// TYPES
// ============================================================================

/**
 * Learning entry from daemon
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
 * Violation entry from daemon
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
 * Pattern entry from daemon
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
 * Session health metrics (derived from vitals)
 */
export interface SessionHealth {
	healthScore: number; // 0-100, inverse of pressure
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
 * Unified data snapshot containing all available data
 */
export interface UnifiedDataSnapshot {
	vitals: VitalsSnapshot | null;
	sessionHealth: SessionHealth;
	recommendation: SnapshotRecommendation;
	guidance: AgentGuidance;
	learnings: Learning[];
	violations: Violation[];
	patterns: WorkspacePattern[];
	stats: {
		totalLearnings: number;
		totalViolations: number;
		promotedPatterns: number;
		pendingPromotion: number;
	};
	degraded: boolean;
}

/**
 * Events emitted by UnifiedDataService
 */
export type UnifiedDataEvent =
	| { type: "vitals-updated"; data: VitalsSnapshot }
	| { type: "health-changed"; data: SessionHealth }
	| { type: "recommendation-changed"; data: SnapshotRecommendation }
	| { type: "learnings-updated"; data: Learning[] }
	| { type: "violations-updated"; data: Violation[] }
	| { type: "patterns-updated"; data: WorkspacePattern[] }
	| { type: "degraded-changed"; data: boolean };

// ============================================================================
// UNIFIED DATA SERVICE
// ============================================================================

/**
 * UnifiedDataService - Single source of truth for all extension data
 *
 * Consolidates:
 * - WorkspaceVitals (real-time workspace health)
 * - Daemon data (via DaemonBridge IPC)
 * - Session health metrics
 * - Snapshot recommendations
 *
 * Architecture: Daemon-first with graceful degradation.
 * All data comes from the daemon. If daemon is unavailable,
 * returns empty data with degraded flag set.
 */
export class UnifiedDataService implements vscode.Disposable {
	private static instances: Map<string, UnifiedDataService> = new Map();

	private readonly workspaceId: string;
	private readonly workspaceRoot: string;
	private readonly vrekoDir: string;

	// Daemon bridge for IPC
	private daemonBridge: DaemonBridge | null = null;

	// Degraded state tracking
	private degraded = false;

	// Data caches
	private learnings: Learning[] = [];
	private violations: Violation[] = [];
	private patterns: WorkspacePattern[] = [];
	private lastVitals: VitalsSnapshot | null = null;
	private lastSnapshotTime: number | null = null;

	// Calibrated threshold multiplier from learning system
	// 0.7 = conservative (more protective), 1.0 = balanced, 1.3 = aggressive (less nagging)
	private thresholdMultiplier = 1.0;

	// File watchers (kept for patterns which don't have daemon methods yet)
	private fileWatcher: vscode.FileSystemWatcher | null = null;
	private disposables: vscode.Disposable[] = [];

	// Event emitter
	private readonly _onDataChange = new vscode.EventEmitter<UnifiedDataEvent>();
	public readonly onDataChange = this._onDataChange.event;

	// Update throttling
	private updatePending = false;
	private readonly UPDATE_THROTTLE_MS = 500;

	/**
	 * Get or create singleton instance per workspace
	 */
	static for(workspaceId: string, workspaceRoot: string): UnifiedDataService {
		if (!UnifiedDataService.instances.has(workspaceId)) {
			UnifiedDataService.instances.set(workspaceId, new UnifiedDataService(workspaceId, workspaceRoot));
		}
		return UnifiedDataService.instances.get(workspaceId)!;
	}

	/**
	 * Dispose all instances
	 */
	static disposeAll(): void {
		for (const instance of UnifiedDataService.instances.values()) {
			instance.dispose();
		}
		UnifiedDataService.instances.clear();
	}

	private constructor(workspaceId: string, workspaceRoot: string) {
		this.workspaceId = workspaceId;
		this.workspaceRoot = workspaceRoot;
		this.vrekoDir = path.join(workspaceRoot, ".vreko");

		// Note: initialize() is called after setDaemonBridge() in extension activation
	}

	/**
	 * Set the DaemonBridge for IPC communication
	 * Must be called before initialize() for daemon-first data loading
	 */
	setDaemonBridge(bridge: DaemonBridge): void {
		this.daemonBridge = bridge;
		logger.debug("DaemonBridge set for UnifiedDataService", { workspaceId: this.workspaceId });
	}

	/**
	 * Check if service is in degraded state (daemon unavailable)
	 */
	isDegraded(): boolean {
		return this.degraded;
	}

	/**
	 * Initialize service: load data and setup watchers
	 * Should be called after setDaemonBridge()
	 */
	async initialize(): Promise<void> {
		// Initial data load from daemon
		await this.loadAllData();

		// Setup file watcher for patterns (no daemon method yet)
		this.setupFileWatcher();

		logger.info("UnifiedDataService initialized", {
			workspaceId: this.workspaceId,
			vrekoDir: this.vrekoDir,
			degraded: this.degraded,
		});
	}

	/**
	 * Setup file watcher for .vreko/ directory
	 * Used for patterns which don't have daemon methods yet
	 */
	private setupFileWatcher(): void {
		if (!fs.existsSync(this.vrekoDir)) {
			logger.debug("No .vreko directory found, skipping file watcher", {
				vrekoDir: this.vrekoDir,
			});
			return;
		}

		// Watch for changes in .vreko/ directory
		const pattern = new vscode.RelativePattern(this.vrekoDir, "**/*");
		this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		this.disposables.push(
			this.fileWatcher.onDidCreate(() => this.scheduleUpdate()),
			this.fileWatcher.onDidChange(() => this.scheduleUpdate()),
			this.fileWatcher.onDidDelete(() => this.scheduleUpdate()),
		);

		logger.debug("File watcher setup for .vreko/", {
			pattern: pattern.pattern,
		});
	}

	/**
	 * Schedule throttled update
	 */
	private scheduleUpdate(): void {
		if (this.updatePending) {
			return;
		}

		this.updatePending = true;
		setTimeout(async () => {
			this.updatePending = false;
			await this.loadAllData();
		}, this.UPDATE_THROTTLE_MS);
	}

	/**
	 * Load all data from daemon
	 */
	private async loadAllData(): Promise<void> {
		await Promise.all([this.loadLearnings(), this.loadViolations(), this.loadPatterns()]);
	}

	/**
	 * Load learnings from daemon via DaemonBridge
	 * Daemon-first: if daemon unavailable, returns empty with degraded flag
	 */
	private async loadLearnings(): Promise<void> {
		// Check daemon availability
		if (!this.daemonBridge?.isConnected()) {
			const wasDegraded = this.degraded;
			this.degraded = true;
			if (!wasDegraded) {
				this._onDataChange.fire({ type: "degraded-changed", data: true });
			}
			logger.warn("UnifiedDataService: Daemon not connected, learnings unavailable", {
				workspaceId: this.workspaceId,
			});
			this.learnings = [];
			return;
		}

		try {
			const result = await this.daemonBridge.listLearnings(this.workspaceRoot);

			const previousCount = this.learnings.length;

			// Map daemon response to Learning type
			this.learnings = (result.learnings || []).map((l, idx) => ({
				id: `learning-${idx}-${Date.now()}`,
				type: l.type as Learning["type"],
				trigger: l.trigger,
				action: l.action,
				source: l.source || "daemon",
				createdAt: l.timestamp || new Date().toISOString(),
			}));

			// Clear degraded flag on success
			if (this.degraded) {
				this.degraded = false;
				this._onDataChange.fire({ type: "degraded-changed", data: false });
			}

			if (this.learnings.length !== previousCount) {
				this._onDataChange.fire({ type: "learnings-updated", data: this.learnings });
			}

			logger.debug("Learnings loaded from daemon", {
				count: this.learnings.length,
				total: result.total,
			});
		} catch (error) {
			const wasDegraded = this.degraded;
			this.degraded = true;
			if (!wasDegraded) {
				this._onDataChange.fire({ type: "degraded-changed", data: true });
			}
			logger.warn("Failed to load learnings from daemon", {
				error: (error as Error).message,
				workspaceId: this.workspaceId,
			});
			this.learnings = [];
		}
	}

	/**
	 * Load violations from daemon via DaemonBridge
	 * Daemon-first: if daemon unavailable, returns empty with degraded flag
	 */
	private async loadViolations(): Promise<void> {
		// Check daemon availability
		if (!this.daemonBridge?.isConnected()) {
			logger.warn("UnifiedDataService: Daemon not connected, violations unavailable", {
				workspaceId: this.workspaceId,
			});
			this.violations = [];
			return;
		}

		try {
			const result = await this.daemonBridge.listViolations(this.workspaceRoot);

			const previousCount = this.violations.length;

			// Map daemon response to Violation type
			// Daemon returns violations grouped by type+file with occurrence counts
			this.violations = (result.violations || []).map((v) => ({
				type: v.type,
				file: v.file,
				message: v.whatHappened || "",
				count: v.occurrences || 1,
				date: v.createdAt || new Date().toISOString(),
				prevention: v.prevention,
				promotionStatus: this.getPromotionStatus(v.occurrences || 1),
			}));

			// Clear degraded flag on success
			if (this.degraded) {
				this.degraded = false;
				this._onDataChange.fire({ type: "degraded-changed", data: false });
			}

			if (this.violations.length !== previousCount) {
				this._onDataChange.fire({ type: "violations-updated", data: this.violations });
			}

			logger.debug("Violations loaded from daemon", {
				count: this.violations.length,
				total: result.total,
			});
		} catch (error) {
			logger.warn("Failed to load violations from daemon", {
				error: (error as Error).message,
				workspaceId: this.workspaceId,
			});
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
	 * Load patterns from .vreko/patterns/workspace-patterns.json
	 * Note: No daemon method exists for patterns yet, so this still reads from local files
	 */
	private async loadPatterns(): Promise<void> {
		const patternsFile = path.join(this.vrekoDir, "patterns", "workspace-patterns.json");

		if (!fs.existsSync(patternsFile)) {
			this.patterns = [];
			return;
		}

		try {
			const content = fs.readFileSync(patternsFile, "utf-8");
			const previousCount = this.patterns.length;
			this.patterns = JSON.parse(content) as WorkspacePattern[];

			if (this.patterns.length !== previousCount) {
				this._onDataChange.fire({ type: "patterns-updated", data: this.patterns });
			}

			logger.debug("Patterns loaded", { count: this.patterns.length });
		} catch (error) {
			logger.warn("Failed to load patterns", { error: (error as Error).message });
			this.patterns = [];
		}
	}

	// ============================================================================
	// VITALS INTEGRATION
	// ============================================================================

	/**
	 * Update vitals from external source (AutoDecisionIntegration)
	 * @param vitals - Current vitals snapshot
	 * @param thresholdMultiplier - Optional calibrated threshold multiplier (default 1.0)
	 */
	updateVitals(vitals: VitalsSnapshot, thresholdMultiplier?: number): void {
		this.lastVitals = vitals;

		// Update calibrated threshold multiplier if provided
		if (thresholdMultiplier !== undefined) {
			this.thresholdMultiplier = thresholdMultiplier;
		}

		this._onDataChange.fire({ type: "vitals-updated", data: vitals });

		// Check if health changed significantly
		const health = this.getSessionHealth();
		this._onDataChange.fire({ type: "health-changed", data: health });

		// Check if recommendation changed
		const recommendation = this.getSnapshotRecommendation();
		this._onDataChange.fire({ type: "recommendation-changed", data: recommendation });
	}

	/**
	 * Record snapshot creation time
	 */
	recordSnapshot(): void {
		this.lastSnapshotTime = Date.now();
	}

	// ============================================================================
	// COMPUTED DATA
	// ============================================================================

	/**
	 * Get current session health based on vitals
	 */
	getSessionHealth(): SessionHealth {
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

		// Health score is inverse of pressure (high pressure = low health)
		const healthScore = Math.max(0, 100 - vitals.pressure.value);

		// Map vitals trajectory to session health trajectory
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
		if (vitals.oxygen.value < OXYGEN_THRESHOLDS.low) {
			warnings.push(`Low oxygen: ${vitals.oxygen.value}%`);
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
		if (lastSnapshotMinutesAgo && lastSnapshotMinutesAgo > TIME_THRESHOLDS.staleSnapshotMinutes) {
			suggestions.push(`Last snapshot was ${lastSnapshotMinutesAgo} minutes ago`);
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
	getSnapshotRecommendation(): SnapshotRecommendation {
		if (!this.lastVitals) {
			return {
				should: false,
				reason: "Vitals not available",
				urgency: "optional",
			};
		}

		const vitals = this.lastVitals;
		const health = this.getSessionHealth();

		// Critical state: immediate snapshot needed
		if (vitals.trajectory === "critical" || health.healthScore < 30) {
			return {
				should: true,
				reason: "Critical workspace state - immediate snapshot recommended",
				urgency: "now",
			};
		}

		// High pressure: snapshot soon
		if (vitals.pressure.value >= PRESSURE_THRESHOLDS.high) {
			return {
				should: true,
				reason: `High pressure (${vitals.pressure.value}%) - snapshot recommended`,
				urgency: "soon",
			};
		}

		// Degrading trajectory with moderate pressure
		if (vitals.trajectory === "escalating" && vitals.pressure.value >= PRESSURE_THRESHOLDS.moderate) {
			return {
				should: true,
				reason: "Escalating pressure - consider creating a snapshot",
				urgency: "soon",
			};
		}

		// Long time since last snapshot
		if (health.lastSnapshotMinutesAgo && health.lastSnapshotMinutesAgo > TIME_THRESHOLDS.optionalSnapshotMinutes) {
			return {
				should: true,
				reason: `No snapshot in ${health.lastSnapshotMinutesAgo} minutes`,
				urgency: "optional",
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
	getAgentGuidance(): AgentGuidance {
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

		// High pressure blocks risky operations
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

		// Critical trajectory blocks almost everything
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

	/**
	 * Get full unified data snapshot
	 */
	getSnapshot(): UnifiedDataSnapshot {
		const stats = {
			totalLearnings: this.learnings.length,
			totalViolations: this.violations.reduce((sum, v) => sum + v.count, 0),
			promotedPatterns: this.patterns.length,
			pendingPromotion: this.violations.filter((v) => v.promotionStatus === "ready_for_promotion").length,
		};

		return {
			vitals: this.lastVitals,
			sessionHealth: this.getSessionHealth(),
			recommendation: this.getSnapshotRecommendation(),
			guidance: this.getAgentGuidance(),
			learnings: this.learnings,
			violations: this.violations,
			patterns: this.patterns,
			stats,
			degraded: this.degraded,
		};
	}

	// ============================================================================
	// ACCESSORS
	// ============================================================================

	getLearnings(): Learning[] {
		return [...this.learnings];
	}

	getViolations(): Violation[] {
		return [...this.violations];
	}

	getPatterns(): WorkspacePattern[] {
		return [...this.patterns];
	}

	getVitals(): VitalsSnapshot | null {
		return this.lastVitals;
	}

	/**
	 * Get the calibrated threshold multiplier from learning system
	 * Used by VitalsUIIntegration to adjust health zone boundaries
	 * @returns Multiplier (0.7 = conservative, 1.0 = balanced, 1.3 = aggressive)
	 */
	getThresholdMultiplier(): number {
		return this.thresholdMultiplier;
	}

	// ============================================================================
	// LIFECYCLE
	// ============================================================================

	dispose(): void {
		this.fileWatcher?.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this._onDataChange.dispose();

		UnifiedDataService.instances.delete(this.workspaceId);
		logger.info("UnifiedDataService disposed", { workspaceId: this.workspaceId });
	}
}

/**
 * Factory function
 */
export function createUnifiedDataService(workspaceId: string, workspaceRoot: string): UnifiedDataService {
	return UnifiedDataService.for(workspaceId, workspaceRoot);
}
