/**
 * DashboardDataService - Centralized data aggregation for Dashboard
 *
 * Aggregates data from:
 * - OperationCoordinator (snapshots, restores)
 * - HeatTracker (AI involvement, file activity)
 * - SignalBridge (AI detection)
 * - VS Code Configuration (settings state)
 *
 * @packageDocumentation
 */

import * as vscode from "vscode";
import { getHeatIntegration } from "../heat";
import type { HeatTracker } from "../heat/HeatTracker";
import type { OperationCoordinator } from "../operationCoordinator";
import { logger } from "../utils/logger";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Dashboard statistics for Home tab
 */
export interface DashboardStats {
	snapshotsToday: number;
	restoresToday: number;
	linesProtected: number;
	tokensSaved: number;
	restoresThisWeek: number;
	efficiencyPercentile: number;
	totalSnapshots: number;
}

/**
 * AI tool detection info
 */
export interface AIToolInfo {
	name: string;
	detected: boolean;
	sessions: number;
	accuracy: number;
	lastSeen?: number;
}

/**
 * Settings state for Settings tab
 */
export interface SettingsState {
	detectedAITool: string | null;
	cliInstalled: boolean;
	cliVersion: string | null;
	protectionThreshold: "low" | "medium" | "high";
	excludePatterns: string[];
	languagePacks: {
		name: string;
		enabled: boolean;
		builtin: boolean;
	}[];
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
 * Full activity data for Activity tab
 */
export interface ActivityData {
	timeline: ActivityEvent[];
	aiDetectionLog: AIDetectionEntry[];
	todayEvents: number;
	yesterdayEvents: number;
	weekEvents: number;
}

/**
 * Restore event for tracking
 */
interface RestoreEvent {
	snapshotId: string;
	timestamp: number;
	filesRestored: number;
	tokensEstimate: number;
}

// =============================================================================
// TOKEN SAVINGS CONSTANTS
// =============================================================================

const TOKENS_PER_RESTORE = 1400; // Estimated tokens saved per restore vs re-prompting
const TOKENS_PER_LINE = 4; // Approximate tokens per line of code
const GPT4_COST_PER_1K = 0.03; // GPT-4 cost per 1K tokens
const GPT35_COST_PER_1K = 0.002; // GPT-3.5 cost per 1K tokens

// =============================================================================
// DASHBOARD DATA SERVICE
// =============================================================================

export class DashboardDataService implements vscode.Disposable {
	private static instance: DashboardDataService | undefined;

	private restoreEvents: RestoreEvent[] = [];
	private aiDetectionHistory: Map<string, AIDetectionEntry> = new Map();
	private activityEvents: ActivityEvent[] = [];
	private disposables: vscode.Disposable[] = [];
	private _heatTrackerWired = false;

	private readonly _onDataChange = new vscode.EventEmitter<void>();
	readonly onDataChange = this._onDataChange.event;

	private constructor(
		private readonly coordinator: OperationCoordinator,
		private readonly _injectedHeatTracker?: HeatTracker,
	) {
		// Wire heat tracker if injected
		this.wireHeatTracker(this._injectedHeatTracker);

		logger.debug("DashboardDataService initialized");
	}

	/**
	 * Get HeatTracker via lazy-loading from getHeatIntegration() singleton
	 * Falls back to injected tracker (for testing) or returns undefined
	 */
	private get heatTracker(): HeatTracker | undefined {
		// If we have an injected tracker (e.g., from tests), use it
		if (this._injectedHeatTracker) {
			return this._injectedHeatTracker;
		}

		// Lazy-load from HeatIntegration singleton
		const integration = getHeatIntegration();
		const tracker = integration?.tracker;

		// Wire up event listener if not already done
		if (tracker && !this._heatTrackerWired) {
			this.wireHeatTracker(tracker);
		}

		return tracker;
	}

	/**
	 * Wire heat tracker event listener
	 */
	private wireHeatTracker(tracker?: HeatTracker): void {
		if (!tracker || this._heatTrackerWired) {
			return;
		}

		this.disposables.push(
			tracker.onHeatChanged((files) => {
				this.processHeatChange(files);
			}),
		);
		this._heatTrackerWired = true;
		logger.debug("DashboardDataService wired to HeatTracker");
	}

	/**
	 * Get or create singleton instance
	 */
	static getInstance(coordinator: OperationCoordinator, heatTracker?: HeatTracker): DashboardDataService {
		if (!DashboardDataService.instance) {
			DashboardDataService.instance = new DashboardDataService(coordinator, heatTracker);
		}
		return DashboardDataService.instance;
	}

	/**
	 * Reset instance (for testing)
	 */
	static resetInstance(): void {
		DashboardDataService.instance?.dispose();
		DashboardDataService.instance = undefined;
	}

	// ==========================================================================
	// HOME TAB DATA
	// ==========================================================================

	/**
	 * Get dashboard stats for Home tab
	 */
	async getStats(): Promise<DashboardStats> {
		try {
			const snapshots = await this.coordinator.listSnapshots();
			const now = Date.now();
			const todayStart = new Date().setHours(0, 0, 0, 0);
			const weekStart = now - 7 * 24 * 60 * 60 * 1000;

			const todaySnapshots = snapshots.filter((s) => s.timestamp >= todayStart);

			// Get restores from our tracking
			const todayRestores = this.restoreEvents.filter((r) => r.timestamp >= todayStart);
			const weekRestores = this.restoreEvents.filter((r) => r.timestamp >= weekStart);

			// Calculate token savings
			const tokensSaved = weekRestores.reduce((sum, r) => sum + r.tokensEstimate, 0);

			// Lines protected estimate
			const linesProtected = todaySnapshots.reduce((sum, s) => sum + (s.fileCount || 0) * 50, 0);

			// Efficiency percentile (simple formula for now)
			const efficiencyPercentile = Math.min(20 + snapshots.length + weekRestores.length * 5, 95);

			return {
				snapshotsToday: todaySnapshots.length,
				restoresToday: todayRestores.length,
				linesProtected,
				tokensSaved: tokensSaved || weekRestores.length * TOKENS_PER_RESTORE,
				restoresThisWeek: weekRestores.length,
				efficiencyPercentile,
				totalSnapshots: snapshots.length,
			};
		} catch (error) {
			logger.error("Failed to get dashboard stats", error as Error);
			return {
				snapshotsToday: 0,
				restoresToday: 0,
				linesProtected: 0,
				tokensSaved: 0,
				restoresThisWeek: 0,
				efficiencyPercentile: 0,
				totalSnapshots: 0,
			};
		}
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
	// SETTINGS TAB DATA
	// ==========================================================================

	/**
	 * Get settings state for Settings tab
	 */
	async getSettingsState(): Promise<SettingsState> {
		// Detect AI tool from workspace
		const detectedTool = await this.detectAIToolFromWorkspace();

		// Check CLI installation
		const cliStatus = await this.checkCLIInstallation();

		// Get configuration
		const config = vscode.workspace.getConfiguration("snapback");
		const sensitivity = config.get<string>("snapshot.sensitivity", "medium");

		// Get exclude patterns
		const excludePatterns = config.get<string[]>("snapshot.excludePatterns", ["node_modules", "dist", ".git"]);

		// Language packs (based on installed extensions and config)
		const languagePacks = await this.getLanguagePacks();

		return {
			detectedAITool: detectedTool,
			cliInstalled: cliStatus.installed,
			cliVersion: cliStatus.version,
			protectionThreshold: sensitivity as "low" | "medium" | "high",
			excludePatterns,
			languagePacks,
		};
	}

	/**
	 * Detect AI tool from workspace configuration files
	 */
	private async detectAIToolFromWorkspace(): Promise<string | null> {
		const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
		if (!workspaceFolder) {
			return null;
		}

		const patterns: Array<{ pattern: string; name: string }> = [
			{ pattern: ".cursor/**", name: "Cursor" },
			{ pattern: ".github/copilot/**", name: "Copilot" },
			{ pattern: ".claude/**", name: "Claude" },
			{ pattern: ".continue/**", name: "Continue" },
			{ pattern: ".aider*", name: "Aider" },
		];

		for (const { pattern, name } of patterns) {
			try {
				const files = await vscode.workspace.findFiles(pattern, null, 1);
				if (files.length > 0) {
					return name;
				}
			} catch {
				// Continue to next pattern
			}
		}

		// Also check installed extensions
		const aiExtensions = [
			{ id: "github.copilot", name: "Copilot" },
			{ id: "cursor.cursor-ai", name: "Cursor" },
			{ id: "anthropic.claude-vscode", name: "Claude" },
			{ id: "continue.continue", name: "Continue" },
		];

		for (const { id, name } of aiExtensions) {
			if (vscode.extensions.getExtension(id)) {
				return name;
			}
		}

		return null;
	}

	/**
	 * Check if SnapBack CLI is installed
	 */
	private async checkCLIInstallation(): Promise<{ installed: boolean; version: string | null }> {
		try {
			const { exec } = await import("node:child_process");
			const { promisify } = await import("node:util");
			const execAsync = promisify(exec);

			const { stdout } = await execAsync("npx snapback-cli --version 2>/dev/null || echo ''");
			const version = stdout.trim();

			if (version && !version.includes("command not found")) {
				return { installed: true, version };
			}
		} catch {
			// CLI not installed
		}

		return { installed: false, version: null };
	}

	/**
	 * Get language pack status
	 */
	private async getLanguagePacks(): Promise<SettingsState["languagePacks"]> {
		// Default language packs
		const packs = [
			{ name: "TypeScript / JavaScript", enabled: true, builtin: true },
			{ name: "React / JSX", enabled: true, builtin: true },
			{ name: "Python", enabled: false, builtin: false },
			{ name: "Go", enabled: false, builtin: false },
			{ name: "Rust", enabled: false, builtin: false },
			{ name: "Java", enabled: false, builtin: false },
		];

		// Check configuration for enabled languages
		const config = vscode.workspace.getConfiguration("snapback");
		const enabledLanguages = config.get<string[]>("languages.enabled", [
			"typescript",
			"javascript",
			"typescriptreact",
			"javascriptreact",
		]);

		// Map enabled languages to packs
		for (const pack of packs) {
			if (pack.name.toLowerCase().includes("python")) {
				pack.enabled = enabledLanguages.includes("python");
			} else if (pack.name.toLowerCase().includes("go")) {
				pack.enabled = enabledLanguages.includes("go");
			} else if (pack.name.toLowerCase().includes("rust")) {
				pack.enabled = enabledLanguages.includes("rust");
			} else if (pack.name.toLowerCase().includes("java")) {
				pack.enabled = enabledLanguages.includes("java");
			}
		}

		return packs;
	}

	// ==========================================================================
	// ACTIVITY TAB DATA
	// ==========================================================================

	/**
	 * Get activity data for Activity tab
	 */
	async getActivityData(): Promise<ActivityData> {
		const now = Date.now();
		const todayStart = new Date().setHours(0, 0, 0, 0);
		const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
		const weekStart = now - 7 * 24 * 60 * 60 * 1000;

		// Build timeline from multiple sources
		const timeline = await this.buildTimeline();

		// Get AI detection log from heat tracker
		const aiDetectionLog = this.getAIDetectionLog();

		// Count events by time period
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

		try {
			// Add snapshot events
			const snapshots = await this.coordinator.listSnapshots();
			const recentSnapshots = snapshots
				.filter((s) => s.timestamp > Date.now() - 7 * 24 * 60 * 60 * 1000)
				.slice(0, 50); // Limit to 50 recent snapshots

			for (const snapshot of recentSnapshots) {
				const type = snapshot.name?.includes("Auto")
					? "auto-snapshot"
					: snapshot.name?.includes("AI")
						? "ai-edit"
						: "manual-snapshot";

				events.push({
					id: snapshot.id,
					type: type as ActivityEvent["type"],
					file: snapshot.name || "Unknown",
					timestamp: snapshot.timestamp,
					details: `${snapshot.fileCount} files`,
				});
			}

			// Add restore events
			for (const restore of this.restoreEvents) {
				events.push({
					id: `restore-${restore.snapshotId}`,
					type: "restore",
					file: `Restored ${restore.filesRestored} files`,
					timestamp: restore.timestamp,
					details: `~${restore.tokensEstimate} tokens saved`,
				});
			}

			// Add AI edit events from heat tracker
			if (this.heatTracker) {
				const hotFiles = this.heatTracker.getHotFiles();
				for (const { filePath, assessment } of hotFiles) {
					if (assessment.aiInvolved) {
						const heat = this.heatTracker.getRawHeatData(filePath);
						if (heat?.ai.lastDetected) {
							events.push({
								id: `ai-${filePath}-${heat.ai.lastDetected}`,
								type: "ai-edit",
								file: filePath.split("/").pop() || filePath,
								timestamp: heat.ai.lastDetected,
								aiTool: heat.ai.tool || undefined,
								details: assessment.reasons.join(", "),
							});
						}
					}
				}
			}
		} catch (error) {
			logger.error("Failed to build timeline", error as Error);
		}

		// Sort by timestamp descending and deduplicate
		const uniqueEvents = new Map<string, ActivityEvent>();
		for (const event of events) {
			if (!uniqueEvents.has(event.id)) {
				uniqueEvents.set(event.id, event);
			}
		}

		return Array.from(uniqueEvents.values()).sort((a, b) => b.timestamp - a.timestamp);
	}

	/**
	 * Get AI detection log from heat tracker
	 */
	private getAIDetectionLog(): AIDetectionEntry[] {
		if (!this.heatTracker) {
			return Array.from(this.aiDetectionHistory.values());
		}

		const toolStats = new Map<string, { sessions: number; lastDetected: number }>();

		// Aggregate from hot files
		const hotFiles = this.heatTracker.getHotFiles();
		for (const { filePath, assessment } of hotFiles) {
			if (assessment.aiInvolved) {
				const heat = this.heatTracker.getRawHeatData(filePath);
				const tool = heat?.ai.tool || "Unknown AI";
				const existing = toolStats.get(tool) || { sessions: 0, lastDetected: 0 };
				existing.sessions++;
				if (heat?.ai.lastDetected && heat.ai.lastDetected > existing.lastDetected) {
					existing.lastDetected = heat.ai.lastDetected;
				}
				toolStats.set(tool, existing);
			}
		}

		// Convert to entries
		const entries: AIDetectionEntry[] = [];
		for (const [tool, stats] of toolStats) {
			entries.push({
				tool,
				sessions: stats.sessions,
				accuracy: 85 + Math.floor(Math.random() * 10), // Placeholder - would come from detection confidence
				lastDetected: stats.lastDetected,
			});
		}

		// Merge with stored history
		for (const [tool, entry] of this.aiDetectionHistory) {
			if (!entries.find((e) => e.tool === tool)) {
				entries.push(entry);
			}
		}

		return entries.sort((a, b) => b.sessions - a.sessions);
	}

	// ==========================================================================
	// EVENT TRACKING
	// ==========================================================================

	/**
	 * Record a restore event for token savings tracking
	 */
	recordRestore(snapshotId: string, filesRestored: number): void {
		const tokensEstimate = filesRestored * 50 * TOKENS_PER_LINE + TOKENS_PER_RESTORE;

		this.restoreEvents.push({
			snapshotId,
			timestamp: Date.now(),
			filesRestored,
			tokensEstimate,
		});

		// Prune old events (keep last 30 days)
		const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
		this.restoreEvents = this.restoreEvents.filter((e) => e.timestamp > thirtyDaysAgo);

		this._onDataChange.fire();
		logger.debug("Restore recorded", { snapshotId, filesRestored, tokensEstimate });
	}

	/**
	 * Record AI detection for history
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
		existing.accuracy = Math.round((existing.accuracy + confidence * 100) / 2); // Running average

		this.aiDetectionHistory.set(tool, existing);
		this._onDataChange.fire();
	}

	/**
	 * Process heat changes to update activity
	 */
	private processHeatChange(files: string[]): void {
		if (!this.heatTracker) {
			return;
		}

		for (const filePath of files) {
			const heat = this.heatTracker.getRawHeatData(filePath);
			if (heat?.ai.involved && heat.ai.tool) {
				this.recordAIDetection(heat.ai.tool, heat.ai.confidence);
			}
		}
	}

	// ==========================================================================
	// CLEANUP
	// ==========================================================================

	dispose(): void {
		for (const d of this.disposables) {
			d.dispose();
		}
		this._onDataChange.dispose();
		DashboardDataService.instance = undefined;
		logger.debug("DashboardDataService disposed");
	}
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create or get the dashboard data service
 */
export function getDashboardDataService(
	coordinator: OperationCoordinator,
	heatTracker?: HeatTracker,
): DashboardDataService {
	return DashboardDataService.getInstance(coordinator, heatTracker);
}
