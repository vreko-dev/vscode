/**
 * Workspace ID Management
 *
 * Generates and stores a unique workspace ID for MCP authentication.
 * The workspace ID is used to link MCP sessions to authenticated users
 * without requiring API keys in MCP config files.
 *
 * Security Model:
 * - Git-based repos: Deterministic ID from git remote (team-stable)
 * - Non-git repos: Random 128-bit entropy stored in SecretStorage
 * - Format: ws_[32 hex chars] or wsg_[32 hex chars]
 *
 * Resolution Order:
 * 1. .snapback/config.json (team-shared, checked in)
 * 2. Git remote URL hash (deterministic team ID)
 * 3. .snapback/local.json (user override)
 * 4. VS Code SecretStorage (user fallback)
 *
 * @packageDocumentation
 */

import * as crypto from "node:crypto";
import {
	initializeSnapbackDirectory,
	resolveWorkspaceId as resolveUnifiedWorkspaceId,
} from "@snapback/intelligence/workspace";
import * as vscode from "vscode";

/**
 * Secret storage key for workspace ID (fallback for non-git repos)
 */
const WORKSPACE_ID_KEY = "snapback.workspaceId";

/**
 * Workspace ID format pattern (legacy random)
 * ws_ prefix + 32 hex characters = 128 bits of entropy
 */
export const WORKSPACE_ID_PATTERN = /^ws_[a-f0-9]{32}$/;

/**
 * Git-based workspace ID pattern
 * wsg_ prefix indicates deterministic git-based ID
 */
export const GIT_WORKSPACE_ID_PATTERN = /^wsg_[a-f0-9]{32}$/;

/**
 * Combined pattern for any valid workspace ID
 */
export const ANY_WORKSPACE_ID_PATTERN = /^ws[g]?_[a-f0-9]{32}$/;

/**
 * Expected workspace ID length (ws_ + 32 hex = 35 chars)
 */
export const WORKSPACE_ID_LENGTH = 35;

/**
 * Result of workspace ID resolution with metadata
 */
export interface WorkspaceIdResult {
	/** The workspace ID */
	workspaceId: string;
	/** Whether the ID is team-stable (git-based or config) */
	isTeamStable: boolean;
	/** Where the ID came from */
	source: "config" | "git" | "local" | "user" | "fallback";
}

/**
 * Generate a new workspace ID with 128 bits of entropy
 *
 * @returns Workspace ID in format ws_[32 hex chars]
 *
 * @example
 * ```ts
 * const id = generateWorkspaceId();
 * // id = "ws_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"
 * ```
 */
export function generateWorkspaceId(): string {
	// 16 bytes = 128 bits of entropy (cryptographically secure)
	const bytes = crypto.randomBytes(16);
	return `ws_${bytes.toString("hex")}`;
}

/**
 * Validate workspace ID format (supports both random and git-based)
 *
 * @param workspaceId - The workspace ID to validate
 * @returns True if valid format
 */
export function isValidWorkspaceId(workspaceId: string | undefined): workspaceId is string {
	if (!workspaceId) {
		return false;
	}
	return ANY_WORKSPACE_ID_PATTERN.test(workspaceId);
}

/**
 * Check if workspace ID is git-based (team-stable)
 */
export function isGitBasedWorkspaceId(workspaceId: string): boolean {
	return GIT_WORKSPACE_ID_PATTERN.test(workspaceId);
}

/**
 * Get the current workspace folder path
 */
function getWorkspacePath(): string | undefined {
	const folders = vscode.workspace.workspaceFolders;
	return folders?.[0]?.uri.fsPath;
}

/**
 * Get or create a workspace ID using unified 4-layer resolution
 *
 * Resolution order:
 * 1. .snapback/config.json - Team-shared, checked into git
 * 2. Git remote URL hash - Deterministic team ID
 * 3. .snapback/local.json - User-specific override
 * 4. VS Code SecretStorage - User fallback for non-git repos
 *
 * @param secrets - VS Code SecretStorage instance
 * @returns The workspace ID and metadata
 *
 * @example
 * ```ts
 * const result = await getOrCreateWorkspaceId(context.secrets);
 * console.log(`Workspace ID: ${result.workspaceId}`);
 * console.log(`Team stable: ${result.isTeamStable}`);
 * ```
 */
export async function getOrCreateWorkspaceId(secrets: vscode.SecretStorage): Promise<WorkspaceIdResult> {
	const workspacePath = getWorkspacePath();

	if (workspacePath) {
		// Get existing fallback ID from secrets (for non-git repos)
		let fallbackUserId = await secrets.get(WORKSPACE_ID_KEY);
		if (fallbackUserId && !isValidWorkspaceId(fallbackUserId)) {
			fallbackUserId = undefined;
		}

		try {
			// Use unified resolution
			const identity = resolveUnifiedWorkspaceId({
				workspacePath,
				fallbackUserId,
				autoPersist: true,
			});

			// Store the resolved ID in secrets as backup
			if (identity.source === "fallback" || identity.source === "git") {
				await secrets.store(WORKSPACE_ID_KEY, identity.workspaceId);
			}

			return {
				workspaceId: identity.workspaceId,
				isTeamStable: identity.isTeamStable,
				source: identity.source,
			};
		} catch (error) {
			// Fallback to legacy behavior on error
			console.error("[WorkspaceId] Unified resolution failed, using legacy:", error);
		}
	}

	// Legacy fallback: random ID in SecretStorage
	let workspaceId = await secrets.get(WORKSPACE_ID_KEY);

	if (workspaceId && !isValidWorkspaceId(workspaceId)) {
		workspaceId = undefined;
	}

	if (!workspaceId) {
		workspaceId = generateWorkspaceId();
		await secrets.store(WORKSPACE_ID_KEY, workspaceId);
	}

	return {
		workspaceId,
		isTeamStable: false,
		source: "user",
	};
}

/**
 * Legacy overload for backward compatibility
 * @deprecated Use the version that returns WorkspaceIdResult
 */
export async function getOrCreateWorkspaceIdLegacy(secrets: vscode.SecretStorage): Promise<string> {
	const result = await getOrCreateWorkspaceId(secrets);
	return result.workspaceId;
}

/**
 * Clear the workspace ID from storage
 *
 * Use when user explicitly wants to reset their workspace identity
 * or during troubleshooting.
 *
 * @param secrets - VS Code SecretStorage instance
 */
export async function clearWorkspaceId(secrets: vscode.SecretStorage): Promise<void> {
	await secrets.delete(WORKSPACE_ID_KEY);
}

/**
 * Get workspace ID without creating one if it doesn't exist
 *
 * Useful for checking if workspace is already linked without
 * side effects.
 *
 * @param secrets - VS Code SecretStorage instance
 * @returns The workspace ID if exists and valid, undefined otherwise
 */
export async function getWorkspaceId(secrets: vscode.SecretStorage): Promise<string | undefined> {
	const workspacePath = getWorkspacePath();

	if (workspacePath) {
		try {
			// Try unified resolution without auto-persist
			const identity = resolveUnifiedWorkspaceId({
				workspacePath,
				autoPersist: false,
			});

			// Only return if it came from config or git (not generated)
			if (identity.source === "config" || identity.source === "git" || identity.source === "local") {
				return identity.workspaceId;
			}
		} catch {
			// Fall through to legacy check
		}
	}

	// Legacy: check SecretStorage
	const workspaceId = await secrets.get(WORKSPACE_ID_KEY);

	if (workspaceId && isValidWorkspaceId(workspaceId)) {
		return workspaceId;
	}

	return undefined;
}

/**
 * Initialize the .snapback directory for the current workspace
 */
export function initializeWorkspaceDirectory(): boolean {
	const workspacePath = getWorkspacePath();
	if (!workspacePath) {
		return false;
	}

	try {
		initializeSnapbackDirectory(workspacePath);
		return true;
	} catch {
		return false;
	}
}
