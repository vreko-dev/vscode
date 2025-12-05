/**
 * Workspace Safety Service
 * Calculates local safety signals and integrates with backend API
 */

import * as path from "node:path";
import { logger } from "@snapback/infrastructure";
import * as vscode from "vscode";
import type { StorageSnapshotSummaryProvider } from "./snapshotSummaryProvider.js";

export interface BlockingIssue {
	id: string;
	severity: "high" | "medium" | "low";
	type:
		| "unprotected_critical_file"
		| "stale_snapshot"
		| "automation_failure"
		| "missing_pre_commit_hook";
	message: string;
	filePath?: string;
	lastModified?: string;
	timeSinceModified?: number;
	action: {
		type: "create_snapshot" | "enable_protection" | "fix_automation";
		label: string;
		command: string;
		args?: Record<string, any>;
	};
}

export interface WatchItem {
	id: string;
	severity: "medium" | "low";
	type: "large_changeset" | "rapid_edits" | "ai_assisted_changes";
	message: string;
	path?: string;
	locChanged?: number;
	timeSinceSnapshot?: number;
	recommendation?: string;
}

export interface SafetySignal {
	blockingIssues: BlockingIssue[];
	watchItems: WatchItem[];
	lastChecked: number;
}

export class WorkspaceSafetyService {
	private signals: SafetySignal | null = null;
	private refreshTimer: NodeJS.Timeout | null = null;

	constructor(
		private snapshotSummaryProvider: StorageSnapshotSummaryProvider,
		// Reserved for future use: protected file registry, workspace root
	) {}

	async getSignals(): Promise<SafetySignal> {
		// Cache for 60 seconds
		if (this.signals && Date.now() - this.signals.lastChecked < 60000) {
			return this.signals;
		}

		// Calculate local heuristics
		this.signals = await this.calculateLocalSignals();
		return this.signals;
	}

	private async calculateLocalSignals(): Promise<SafetySignal> {
		const blockingIssues: BlockingIssue[] = [];
		const watchItems: WatchItem[] = [];

		try {
			// 1. Check critical files without recent snapshots
			await this.checkCriticalFiles(blockingIssues);

			// 2. Check for stale snapshots
			await this.checkStaleSnapshots(blockingIssues);

			// 3. Check for large changesets (watch item, not blocking)
			await this.checkLargeChangesets(watchItems);
		} catch (error) {
			logger.error("Error calculating safety signals", error as Error);
		}

		return {
			blockingIssues,
			watchItems,
			lastChecked: Date.now(),
		};
	}

	private async checkCriticalFiles(issues: BlockingIssue[]): Promise<void> {
		const criticalFiles = await this.findCriticalFiles();
		const snapshots = await this.snapshotSummaryProvider.listRecent(1);
		const lastSnapshot = snapshots[0];

		for (const file of criticalFiles) {
			try {
				const uri = vscode.Uri.file(file);
				const stat = await vscode.workspace.fs.stat(uri);

				// File modified after last snapshot
				if (!lastSnapshot || stat.mtime > lastSnapshot.createdAt) {
					const age = Date.now() - stat.mtime;
					const fileName = path.basename(file);

					issues.push({
						id: `critical_${fileName}`,
						type: "unprotected_critical_file",
						severity: "high",
						message: `${fileName} changed ${this.formatAge(age)}, no snapshot`,
						filePath: file,
						timeSinceModified: Math.floor(age / 1000),
						action: {
							type: "create_snapshot",
							label: "Create snapshot now",
							command: "snapback.createSnapshot",
							args: { reason: `Protect ${fileName}`, files: [file] },
						},
					});
				}
			} catch (_error) {}
		}
	}

	private async checkStaleSnapshots(issues: BlockingIssue[]): Promise<void> {
		const snapshots = await this.snapshotSummaryProvider.listRecent(1);
		const lastSnapshot = snapshots[0];

		if (!lastSnapshot) {
			// No snapshots at all
			issues.push({
				id: "no_snapshots",
				type: "stale_snapshot",
				severity: "high",
				message: "No snapshots exist for this workspace",
				action: {
					type: "create_snapshot",
					label: "Create first snapshot",
					command: "snapback.createSnapshot",
				},
			});
			return;
		}

		const age = Date.now() - lastSnapshot.createdAt;
		const STALE_THRESHOLD = 4 * 60 * 60 * 1000; // 4 hours

		if (age > STALE_THRESHOLD) {
			issues.push({
				id: "stale_snapshot",
				type: "stale_snapshot",
				severity: age > 8 * 60 * 60 * 1000 ? "high" : "medium",
				message: `Last snapshot ${this.formatAge(age)} ago`,
				action: {
					type: "create_snapshot",
					label: "Create snapshot",
					command: "snapback.createSnapshot",
				},
			});
		}
	}

	private async checkLargeChangesets(_watchItems: WatchItem[]): Promise<void> {
		// TODO: Implement git diff analysis
		// For now, this is a placeholder for future enhancement
		// Would use: git diff --stat to count LOC changes
	}

	private async findCriticalFiles(): Promise<string[]> {
		const patterns = [
			"**/.env*",
			"**/config.*",
			"**/secrets.*",
			"**/.snapbackrc",
			"**/credentials.*",
		];

		const files: string[] = [];
		for (const pattern of patterns) {
			try {
				const found = await vscode.workspace.findFiles(
					pattern,
					"**/node_modules/**",
				);
				files.push(...found.map((uri) => uri.fsPath));
			} catch (_error) {}
		}

		return files;
	}

	private formatAge(ms: number): string {
		const seconds = Math.floor(ms / 1000);
		if (seconds < 60) return `${seconds}s`;
		const minutes = Math.floor(seconds / 60);
		if (minutes < 60) return `${minutes}m`;
		const hours = Math.floor(minutes / 60);
		if (hours < 24) return `${hours}h`;
		const days = Math.floor(hours / 24);
		return `${days}d`;
	}

	startAutoRefresh(intervalMs = 60000): void {
		this.stopAutoRefresh();
		this.refreshTimer = setInterval(() => {
			this.getSignals().catch((err) => {
				logger.warn("Failed to refresh safety signals", err);
			});
		}, intervalMs);
	}

	stopAutoRefresh(): void {
		if (this.refreshTimer) {
			clearInterval(this.refreshTimer);
			this.refreshTimer = null;
		}
	}

	dispose(): void {
		this.stopAutoRefresh();
	}
}
