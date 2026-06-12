/**
 * Vreko TreeView Provider - Redesigned UX/IA
 *
 * Philosophy:
 * - Lead with value, not status ("232 files protected" not "Protection Status: Active")
 * - No news is good news (removed "All good!" placeholders)
 * - Hide empty states (only show groups with content)
 * - Snapshots are the product (make them prominent)
 * - Respect attention (minimal root items, problems only when needed)
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/commands";
import { getThemeIcon } from "../constants/cross-ide-icons";
import { VREKO_ICONS } from "../constants/icons";
import { type Learning, UnifiedDataService, type UnifiedDataSnapshot } from "../services/UnifiedDataService";
import type { IStorageManager, SnapshotManifest } from "../storage/types";
import type { ProjectionStore } from "../ui/ProjectionStore";
import { formatAbsoluteTime, getFileTypeIcon } from "../ui/snapshot-display/formatting";
import type { IntelligenceSignals, ProtectionSummary, SessionSummary } from "../ui/types";
import { logger } from "../utils/logger";
import { createTreeItemBadgeProvider, type TreeItemBadgeProvider } from "../utils/treeItemBadgeProvider";
import { TimeGroupingStrategy } from "./grouping/TimeGroupingStrategy";
import type { GroupingMode, ProblemItem, SnapshotDisplayItem, TimeGroup, TreeViewConfig } from "./types";
import { DEFAULT_TREE_CONFIG } from "./types";

// ============================================
// MINIMAL SERVICE INTERFACES
// ============================================

/**
 * Minimal config manager interface
 */
interface IConfigManager {
	getProtectionCounts(): Promise<{
		block: number;
		warn: number;
		watch: number;
	}>;
}

// ============================================
// TREE ITEM TYPES
// ============================================

type TreeItemType =
	| "header"
	| "header-detail"
	| "activity-header"
	| "time-group"
	| "snapshot"
	| "snapshot-file"
	| "more-snapshots"
	| "problems-header"
	| "problem"
	| "learnings-header"
	| "learning-item"
	| "violations-header"
	| "violation-item"
	| "stats-header"
	| "stat-item"
	| "setup-header"
	| "setup-claude-desktop";

interface VrekoTreeItemData {
	type: TreeItemType;
	id?: string;
	groupKey?: string;
	count?: number;
	filePath?: string;
}

class VrekoTreeItem extends vscode.TreeItem {
	constructor(
		label: string,
		public readonly data: VrekoTreeItemData,
		collapsibleState?: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
	}
}

// ============================================
// PROVIDER
// ============================================

export class VrekoTreeProvider implements vscode.TreeDataProvider<VrekoTreeItem>, vscode.Disposable {
	private _onDidChangeTreeData = new vscode.EventEmitter<VrekoTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private problems: ProblemItem[] = [];
	private config: TreeViewConfig;
	private cachedSnapshots: SnapshotDisplayItem[] = [];
	private readonly badgeProvider: TreeItemBadgeProvider;

	/** Cached daemon projection data for enriched display */
	private _protectionSummary: ProtectionSummary | null = null;
	private _sessionSummary: SessionSummary | null = null;
	private _intelligenceSignals: IntelligenceSignals | null = null;
	private _projectionDisposables: vscode.Disposable[] = [];

	/** Cached intelligence data from UnifiedDataService */
	private _cachedIntelligence: UnifiedDataSnapshot | null = null;
	private _unifiedDataService: UnifiedDataService | null = null;

	/** Flag to indicate if snapshots are currently being loaded */
	private isLoadingSnapshots = false;

	/** Timer for debouncing snapshot refreshes */
	private snapshotRefreshTimer: NodeJS.Timeout | null = null;

	/** Timer for debounced tree refresh (250ms per wiring_fix.md) */
	private treeRefreshTimer: NodeJS.Timeout | null = null;
	private readonly TREE_REFRESH_DEBOUNCE_MS = 250;

	constructor(
		_context: vscode.ExtensionContext,
		private storageManager: IStorageManager,
		private configManager: IConfigManager,
		private projectionStore?: ProjectionStore,
		private workspaceRoot?: string,
	) {
		this.config = { ...DEFAULT_TREE_CONFIG };

		// Initialize badge provider with auto-refresh callback
		this.badgeProvider = createTreeItemBadgeProvider({
			onRefreshNeeded: () => this.refresh(),
		});

		// Initialize UnifiedDataService for intelligence data (learnings, violations, stats)
		if (this.workspaceRoot) {
			const workspaceId = _context.workspaceState.get<string>("workspaceId") || this.workspaceRoot;
			this._unifiedDataService = UnifiedDataService.for(workspaceId, this.workspaceRoot);
			this._cachedIntelligence = this._unifiedDataService.getSnapshot();
			logger.debug("VrekoTreeProvider: UnifiedDataService initialized", {
				workspaceRoot: this.workspaceRoot,
				learningsCount: this._cachedIntelligence?.learnings?.length ?? 0,
				violationsCount: this._cachedIntelligence?.violations?.length ?? 0,
			});
		} else {
			logger.warn("VrekoTreeProvider: No workspaceRoot provided, intelligence data unavailable");
		}

		// Subscribe to ProjectionStore protection/session/intelligence changes for daemon-backed updates
		if (this.projectionStore) {
			this._protectionSummary = this.projectionStore.protection as ProtectionSummary;
			this._sessionSummary = this.projectionStore.session as SessionSummary;
			this._intelligenceSignals = this.projectionStore.intelligence as IntelligenceSignals;

			this._projectionDisposables.push(
				this.projectionStore.onDidChange((event) => {
					let needsRefresh = false;
					if (event.changed.includes("protection")) {
						this._protectionSummary = event.state.protection as ProtectionSummary;
						needsRefresh = true;
					}
					if (event.changed.includes("session")) {
						this._sessionSummary = event.state.session as SessionSummary;
						needsRefresh = true;
					}
					if (event.changed.includes("intelligence")) {
						this._intelligenceSignals = event.state.intelligence as IntelligenceSignals;
						needsRefresh = true;
					}
					if (needsRefresh) {
						// Use debounced refresh for event-driven updates
						this.refreshDebounced();
					}
				}),
			);
		}

		// Preload snapshots in background to avoid blocking getChildren
		this.preloadSnapshots();
	}

	/**
	 * Preload snapshots in background to avoid blocking getChildren
	 */
	private async preloadSnapshots(): Promise<void> {
		if (this.isLoadingSnapshots) {
			return; // Already loading
		}
		this.isLoadingSnapshots = true;
		try {
			await this.loadSnapshots();
			// Refresh the tree view to show the newly loaded snapshots
			// This ensures the ACTIVITY section appears on initial load
			this.refresh();
		} finally {
			this.isLoadingSnapshots = false;
		}
	}
	/**
	 * Dispose resources (badge provider timers)
	 */
	dispose(): void {
		this.badgeProvider.dispose();
		this._onDidChangeTreeData.dispose();
		for (const d of this._projectionDisposables) {
			d.dispose();
		}
		if (this.snapshotRefreshTimer) {
			clearTimeout(this.snapshotRefreshTimer);
		}
		if (this.treeRefreshTimer) {
			clearTimeout(this.treeRefreshTimer);
		}
	}

	// ============================================
	// PUBLIC API
	// ============================================

	refresh(): void {
		logger.debug("TreeView refresh triggered", {
			groupingMode: this.config.groupBy,
			cachedSnapshotCount: this.cachedSnapshots.length,
			problemCount: this.problems.length,
		});
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Debounced refresh for event-driven updates
	 * Prevents rapid-fire refreshes when multiple events arrive
	 */
	refreshDebounced(): void {
		if (this.treeRefreshTimer) {
			clearTimeout(this.treeRefreshTimer);
		}
		this.treeRefreshTimer = setTimeout(() => {
			this.refresh();
		}, this.TREE_REFRESH_DEBOUNCE_MS);
	}

	/**
	 * Set problems to display in TreeView
	 * Problems section only shown when problems exist ("No news is good news" principle)
	 * @param problems Array of problem items to display
	 */
	setProblems(problems: ProblemItem[]): void {
		this.problems = problems;
		this.refresh();
	}

	/**
	 * Change grouping mode (time/system/file)
	 * Currently only 'time' is fully implemented
	 * @param mode Grouping mode to use
	 */
	setGroupingMode(mode: GroupingMode): void {
		if (mode !== "time") {
			vscode.window.showInformationMessage(`${mode} grouping coming soon! Using time grouping for now.`);
			return;
		}
		this.config.groupBy = mode;
		this.refresh();
	}

	/**
	 * Get current grouping mode
	 * @returns Current grouping mode
	 */
	getGroupingMode(): GroupingMode {
		return this.config.groupBy;
	}

	// ============================================
	// TREE DATA PROVIDER IMPLEMENTATION
	// ============================================

	getTreeItem(element: VrekoTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: VrekoTreeItem): Promise<VrekoTreeItem[]> {
		if (!element) {
			return this.getRootItems();
		}

		switch (element.data.type) {
			case "header":
				return this.getProtectionBreakdown();
			case "time-group":
				return this.getSnapshotsForTimeGroup(element.data.groupKey as TimeGroup);
			case "snapshot":
				return this.getSnapshotFiles(element.data.id!);
			case "activity-header":
				return this.getActivityTimeGroups();
			case "problems-header":
				return this.getProblemItems();
			case "more-snapshots":
				return this.getMoreSnapshots(element.data.groupKey as TimeGroup);
			case "learnings-header":
				return this.getLearningItems();
			case "violations-header":
				return this.getViolationItems();
			case "stats-header":
				return this.getStatsItems();
			default:
				return [];
		}
	}

	// ============================================
	// ROOT LEVEL
	// ============================================

	private async getRootItems(): Promise<VrekoTreeItem[]> {
		const items: VrekoTreeItem[] = [];

		try {
			// 1. HEADER - Always show (the confidence builder)
			items.push(await this.createHeader());

			// 2. DAEMON SNAPSHOT SUMMARY (from ProjectionStore, if available)
			if (this._sessionSummary?.active && this._sessionSummary.snapshotCount > 0) {
				items.push(this.createDaemonSessionSummary());
			}

			// 3. PROBLEMS - Only if there are problems (respect attention)
			if (this.problems.length > 0) {
				items.push(this.createProblemsSection());
			}

			// 4. LEARNINGS - Show if any exist (from UnifiedDataService)
			const learningsCount = this._cachedIntelligence?.learnings?.length ?? 0;
			if (learningsCount > 0) {
				items.push(this.createLearningsSection(learningsCount));
			}

			// 5. VIOLATIONS - Show if any exist (from UnifiedDataService)
			const violationsCount = this._cachedIntelligence?.violations?.length ?? 0;
			if (violationsCount > 0) {
				items.push(this.createViolationsSection(violationsCount));
			}

			// 6. SNAPSHOT GROUPS - Based on current grouping mode
			const snapshotGroups = await this.createSnapshotGroups();
			items.push(...snapshotGroups);

			// 7. QUICK STATS - Always show at bottom
			items.push(this.createStatsSection());

			// 8. SETUP - Show Claude Desktop setup if detected but not configured
			if (this.isClaudeDesktopSetupNeeded()) {
				items.push(this.createClaudeDesktopSetupItem());
			}

			// NOTE: Cloud section removed - Pioneer status is shown in status bar (PioneerStatusItem)
			// Users can see connection status there without duplicating in tree view
		} catch (error) {
			logger.error("Error loading Vreko tree", error as Error);
			items.push(this.createErrorItem());
		}

		return items;
	}

	/**
	 * Create daemon session summary item (from ProjectionStore)
	 * Shows active session info: task, file count, snapshot count
	 */
	private createDaemonSessionSummary(): VrekoTreeItem {
		const session = this._sessionSummary;
		if (!session) {
			// Should not happen  -  caller checks, but guard defensively
			return new VrekoTreeItem("Session", { type: "header-detail" });
		}

		const label = session.task ? `Session: ${session.task}` : "Active Session";

		const item = new VrekoTreeItem(label, { type: "header-detail" }, vscode.TreeItemCollapsibleState.None);

		item.id = "vreko:root:daemon-session";
		item.iconPath = getThemeIcon("debugStart");
		item.description = `${session.filesModified} files, ${session.snapshotCount} snapshots`;
		item.tooltip = [
			`Session: ${session.task || "(untitled)"}`,
			`Files Modified: ${session.filesModified}`,
			`Snapshots: ${session.snapshotCount}`,
			session.startedAt ? `Started: ${session.startedAt.toLocaleString()}` : undefined,
			session.durationSeconds > 0 ? `Duration: ${Math.floor(session.durationSeconds / 60)}m` : undefined,
		]
			.filter(Boolean)
			.join("\n");
		item.contextValue = "daemonSession";

		return item;
	}

	// ============================================
	// HEADER (Protected Files Count)
	// ============================================

	private async createHeader(): Promise<VrekoTreeItem> {
		// Prefer daemon projection data if available, fallback to local config
		const totalProtected =
			this._protectionSummary && this._protectionSummary.protectedFileCount > 0
				? this._protectionSummary.protectedFileCount
				: await this.getTotalProtectedCount();

		const levelLabel =
			this._protectionSummary && this._protectionSummary.currentLevel !== "none"
				? ` (${this._protectionSummary.currentLevel})`
				: "";

		const item = new VrekoTreeItem(
			`${VREKO_ICONS.SHIELD} ${totalProtected} files protected${levelLabel}`,
			{ type: "header" },
			vscode.TreeItemCollapsibleState.Collapsed,
		);

		// Stable ID for automatic expansion persistence by VS Code
		item.id = "vreko:root:header";
		item.tooltip = "Click to see protection breakdown";
		item.contextValue = "header";

		return item;
	}

	private async getProtectionBreakdown(): Promise<VrekoTreeItem[]> {
		try {
			const counts = await this.configManager.getProtectionCounts();
			const items: VrekoTreeItem[] = [];

			// Only show non-zero counts (hide empty states)
			if (counts.block > 0) {
				items.push(this.createDetailItem("Block", counts.block, VREKO_ICONS.BLOCK));
			}
			if (counts.warn > 0) {
				items.push(this.createDetailItem("Warn", counts.warn, VREKO_ICONS.WARN));
			}
			if (counts.watch > 0) {
				items.push(this.createDetailItem("Watch", counts.watch, VREKO_ICONS.WATCH));
			}

			return items;
		} catch (error) {
			logger.error("Error getting protection breakdown", error as Error);
			return [];
		}
	}

	private createDetailItem(level: string, count: number, icon: string): VrekoTreeItem {
		const item = new VrekoTreeItem(
			`${icon} ${level}: ${count}`,
			{ type: "header-detail", count },
			vscode.TreeItemCollapsibleState.None,
		);
		item.command = {
			command: COMMANDS.PROTECTION.SHOW_ALL,
			title: `Show ${level} files`,
			arguments: [level.toLowerCase()],
		};
		return item;
	}

	private async getTotalProtectedCount(): Promise<number> {
		try {
			const counts = await this.configManager.getProtectionCounts();
			return counts.block + counts.warn + counts.watch;
		} catch (error) {
			logger.error("Error getting total protected count", error as Error);
			return 0;
		}
	}

	// ============================================
	// SNAPSHOT GROUPS (Strategy Pattern)
	// ============================================

	/**
	 * Create the unified ACTIVITY section with snapshot count
	 *
	 * NOTE: VS Code automatically persists expansion state via stable TreeItem.id.
	 * Default to expanded for first-time visibility.
	 */
	private async createSnapshotGroups(): Promise<VrekoTreeItem[]> {
		// Use cached snapshots, trigger background refresh if cache is empty
		if (this.cachedSnapshots.length === 0 && !this.isLoadingSnapshots) {
			void this.preloadSnapshots(); // Load in background
		}

		// Only show ACTIVITY section if there are snapshots
		if (this.cachedSnapshots.length === 0) {
			return [];
		}

		// Create unified ACTIVITY header
		// Default to Expanded - VS Code will remember user's preference via stable ID
		const activityItem = new VrekoTreeItem(
			`ACTIVITY (${this.cachedSnapshots.length})`,
			{ type: "activity-header", count: this.cachedSnapshots.length },
			vscode.TreeItemCollapsibleState.Expanded,
		);
		// Stable ID for automatic expansion persistence by VS Code
		activityItem.id = "vreko:activity:header";
		activityItem.contextValue = "activityHeader";

		return [activityItem];
	}

	private async loadSnapshots(): Promise<void> {
		const startTime = Date.now();
		try {
			const manifests = await this.storageManager.listSnapshots({ limit: 100 });
			this.cachedSnapshots = manifests.map((m) => this.toDisplayItem(m));

			// Count NEW badges for telemetry
			const newBadgeCount = this.cachedSnapshots.filter(
				(s) => this.badgeProvider.getBadge(s.timestamp.getTime())?.type === "new",
			).length;

			logger.debug("Snapshots loaded for TreeView", {
				count: this.cachedSnapshots.length,
				newBadgeCount,
				hasAI: this.cachedSnapshots.some((s) => s.trigger === "ai-detected"),
				hasManual: this.cachedSnapshots.some((s) => s.trigger === "manual"),
				duration: Date.now() - startTime,
			});
		} catch (error) {
			logger.error("Error loading snapshots", error as Error);
			this.cachedSnapshots = [];
		}
	}

	// ============================================
	// TIME GROUPING (Removed - replaced by getActivityTimeGroups)
	// ============================================

	private async getSnapshotsForTimeGroup(groupKey: TimeGroup): Promise<VrekoTreeItem[]> {
		const strategy = new TimeGroupingStrategy();
		const grouped = strategy.group(this.cachedSnapshots);

		const snapshots = grouped[groupKey === "this-week" ? "thisWeek" : groupKey];
		return this.createSnapshotItems(snapshots, groupKey);
	}

	/**
	 * Get files for a specific snapshot
	 * Called when user expands a snapshot node
	 */
	private async getSnapshotFiles(snapshotId: string): Promise<VrekoTreeItem[]> {
		try {
			const manifest = await this.storageManager.getSnapshotManifest(snapshotId);
			if (!manifest) {
				return [];
			}

			return Object.keys(manifest.files).map((filePath) => {
				const fileName = path.basename(filePath);
				const dirName = path.dirname(filePath);

				const item = new VrekoTreeItem(
					fileName,
					{ type: "snapshot-file", id: snapshotId, filePath },
					vscode.TreeItemCollapsibleState.None,
				);

				// Stable ID for automatic expansion persistence by VS Code
				item.id = `vreko:activity:file:${snapshotId}:${filePath}`;
				// Use iconPath for file icons (codicon syntax doesn't work in labels)
				item.iconPath = this.getFileIcon(filePath);

				// CRITICAL: resourceUri must be set for ThemeIcon.File/Folder to render
				// This enables VS Code's file icon theme to show the correct icon
				// Using the full file path for proper icon theming
				item.resourceUri = vscode.Uri.file(filePath);
				// Show directory path only if not root
				item.description = dirName === "." ? "" : dirName;
				item.tooltip = `Click to compare with current file\n${filePath}`;
				item.contextValue = "activityFile";
				item.command = {
					command: "vreko.snapshot.showFileDiff",
					title: "Compare with Current",
					arguments: [snapshotId, filePath],
				};

				return item;
			});
		} catch (error) {
			logger.error("Error loading snapshot files", error as Error);
			return [];
		}
	}

	/**
	 * Get appropriate file icon based on extension
	 */
	private getFileIcon(filePath: string): vscode.ThemeIcon {
		const ext = path.extname(filePath).toLowerCase();
		switch (ext) {
			case ".ts":
			case ".tsx":
			case ".js":
			case ".jsx":
			case ".mjs":
			case ".cjs":
				return new vscode.ThemeIcon("file-code");
			case ".json":
				return new vscode.ThemeIcon("json");
			case ".md":
				return new vscode.ThemeIcon("markdown");
			case ".css":
			case ".scss":
			case ".less":
				return new vscode.ThemeIcon("file-code");
			case ".html":
			case ".htm":
				return new vscode.ThemeIcon("file-code");
			case ".yml":
			case ".yaml":
				return new vscode.ThemeIcon("file-code");
			case ".env":
				return new vscode.ThemeIcon("key");
			case ".png":
			case ".jpg":
			case ".jpeg":
			case ".gif":
			case ".svg":
				return new vscode.ThemeIcon("file-media");
			default:
				return new vscode.ThemeIcon("file");
		}
	}

	// ============================================
	// SNAPSHOT ITEMS
	// ============================================

	private createSnapshotItems(snapshots: SnapshotDisplayItem[], groupKey: TimeGroup): VrekoTreeItem[] {
		const maxVisible = this.config.maxPerGroup;
		const items = snapshots.slice(0, maxVisible).map((snap) => this.createSnapshotItem(snap));

		if (snapshots.length > maxVisible) {
			items.push(this.createMoreItem(snapshots.length - maxVisible, groupKey));
		}

		return items;
	}

	/**
	 * Get remaining snapshots when "more snapshots" is expanded
	 */
	private getMoreSnapshots(groupKey: TimeGroup): VrekoTreeItem[] {
		const strategy = new TimeGroupingStrategy();
		const grouped = strategy.group(this.cachedSnapshots);

		const snapshots = grouped[groupKey === "this-week" ? "thisWeek" : groupKey];
		const maxVisible = this.config.maxPerGroup;

		// Return only the remaining snapshots (those after maxVisible)
		return snapshots.slice(maxVisible).map((snap) => this.createSnapshotItem(snap));
	}

	/**
	 * Create snapshot item with file-first label format
	 * Format: "{icon}  {filename} (+count)"
	 * Description shows time
	 * Examples:
	 * - "🤖  api.ts (+2)" with description "2:45 PM"
	 * - "📸  index.ts" with description "2:30 PM"
	 */
	private createSnapshotItem(snapshot: SnapshotDisplayItem): VrekoTreeItem {
		// Use shared formatting utilities for consistent display
		const icon = this.getEventIconFromManifest(snapshot);
		const fileDisplay = this.getFileDisplayFromSnapshot(snapshot);
		const timeDisplay = formatAbsoluteTime(snapshot.timestamp.getTime());
		const createdAt = snapshot.timestamp.getTime();

		// Get badge state for this snapshot
		const badge = this.badgeProvider.getBadge(createdAt);

		// Track snapshot for auto-refresh when badge expires
		this.badgeProvider.trackSnapshot(snapshot.id, createdAt);

		// Build label with optional badge
		const badgeText = badge?.type === "new" ? " NEW" : "";

		// Determine collapsibility: multi-file expands, single-file opens diff
		const isMultiFile = snapshot.fileCount > 1;
		const collapsibleState = isMultiFile
			? vscode.TreeItemCollapsibleState.Collapsed
			: vscode.TreeItemCollapsibleState.None;

		const item = new VrekoTreeItem(
			`${icon}  ${fileDisplay}${badgeText}`,
			{ type: "snapshot", id: snapshot.id },
			collapsibleState,
		);

		// Stable ID for automatic expansion persistence by VS Code
		item.id = `vreko:activity:snapshot:${snapshot.id}`;
		// Description shows time
		const staleIndicator = badge?.type === "stale" ? " (old)" : "";
		item.description = `${timeDisplay}${staleIndicator}`;
		item.tooltip = this.getSnapshotTooltip(snapshot);

		// Context value based on single/multi file for interaction model
		item.contextValue = isMultiFile ? "activityEventMulti" : "activityEventSingle";

		// Single-file events: click opens diff
		if (!isMultiFile) {
			item.command = {
				command: "vreko.snapshot.showFileDiff",
				title: "Compare with Current",
				arguments: [snapshot.id, snapshot.primaryFile],
			};
		}

		return item;
	}

	/**
	 * Get origin icon using shared formatting utilities
	 */
	private getEventIconFromManifest(snapshot: SnapshotDisplayItem): string {
		// File-type icon based on primary file (e.g., ⚙️ for config, 📦 for package.json)
		return snapshot.primaryFile ? getFileTypeIcon(snapshot.primaryFile) : "📄";
	}

	/**
	 * Get file display using shared formatting or fallback
	 */
	private getFileDisplayFromSnapshot(snapshot: SnapshotDisplayItem): string {
		const fileName = path.basename(snapshot.primaryFile);
		if (snapshot.fileCount > 1) {
			return `${fileName} (+${snapshot.fileCount - 1})`;
		}
		return fileName;
	}

	private getSnapshotTooltip(snapshot: SnapshotDisplayItem): string {
		const lines = [snapshot.name, `Files: ${snapshot.fileCount}`, `Trigger: ${snapshot.trigger}`];
		if (snapshot.aiTool) {
			lines.push(`AI Tool: ${snapshot.aiTool}`);
		}
		if (snapshot.detectedSystem) {
			lines.push(`System: ${snapshot.detectedSystem}`);
		}
		lines.push(`Time: ${snapshot.timestamp.toLocaleString()}`);
		return lines.join("\n");
	}

	private createMoreItem(remaining: number, groupKey: TimeGroup): VrekoTreeItem {
		const item = new VrekoTreeItem(
			`⋯ ${remaining} more snapshots`,
			{ type: "more-snapshots", count: remaining, groupKey },
			vscode.TreeItemCollapsibleState.Collapsed,
		);
		// Stable ID for automatic expansion persistence by VS Code
		item.id = `vreko:activity:more:${groupKey}`;
		item.tooltip = `Click to expand ${remaining} more snapshots`;
		return item;
	}

	// ============================================
	// ACTIVITY TIME GROUPS
	// ============================================

	/**
	 * Get time-based sub-groups for the unified ACTIVITY section
	 */
	private getActivityTimeGroups(): VrekoTreeItem[] {
		const strategy = new TimeGroupingStrategy();
		const grouped = strategy.group(this.cachedSnapshots);
		const items: VrekoTreeItem[] = [];

		const groups: Array<{ key: TimeGroup; data: SnapshotDisplayItem[] }> = [
			{ key: "recent", data: grouped.recent },
			{ key: "yesterday", data: grouped.yesterday },
			{ key: "this-week", data: grouped.thisWeek },
			{ key: "older", data: grouped.older },
		];

		for (const { key, data } of groups) {
			// HIDE EMPTY STATES - Only show groups with content
			if (data.length > 0) {
				const item = new VrekoTreeItem(
					strategy.getGroupLabel(key),
					{ type: "time-group", groupKey: key, count: data.length },
					strategy.isExpandedByDefault(key)
						? vscode.TreeItemCollapsibleState.Expanded
						: vscode.TreeItemCollapsibleState.Collapsed,
				);
				// Stable ID for automatic expansion persistence by VS Code
				item.id = `vreko:activity:time-group:${key}`;
				item.description = `${data.length}`;
				items.push(item);
			}
		}

		return items;
	}

	// ============================================
	// PROBLEMS SECTION
	// ============================================

	private createProblemsSection(): VrekoTreeItem {
		const item = new VrekoTreeItem(
			`${VREKO_ICONS.WARNING} PROBLEMS (${this.problems.length})`,
			{ type: "problems-header", count: this.problems.length },
			vscode.TreeItemCollapsibleState.Expanded,
		);
		// Stable ID for automatic expansion persistence by VS Code
		item.id = "vreko:root:problems";
		item.contextValue = "problems-header";
		return item;
	}

	private getProblemItems(): VrekoTreeItem[] {
		return this.problems.map((problem) => {
			const icon = problem.severity === "error" ? VREKO_ICONS.ERROR : VREKO_ICONS.WARNING;
			const item = new VrekoTreeItem(
				`${icon} ${problem.title}`,
				{ type: "problem", id: problem.id },
				vscode.TreeItemCollapsibleState.None,
			);
			// Stable ID for automatic expansion persistence by VS Code
			item.id = `vreko:problems:item:${problem.id}`;
			item.description = problem.action?.label;
			item.tooltip = problem.description;

			if (problem.action) {
				item.command = {
					command: problem.action.command,
					title: problem.action.label,
					arguments: [problem.id],
				};
			}

			return item;
		});
	}

	// ============================================
	// INTELLIGENCE SECTIONS (Learnings, Violations, Stats)
	// ============================================

	private createLearningsSection(count: number): VrekoTreeItem {
		const item = new VrekoTreeItem(
			"📖 Learnings",
			{ type: "learnings-header", count },
			vscode.TreeItemCollapsibleState.Collapsed,
		);
		item.id = "vreko:learnings:header";
		item.description = `(${count})`;
		item.tooltip = `Accumulated project knowledge and patterns - ${count} learnings`;
		item.contextValue = "learningsHeader";
		return item;
	}

	private createViolationsSection(count: number): VrekoTreeItem {
		const item = new VrekoTreeItem(
			"⚠️ Violations",
			{ type: "violations-header", count },
			vscode.TreeItemCollapsibleState.Collapsed,
		);
		item.id = "vreko:violations:header";
		item.description = `(${count})`;
		item.tooltip = `Pattern violations detected in your code - ${count} total occurrences`;
		item.contextValue = "violationsHeader";
		return item;
	}

	private createStatsSection(): VrekoTreeItem {
		const stats = this._cachedIntelligence?.stats;
		const totalLearnings = stats?.totalLearnings ?? 0;
		const totalViolations = stats?.totalViolations ?? 0;

		const item = new VrekoTreeItem(
			"📊 Quick Stats",
			{ type: "stats-header" },
			vscode.TreeItemCollapsibleState.Collapsed,
		);
		item.id = "vreko:stats:header";
		item.description = `${totalLearnings} learnings, ${totalViolations} violations`;
		item.tooltip = "Quick overview of your intelligence data";
		item.contextValue = "statsHeader";
		return item;
	}

	private getLearningItems(): VrekoTreeItem[] {
		const learnings = this._cachedIntelligence?.learnings ?? [];
		if (learnings.length === 0) {
			return [];
		}

		// Sort by date (most recent first)
		const sorted = [...learnings].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		// Show first 20
		const truncated = sorted.slice(0, 20);

		return truncated.map((learning) => {
			const typeIconMap: Record<Learning["type"], string> = {
				pattern: "🔄",
				pitfall: "⚠️",
				efficiency: "⚡",
				discovery: "💡",
				workflow: "⚙️",
			};

			const item = new VrekoTreeItem(
				`${typeIconMap[learning.type]} ${learning.trigger}`,
				{ type: "learning-item", id: learning.id },
				vscode.TreeItemCollapsibleState.None,
			);
			item.id = `vreko:learning:${learning.id}`;
			item.description = learning.type;
			item.tooltip = `${learning.trigger}\n\nAction: ${learning.action}\nSource: ${learning.source}`;
			item.contextValue = "learningItem";
			return item;
		});
	}

	private getViolationItems(): VrekoTreeItem[] {
		const violations = this._cachedIntelligence?.violations ?? [];
		if (violations.length === 0) {
			return [];
		}

		// Sort by count (descending) then by date (most recent first)
		const sorted = [...violations].sort((a, b) => {
			if (a.count !== b.count) {
				return b.count - a.count;
			}
			return new Date(b.date).getTime() - new Date(a.date).getTime();
		});

		// Show first 20
		const truncated = sorted.slice(0, 20);

		return truncated.map((violation) => {
			const statusBadge = {
				tracking: "●",
				ready_for_promotion: "◉",
				promoted: "✓",
				automated: "⚡",
			}[violation.promotionStatus];

			const item = new VrekoTreeItem(
				`${statusBadge} ${violation.type}`,
				{ type: "violation-item" },
				vscode.TreeItemCollapsibleState.None,
			);
			item.id = `vreko:violation:${violation.type}:${violation.file}`;
			item.description = `${violation.count}x in ${path.basename(violation.file)}`;
			item.tooltip = `${violation.type}\n\n${violation.message}\n\nStatus: ${violation.promotionStatus}\nOccurrences: ${violation.count}`;
			item.contextValue = "violationItem";
			item.command = {
				command: "vscode.open",
				title: "Open file with violation",
				arguments: [vscode.Uri.file(violation.file)],
			};
			return item;
		});
	}

	private getStatsItems(): VrekoTreeItem[] {
		const stats = this._cachedIntelligence?.stats;
		if (!stats) {
			return [];
		}

		const items: VrekoTreeItem[] = [];

		// Core stats
		items.push(
			this.createStatItem("Total Learnings", stats.totalLearnings, "book"),
			this.createStatItem("Total Violations", stats.totalViolations, "warning"),
			this.createStatItem("Promoted Patterns", stats.promotedPatterns, "check"),
			this.createStatItem("Pending Promotion", stats.pendingPromotion, "clock"),
		);

		// Add vitals if available
		const vitals = this._cachedIntelligence?.vitals;
		if (vitals) {
			items.push(
				this.createStatItem("Pulse", `${vitals.pulse.changesPerMinute}/min`, "pulse"),
				this.createStatItem("Temperature", `${vitals.temperature.aiPercentage}%`, "thermometer"),
			);
		}

		return items;
	}

	private createStatItem(label: string, value: number | string, iconName: string): VrekoTreeItem {
		const item = new VrekoTreeItem(label, { type: "stat-item" }, vscode.TreeItemCollapsibleState.None);
		item.id = `vreko:stat:${label}`;
		item.description = String(value);
		item.iconPath = getThemeIcon(iconName as Parameters<typeof getThemeIcon>[0]);
		item.contextValue = "statItem";
		return item;
	}

	// ============================================
	// HELPERS
	// ============================================

	private toDisplayItem(manifest: SnapshotManifest): SnapshotDisplayItem {
		return {
			id: manifest.id,
			name: manifest.name,
			timestamp: new Date(manifest.timestamp),
			trigger: manifest.trigger,
			fileCount: Object.keys(manifest.files).length,
			primaryFile: Object.keys(manifest.files)[0] || "unknown",
			aiTool: manifest.metadata?.aiDetection?.tool,
			description: this.formatRelativeTime(manifest.timestamp),
			detectedSystem: undefined, // Future: manifest.metadata?.detectedSystem
		};
	}

	private formatRelativeTime(timestamp: number): string {
		const diff = Date.now() - timestamp;
		const minutes = Math.floor(diff / 60000);
		const hours = Math.floor(diff / 3600000);
		const days = Math.floor(diff / 86400000);

		if (minutes < 1) {
			return "just now";
		}
		if (minutes < 60) {
			return `${minutes}m ago`;
		}
		if (hours < 24) {
			return `${hours}h ago`;
		}
		if (days === 1) {
			return "yesterday";
		}
		return `${days}d ago`;
	}

	// ============================================
	// SETUP SECTION (Claude Desktop)
	// ============================================

	/**
	 * Check if Claude Desktop is installed but needs Vreko configuration
	 * Returns true if the Claude Desktop config directory exists
	 */
	private isClaudeDesktopSetupNeeded(): boolean {
		try {
			const home = os.homedir();
			let configPath: string;

			switch (process.platform) {
				case "darwin":
					configPath = path.join(home, "Library/Application Support/Claude");
					break;
				case "win32":
					configPath = path.join(process.env.APPDATA || "", "Claude");
					break;
				default:
					configPath = path.join(home, ".config/Claude");
					break;
			}

			// Check if Claude Desktop directory exists (app is installed)
			if (!fs.existsSync(configPath)) {
				return false;
			}

			// Check if Vreko is already configured
			const configFile = path.join(configPath, "claude_desktop_config.json");
			if (fs.existsSync(configFile)) {
				try {
					const content = fs.readFileSync(configFile, "utf-8");
					const config = JSON.parse(content);
					// Check if vreko is already in mcpServers
					if (config.mcpServers?.vreko) {
						return false; // Already configured
					}
				} catch {
					// Config exists but couldn't be parsed - show setup option
				}
			}

			return true; // Claude Desktop installed but Vreko not configured
		} catch (error) {
			logger.debug("Error checking Claude Desktop setup status", error as Error);
			return false;
		}
	}

	/**
	 * Create the Claude Desktop setup tree item
	 */
	private createClaudeDesktopSetupItem(): VrekoTreeItem {
		const item = new VrekoTreeItem(
			"🖥️ Setup Claude Desktop",
			{ type: "setup-claude-desktop" },
			vscode.TreeItemCollapsibleState.None,
		);
		item.id = "vreko:setup:claude-desktop";
		item.description = "Configure MCP integration";
		item.tooltip = "Click to configure Vreko for Claude Desktop.\nRuns: snap tools configure --claude";
		item.contextValue = "vreko.setupClaudeDesktop";
		item.command = {
			command: "vreko.setupClaudeDesktop",
			title: "Setup Claude Desktop",
		};
		return item;
	}

	// ============================================
	// ERROR HANDLING
	// ============================================

	private createErrorItem(): VrekoTreeItem {
		const item = new VrekoTreeItem(
			`${VREKO_ICONS.ERROR} Error loading tree view`,
			{ type: "header" },
			vscode.TreeItemCollapsibleState.None,
		);
		item.tooltip = "Check Output panel for details";
		return item;
	}

	/**
	 * Static factory method for easy registration
	 */
	static register(
		context: vscode.ExtensionContext,
		storageManager: IStorageManager,
		configManager: IConfigManager,
		viewId = "vreko.dashboard",
		projectionStore?: ProjectionStore,
		workspaceRoot?: string,
	): {
		provider: VrekoTreeProvider;
		view: vscode.TreeView<VrekoTreeItem>;
	} {
		const provider = new VrekoTreeProvider(context, storageManager, configManager, projectionStore, workspaceRoot);

		const view = vscode.window.createTreeView(viewId, {
			treeDataProvider: provider,
			showCollapseAll: true,
		});

		context.subscriptions.push(view);

		return { provider, view };
	}
}
