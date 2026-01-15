import * as path from "node:path";
import * as vscode from "vscode";
import { type AcknowledgmentRecord, NotificationAcknowledgment } from "../notifications/acknowledgment";
import {
	type Learning,
	type SnapshotRecommendation,
	UnifiedDataService,
	type UnifiedDataSnapshot,
	type Violation,
} from "../services/UnifiedDataService";
// logger available if needed for future debugging

/**
 * Intelligence Tree Provider - Displays violations, learnings, nudges, and stats
 *
 * Replaces ProtectedFilesTreeProvider to surface actionable intelligence data
 * that users need constant visibility into, rather than static protected file lists.
 */
export class IntelligenceTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;
	private disposables: vscode.Disposable[] = [];
	private readonly MAX_ITEMS_PER_SECTION = 50;

	constructor(
		private readonly workspaceId: string,
		private readonly workspaceRoot: string,
		private readonly globalState: vscode.Memento,
	) {
		// Get UnifiedDataService instance
		const dataService = UnifiedDataService.for(workspaceId, workspaceRoot);

		// Subscribe to data changes with throttled refresh
		this.disposables.push(
			dataService.onDataChange((event) => {
				if (
					event.type === "violations-updated" ||
					event.type === "learnings-updated" ||
					event.type === "recommendation-changed"
				) {
					this.refresh();
				}
			}),
		);
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
		// Root level: show sections
		if (!element) {
			const dataService = UnifiedDataService.for(this.workspaceId, this.workspaceRoot);
			const snapshot = dataService.getSnapshot();

			const sections: vscode.TreeItem[] = [];

			// Violations section (always show if any violations exist)
			if (snapshot.violations.length > 0) {
				sections.push(createViolationsSection(snapshot.violations.length));
			}

			// Learnings section (always show if any learnings exist)
			if (snapshot.learnings.length > 0) {
				sections.push(createLearningsSection(snapshot.learnings.length));
			}

			// Nudges & Reminders section (show if any active)
			const nudgeCount = this.getNudgeCount();
			if (nudgeCount > 0) {
				sections.push(createNudgesSection(nudgeCount));
			}

			// Quick Stats section (always show)
			sections.push(createStatsSection(snapshot.stats));

			// Empty state: Show guidance when no intelligence data exists
			if (sections.length === 0 || (sections.length === 1 && sections[0].contextValue === "intelligence.stats")) {
				return [createEmptyStateItem()];
			}

			return sections;
		}

		// Section level: show items in that section
		if (element.contextValue?.startsWith("intelligence.")) {
			const sectionType = element.contextValue.split(".")[1];
			return this.getItemsForSection(sectionType);
		}

		return [];
	}

	private async getItemsForSection(sectionType: string): Promise<vscode.TreeItem[]> {
		const dataService = UnifiedDataService.for(this.workspaceId, this.workspaceRoot);

		switch (sectionType) {
			case "violations":
				return this.getViolationItems(dataService.getViolations());
			case "learnings":
				return this.getLearningItems(dataService.getLearnings());
			case "nudges":
				return this.getNudgeItems();
			case "stats":
				return this.getStatsItems(dataService.getSnapshot().stats);
			default:
				return [];
		}
	}

	private getViolationItems(violations: Violation[]): vscode.TreeItem[] {
		// Sort by count (descending) then by date (most recent first)
		const sorted = violations.sort((a, b) => {
			if (a.count !== b.count) {
				return b.count - a.count;
			}
			return new Date(b.date).getTime() - new Date(a.date).getTime();
		});

		// Pagination: Show first 50, add "Show more" if needed
		const truncated = sorted.slice(0, this.MAX_ITEMS_PER_SECTION);
		const remaining = sorted.length - this.MAX_ITEMS_PER_SECTION;

		const items = truncated.map((violation) => createViolationTreeItem(violation));

		if (remaining > 0) {
			items.push(createShowMoreItem("violations", remaining));
		}

		return items;
	}

	private getLearningItems(learnings: Learning[]): vscode.TreeItem[] {
		// Sort by date (most recent first)
		const sorted = learnings.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

		// Pagination
		const truncated = sorted.slice(0, this.MAX_ITEMS_PER_SECTION);
		const remaining = sorted.length - this.MAX_ITEMS_PER_SECTION;

		const items = truncated.map((learning) => createLearningTreeItem(learning));

		if (remaining > 0) {
			items.push(createShowMoreItem("learnings", remaining));
		}

		return items;
	}

	private getNudgeItems(): vscode.TreeItem[] {
		const dataService = UnifiedDataService.for(this.workspaceId, this.workspaceRoot);
		const recommendation = dataService.getSnapshotRecommendation();
		const acknowledgment = new NotificationAcknowledgment(this.globalState);

		const items: vscode.TreeItem[] = [];

		// Active recommendation nudge
		if (recommendation.should) {
			items.push(createRecommendationNudgeItem(recommendation));
		}

		// Dismissed notifications (from globalState)
		const dismissed = acknowledgment.getAll();
		items.push(...dismissed.map(createDismissedNudgeItem));

		return items;
	}

	private getStatsItems(stats: UnifiedDataSnapshot["stats"]): vscode.TreeItem[] {
		const dataService = UnifiedDataService.for(this.workspaceId, this.workspaceRoot);
		const vitals = dataService.getVitals();

		const items = [
			createStatItem("Total Learnings", stats.totalLearnings, "$(book)"),
			createStatItem("Total Violations", stats.totalViolations, "$(warning)"),
			createStatItem("Promoted Patterns", stats.promotedPatterns, "$(check)"),
			createStatItem("Pending Promotion", stats.pendingPromotion, "$(clock)"),
		];

		// Add vitals if available
		if (vitals) {
			items.push(
				createDividerItem(),
				createVitalStatItem("Pulse", `${vitals.pulse.changesPerMinute}/min`, vitals.pulse.level),
				createVitalStatItem("Temperature", `${vitals.temperature.aiPercentage}%`, vitals.temperature.level),
				createVitalStatItem("Pressure", vitals.pressure.value.toString(), "moderate"),
				createVitalStatItem("Oxygen", `${vitals.oxygen.value}%`, "stable"),
			);
		}

		return items;
	}

	private getNudgeCount(): number {
		const dataService = UnifiedDataService.for(this.workspaceId, this.workspaceRoot);
		const recommendation = dataService.getSnapshotRecommendation();
		const acknowledgment = new NotificationAcknowledgment(this.globalState);

		let count = recommendation.should ? 1 : 0;
		count += acknowledgment.getAll().length;

		return count;
	}

	refresh(): void {
		this._onDidChangeTreeData.fire(undefined);
	}

	dispose(): void {
		this._onDidChangeTreeData.dispose();
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}

// ============================================================================
// TREE ITEM CREATORS
// ============================================================================

function createViolationsSection(count: number): vscode.TreeItem {
	const item = new vscode.TreeItem("$(warning) Violations", vscode.TreeItemCollapsibleState.Expanded);
	item.id = "intelligence.violations";
	item.contextValue = "intelligence.violations";
	item.description = `(${count})`;
	item.tooltip = `Pattern violations detected in your code - ${count} total occurrences`;
	return item;
}

function createViolationTreeItem(violation: Violation): vscode.TreeItem {
	const item = new vscode.TreeItem(violation.type, vscode.TreeItemCollapsibleState.None);

	// Badge for promotion status
	const statusBadge = {
		tracking: "●",
		ready_for_promotion: "◉",
		promoted: "✓",
		automated: "⚡",
	}[violation.promotionStatus];

	item.id = `violation.${violation.type}.${violation.file}`;
	item.contextValue = "intelligence.item.violation";
	item.description = `${statusBadge} ${violation.count}x in ${path.basename(violation.file)}`;
	item.tooltip = buildViolationTooltip(violation);
	item.command = {
		command: "snapback.openFile",
		title: "Open file with violation",
		arguments: [vscode.Uri.file(violation.file)],
	};

	return item;
}

function buildViolationTooltip(violation: Violation): vscode.MarkdownString {
	const tooltip = new vscode.MarkdownString();
	tooltip.supportHtml = false;
	tooltip.isTrusted = true;

	const statusLabels = {
		tracking: "Tracking (1x)",
		ready_for_promotion: "Ready for Promotion (2x)",
		promoted: "Promoted Pattern (3x)",
		automated: "Automated Prevention (5x+)",
	};

	const lines = [
		`**${violation.type}**`,
		"",
		`📊 Status: ${statusLabels[violation.promotionStatus]}`,
		`🔢 Occurrences: ${violation.count}`,
		`📁 File: ${violation.file}`,
		`📅 Last seen: ${new Date(violation.date).toLocaleString()}`,
		"",
		`💬 ${violation.message}`,
	];

	if (violation.prevention) {
		lines.push("", "🛡️ **Prevention**:", violation.prevention);
	}

	tooltip.appendMarkdown(lines.join("\n"));
	return tooltip;
}

function createLearningsSection(count: number): vscode.TreeItem {
	const item = new vscode.TreeItem("$(book) Learnings", vscode.TreeItemCollapsibleState.Collapsed);
	item.id = "intelligence.learnings";
	item.contextValue = "intelligence.learnings";
	item.description = `(${count})`;
	item.tooltip = `Accumulated project knowledge and patterns - ${count} learnings`;
	return item;
}

function createLearningTreeItem(learning: Learning): vscode.TreeItem {
	const typeIcon = {
		pattern: "$(symbol-method)",
		pitfall: "$(alert)",
		efficiency: "$(zap)",
		discovery: "$(lightbulb)",
		workflow: "$(gear)",
	}[learning.type];

	const item = new vscode.TreeItem(learning.trigger, vscode.TreeItemCollapsibleState.None);
	item.id = `learning.${learning.id}`;
	item.contextValue = "intelligence.item.learning";
	item.description = learning.type;
	item.iconPath = new vscode.ThemeIcon(typeIcon.replace("$(", "").replace(")", ""));
	item.tooltip = buildLearningTooltip(learning);

	return item;
}

function buildLearningTooltip(learning: Learning): vscode.MarkdownString {
	const tooltip = new vscode.MarkdownString();
	tooltip.supportHtml = false;
	tooltip.isTrusted = true;

	const typeLabels = {
		pattern: "🔄 Pattern",
		pitfall: "⚠️ Pitfall",
		efficiency: "⚡ Efficiency",
		discovery: "💡 Discovery",
		workflow: "⚙️ Workflow",
	};

	const lines = [
		`**${learning.trigger}**`,
		"",
		`${typeLabels[learning.type]}`,
		"",
		`📝 **Action**: ${learning.action}`,
		`📍 **Source**: ${learning.source}`,
		`📅 **Created**: ${new Date(learning.createdAt).toLocaleString()}`,
	];

	tooltip.appendMarkdown(lines.join("\n"));
	return tooltip;
}

function createNudgesSection(count: number): vscode.TreeItem {
	const item = new vscode.TreeItem("$(bell) Nudges & Reminders", vscode.TreeItemCollapsibleState.Expanded);
	item.id = "intelligence.nudges";
	item.contextValue = "intelligence.nudges";
	item.description = `(${count})`;
	item.tooltip = "Active recommendations and dismissed messages";
	return item;
}

function createRecommendationNudgeItem(recommendation: SnapshotRecommendation): vscode.TreeItem {
	const urgencyIcon = {
		now: "$(alert)",
		soon: "$(clock)",
		optional: "$(info)",
	}[recommendation.urgency];

	const item = new vscode.TreeItem(recommendation.reason, vscode.TreeItemCollapsibleState.None);
	item.id = "nudge.recommendation";
	item.contextValue = "intelligence.item.nudge.recommendation";
	item.iconPath = new vscode.ThemeIcon(urgencyIcon.replace("$(", "").replace(")", ""));
	item.description = recommendation.urgency;
	item.tooltip = `Snapshot recommendation: ${recommendation.reason}`;
	item.command = {
		command: "snapback.createSnapshot",
		title: "Create snapshot",
		arguments: [],
	};

	return item;
}

function createDismissedNudgeItem(notification: AcknowledgmentRecord): vscode.TreeItem {
	const item = new vscode.TreeItem(notification.message, vscode.TreeItemCollapsibleState.None);
	item.id = `nudge.dismissed.${notification.key}`;
	item.contextValue = "intelligence.item.nudge.dismissed";
	item.iconPath = new vscode.ThemeIcon("eye-closed");
	item.description = "dismissed";
	item.tooltip = `Dismissed: ${notification.message}\n\nClick to re-enable`;
	item.command = {
		command: "snapback.resetNotificationAcknowledgment",
		title: "Re-enable notification",
		arguments: [notification.key],
	};

	return item;
}

function createStatsSection(_stats: UnifiedDataSnapshot["stats"]): vscode.TreeItem {
	const item = new vscode.TreeItem("$(graph) Quick Stats", vscode.TreeItemCollapsibleState.Collapsed);
	item.id = "intelligence.stats";
	item.contextValue = "intelligence.stats";
	item.tooltip = "Quick overview of your intelligence data";
	return item;
}

function createStatItem(label: string, value: number, icon: string): vscode.TreeItem {
	const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
	item.id = `stat.${label}`;
	item.contextValue = "intelligence.item.stat";
	item.iconPath = new vscode.ThemeIcon(icon.replace("$(", "").replace(")", ""));
	item.description = value.toString();
	return item;
}

function createDividerItem(): vscode.TreeItem {
	const item = new vscode.TreeItem("───────────", vscode.TreeItemCollapsibleState.None);
	item.id = "stat.divider";
	item.contextValue = "intelligence.item.divider";
	return item;
}

function createVitalStatItem(label: string, value: string | number, level: string): vscode.TreeItem {
	const levelIcons: Record<string, string> = {
		stable: "$(circle-outline)",
		moderate: "$(warning)",
		high: "$(error)",
		critical: "$(alert)",
	};
	const icon = levelIcons[level] || "$(circle-outline)";

	const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
	item.id = `stat.vital.${label}`;
	item.contextValue = "intelligence.item.vital";
	item.iconPath = new vscode.ThemeIcon(icon.replace("$(", "").replace(")", ""));
	item.description = `${value} (${level})`;
	item.tooltip = `${label}: ${value} - Level: ${level}`;
	return item;
}

function createEmptyStateItem(): vscode.TreeItem {
	const item = new vscode.TreeItem("$(info) No intelligence data yet", vscode.TreeItemCollapsibleState.None);
	item.id = "intelligence.empty";
	item.contextValue = "intelligence.empty";
	item.tooltip = new vscode.MarkdownString(
		"**No intelligence data found**\n\n" +
			"SnapBack learns from your coding patterns to provide insights.\n\n" +
			"To see intelligence data:\n" +
			"- Make some code changes\n" +
			"- Create snapshots\n" +
			"- The system will automatically detect patterns and violations\n\n" +
			"Intelligence data is stored in `.snapback/` directory.",
	);
	item.command = {
		command: "snapback.showWelcome",
		title: "Learn more",
		arguments: [],
	};
	return item;
}

function createShowMoreItem(sectionType: string, count: number): vscode.TreeItem {
	const item = new vscode.TreeItem(`Show ${count} more...`, vscode.TreeItemCollapsibleState.None);
	item.id = `show-more.${sectionType}`;
	item.contextValue = "intelligence.item.showMore";
	item.iconPath = new vscode.ThemeIcon("chevron-down");
	item.command = {
		command: "snapback.expandSection",
		title: "Show more items",
		arguments: [sectionType],
	};
	return item;
}
