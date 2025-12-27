/**
 * HeatTracker - State Management for File Heat
 *
 * Tracks file activity, AI involvement, and "struggle" patterns.
 * Implements LRU eviction and periodic decay for memory efficiency.
 */

import { EventEmitter } from "vscode";

import { logger } from "../utils/logger";
import type { AITool, FileHeatData, HeatAssessment, HeatConfig, HeatLevel, HeatSummary } from "./types";
import { DEFAULT_HEAT_CONFIG } from "./types";

/**
 * HeatTracker maintains heat state for all tracked files.
 *
 * Features:
 * - LRU eviction when maxTrackedFiles exceeded
 * - Periodic decay of heat over time
 * - AI detection amplification
 * - Event emission for decoration updates
 */
export class HeatTracker {
	private heatMap = new Map<string, FileHeatData>();
	private config: HeatConfig;
	private decayTimer: NodeJS.Timeout | null = null;

	private readonly _onHeatChanged = new EventEmitter<string[]>();
	public readonly onHeatChanged = this._onHeatChanged.event;

	constructor(config: Partial<HeatConfig> = {}) {
		this.config = { ...DEFAULT_HEAT_CONFIG, ...config };
		this.startDecayTimer();
		logger.debug("HeatTracker initialized", {
			trackingWindow: this.config.trackingWindow,
			maxTrackedFiles: this.config.maxTrackedFiles,
		});
	}

	// ─────────────────────────────────────────────────────────────────
	// Public API
	// ─────────────────────────────────────────────────────────────────

	/**
	 * Record a file save event.
	 */
	recordSave(filePath: string, metadata: { diffSize?: number } = {}): void {
		const heat = this.getOrCreate(filePath);
		const now = Date.now();

		heat.saveCount++;
		heat.saveTimestamps.push(now);
		heat.lastActivity = now;

		if (metadata.diffSize !== undefined) {
			heat.diffSize = Math.max(heat.diffSize, metadata.diffSize);
		}

		// Prune old timestamps outside tracking window
		this.pruneTimestamps(heat);

		// Enforce LRU eviction
		this.enforceLRU();

		this._onHeatChanged.fire([filePath]);
	}

	/**
	 * Record AI involvement in a file.
	 */
	recordAIEdit(filePath: string, tool: AITool, confidence: number): void {
		const heat = this.getOrCreate(filePath);

		heat.ai = {
			involved: true,
			tool,
			confidence,
			lastDetected: Date.now(),
		};
		heat.lastActivity = Date.now();

		this._onHeatChanged.fire([filePath]);

		logger.debug("AI edit recorded", { filePath, tool, confidence });
	}

	/**
	 * Record undo/redo activity (struggle indicator).
	 */
	recordUndoRedo(filePath: string): void {
		const heat = this.getOrCreate(filePath);

		heat.undoRedoCount++;
		heat.lastActivity = Date.now();

		this._onHeatChanged.fire([filePath]);
	}

	/**
	 * Update diff size (called after computing actual diff).
	 */
	updateDiffSize(filePath: string, diffSize: number): void {
		const heat = this.heatMap.get(filePath);
		if (!heat) {
			return;
		}

		heat.diffSize = diffSize;
		this._onHeatChanged.fire([filePath]);
	}

	/**
	 * Reset heat for a file (e.g., after checkpoint created).
	 */
	resetFile(filePath: string): void {
		this.heatMap.delete(filePath);
		this._onHeatChanged.fire([filePath]);
		logger.debug("Heat reset for file", { filePath });
	}

	/**
	 * Get current heat assessment for a file.
	 */
	assess(filePath: string): HeatAssessment {
		const heat = this.heatMap.get(filePath);

		if (!heat) {
			return { level: "none", reasons: [], aiInvolved: false, score: 0 };
		}

		return this.calculateAssessment(heat);
	}

	/**
	 * Get all files with heat above 'none'.
	 */
	getHotFiles(): Array<{ filePath: string; assessment: HeatAssessment }> {
		const result: Array<{ filePath: string; assessment: HeatAssessment }> = [];

		for (const [filePath, heat] of this.heatMap) {
			const assessment = this.calculateAssessment(heat);
			if (assessment.level !== "none") {
				result.push({ filePath, assessment });
			}
		}

		return result.sort((a, b) => b.assessment.score - a.assessment.score);
	}

	/**
	 * Get summary for vitals integration.
	 */
	getSummary(): HeatSummary {
		const hotFiles = this.getHotFiles();

		return {
			totalHotFiles: hotFiles.length,
			criticalFiles: hotFiles.filter((f) => f.assessment.level === "critical").map((f) => f.filePath),
			aiInvolvedFiles: hotFiles.filter((f) => f.assessment.aiInvolved).map((f) => f.filePath),
		};
	}

	/**
	 * Get raw heat data for a file (for debugging/testing).
	 */
	getRawHeatData(filePath: string): FileHeatData | undefined {
		return this.heatMap.get(filePath);
	}

	// ─────────────────────────────────────────────────────────────────
	// Private Methods
	// ─────────────────────────────────────────────────────────────────

	private getOrCreate(filePath: string): FileHeatData {
		let heat = this.heatMap.get(filePath);

		if (!heat) {
			heat = {
				filePath,
				saveCount: 0,
				saveTimestamps: [],
				diffSize: 0,
				ai: { involved: false, confidence: 0 },
				undoRedoCount: 0,
				lastActivity: Date.now(),
				trackingStarted: Date.now(),
			};
			this.heatMap.set(filePath, heat);
		} else {
			// Move to end for LRU ordering (Map maintains insertion order)
			this.heatMap.delete(filePath);
			this.heatMap.set(filePath, heat);
		}

		return heat;
	}

	private pruneTimestamps(heat: FileHeatData): void {
		const cutoff = Date.now() - this.config.trackingWindow;
		heat.saveTimestamps = heat.saveTimestamps.filter((ts) => ts > cutoff);
		heat.saveCount = heat.saveTimestamps.length;
	}

	private enforceLRU(): void {
		if (this.heatMap.size <= this.config.maxTrackedFiles) {
			return;
		}

		// Remove oldest 10% when limit exceeded
		const entriesToDelete = Math.floor(this.config.maxTrackedFiles * 0.1);
		let deletedCount = 0;
		const evictedFiles: string[] = [];

		for (const key of this.heatMap.keys()) {
			if (deletedCount >= entriesToDelete) {
				break;
			}
			evictedFiles.push(key);
			this.heatMap.delete(key);
			deletedCount++;
		}

		if (evictedFiles.length > 0) {
			logger.debug("LRU eviction performed", { evictedCount: evictedFiles.length });
		}
	}

	private calculateAssessment(heat: FileHeatData): HeatAssessment {
		const reasons: string[] = [];
		let score = 0;

		const { thresholds, aiMultiplier, trackingWindow } = this.config;
		const windowMinutes = trackingWindow / 60000;

		// Prune to get accurate count
		this.pruneTimestamps(heat);

		// Save frequency scoring
		if (heat.saveCount >= thresholds.critical.saveCount) {
			score += 50;
			reasons.push(`${heat.saveCount} saves in ${windowMinutes} min`);
		} else if (heat.saveCount >= thresholds.hot.saveCount) {
			score += 30;
			reasons.push(`${heat.saveCount} saves in ${windowMinutes} min`);
		} else if (heat.saveCount >= thresholds.warm.saveCount) {
			score += 15;
			reasons.push(`${heat.saveCount} saves recently`);
		}

		// Diff size scoring
		if (heat.diffSize >= thresholds.critical.diffSize) {
			score += 40;
			reasons.push(`${heat.diffSize} lines changed`);
		} else if (heat.diffSize >= thresholds.hot.diffSize) {
			score += 25;
			reasons.push(`${heat.diffSize} lines changed`);
		} else if (heat.diffSize >= thresholds.warm.diffSize) {
			score += 10;
			reasons.push(`${heat.diffSize} lines changed`);
		}

		// Undo/redo scoring (struggle indicator)
		if (heat.undoRedoCount >= thresholds.hot.undoRedoCount) {
			score += 20;
			reasons.push(`${heat.undoRedoCount} undo/redo operations`);
		}

		// AI multiplier
		if (heat.ai.involved) {
			score = Math.round(score * aiMultiplier);
			const toolName = heat.ai.tool || "AI";
			reasons.unshift(`${toolName} assisted edits`);
		}

		// Determine level
		let level: HeatLevel = "none";
		if (score >= 70) {
			level = "critical";
		} else if (score >= 40) {
			level = "hot";
		} else if (score >= 15) {
			level = "warm";
		}

		return {
			level,
			reasons,
			aiInvolved: heat.ai.involved,
			score: Math.min(100, score),
		};
	}

	private startDecayTimer(): void {
		this.decayTimer = setInterval(() => {
			this.decay();
		}, this.config.decayInterval);
	}

	private decay(): void {
		const now = Date.now();
		const staleThreshold = this.config.trackingWindow;
		const changedFiles: string[] = [];

		for (const [filePath, heat] of this.heatMap) {
			// Prune old timestamps
			const oldCount = heat.saveCount;
			this.pruneTimestamps(heat);

			// Decay AI involvement after 30 min of no activity
			if (heat.ai.involved && heat.ai.lastDetected) {
				const aiAge = now - heat.ai.lastDetected;
				if (aiAge > 30 * 60 * 1000) {
					heat.ai.involved = false;
				}
			}

			// Decay undo/redo count over time (5 min of no activity)
			const timeSinceActivity = now - heat.lastActivity;
			if (timeSinceActivity > 5 * 60 * 1000) {
				heat.undoRedoCount = Math.max(0, heat.undoRedoCount - 1);
			}

			// Remove completely stale entries
			if (timeSinceActivity > staleThreshold && heat.saveCount === 0) {
				this.heatMap.delete(filePath);
				changedFiles.push(filePath);
				continue;
			}

			// Check if assessment changed
			if (heat.saveCount !== oldCount) {
				changedFiles.push(filePath);
			}
		}

		if (changedFiles.length > 0) {
			this._onHeatChanged.fire(changedFiles);
		}
	}

	dispose(): void {
		if (this.decayTimer) {
			clearInterval(this.decayTimer);
			this.decayTimer = null;
		}
		this._onHeatChanged.dispose();
		this.heatMap.clear();
		logger.debug("HeatTracker disposed");
	}
}
