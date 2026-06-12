/**
 * @fileoverview URI Scheme Constants
 * @description Centralized URI scheme definitions for VS Code extension to prevent
 * scheme mismatches between TextDocumentContentProvider registration and usage.
 *
 * @see https://linear.app/marcelle-labs/issue/SB-256
 */

import * as vscode from "vscode";

/**
 * URI scheme for snapshot content provider.
 * Used for displaying snapshot file contents in diff view.
 * Must match the scheme registered in phase5-registration.ts
 */
export const SNAPSHOT_SCHEME = "vreko-snapshot";

/**
 * Creates a snapshot URI for use in diff commands.
 * Uses the format: vreko-snapshot:snapshotId/filePath
 *
 * @param snapshotId - The snapshot identifier
 * @param filePath - The file path within the snapshot
 * @returns vscode.Uri with vreko-snapshot scheme
 *
 * @example
 * ```typescript
 * const uri = createSnapshotUri('abc123', 'src/index.ts');
 * // Returns: vscode.Uri with scheme 'vreko-snapshot', path 'abc123/src/index.ts'
 * ```
 */
export function createSnapshotUri(snapshotId: string, filePath: string): vscode.Uri {
	// Encode path components to handle special characters
	const encodedPath = filePath
		.split("/")
		.map((segment) => encodeURIComponent(segment))
		.join("/");

	// Use colon format (not //) to match VS Code virtual document provider pattern
	return vscode.Uri.parse(`${SNAPSHOT_SCHEME}:${snapshotId}/${encodedPath}`);
}
