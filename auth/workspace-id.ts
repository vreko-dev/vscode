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
 * 1. .vreko/config.json (team-shared, checked in)
 * 2. Git remote URL hash (deterministic team ID)
 * 3. .vreko/local.json (user override)
 * 4. VS Code SecretStorage (user fallback)
 *
 * @packageDocumentation
 */

import { generateWorkspaceId as generateUnifiedWorkspaceId } from "@vreko/workspace-identity";
import * as vscode from "vscode";
import type { DaemonBridge } from "../services/DaemonBridge";

/**
 * Secret storage key for workspace ID (fallback for non-git repos)
 */
const WORKSPACE_ID_KEY = "vreko.workspaceId";

/**
 * Workspace ID format pattern (unified 12-char hex)
 * 12 hex characters = 48 bits of entropy
 */
export const WORKSPACE_ID_PATTERN = /^[a-f0-9]{12}$/;

/**
 * Legacy pattern for backward compatibility during migration
 * @deprecated Use WORKSPACE_ID_PATTERN instead
 */
export const LEGACY_WORKSPACE_ID_PATTERN = /^ws[g]?_[a-f0-9]{32}$/;

/**
 * Combined pattern for any valid workspace ID (unified or legacy)
 */
export const ANY_WORKSPACE_ID_PATTERN = /^([a-f0-9]{12}|ws[g]?_[a-f0-9]{32})$/;

/**
 * Expected workspace ID length (12 chars for unified format)
 */
export const WORKSPACE_ID_LENGTH = 12;

/**
 * Result of workspace ID resolution with metadata
 */
export interface WorkspaceIdResult {
	/** The workspace ID */
	workspaceId: string;
	/** Whether the ID is team-stable (path-based deterministic) */
	isTeamStable: boolean;
	/** Where the ID came from */
	source: "config" | "git" | "local" | "user" | "fallback" | "path";
}

/**
 * Generate a workspace ID from workspace path
 *
 * Uses unified SHA-256 algorithm for cross-surface consistency.
 * Same path always produces same ID (deterministic).
 *
 * @param workspacePath - Absolute path to workspace root
 * @returns Workspace ID (12 hex chars)
 *
 * @example
 * ```ts
 * const id = generateWorkspaceId("/Users/dev/project");
 * // id = "a1b2c3d4e5f6"
 * ```
 */
export function generateWorkspaceId(workspacePath: string): string {
	return generateUnifiedWorkspaceId(workspacePath);
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
 * @deprecated All workspace IDs are now path-based deterministic
 */
export function isGitBasedWorkspaceId(_workspaceId: string): boolean {
	// All unified workspace IDs are path-based deterministic
	return true;
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
 * 1. .vreko/config.json - Team-shared, checked into git (via daemon when available)
 * 2. Git remote URL hash - Deterministic team ID (via daemon when available)
 * 3. .vreko/local.json - User-specific override (via daemon when available)
 * 4. VS Code SecretStorage - User fallback for non-git repos
 *
 * @param secrets - VS Code SecretStorage instance
 * @param bridge - Optional DaemonBridge for daemon-routed resolution (preferred)
 * @returns The workspace ID and metadata
 *
 * @example
 * ```ts
 * const result = await getOrCreateWorkspaceId(context.secrets, daemonBridge);
 * // output:(`Workspace ID: ${result.workspaceId}`);
 * // output:(`Team stable: ${result.isTeamStable}`);
 * ```
 */
export async function getOrCreateWorkspaceId(
	secrets: vscode.SecretStorage,
	bridge?: DaemonBridge,
): Promise<WorkspaceIdResult> {
	const workspacePath = getWorkspacePath();

	if (workspacePath) {
		// Get existing fallback ID from secrets (for non-git repos)
		let fallbackUserId = await secrets.get(WORKSPACE_ID_KEY);
		if (fallbackUserId && !isValidWorkspaceId(fallbackUserId)) {
			fallbackUserId = undefined;
		}

		if (bridge) {
			try {
				// Route through daemon  -  avoids direct @vreko/intelligence import in extension
				const identity = await bridge.resolveWorkspaceId(workspacePath, fallbackUserId, true);

				// Store the resolved ID in secrets as backup
				if (identity.source === "fallback" || identity.source === "git") {
					await secrets.store(WORKSPACE_ID_KEY, identity.workspaceId);
				}

				return {
					workspaceId: identity.workspaceId,
					isTeamStable: identity.isTeamStable,
					source: identity.source,
				};
			} catch {
				/* intentionally empty */
			}
		}
	}

	// Legacy fallback: deterministic ID from workspace path (no daemon needed)
	let workspaceId: string | undefined;

	if (workspacePath) {
		workspaceId = generateWorkspaceId(workspacePath);
	}

	if (!workspaceId) {
		// Last resort: use stored ID if exists
		workspaceId = await secrets.get(WORKSPACE_ID_KEY);
		if (workspaceId && !isValidWorkspaceId(workspaceId)) {
			workspaceId = undefined;
		}
	}

	return {
		workspaceId: workspaceId || "unknown",
		isTeamStable: !!workspacePath,
		source: workspacePath ? ("path" as const) : ("fallback" as const),
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
 * @param bridge - Optional DaemonBridge for daemon-routed resolution (preferred)
 * @returns The workspace ID if exists and valid, undefined otherwise
 */
export async function getWorkspaceId(
	secrets: vscode.SecretStorage,
	bridge?: DaemonBridge,
): Promise<string | undefined> {
	const workspacePath = getWorkspacePath();

	if (workspacePath && bridge) {
		try {
			// Route through daemon without auto-persist  -  avoids intelligence import in extension
			const identity = await bridge.resolveWorkspaceId(workspacePath, undefined, false);

			// Only return if it came from a persisted source (not generated on-the-fly)
			if (identity.source === "config" || identity.source === "git" || identity.source === "local") {
				return identity.workspaceId;
			}
		} catch {
			// Daemon unavailable  -  fall through to legacy check
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
 * Initialize the .vreko directory for the current workspace
 *
 * Routes through daemon when a bridge is provided so the extension
 * avoids direct fs access and @vreko/intelligence imports.
 *
 * @param bridge - Optional DaemonBridge for daemon-routed initialization
 * @returns true if initialization succeeded (or was skipped gracefully)
 */
export async function initializeWorkspaceDirectory(bridge?: DaemonBridge): Promise<boolean> {
	const workspacePath = getWorkspacePath();
	if (!workspacePath) {
		return false;
	}

	if (bridge) {
		try {
			await bridge.initializeWorkspaceDirectory(workspacePath);
			return true;
		} catch {
			return false;
		}
	}

	// No bridge available  -  skip silently (daemon-only operation per extension CLAUDE.md)
	return false;
}
