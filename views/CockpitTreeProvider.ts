/**
 * CockpitTreeProvider - Redesigned TreeView for Vreko
 *
 * Per fix_up_tree_view.md spec:
 * - Lead with value, not status
 * - Operational intelligence (what you need mid-flow)
 * - No analytics/dashboard data (that goes to web console)
 *
 * Structure:
 * - Session: live session with timer (if active)
 * - Recent Snapshots: last 5 with inline restore
 * - Fragile Files: high-risk files in this workspace
 * - Active Learnings: what the daemon knows
 * - Actions: Create Snapshot, End Session, Open Ceremony
 */

import * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";
import type { IStorageManager, SnapshotManifest } from "../storage/types";
import { logger } from "../utils/logger";

// =============================================================================
// TREE ITEM TYPES
// =============================================================================

type CockpitItemType =
	| "brand-header"
	| "session"
	| "session-detail"
	| "snapshots-header"
	| "snapshot"
	| "fragile-header"
	| "fragile-file"
	| "learnings-header"
	| "learning-item"
	| "session-history-header"
	| "session-history-item"
	| "session-history-more"
	| "health-header"
	| "health-guard"
	| "health-file"
	| "workspace-intel-header"
	| "workspace-intel-item"
	| "actions-header"
	| "action"
	| "empty-state"
	| "error";

/** Session list item for history display */
interface SessionHistoryItem {
	sessionId: string;
	task: string | null;
	startedAt: number;
	endedAt: number | null;
	snapshotCount: number;
	learningCount: number;
	isLive: boolean;
}

/** Health guard result (SB-HEALTH-001) */
interface HealthGuardItem {
	guard: string;
	status: "pass" | "warn" | "fail";
	files: Array<{ path: string; line?: number; message: string }>;
	durationMs: number;
}

/** Workspace intelligence state from .agents/workspace.json */
interface AgentsWorkspaceHealth {
	intelligenceState: string;
	observationCount: number;
	confidence: number;
	averageFragility: number;
	fragileFileCount: number;
	mcpLastContact: string | null;
}

interface CockpitTreeItemData {
	type: CockpitItemType;
	id?: string;
	label: string;
	description?: string;
	tooltip?: string;
	contextValue?: string;
	command?: vscode.Command;
	filePath?: string;
	count?: number;
}

class CockpitTreeItem extends vscode.TreeItem {
	constructor(
		label: string,
		public readonly data: CockpitTreeItemData,
		collapsibleState?: vscode.TreeItemCollapsibleState,
	) {
		super(label, collapsibleState);
	}
}

// =============================================================================
// PROVIDER
// =============================================================================

export class CockpitTreeProvider implements vscode.TreeDataProvider<CockpitTreeItem>, vscode.Disposable {
	private _onDidChangeTreeData = new vscode.EventEmitter<CockpitTreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	private _disposables: vscode.Disposable[] = [];

	// Cached data
	private _snapshots: SnapshotManifest[] = [];
	private _fragileFiles: Array<{
		path: string;
		compositeScore: number;
		rank: number;
	}> = [];
	private _learnings: Array<{
		type: string;
		trigger: string;
		action: string;
	}> = [];
	private _sessionHistory: SessionHistoryItem[] = [];
	private _sessionActive = false;
	private _sessionTask: string | null = null;
	private _sessionDuration = 0;
	private _sessionSnapshotCount = 0;
	private _protectedCount = 0;

	// Health data (SB-HEALTH-001)
	private _healthGuards: HealthGuardItem[] = [];
	private _healthStaleMs = 0;
	private _healthRefreshing = false;

	// Workspace intelligence state from workspace.json
	private _workspaceHealth: AgentsWorkspaceHealth | null = null;

	// Debounce timer for tree refresh (prevents TreeError from rapid updates)
	private _refreshDebounceTimer: NodeJS.Timeout | undefined;

	constructor(
		private _context: vscode.ExtensionContext,
		private _storageManager: IStorageManager,
		private _daemonBridge: DaemonBridge | null,
		private _workspaceRoot: string,
	) {
		// Subscribe to daemon events
		if (_daemonBridge) {
			_daemonBridge.onSessionStarted((event) => {
				this._sessionActive = true;
				this._sessionTask = event.task ?? null;
				this.refresh();
			});

			_daemonBridge.onSessionEnded(() => {
				this._sessionActive = false;
				this._sessionTask = null;
				this._sessionDuration = 0;
				this._sessionSnapshotCount = 0;
				// Reload session history to show the newly ended session
				this.loadSessionHistory().then(() => this.refresh());
			});

			_daemonBridge.onSnapshotCreated(() => {
				this.loadSnapshots();
			});

			// Subscribe to health guard changes (SB-HEALTH-001)
			_daemonBridge.onGuardChanged((event) => {
				this._healthGuards = event.current;
				this._healthStaleMs = 0; // Reset staleness on fresh data
				this._healthRefreshing = false;
				this.refresh();
			});
		}

		// Watch workspace.json so the intelligence section refreshes live
		const agentsDir = vscode.Uri.joinPath(vscode.Uri.file(_workspaceRoot), ".agents");
		const agentsWatcher = vscode.workspace.createFileSystemWatcher(
			new vscode.RelativePattern(agentsDir, "workspace.json"),
		);
		const onAgentsFileChange = () => {
			this.loadWorkspaceJson().then(() => this.refresh());
		};
		agentsWatcher.onDidChange(onAgentsFileChange, undefined, this._disposables);
		agentsWatcher.onDidCreate(onAgentsFileChange, undefined, this._disposables);
		this._disposables.push(agentsWatcher);

		// Initial load
		this.loadAllData();
	}

	refresh(element?: CockpitTreeItem): void {
		// Cancel any pending refresh to batch rapid updates
		if (this._refreshDebounceTimer) {
			clearTimeout(this._refreshDebounceTimer);
		}

		// Trailing-edge debounce: batch all refreshes into single fire after 100ms
		this._refreshDebounceTimer = setTimeout(() => {
			this._refreshDebounceTimer = undefined;
			this._onDidChangeTreeData.fire(element);
		}, 100);
	}

	private async loadAllData(): Promise<void> {
		await Promise.all([
			this.loadSnapshots(),
			this.loadFragileFiles(),
			this.loadLearnings(),
			this.loadSessionHistory(),
			this.loadHealthData(),
			this.loadWorkspaceJson(),
		]);
		this.refresh();
	}

	private async loadSnapshots(): Promise<void> {
		try {
			const manifests = await this._storageManager.listSnapshots({ limit: 5 });
			this._snapshots = manifests;
			this._sessionSnapshotCount = manifests.length;
		} catch (error) {
			logger.error("Failed to load snapshots", error as Error);
			this._snapshots = [];
		}
	}

	private async loadFragileFiles(): Promise<void> {
		if (!this._daemonBridge || !this._workspaceRoot) {
			return;
		}

		try {
			const baseline = await this._daemonBridge.getBaseline(this._workspaceRoot);
			if (baseline?.fragileFiles) {
				this._fragileFiles = baseline.fragileFiles.slice(0, 5);
			}
		} catch (error) {
			logger.error("Failed to load fragile files", error as Error);
			this._fragileFiles = [];
		}
	}

	private async loadLearnings(): Promise<void> {
		if (!this._daemonBridge || !this._workspaceRoot) {
			return;
		}

		try {
			const result = await this._daemonBridge.listLearnings(this._workspaceRoot, 5);
			this._learnings = result.learnings ?? [];
		} catch (error) {
			logger.error("Failed to load learnings", error as Error);
			this._learnings = [];
		}
	}

	private async loadSessionHistory(): Promise<void> {
		if (!this._daemonBridge || !this._workspaceRoot) {
			return;
		}

		try {
			const result = await this._daemonBridge.listSessionCeremonies(this._workspaceRoot, { limit: 5 });
			// Transform to our internal format, filtering out live sessions (shown separately)
			this._sessionHistory = (result.sessions ?? [])
				.filter((s) => !s.isLive)
				.map((s) => ({
					sessionId: s.sessionId,
					task: null, // Task name not included in ceremony list response
					startedAt: s.startedAt,
					endedAt: s.endedAt,
					snapshotCount: s.snapshotCount,
					learningCount: s.learningCount,
					isLive: s.isLive,
				}));
		} catch (error) {
			logger.error("Failed to load session history", error as Error);
			this._sessionHistory = [];
		}
	}

	/**
	 * Load guard health data (SB-HEALTH-001)
	 */
	private async loadHealthData(): Promise<void> {
		if (!this._daemonBridge || !this._workspaceRoot) {
			return;
		}

		try {
			this._healthRefreshing = true;
			const result = await this._daemonBridge.getWorkspaceHealth(this._workspaceRoot, "fast");
			this._healthGuards = result.guards;
			this._healthStaleMs = result.staleMs;
			this._healthRefreshing = result.refreshing;
		} catch (error) {
			logger.error("Failed to load health data", error as Error);
			this._healthGuards = [];
			this._healthRefreshing = false;
		}
	}

	private async loadWorkspaceJson(): Promise<void> {
		if (!this._workspaceRoot) {
			return;
		}

		try {
			// Resolve workspace.json with deprecation fallback (new name first)
			const agentsDir2 = vscode.Uri.joinPath(vscode.Uri.file(this._workspaceRoot), ".agents");
			const newFileUri = vscode.Uri.joinPath(agentsDir2, "workspace.json");
			const legacyFileUri = vscode.Uri.joinPath(agentsDir2, "agents.workspace.json");
			const fileUri = await vscode.workspace.fs.stat(newFileUri).then(
				() => newFileUri,
				() => legacyFileUri,
			);
			const raw = await vscode.workspace.fs.readFile(fileUri);
			const parsed = JSON.parse(new TextDecoder().decode(raw)) as {
				health?: Partial<AgentsWorkspaceHealth>;
			};
			if (parsed.health) {
				this._workspaceHealth = {
					intelligenceState: parsed.health.intelligenceState ?? "UNKNOWN",
					observationCount: parsed.health.observationCount ?? 0,
					confidence: parsed.health.confidence ?? 0,
					averageFragility: parsed.health.averageFragility ?? 0,
					fragileFileCount: parsed.health.fragileFileCount ?? 0,
					mcpLastContact: parsed.health.mcpLastContact ?? null,
				};
			}
		} catch (error) {
			// File absent until first session  -  not an error worth surfacing
			logger.debug("workspace.json not readable", { reason: String(error) });
			this._workspaceHealth = null;
		}
	}

	// =============================================================================
	// TREE DATA PROVIDER IMPLEMENTATION
	// =============================================================================

	getTreeItem(element: CockpitTreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: CockpitTreeItem): Promise<CockpitTreeItem[]> {
		if (!element) {
			return this.getRootItems();
		}

		switch (element.data.type) {
			case "snapshots-header":
				return this.getSnapshotItems();
			case "fragile-header":
				return this.getFragileFileItems();
			case "learnings-header":
				return this.getLearningItems();
			case "session-history-header":
				return this.getSessionHistoryItems();
			case "health-header":
				return this.getHealthGuardItems();
			case "health-guard":
				return this.getHealthFileItems(element);
			case "workspace-intel-header":
				return this.getWorkspaceIntelItems();
			case "actions-header":
				return this.getActionItems();
			default:
				return [];
		}
	}

	private async getRootItems(): Promise<CockpitTreeItem[]> {
		const items: CockpitTreeItem[] = [];

		// 0. BRAND HEADER (always at top for visibility)
		items.push(this.createBrandHeader());

		// 1. SESSION (if active)
		if (this._sessionActive) {
			items.push(this.createSessionItem());
		}

		// 2. HEALTH STATUS (SB-HEALTH-001) - only show if we have guard data
		// Only show health section when we have actual data (not while loading with 0 items)
		if (this._healthGuards.length > 0) {
			items.push(this.createHealthHeader());
		}

		// 3. WORKSPACE INTELLIGENCE (from workspace.json)
		if (this._workspaceHealth) {
			items.push(this.createWorkspaceIntelHeader());
		}

		// 4. RECENT SNAPSHOTS
		items.push(this.createSnapshotsHeader());

		// 4. FRAGILE FILES
		if (this._fragileFiles.length > 0) {
			items.push(this.createFragileHeader());
		}

		// 5. ACTIVE LEARNINGS
		if (this._learnings.length > 0) {
			items.push(this.createLearningsHeader());
		}

		// 6. RECENT SESSIONS (past sessions with closing ceremonies)
		if (this._sessionHistory.length > 0) {
			items.push(this.createSessionHistoryHeader());
		}

		// 7. ACTIONS
		items.push(this.createActionsHeader());

		return items;
	}

	// =============================================================================
	// ITEM CREATORS
	// =============================================================================

	private createBrandHeader(): CockpitTreeItem {
		const protectedCount = this._protectedCount || this._snapshots.length;
		const label = "Vreko";

		const item = new CockpitTreeItem(
			label,
			{
				type: "brand-header",
				id: "vreko:cockpit:brand",
				label,
				description: protectedCount > 0 ? `${protectedCount} files protected` : "Ready to protect",
				contextValue: "brandHeader",
			},
			vscode.TreeItemCollapsibleState.None,
		);

		// Use Vreko logo from media folder
		item.iconPath = {
			light: vscode.Uri.joinPath(this._context.extensionUri, "media", "vreko-logo.png"),
			dark: vscode.Uri.joinPath(this._context.extensionUri, "media", "vreko-logo.png"),
		};
		item.tooltip = "Vreko - AI-aware code protection\nClick to open dashboard";
		item.command = {
			command: "vreko.openDashboard",
			title: "Open Dashboard",
		};

		return item;
	}

	private createSessionItem(): CockpitTreeItem {
		const duration = this._sessionDuration > 0 ? ` (${this.formatDuration(this._sessionDuration)})` : "";
		const label = this._sessionTask
			? `📊 Session: ${this._sessionTask}${duration}`
			: `📊 Active Session${duration}`;

		const item = new CockpitTreeItem(
			label,
			{
				type: "session",
				id: "vreko:cockpit:session",
				label,
				description: `${this._sessionSnapshotCount} snapshots`,
				contextValue: "session",
			},
			vscode.TreeItemCollapsibleState.None,
		);

		item.iconPath = new vscode.ThemeIcon("debug-start");
		item.tooltip = `Task: ${this._sessionTask ?? "(unnamed)"}\nSnapshots: ${this._sessionSnapshotCount}`;
		item.contextValue = "activeSession";

		return item;
	}

	private createSnapshotsHeader(): CockpitTreeItem {
		const count = this._snapshots.length;
		const label = `📸 Recent Snapshots (${count})`;

		const item = new CockpitTreeItem(
			label,
			{
				type: "snapshots-header",
				id: "vreko:cockpit:snapshots",
				label,
				count,
			},
			count > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None,
		);

		item.iconPath = new vscode.ThemeIcon("history");
		item.contextValue = "snapshotsHeader";

		if (count === 0) {
			item.description = "No snapshots yet";
		}

		return item;
	}

	private getSnapshotItems(): CockpitTreeItem[] {
		if (this._snapshots.length === 0) {
			return [
				new CockpitTreeItem("No snapshots yet", {
					type: "empty-state",
					label: "No snapshots yet",
				}),
			];
		}

		return this._snapshots.map((snapshot, _index) => {
			const time = this.formatTime(snapshot.timestamp);

			// Handle both Record<string, SnapshotFileRef> and string[] formats
			// Daemon returns files as string[], storage returns Record<string, SnapshotFileRef>
			let filePaths: string[];
			if (Array.isArray(snapshot.files)) {
				filePaths = snapshot.files as string[];
			} else if (snapshot.files && typeof snapshot.files === "object") {
				filePaths = Object.keys(snapshot.files);
			} else {
				filePaths = [];
			}

			const files =
				filePaths
					.slice(0, 2)
					.map((f) => f.split("/").pop() ?? f)
					.join(", ") ?? "";
			const label = `${time}  ${files}${filePaths.length > 2 ? " ..." : ""}`;

			const item = new CockpitTreeItem(
				label,
				{
					type: "snapshot",
					id: `vreko:cockpit:snapshot:${snapshot.id}`,
					label,
					description: snapshot.trigger === "ai-detected" ? "[AI]" : undefined,
					contextValue: "snapshot",
					filePath: filePaths[0],
				},
				vscode.TreeItemCollapsibleState.None,
			);

			item.iconPath = new vscode.ThemeIcon(snapshot.trigger === "ai-detected" ? "sparkle" : "save");
			item.tooltip = `ID: ${snapshot.id}\nFiles: ${filePaths.length}\nTrigger: ${snapshot.trigger ?? "manual"}`;
			item.contextValue = "snapshot";

			// Add restore command
			item.command = {
				command: "vreko.restoreSnapshot",
				title: "Restore",
				arguments: [snapshot.id],
			};

			return item;
		});
	}

	private createFragileHeader(): CockpitTreeItem {
		const count = this._fragileFiles.length;
		const label = `⚠️ Fragile Files (${count})`;

		const item = new CockpitTreeItem(
			label,
			{
				type: "fragile-header",
				id: "vreko:cockpit:fragile",
				label,
				count,
			},
			vscode.TreeItemCollapsibleState.Collapsed,
		);

		item.iconPath = new vscode.ThemeIcon("warning");
		item.contextValue = "fragileHeader";

		return item;
	}

	private getFragileFileItems(): CockpitTreeItem[] {
		return this._fragileFiles.map((file) => {
			const fileName = file.path.split("/").pop() ?? file.path;
			const label = `${fileName}`;

			const item = new CockpitTreeItem(
				label,
				{
					type: "fragile-file",
					id: `vreko:cockpit:fragile:${file.path}`,
					label,
					description: `score: ${file.compositeScore.toFixed(0)}`,
					contextValue: "fragileFile",
					filePath: file.path,
				},
				vscode.TreeItemCollapsibleState.None,
			);

			item.iconPath = new vscode.ThemeIcon("file-warning");
			item.tooltip = `${file.path}\nFragility Score: ${file.compositeScore.toFixed(0)}\nRank: #${file.rank}`;
			item.contextValue = "fragileFile";

			// Click opens the file
			item.command = {
				command: "vscode.open",
				title: "Open File",
				arguments: [vscode.Uri.file(file.path)],
			};

			return item;
		});
	}

	private createLearningsHeader(): CockpitTreeItem {
		const count = this._learnings.length;
		const label = `💡 Active Learnings (${count})`;

		const item = new CockpitTreeItem(
			label,
			{
				type: "learnings-header",
				id: "vreko:cockpit:learnings",
				label,
				count,
			},
			vscode.TreeItemCollapsibleState.Collapsed,
		);

		item.iconPath = new vscode.ThemeIcon("lightbulb");
		item.contextValue = "learningsHeader";

		return item;
	}

	private getLearningItems(): CockpitTreeItem[] {
		return this._learnings.map((learning, index) => {
			const label = learning.trigger ?? learning.type ?? "Learning";

			const item = new CockpitTreeItem(
				label,
				{
					type: "learning-item",
					id: `vreko:cockpit:learning:${index}`,
					label,
					description: learning.action?.slice(0, 30),
					contextValue: "learning",
				},
				vscode.TreeItemCollapsibleState.None,
			);

			item.iconPath = new vscode.ThemeIcon("bookmark");
			item.tooltip = `Type: ${learning.type}\nTrigger: ${learning.trigger}\nAction: ${learning.action}`;
			item.contextValue = "learning";

			return item;
		});
	}

	private createSessionHistoryHeader(): CockpitTreeItem {
		const count = this._sessionHistory.length;
		const label = `📜 Recent Sessions (${count})`;

		const item = new CockpitTreeItem(
			label,
			{
				type: "session-history-header",
				id: "vreko:cockpit:session-history",
				label,
				count,
			},
			count > 0 ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
		);

		item.iconPath = new vscode.ThemeIcon("archive");
		item.contextValue = "sessionHistoryHeader";

		if (count === 0) {
			item.description = "No past sessions";
		}

		return item;
	}

	private getSessionHistoryItems(): CockpitTreeItem[] {
		if (this._sessionHistory.length === 0) {
			return [
				new CockpitTreeItem("No past sessions", {
					type: "empty-state",
					label: "No past sessions",
				}),
			];
		}

		return this._sessionHistory.map((session) => {
			const taskLabel = session.task ?? "Session";
			const startDate = new Date(session.startedAt);
			const dateStr = startDate.toLocaleDateString();
			const timeStr = startDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

			// Calculate duration if session has ended
			let durationStr = "";
			if (session.endedAt) {
				const durationMs = session.endedAt - session.startedAt;
				const durationMins = Math.floor(durationMs / 60000);
				if (durationMins < 60) {
					durationStr = `${durationMins}m`;
				} else {
					const hrs = Math.floor(durationMins / 60);
					const mins = durationMins % 60;
					durationStr = `${hrs}h ${mins}m`;
				}
			}

			const item = new CockpitTreeItem(
				taskLabel,
				{
					type: "session-history-item",
					id: `vreko:cockpit:session:${session.sessionId}`,
					label: taskLabel,
					description: `${dateStr} ${timeStr}${durationStr ? ` • ${durationStr}` : ""} • ${session.snapshotCount} snapshots`,
					contextValue: "pastSession",
				},
				vscode.TreeItemCollapsibleState.None,
			);

			item.iconPath = new vscode.ThemeIcon("pass-filled");
			item.tooltip = `Session: ${session.sessionId}\nTask: ${session.task ?? "N/A"}\nStarted: ${startDate.toLocaleString()}\nDuration: ${durationStr || "N/A"}\nSnapshots: ${session.snapshotCount}\nLearnings: ${session.learningCount}\n\nClick to view closing ceremony`;

			// Click opens the ceremony view for this session
			item.command = {
				command: "vreko.openCeremony",
				title: "View Closing Ceremony",
				arguments: [session.sessionId],
			};

			return item;
		});
	}

	// =============================================================================
	// HEALTH SECTION (SB-HEALTH-001)
	// =============================================================================

	private createHealthHeader(): CockpitTreeItem {
		const passCount = this._healthGuards.filter((g) => g.status === "pass").length;
		const warnCount = this._healthGuards.filter((g) => g.status === "warn").length;
		const failCount = this._healthGuards.filter((g) => g.status === "fail").length;

		// Determine overall status icon, text, and context value
		let overallStatus: "pass" | "warn" | "fail" = "pass";
		let overallIcon = "pass-filled";
		let statusText = "All checks passing";

		if (failCount > 0) {
			overallStatus = "fail";
			overallIcon = "error";
			statusText = `${failCount} failing`;
		} else if (warnCount > 0) {
			overallStatus = "warn";
			overallIcon = "warning";
			statusText = `${warnCount} warning${warnCount > 1 ? "s" : ""}`;
		}

		if (this._healthRefreshing) {
			overallIcon = "sync~spin";
			statusText = "Refreshing...";
		}

		const label = `🏥 Health (${this._healthGuards.length})`;

		const item = new CockpitTreeItem(
			label,
			{
				type: "health-header",
				id: "vreko:cockpit:health",
				label,
				description: statusText,
				contextValue: `healthHeader.${overallStatus}`,
				count: this._healthGuards.length,
			},
			this._healthGuards.length > 0
				? vscode.TreeItemCollapsibleState.Collapsed
				: vscode.TreeItemCollapsibleState.None,
		);

		item.iconPath = new vscode.ThemeIcon(overallIcon);

		// Build tooltip with summary
		const staleMinutes = Math.floor(this._healthStaleMs / 60000);
		const staleText = staleMinutes > 0 ? `${staleMinutes}m ago` : "Just now";
		item.tooltip = new vscode.MarkdownString(
			"**Health Status**\n\n" +
				`✅ Pass: ${passCount} | ⚠️ Warn: ${warnCount} | ❌ Fail: ${failCount}\n\n` +
				`Last checked: ${staleText}`,
		);

		return item;
	}

	private getHealthGuardItems(): CockpitTreeItem[] {
		if (this._healthGuards.length === 0) {
			return [
				new CockpitTreeItem("No guard data", {
					type: "empty-state",
					label: "No guard data",
				}),
			];
		}

		// Sort by status: fail first, then warn, then pass
		const statusOrder = { fail: 0, warn: 1, pass: 2 };
		const sortedGuards = [...this._healthGuards].sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);

		return sortedGuards.map((guard) => {
			// Format guard name nicely (e.g., "console-logs" -> "Console Logs")
			const displayName = guard.guard
				.split("-")
				.map((word) => word.charAt(0).toUpperCase() + word.slice(1))
				.join(" ");

			const hasFiles = guard.files.length > 0;
			const fileCountText = hasFiles ? `${guard.files.length} issue${guard.files.length > 1 ? "s" : ""}` : "";
			const durationText = `${guard.durationMs}ms`;

			// Status icon and color
			const statusIcons = {
				pass: "pass-filled",
				warn: "warning",
				fail: "error",
			};

			const item = new CockpitTreeItem(
				displayName,
				{
					type: "health-guard",
					id: `vreko:cockpit:health:${guard.guard}`,
					label: displayName,
					description: fileCountText || durationText,
					contextValue: `healthGuard.${guard.status}`,
				},
				hasFiles ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None,
			);

			item.iconPath = new vscode.ThemeIcon(statusIcons[guard.status]);

			// Store guard data for children lookup
			(item as CockpitTreeItem & { guardData?: HealthGuardItem }).guardData = guard;

			// Build detailed tooltip
			const statusEmoji = { pass: "✅", warn: "⚠️", fail: "❌" };
			item.tooltip = new vscode.MarkdownString(
				`**${displayName}**\n\n` +
					`${statusEmoji[guard.status]} Status: ${guard.status.toUpperCase()}\n\n` +
					`Duration: ${guard.durationMs}ms\n` +
					(hasFiles ? `\nIssues: ${guard.files.length}` : ""),
			);

			return item;
		});
	}

	private getHealthFileItems(guardElement: CockpitTreeItem): CockpitTreeItem[] {
		const guardData = (guardElement as CockpitTreeItem & { guardData?: HealthGuardItem }).guardData;

		if (!guardData || guardData.files.length === 0) {
			return [];
		}

		return guardData.files.map((file: { path: string; line?: number; message: string }, index: number) => {
			const fileName = file.path.split("/").pop() ?? file.path;
			const lineText = file.line ? `:${file.line}` : "";
			const label = `${fileName}${lineText}`;

			const item = new CockpitTreeItem(
				label,
				{
					type: "health-file",
					id: `vreko:cockpit:health:${guardData.guard}:${index}`,
					label,
					description: file.message.slice(0, 50) + (file.message.length > 50 ? "..." : ""),
					contextValue: "healthFile",
					filePath: file.path,
				},
				vscode.TreeItemCollapsibleState.None,
			);

			item.iconPath = new vscode.ThemeIcon("file-code");
			item.tooltip = new vscode.MarkdownString(
				`**${file.path}**${file.line ? ` (line ${file.line})` : ""}\n\n` + `${file.message}`,
			);

			// Click opens the file at the line
			const fileUri = vscode.Uri.file(file.path);
			item.command = {
				command: "vscode.open",
				title: "Open File",
				arguments: file.line
					? [fileUri, { selection: new vscode.Range(file.line - 1, 0, file.line - 1, 0) }]
					: [fileUri],
			};

			return item;
		});
	}

	private createActionsHeader(): CockpitTreeItem {
		const item = new CockpitTreeItem(
			"⚡ Actions",
			{
				type: "actions-header",
				id: "vreko:cockpit:actions",
				label: "Actions",
			},
			vscode.TreeItemCollapsibleState.Expanded,
		);

		item.iconPath = new vscode.ThemeIcon("zap");
		item.contextValue = "actionsHeader";

		return item;
	}

	private getActionItems(): CockpitTreeItem[] {
		const actions: CockpitTreeItem[] = [];

		// End Session (if active)
		if (this._sessionActive) {
			actions.push(
				new CockpitTreeItem(
					"🏁 End Session",
					{
						type: "action",
						id: "vreko:cockpit:action:endSession",
						label: "End Session",
						contextValue: "action",
						command: {
							command: "vreko.endSession",
							title: "End Session",
						},
					},
					vscode.TreeItemCollapsibleState.None,
				),
			);
		}

		// View Ceremonies
		actions.push(
			new CockpitTreeItem(
				"🎭 View Ceremonies",
				{
					type: "action",
					id: "vreko:cockpit:action:openCeremony",
					label: "View Ceremonies",
					contextValue: "action",
					command: {
						command: "vreko.openCeremony",
						title: "View Ceremonies",
					},
				},
				vscode.TreeItemCollapsibleState.None,
			),
		);

		// Open Dashboard
		actions.push(
			new CockpitTreeItem(
				"🔗 Open Dashboard",
				{
					type: "action",
					id: "vreko:cockpit:action:openDashboard",
					label: "Open Dashboard",
					contextValue: "action",
					command: {
						command: "vreko.openDashboard",
						title: "Open Dashboard",
					},
				},
				vscode.TreeItemCollapsibleState.None,
			),
		);

		return actions;
	}

	// =============================================================================
	// HELPERS
	// =============================================================================

	private formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		if (mins < 60) {
			return `${mins}m`;
		}
		const hrs = Math.floor(mins / 60);
		const remainMins = mins % 60;
		return `${hrs}h ${remainMins}m`;
	}

	private formatTime(timestamp: number | string): string {
		const date = typeof timestamp === "string" ? new Date(timestamp) : new Date(timestamp);
		return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
	}

	private createWorkspaceIntelHeader(): CockpitTreeItem {
		const h = this._workspaceHealth!;
		const stateLabel = h.intelligenceState === "CONFIDENT" ? "$(pass-filled)" : "$(circle-outline)";
		const label = `${stateLabel} Intelligence`;
		const item = new CockpitTreeItem(
			label,
			{
				type: "workspace-intel-header",
				id: "vreko:cockpit:workspace-intel",
				label,
				description: `${h.observationCount} obs · ${Math.round(h.confidence * 100)}% confidence`,
				contextValue: "workspaceIntelHeader",
			},
			vscode.TreeItemCollapsibleState.Expanded,
		);
		item.iconPath = new vscode.ThemeIcon("brain");
		return item;
	}

	private getWorkspaceIntelItems(): CockpitTreeItem[] {
		const h = this._workspaceHealth;
		if (!h) return [];

		const makeItem = (id: string, label: string, value: string, icon: string): CockpitTreeItem => {
			const item = new CockpitTreeItem(
				label,
				{
					type: "workspace-intel-item",
					id: `vreko:cockpit:workspace-intel:${id}`,
					label,
					description: value,
					contextValue: "workspaceIntelItem",
				},
				vscode.TreeItemCollapsibleState.None,
			);
			item.iconPath = new vscode.ThemeIcon(icon);
			return item;
		};

		const contactLabel = h.mcpLastContact
			? new Date(h.mcpLastContact).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
			: "never";

		return [
			makeItem("state", "State", h.intelligenceState, "symbol-enum"),
			makeItem("observations", "Observations", String(h.observationCount), "eye"),
			makeItem("confidence", "Confidence", `${Math.round(h.confidence * 100)}%`, "graph-line"),
			makeItem("fragile", "Fragile files", String(h.fragileFileCount), "warning"),
			makeItem("mcp-contact", "MCP contact", contactLabel, "plug"),
		];
	}

	// =============================================================================
	// REGISTRATION
	// =============================================================================

	static register(
		context: vscode.ExtensionContext,
		storageManager: IStorageManager,
		daemonBridge: DaemonBridge | null,
		viewId: string,
		workspaceRoot: string,
	): { provider: CockpitTreeProvider; view: vscode.TreeView<CockpitTreeItem> } {
		const provider = new CockpitTreeProvider(context, storageManager, daemonBridge, workspaceRoot);

		const view = vscode.window.createTreeView(viewId, {
			treeDataProvider: provider,
			showCollapseAll: true,
		});

		context.subscriptions.push(view, provider);

		return { provider, view };
	}

	dispose(): void {
		// Clear debounce timer to prevent memory leaks
		if (this._refreshDebounceTimer) {
			clearTimeout(this._refreshDebounceTimer);
		}

		for (const d of this._disposables) {
			d.dispose();
		}
		this._disposables = [];
	}
}
