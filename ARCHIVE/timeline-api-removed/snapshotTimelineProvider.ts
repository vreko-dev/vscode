/// <reference path="../../vscode.proposed.timeline.d.ts" />

import { logger } from "@snapback/logs";
import * as vscode from "vscode";
import type { SnapshotSummary, SnapshotSummaryProvider } from "./types.js";

/**
 * Provides timeline integration for SnapBack snapshots
 * Shows file history in VS Code's timeline view
 */
export class SnapshotTimelineProvider implements vscode.TimelineProvider {
	readonly id = "snapback.snapshots";
	readonly label = "SnapBack Snapshots";

	// Add EventEmitter for refresh events
	private _onDidChange = new vscode.EventEmitter<
		vscode.TimelineChangeEvent | undefined
	>();
	readonly onDidChange = this._onDidChange.event;

	constructor(private readonly snapshotProvider: SnapshotSummaryProvider) {}

	/**
	 * Provide timeline items for a given URI
	 * @param uri The URI of the file to get timeline items for
	 * @param options Timeline options
	 * @param token Cancellation token
	 * @returns Timeline with snapshot items
	 */
	async provideTimeline(
		uri: vscode.Uri,
		_options: vscode.TimelineOptions,
		_token: vscode.CancellationToken,
	): Promise<vscode.Timeline> {
		try {
			// Get snapshots for this file
			const snapshots = await this.snapshotProvider.forFile(uri);

			// Convert snapshots to timeline items
			const items = snapshots
				.sort(
					(a: SnapshotSummary, b: SnapshotSummary) => b.createdAt - a.createdAt,
				)
				.map((snapshot: SnapshotSummary) => {
					const item = new vscode.TimelineItem(
						snapshot.label,
						snapshot.createdAt,
					);
					item.id = snapshot.id;
					item.description = this.formatDescription(snapshot);
					// Remove detail property as it doesn't exist in the VS Code TimelineItem
					item.command = {
						title: "Restore from snapshot",
						command: "snapback.restoreFileFromSnapshot",
						arguments: [snapshot.id, uri],
					};

					return item;
				});

			return {
				items,
			};
		} catch (error) {
			logger.error("Error providing timeline items:", error);
			// Return empty timeline on error
			return {
				items: [],
			};
		}
	}

	/**
	 * Format the description for a timeline item
	 * @param snapshot The snapshot to format
	 * @returns Formatted description string
	 */
	private formatDescription(snapshot: SnapshotSummary): string {
		if (snapshot.filesChanged !== undefined) {
			return `${snapshot.filesChanged} files changed`;
		}
		return "";
	}

	/**
	 * Refresh the timeline for a specific URI or all URIs
	 * @param uri Optional URI to refresh, if undefined refreshes all
	 */
	refresh(uri?: vscode.Uri): void {
		this._onDidChange.fire(uri ? { uri } : undefined);
	}

	/**
	 * Dispose of the timeline provider
	 */
	dispose(): void {
		this._onDidChange.dispose();
	}
}
