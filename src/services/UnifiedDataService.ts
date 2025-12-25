/**
 * UnifiedDataService
 *
 * Consolidates all data sources for the VS Code extension:
 * - WorkspaceVitals from @snapback/intelligence (via AutoDecisionIntegration)
 * - CLI data from .snapback/ directory (learnings, violations, patterns, sessions)
 * - Session health metrics
 * - Snapshot recommendations
 *
 * This service bridges the gap between CLI/MCP capabilities and extension UI.
 *
 * @see CLI_MCP_INTEGRATION_GAP_ANALYSIS.md for full gap analysis
 */

import * as fs from "node:fs";
import * as path from "node:path";
import type { VitalsSnapshot } from "@snapback/intelligence/vitals";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

// ============================================================================
// TYPES
// ============================================================================

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
	| { type: "patterns-updated"; data: WorkspacePattern[] };

// ============================================================================
// UNIFIED DATA SERVICE
// ============================================================================

/**
 * UnifiedDataService - Single source of truth for all extension data
 *
 * Consolidates:
 * - WorkspaceVitals (real-time workspace health)
 * - CLI data (.snapback/ directory)
 * - Session health metrics
 * - Snapshot recommendations
 */
export class UnifiedDataService implements vscode.Disposable {
	private static instances: Map<string, UnifiedDataService> = new Map();

	private readonly workspaceId: string;
	// workspaceRoot available via this.snapbackDir parent directory if needed
	private readonly snapbackDir: string;

	// Data caches
	private learnings: Learning[] = [];
	private violations: Violation[] = [];
	private patterns: WorkspacePattern[] = [];
	private lastVitals: VitalsSnapshot | null = null;
	private lastSnapshotTime: number | null = null;

	// File watchers
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
		this.snapbackDir = path.join(workspaceRoot, ".snapback");

		this.initialize();
	}

	/**
	 * Initialize service: load data and setup watchers
	 */
	private initialize(): void {
		// Initial data load
		this.loadAllData();

		// Setup file watcher for .snapback/ directory
		this.setupFileWatcher();

		logger.info("UnifiedDataService initialized", {
			workspaceId: this.workspaceId,
			snapbackDir: this.snapbackDir,
			hasSnapbackDir: fs.existsSync(this.snapbackDir),
		});
	}

	/**
	 * Setup file watcher for .snapback/ directory
	 */
	private setupFileWatcher(): void {
		if (!fs.existsSync(this.snapbackDir)) {
			logger.debug("No .snapback directory found, skipping file watcher", {
				snapbackDir: this.snapbackDir,
			});
			return;
		}

		// Watch for changes in .snapback/ directory
		const pattern = new vscode.RelativePattern(this.snapbackDir, "**/*");
		this.fileWatcher = vscode.workspace.createFileSystemWatcher(pattern);

		this.disposables.push(
			this.fileWatcher.onDidCreate(() => this.scheduleUpdate()),
			this.fileWatcher.onDidChange(() => this.scheduleUpdate()),
			this.fileWatcher.onDidDelete(() => this.scheduleUpdate()),
		);

		logger.debug("File watcher setup for .snapback/", {
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
		setTimeout(() => {
			this.updatePending = false;
			this.loadAllData();
		}, this.UPDATE_THROTTLE_MS);
	}

	/**
	 * Load all data from .snapback/ directory
	 */
	private loadAllData(): void {
		this.loadLearnings();
		this.loadViolations();
		this.loadPatterns();
	}

	/**
	 * Load learnings from .snapback/learnings/
	 */
	private loadLearnings(): void {
		const learningsDir = path.join(this.snapbackDir, "learnings");
		const learningsFile = path.join(learningsDir, "user-learnings.jsonl");

		if (!fs.existsSync(learningsFile)) {
			// Try alternative path
			const altFile = path.join(learningsDir, "learnings.jsonl");
			if (!fs.existsSync(altFile)) {
				this.learnings = [];
				return;
			}
			this.parseLearningsFile(altFile);
			return;
		}

		this.parseLearningsFile(learningsFile);
	}

	/**
	 * Parse JSONL learnings file
	 */
	private parseLearningsFile(filePath: string): void {
		try {
			const content = fs.readFileSync(filePath, "utf-8");
			const lines = content.trim().split("\n").filter(Boolean);

			const previousCount = this.learnings.length;
			this.learnings = lines
				.map((line) => {
					try {
						return JSON.parse(line) as Learning;
					} catch {
						return null;
					}
				})
				.filter((l): l is Learning => l !== null);

			if (this.learnings.length !== previousCount) {
				this._onDataChange.fire({ type: "learnings-updated", data: this.learnings });
			}

			logger.debug("Learnings loaded", { count: this.learnings.length });
		} catch (error) {
			logger.warn("Failed to load learnings", { error: (error as Error).message });
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

			// Group violations by type and count occurrences
			const violationMap = new Map<string, Violation>();

			for (const line of lines) {
				try {
					const entry = JSON.parse(line);
					const key = `${entry.type}:${entry.file}`;

					if (violationMap.has(key)) {
						const existing = violationMap.get(key)!;
						existing.count++;
						existing.date = entry.date || existing.date;
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

			// Update promotion status based on count
			for (const violation of violationMap.values()) {
				violation.promotionStatus = this.getPromotionStatus(violation.count);
			}

			const previousCount = this.violations.length;
			this.violations = Array.from(violationMap.values());

			if (this.violations.length !== previousCount) {
				this._onDataChange.fire({ type: "violations-updated", data: this.violations });
			}

			logger.debug("Violations loaded", { count: this.violations.length });
		} catch (error) {
			logger.warn("Failed to load violations", { error: (error as Error).message });
			this.violations = [];
		}
	}

	/**
	 * Get promotion status based on occurrence count
	 */
	private getPromotionStatus(count: number): Violation["promotionStatus"] {
		if (count >= 5) return "automated";
		if (count >= 3) return "promoted";
		if (count >= 2) return "ready_for_promotion";
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
	 */
	updateVitals(vitals: VitalsSnapshot): void {
		this.lastVitals = vitals;
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
		if (vitals.pressure.value > 75) {
			warnings.push(`Pressure at ${vitals.pressure.value}% - snapshot recommended`);
		}
		if (vitals.oxygen.value < 50) {
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
		if (lastSnapshotMinutesAgo && lastSnapshotMinutesAgo > 30) {
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
		if (vitals.pressure.value > 75) {
			return {
				should: true,
				reason: `High pressure (${vitals.pressure.value}%) - snapshot recommended`,
				urgency: "soon",
			};
		}

		// Degrading trajectory with moderate pressure
		if (vitals.trajectory === "escalating" && vitals.pressure.value > 50) {
			return {
				should: true,
				reason: "Escalating pressure - consider creating a snapshot",
				urgency: "soon",
			};
		}

		// Long time since last snapshot
		if (health.lastSnapshotMinutesAgo && health.lastSnapshotMinutesAgo > 60) {
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
		if (vitals.pressure.value > 75) {
			blockedOps.push("refactor large files", "delete files", "major restructuring");
			suggestion = "High pressure - complete current changes before major refactoring";
		} else if (vitals.pressure.value > 50) {
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
