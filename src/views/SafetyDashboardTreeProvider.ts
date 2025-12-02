/**
 * Safety Dashboard Tree Provider
 * Unified tree view for workspace safety status
 */

import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import { COMMANDS } from "../constants/index.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";
import type { AttentionItem } from "../services/protectionPolicy.js";
import type { ProtectionService } from "../services/protectionService.js";
import type { StorageSnapshotSummaryProvider } from "../services/snapshotSummaryProvider.js";
import type {
	BlockingIssue,
	WatchItem,
	WorkspaceSafetyService,
} from "../services/WorkspaceSafetyService";
import { CORE_CONCEPT_SIGNAGE, REPO_STATUS_SIGNAGE } from "../signage/index.js";

type SafetyTreeNode =
	| SectionNode
	| IssueNode
	| WatchItemNode
	| SnapshotNode
	| ProtectedFileNode
	| PlaceholderNode
	| AttentionItemNode;

export class SafetyDashboardTreeProvider
	implements vscode.TreeDataProvider<SafetyTreeNode>
{
	private _onDidChangeTreeData = new vscode.EventEmitter<
		SafetyTreeNode | undefined
	>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(
		private safetyService: WorkspaceSafetyService,
		private snapshotProvider: StorageSnapshotSummaryProvider,
		private protectedFiles: ProtectedFileRegistry,
		private protectionService?: ProtectionService,
	) {}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	/**
	 * Register command to allow external refresh triggers
	 */
	static registerRefreshCommand(
		context: vscode.ExtensionContext,
		provider: SafetyDashboardTreeProvider,
	): void {
		context.subscriptions.push(
			vscode.commands.registerCommand(COMMANDS.VIEW.REFRESH_DASHBOARD, () => {
				provider.refresh();
			}),
		);
	}

	getTreeItem(element: SafetyTreeNode): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: SafetyTreeNode): Promise<SafetyTreeNode[]> {
		if (!element) {
			return this.getRootSections();
		}

		switch (element.contextValue) {
			case "section.protection_status":
				return this.getProtectionStatusItems();
			case "section.blocking":
				return this.getBlockingIssues();
			case "section.watch":
				return this.getWatchItems();
			case "section.snapshots":
				return this.getRecentSnapshots();
			case "section.protected":
				return this.getProtectedFiles();
			default:
				return [];
		}
	}

	private async getRootSections(): Promise<SafetyTreeNode[]> {
		try {
			const signals = await this.safetyService.getSignals();
			const snapshotCount = await this.snapshotProvider.total();

			const sections: SafetyTreeNode[] = [];

			// Add Protection Status section if ProtectionService is available
			if (this.protectionService) {
				try {
					const audit = await this.protectionService.getRepoStatus();
					const statusIcon = this.getStatusIcon(audit.status);
					const statusLabel = this.getStatusLabel(audit.status);
					const attentionCount = audit.attentionItems?.length ?? 0;

					// Auto-expand if status is not complete
					const shouldExpand = audit.status !== "complete";

					sections.push(
						new SectionNode(
							`${statusIcon} Protection Status`,
							attentionCount,
							"section.protection_status",
							shouldExpand,
							statusLabel,
						),
					);
				} catch (error) {
					logger.error("Error loading protection status", error as Error);
				}
			}

			sections.push(
				new SectionNode(
					`${CORE_CONCEPT_SIGNAGE.blockingIssues.emoji} ${CORE_CONCEPT_SIGNAGE.blockingIssues.label}`,
					signals.blockingIssues.length,
					"section.blocking",
					signals.blockingIssues.length > 0, // Auto-expand if has blocking issues
				),
				new SectionNode(
					`${CORE_CONCEPT_SIGNAGE.watchItems.emoji} ${CORE_CONCEPT_SIGNAGE.watchItems.label}`,
					signals.watchItems.length,
					"section.watch",
					false, // Default collapsed
				),
				new SectionNode(
					`${CORE_CONCEPT_SIGNAGE.snapshot.emoji} ${CORE_CONCEPT_SIGNAGE.snapshot.label}`,
					snapshotCount,
					"section.snapshots",
					false, // Default collapsed
				),
			);

			return sections;
		} catch (error) {
			logger.error("Error loading safety dashboard", error as Error);
			return [new PlaceholderNode("Error loading dashboard", "error")];
		}
	}

	private async getBlockingIssues(): Promise<SafetyTreeNode[]> {
		const signals = await this.safetyService.getSignals();

		if (signals.blockingIssues.length === 0) {
			return [new PlaceholderNode("✓ All good! No blocking issues", "success")];
		}

		return signals.blockingIssues.map((issue) => new IssueNode(issue));
	}

	private async getWatchItems(): Promise<SafetyTreeNode[]> {
		const signals = await this.safetyService.getSignals();

		if (signals.watchItems.length === 0) {
			return [new PlaceholderNode("✓ No items to watch", "success")];
		}

		return signals.watchItems.map((item) => new WatchItemNode(item));
	}

	private async getRecentSnapshots(): Promise<SafetyTreeNode[]> {
		const snapshots = await this.snapshotProvider.listRecent(10);

		if (snapshots.length === 0) {
			return [
				new PlaceholderNode(
					"No snapshots yet. Create one to get started!",
					"info",
				),
			];
		}

		return snapshots.map((snapshot) => new SnapshotNode(snapshot));
	}

	private async getProtectedFiles(): Promise<SafetyTreeNode[]> {
		const files = await this.protectedFiles.list();

		if (files.length === 0) {
			return [new PlaceholderNode("No protected files", "info")];
		}

		return files.map((file) => new ProtectedFileNode(file));
	}

	private async getProtectionStatusItems(): Promise<SafetyTreeNode[]> {
		if (!this.protectionService) {
			return [new PlaceholderNode("Protection service not available", "info")];
		}

		try {
			const audit = await this.protectionService.getRepoStatus();
			const items: SafetyTreeNode[] = [];

			// Show status summary
			const statusLabel = this.getStatusLabel(audit.status);
			items.push(new PlaceholderNode(`Status: ${statusLabel}`, "info"));

			items.push(
				new PlaceholderNode(`Protected: ${audit.protectedCount} files`, "info"),
			);

			// Show attention items if any exist
			if (audit.attentionItems && audit.attentionItems.length > 0) {
				items.push(
					new PlaceholderNode(
						`⚠️ Needs Attention (${audit.attentionItems.length})`,
						"warning",
					),
				);

				// Add each attention item
				for (const item of audit.attentionItems) {
					items.push(new AttentionItemNode(item));
				}
			} else {
				items.push(
					new PlaceholderNode(
						"✓ All critical files properly protected",
						"success",
					),
				);
			}

			return items;
		} catch (error) {
			logger.error("Error loading protection status items", error as Error);
			return [new PlaceholderNode("Error loading protection status", "error")];
		}
	}

	private getStatusIcon(status: string): string {
		// Map repo status strings to canonical signage status values
		const statusMap: Record<
			string,
			"unprotected" | "partial" | "protected" | "error"
		> = {
			unprotected: "unprotected",
			partial: "partial",
			complete: "protected",
			error: "error",
		};
		const canonical = statusMap[status] || "unprotected";
		return REPO_STATUS_SIGNAGE[canonical].emoji || "⭕";
	}

	private getStatusLabel(status: string): string {
		// Map repo status strings to canonical signage status values
		const statusMap: Record<
			string,
			"unprotected" | "partial" | "protected" | "error"
		> = {
			unprotected: "unprotected",
			partial: "partial",
			complete: "protected",
			error: "error",
		};
		const canonical = statusMap[status] || "unprotected";
		return REPO_STATUS_SIGNAGE[canonical].label || "Unknown";
	}
}

// Tree Node Classes

class SectionNode extends vscode.TreeItem {
	constructor(
		label: string,
		count: number,
		public readonly contextValue: string,
		shouldExpand: boolean,
		statusLabel?: string,
	) {
		// Default to collapsed unless shouldExpand is true
		super(
			label,
			shouldExpand
				? vscode.TreeItemCollapsibleState.Expanded
				: vscode.TreeItemCollapsibleState.Collapsed,
		);
		// Show count or status label
		this.description = statusLabel || `(${count})`;

		if (shouldExpand && count > 0) {
			this.iconPath = new vscode.ThemeIcon(
				"warning",
				new vscode.ThemeColor("problemsWarningIcon.foreground"),
			);
		}
	}
}

class IssueNode extends vscode.TreeItem {
	constructor(issue: BlockingIssue) {
		super(issue.message, vscode.TreeItemCollapsibleState.None);
		this.contextValue = "issue.blocking";

		// Set icon based on severity
		if (issue.severity === "high") {
			this.iconPath = new vscode.ThemeIcon(
				"error",
				new vscode.ThemeColor("problemsErrorIcon.foreground"),
			);
		} else {
			this.iconPath = new vscode.ThemeIcon(
				"warning",
				new vscode.ThemeColor("problemsWarningIcon.foreground"),
			);
		}

		// Make it clickable with action command
		this.command = {
			command: issue.action.command,
			title: issue.action.label,
			arguments: issue.action.args ? [issue.action.args] : [],
		};

		this.tooltip = `Click to ${issue.action.label.toLowerCase()}`;
	}
}

class WatchItemNode extends vscode.TreeItem {
	constructor(item: WatchItem) {
		super(item.message, vscode.TreeItemCollapsibleState.None);
		this.contextValue = "watch.item";
		this.iconPath = new vscode.ThemeIcon(
			"info",
			new vscode.ThemeColor("problemsInfoIcon.foreground"),
		);

		if (item.recommendation) {
			this.description = item.recommendation;
		}
	}
}

class SnapshotNode extends vscode.TreeItem {
	constructor(snapshot: {
		id: string;
		label: string;
		createdAt: number;
		branch?: string;
	}) {
		const age = Date.now() - snapshot.createdAt;
		const label = `${snapshot.label} – ${formatAge(age)} ago`;

		super(label, vscode.TreeItemCollapsibleState.None);
		this.contextValue = "snapshot";
		this.iconPath = new vscode.ThemeIcon("history");

		if (snapshot.branch) {
			this.description = snapshot.branch;
		}

		// Add restore command
		this.command = {
			command: "snapback.restoreSnapshot",
			title: "Restore",
			arguments: [snapshot.id],
		};
	}
}

class ProtectedFileNode extends vscode.TreeItem {
	constructor(file: {
		id: string;
		path: string;
		label: string;
		protectionLevel?: string;
	}) {
		const name = file.label || file.path.split("/").pop() || file.path;
		super(name, vscode.TreeItemCollapsibleState.None);
		this.contextValue = "protected.file";
		this.description = file.protectionLevel || "Watch";

		// Icon based on protection level - use canonical signage
		const level = file.protectionLevel || "Watch";
		this.iconPath =
			level === "Block"
				? new vscode.ThemeIcon("lock")
				: new vscode.ThemeIcon("eye");
	}
}

class PlaceholderNode extends vscode.TreeItem {
	constructor(message: string, type: "success" | "info" | "error" | "warning") {
		super(message, vscode.TreeItemCollapsibleState.None);
		this.contextValue = `placeholder.${type}`;

		switch (type) {
			case "success":
				this.iconPath = new vscode.ThemeIcon(
					"check",
					new vscode.ThemeColor("testing.iconPassed"),
				);
				break;
			case "info":
				this.iconPath = new vscode.ThemeIcon("info");
				break;
			case "error":
				this.iconPath = new vscode.ThemeIcon("error");
				break;
			case "warning":
				this.iconPath = new vscode.ThemeIcon(
					"warning",
					new vscode.ThemeColor("problemsWarningIcon.foreground"),
				);
				break;
		}
	}
}

class AttentionItemNode extends vscode.TreeItem {
	constructor(item: AttentionItem) {
		// Get file name from path
		const fileName = item.filePath.split("/").pop() || item.filePath;
		super(fileName, vscode.TreeItemCollapsibleState.None);
		this.contextValue = "attention.item";
		this.description = item.message;

		// Icon based on severity
		if (item.severity === "error") {
			this.iconPath = new vscode.ThemeIcon(
				"error",
				new vscode.ThemeColor("problemsErrorIcon.foreground"),
			);
		} else {
			this.iconPath = new vscode.ThemeIcon(
				"warning",
				new vscode.ThemeColor("problemsWarningIcon.foreground"),
			);
		}

		this.tooltip = item.message;

		// Make clickable to open file
		if (item.filePath) {
			this.command = {
				command: "vscode.open",
				title: "Open File",
				arguments: [vscode.Uri.file(item.filePath)],
			};
		}
	}
}

// Helper function
function formatAge(ms: number): string {
	const seconds = Math.floor(ms / 1000);
	if (seconds < 60) return `${seconds}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes}m`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	return `${days}d`;
}
