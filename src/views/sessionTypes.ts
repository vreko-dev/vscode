import * as vscode from "vscode";
import { CORE_CONCEPT_SIGNAGE } from "../signage/index.js";
import type { SessionManifest } from "../snapshot/sessionTypes.js";

/**
 * Tree item for a session
 */
export class SessionTreeItem extends vscode.TreeItem {
	constructor(
		public readonly session: SessionManifest,
		public readonly collapsibleState: vscode.TreeItemCollapsibleState,
	) {
		super(new Date(session.startedAt).toLocaleString(), collapsibleState);

		this.description = this.getSessionDescription(session);
		this.tooltip = this.buildTooltip(session);
		this.contextValue = "session";
		this.iconPath = new vscode.ThemeIcon("history");

		// Add summary to the label if available
		if (session.summary) {
			this.label = `${new Date(session.startedAt).toLocaleString()}: ${session.summary}`;
		} else {
			// Fallback to a default label if no summary is available
			this.label = new Date(session.startedAt).toLocaleString();
		}
	}

	private getSessionDescription(session: SessionManifest): string {
		const fileCount = session.files.length;
		const duration = Math.round((session.endedAt - session.startedAt) / 1000);
		return `${fileCount} files, ${duration}s`;
	}

	private buildTooltip(session: SessionManifest): vscode.MarkdownString {
		const tooltip = new vscode.MarkdownString();
		tooltip.supportHtml = false;
		tooltip.isTrusted = true;

		const lines = [
			`**Session ${session.id}**`,
			"",
			`${CORE_CONCEPT_SIGNAGE.session.emoji} Started: ${new Date(session.startedAt).toLocaleString()}`,
			`${CORE_CONCEPT_SIGNAGE.session.emoji} Ended: ${new Date(session.endedAt).toLocaleString()}`,
			`⏱ Duration: ${Math.round((session.endedAt - session.startedAt) / 1000)}s`,
			`📁 Files: ${session.files.length}`,
			"",
			`🏷 Reason: ${session.reason}`,
		];

		if (session.summary) {
			lines.push("", `📝 ${session.summary}`);
		}

		if (session.tags && session.tags.length > 0) {
			lines.push("", `🏷 Tags: ${session.tags.join(", ")}`);
		}

		tooltip.appendMarkdown(lines.join("\n"));
		return tooltip;
	}
}

/**
 * Tree item for a file within a session
 */
export class SessionFileTreeItem extends vscode.TreeItem {
	constructor(public readonly fileEntry: SessionManifest["files"][number]) {
		super(fileEntry.uri, vscode.TreeItemCollapsibleState.None);

		this.description = fileEntry.changeStats
			? `+${fileEntry.changeStats.added}/-${fileEntry.changeStats.deleted}`
			: "";
		this.tooltip = `File: ${fileEntry.uri}\nSnapshot: ${fileEntry.snapshotId}`;
		this.contextValue = "sessionFile";
		this.iconPath = new vscode.ThemeIcon("file");
		this.command = {
			command: "vscode.open",
			title: "Open File",
			arguments: [vscode.Uri.file(fileEntry.uri)],
		};
	}
}
