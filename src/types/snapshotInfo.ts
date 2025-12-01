import type { GitFileChange } from "./fileChanges.js";

/**
 * Snapshot information for name generation
 * Used by SnapshotNamingStrategy
 */
export interface SnapshotNamingInfo {
	files: GitFileChange[];
	workspaceRoot: string;
}

/**
 * Metadata describing a snapshot for icon classification
 * Used by SnapshotIconStrategy
 */
export interface SnapshotIconMetadata {
	name: string;
	files: string[];
	isProtected: boolean;
}

/**
 * Result of icon classification containing the codicon name and theme color
 */
export interface IconResult {
	icon: string;
	color: string; // ThemeColor id
}

/**
 * Snapshot information for UI
 * Used by SnapshotRestoreUI
 */
export interface SnapshotUIInfo {
	id: string;
	name: string;
	timestamp: number;
	fileContents: Record<string, string>;
}
