/**
 * @fileoverview Type definitions for SnapBack Explorer Tree View
 *
 * @see Design: .qoder/quests/snapback-explorer-tree.md
 */

import type * as vscode from "vscode";

// ============================================================================
// Backend API Response Types
// ============================================================================

/**
 * Safety issue from workspace/safety endpoint
 */
export interface SafetyIssue {
	id: string;
	kind: "blocking" | "watch";
	message: string;
	severity: "low" | "medium" | "high";
	createdAt: string; // ISO 8601
	filePath?: string;
}

/**
 * Response from GET /api/v1/workspace/safety
 */
export interface WorkspaceSafetyResponse {
	blockingIssues: SafetyIssue[];
	watchItems: SafetyIssue[];
}

/**
 * Branch snapshot status
 */
export type SnapshotBranchStatus = "healthy" | "needs_snapshot" | "stale";

/**
 * Recommended snapshot recovery point
 */
export interface SnapshotRecoveryPoint {
	id: string;
	reason: string;
	createdAt: string; // ISO 8601
	trigger: string;
	branch: string;
	label: string;
}

/**
 * Active branch with snapshot metadata
 */
export interface SnapshotActiveBranch {
	branch: string;
	snapshots: number;
	lastSnapshotAgeSeconds: number;
	status: SnapshotBranchStatus;
}

/**
 * Snapshot cleanup candidate
 */
export interface SnapshotCleanupCandidate {
	id: string;
	reason: string;
	ageSeconds: number;
	storageBytes: number;
}

/**
 * Response from GET /api/v1/workspace/snapshots
 */
export interface WorkspaceSnapshotsResponse {
	recommendedRecoveryPoints: SnapshotRecoveryPoint[];
	activeBranches: SnapshotActiveBranch[];
	cleanupCandidates: SnapshotCleanupCandidate[];
	total: number;
}

// ============================================================================
// Tree Node Types (Discriminated Union Pattern)
// ============================================================================

/**
 * Root section categorization
 */
export type SnapBackSection = "workspaceSafety" | "snapshots";

/**
 * Node kind discriminator
 *
 * Following always-typescript-patterns.md discriminated union pattern
 */
export type SnapBackNodeKind =
	| "rootStatus" // Last updated timestamp node
	| "section" // Root section (Safety or Snapshots)
	| "group" // Grouping node (Blocking Issues, Recovery Points, etc.)
	| "blockingIssue" // Blocking safety issue leaf
	| "watchItem" // Watch item leaf
	| "snapshot" // Snapshot leaf (recovery point or cleanup candidate)
	| "branch"; // Active branch leaf

/**
 * Tree node structure using discriminated union pattern
 *
 * All nodes share common fields, with optional fields based on `kind`
 */
export interface SnapBackTreeNode {
	id: string;
	label: string;
	description?: string;
	icon?: string; // VS Code codicon identifier
	section?: SnapBackSection; // Only for section nodes
	kind: SnapBackNodeKind; // Discriminator
	collapsibleState: vscode.TreeItemCollapsibleState;

	// Optional data for specific node types
	snapshotId?: string; // For snapshot nodes
	filePath?: string; // For blocking issue nodes
}

// ============================================================================
// Type Guards (following always-typescript-patterns.md)
// ============================================================================

/**
 * Type guard for section nodes
 */
export function isSection(
	node: SnapBackTreeNode,
): node is SnapBackTreeNode & { section: SnapBackSection } {
	return node.kind === "section" && node.section !== undefined;
}

/**
 * Type guard for snapshot nodes
 */
export function isSnapshot(
	node: SnapBackTreeNode,
): node is SnapBackTreeNode & { snapshotId: string } {
	return node.kind === "snapshot" && node.snapshotId !== undefined;
}

/**
 * Type guard for blocking issue nodes
 */
export function isBlockingIssue(
	node: SnapBackTreeNode,
): node is SnapBackTreeNode & { filePath: string } {
	return node.kind === "blockingIssue" && node.filePath !== undefined;
}
