/**
 * Line Diff Utilities
 *
 * Calculates line additions and deletions from VS Code text document changes.
 * Used for behavioral tracking (edit velocity) in Phase 2A.
 */

import type * as vscode from "vscode";

export interface LineDiffResult {
	linesAdded: number;
	linesDeleted: number;
}

/**
 * Calculate line diff from TextDocumentContentChangeEvent
 *
 * @param changes - Array of content change events from VS Code
 * @returns Object with linesAdded and linesDeleted counts
 */
export function calculateLineDiff(changes: readonly vscode.TextDocumentContentChangeEvent[]): LineDiffResult {
	let linesAdded = 0;
	let linesDeleted = 0;

	for (const change of changes) {
		// Skip empty changes or malformed ranges
		if (!change.range) {
			continue;
		}

		const rangeLength = change.range.end.line - change.range.start.line;
		const newLineCount = change.text.split("\n").length - 1;

		if (newLineCount > rangeLength) {
			linesAdded += newLineCount - rangeLength;
		} else if (rangeLength > newLineCount) {
			linesDeleted += rangeLength - newLineCount;
		}
	}

	return { linesAdded, linesDeleted };
}
