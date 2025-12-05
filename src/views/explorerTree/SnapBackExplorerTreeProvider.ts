/**
 * @fileoverview SnapBack Explorer Tree Data Provider
 *
 * Implements VS Code TreeDataProvider for the SnapBack Explorer view.
 * Displays workspace safety metrics and snapshot summaries.
 *
 * @see Design: .qoder/quests/snapback-explorer-tree.md
 */

import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import type { AuthedApiClient } from "../../api/authedApiClient.js";
import type { CredentialsManager } from "../../auth/credentials.js";
import {
	isSection,
	type SnapBackTreeNode,
	type WorkspaceSafetyResponse,
	type WorkspaceSnapshotsResponse,
} from "./types.js";
import {
	branchStatusLabel,
	formatAge,
	formatAgeFromSeconds,
	formatBytes,
} from "./utils.js";

/**
 * Section configurations using const assertion for type safety
 *
 * Following always-typescript-patterns.md const assertion pattern
 */
const SECTION_CONFIGS = [
	{
		id: "workspaceSafety",
		section: "workspaceSafety" as const,
		label: "Workspace Safety",
		icon: "shield",
		collapsibleState: vscode.TreeItemCollapsibleState.Expanded,
	},
	{
		id: "snapshots",
		section: "snapshots" as const,
		label: "Snapshots",
		icon: "history",
		collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
	},
] as const;

/**
 * SnapBack Explorer Tree Data Provider
 *
 * Implements TreeDataProvider interface to display workspace safety
 * and snapshot data in VS Code's Explorer sidebar.
 */
export class SnapBackExplorerTreeProvider
	implements vscode.TreeDataProvider<SnapBackTreeNode>, vscode.Disposable
{
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<
		SnapBackTreeNode | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	// Cached API responses
	private safetyCache: WorkspaceSafetyResponse | null = null;
	private snapshotsCache: WorkspaceSnapshotsResponse | null = null;
	private lastUpdatedAt: Date | null = null;

	constructor(
		private readonly apiClient: AuthedApiClient,
		private readonly credentialsManager: CredentialsManager,
	) {}

	/**
	 * Refresh the tree view
	 * Clears caches and fires tree data change event
	 */
	refresh(): void {
		this.safetyCache = null;
		this.snapshotsCache = null;
		this.lastUpdatedAt = null;
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Get tree item representation for a node
	 *
	 * @param element - Tree node to convert
	 * @returns VS Code TreeItem
	 */
	getTreeItem(element: SnapBackTreeNode): vscode.TreeItem {
		const item = new vscode.TreeItem(element.label, element.collapsibleState);

		if (element.description) {
			item.description = element.description;
		}

		if (element.icon) {
			item.iconPath = new vscode.ThemeIcon(element.icon);
		}

		// Set contextValue for menu contributions
		if (element.kind === "blockingIssue" && element.filePath) {
			item.contextValue = "blockingIssue";
		} else if (element.kind === "snapshot" && element.snapshotId) {
			item.contextValue = "snapshot";
		}

		return item;
	}

	/**
	 * Get children for a tree node
	 *
	 * Uses discriminated union pattern for type-safe node handling
	 *
	 * @param element - Parent node (undefined for root)
	 * @returns Array of child nodes
	 */
	async getChildren(element?: SnapBackTreeNode): Promise<SnapBackTreeNode[]> {
		if (!element) {
			return this.getRootNodes();
		}

		// Exhaustive checking via discriminated union
		switch (element.kind) {
			case "section":
				return this.getSectionChildren(element);
			case "group":
				// Group nodes return empty (children built inline)
				return [];
			case "rootStatus":
			case "blockingIssue":
			case "watchItem":
			case "snapshot":
			case "branch":
				// Leaf nodes have no children
				return [];
			default: {
				// TypeScript ensures all cases handled
				const _exhaustive: never = element.kind;
				void _exhaustive;
				return [];
			}
		}
	}

	/**
	 * Get root nodes based on authentication state
	 *
	 * @returns Root node array
	 */
	private async getRootNodes(): Promise<SnapBackTreeNode[]> {
		const creds = await this.credentialsManager.getCredentials();

		if (creds === null) {
			// Unauthenticated: show connect node
			return [this.createConnectNode()];
		}

		// Authenticated: show status + sections
		const nodes: SnapBackTreeNode[] = [
			this.createStatusNode(),
			...SECTION_CONFIGS.map((config) => this.createSectionNode(config)),
		];

		return nodes;
	}

	/**
	 * Create connect account node (unauthenticated state)
	 */
	private createConnectNode(): SnapBackTreeNode {
		return {
			id: "connect",
			kind: "section",
			label: "Connect SnapBack Account",
			description: "Link VS Code to your SnapBack workspace",
			icon: "account",
			collapsibleState: vscode.TreeItemCollapsibleState.None,
		};
	}

	/**
	 * Create status node showing last update time
	 */
	private createStatusNode(): SnapBackTreeNode {
		const label = this.lastUpdatedAt
			? `Last updated ${formatAge(this.lastUpdatedAt.toISOString())}`
			: "Last updated: never";

		return {
			id: "status",
			kind: "rootStatus",
			label,
			icon: "clock",
			collapsibleState: vscode.TreeItemCollapsibleState.None,
		};
	}

	/**
	 * Create section node from configuration
	 */
	private createSectionNode(
		config: (typeof SECTION_CONFIGS)[number],
	): SnapBackTreeNode {
		return {
			id: config.id,
			kind: "section",
			section: config.section,
			label: config.label,
			icon: config.icon,
			collapsibleState: config.collapsibleState,
		};
	}

	/**
	 * Get children for a section node
	 *
	 * @param element - Section node
	 * @returns Child nodes for the section
	 */
	private async getSectionChildren(
		element: SnapBackTreeNode,
	): Promise<SnapBackTreeNode[]> {
		if (!isSection(element)) {
			return [];
		}

		switch (element.section) {
			case "workspaceSafety":
				return this.getSafetyChildren();
			case "snapshots":
				return this.getSnapshotsChildren();
			default: {
				const _exhaustive: never = element.section;
				void _exhaustive;
				return [];
			}
		}
	}

	/**
	 * Get workspace safety children
	 *
	 * Uses cache if available, otherwise fetches from API
	 */
	private async getSafetyChildren(): Promise<SnapBackTreeNode[]> {
		// Return cached data if available
		if (this.safetyCache !== null) {
			return this.buildSafetyNodes(this.safetyCache);
		}

		try {
			const safety = await this.apiClient.fetch<WorkspaceSafetyResponse>(
				"/api/v1/workspace/safety",
			);

			this.safetyCache = safety;
			this.lastUpdatedAt = new Date();

			return this.buildSafetyNodes(safety);
		} catch (error) {
			return this.handleError(error, "workspaceSafety");
		}
	}

	/**
	 * Get snapshots children
	 *
	 * Uses cache if available, otherwise fetches from API
	 */
	private async getSnapshotsChildren(): Promise<SnapBackTreeNode[]> {
		// Return cached data if available
		if (this.snapshotsCache !== null) {
			return this.buildSnapshotsNodes(this.snapshotsCache);
		}

		try {
			const snapshots = await this.apiClient.fetch<WorkspaceSnapshotsResponse>(
				"/api/v1/workspace/snapshots",
			);

			this.snapshotsCache = snapshots;
			this.lastUpdatedAt = new Date();

			return this.buildSnapshotsNodes(snapshots);
		} catch (error) {
			return this.handleError(error, "snapshots");
		}
	}

	/**
	 * Build safety section nodes from API response
	 */
	private buildSafetyNodes(
		safety: WorkspaceSafetyResponse,
	): SnapBackTreeNode[] {
		const nodes: SnapBackTreeNode[] = [];

		// Blocking Issues group
		const blockingCount = safety.blockingIssues.length;
		nodes.push({
			id: "blockingIssues",
			kind: "group",
			label: `Blocking Issues (${blockingCount})`,
			icon: blockingCount > 0 ? "error" : "pass",
			collapsibleState:
				blockingCount > 0
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.None,
		});

		// Add blocking issue nodes
		for (const issue of safety.blockingIssues) {
			nodes.push({
				id: issue.id,
				kind: "blockingIssue",
				label: issue.message,
				description: formatAge(issue.createdAt),
				icon: "warning",
				filePath: issue.filePath,
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			});
		}

		// Watch Items group
		const watchCount = safety.watchItems.length;
		nodes.push({
			id: "watchItems",
			kind: "group",
			label: `Watch Items (${watchCount})`,
			icon: "eye",
			collapsibleState:
				watchCount > 0
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.None,
		});

		// Add watch item nodes
		for (const issue of safety.watchItems) {
			nodes.push({
				id: issue.id,
				kind: "watchItem",
				label: issue.message,
				description: formatAge(issue.createdAt),
				icon: "circle-large-outline",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			});
		}

		return nodes;
	}

	/**
	 * Build snapshots section nodes from API response
	 */
	private buildSnapshotsNodes(
		snapshots: WorkspaceSnapshotsResponse,
	): SnapBackTreeNode[] {
		const nodes: SnapBackTreeNode[] = [];

		// Total snapshots node
		nodes.push({
			id: "snapshotsTotal",
			kind: "group",
			label: `Total Snapshots: ${snapshots.total}`,
			icon: "list-tree",
			collapsibleState: vscode.TreeItemCollapsibleState.None,
		});

		// Recommended Recovery Points group
		const recoveryCount = snapshots.recommendedRecoveryPoints.length;
		nodes.push({
			id: "recommendedRecoveryPoints",
			kind: "group",
			label: `⭐ Recommended Recovery Points (${recoveryCount})`,
			icon: "star-full",
			collapsibleState:
				recoveryCount > 0
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.None,
		});

		// Add recovery point nodes
		for (const snap of snapshots.recommendedRecoveryPoints) {
			const age = formatAge(snap.createdAt);
			nodes.push({
				id: snap.id,
				kind: "snapshot",
				label: snap.label || snap.reason,
				description: `${snap.branch} • ${snap.trigger} • ${age}`,
				icon: "star-full",
				snapshotId: snap.id,
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			});
		}

		// Active Branches group
		const branchCount = snapshots.activeBranches.length;
		nodes.push({
			id: "activeBranches",
			kind: "group",
			label: `🔄 Active Branches (${branchCount})`,
			icon: "git-branch",
			collapsibleState:
				branchCount > 0
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.None,
		});

		// Add branch nodes
		for (const branch of snapshots.activeBranches) {
			const age = formatAgeFromSeconds(branch.lastSnapshotAgeSeconds);
			const statusLabel = branchStatusLabel(branch.status);
			nodes.push({
				id: `branch-${branch.branch}`,
				kind: "branch",
				label: branch.branch,
				description: `${branch.snapshots} snapshots • ${age} • ${statusLabel}`,
				icon: "git-branch",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			});
		}

		// Cleanup Candidates group
		const cleanupCount = snapshots.cleanupCandidates.length;
		nodes.push({
			id: "cleanupCandidates",
			kind: "group",
			label: `🗑️ Cleanup Candidates (${cleanupCount})`,
			icon: "trash",
			collapsibleState:
				cleanupCount > 0
					? vscode.TreeItemCollapsibleState.Expanded
					: vscode.TreeItemCollapsibleState.None,
		});

		// Add cleanup candidate nodes
		for (const snap of snapshots.cleanupCandidates) {
			const age = formatAgeFromSeconds(snap.ageSeconds);
			const size = formatBytes(snap.storageBytes);
			nodes.push({
				id: snap.id,
				kind: "snapshot",
				label: snap.reason,
				description: `${age} • ${size}`,
				icon: "trash",
				snapshotId: snap.id,
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			});
		}

		return nodes;
	}

	/**
	 * Handle API errors and session expiry
	 *
	 * @param error - Caught error
	 * @param section - Section name for logging
	 * @returns Error node array
	 */
	private async handleError(
		error: unknown,
		section: string,
	): Promise<SnapBackTreeNode[]> {
		const errorMsg = error instanceof Error ? error.message : String(error);

		// Check for session expiry
		if (errorMsg.includes("Session expired")) {
			logger.warn("Session expired, clearing credentials", {
				section,
			});

			await this.credentialsManager.clearCredentials();
			this._onDidChangeTreeData.fire(undefined);

			return [
				{
					id: "sessionExpired",
					kind: "section",
					label: "Session Expired",
					description: "Please reconnect your account",
					icon: "warning",
					collapsibleState: vscode.TreeItemCollapsibleState.None,
				},
			];
		}

		// Generic error
		logger.error("Failed to fetch section data", {
			section,
			error: errorMsg,
		});

		return [
			{
				id: "error",
				kind: "section",
				label: "Error loading data",
				description: errorMsg,
				icon: "error",
				collapsibleState: vscode.TreeItemCollapsibleState.None,
			},
		];
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this._onDidChangeTreeData.dispose();
	}
}
