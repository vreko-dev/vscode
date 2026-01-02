/**
 * Workspace ID Management
 *
 * Generates and stores a unique workspace ID for MCP authentication.
 * The workspace ID is used to link MCP sessions to authenticated users
 * without requiring API keys in MCP config files.
 *
 * Security Model:
 * - 128-bit random entropy (unguessable)
 * - Stored in VS Code SecretStorage (encrypted)
 * - Format: ws_[32 hex chars]
 *
 * @packageDocumentation
 */

import * as crypto from "node:crypto";
import type * as vscode from "vscode";

/**
 * Secret storage key for workspace ID
 */
const WORKSPACE_ID_KEY = "snapback.workspaceId";

/**
 * Workspace ID format pattern
 * ws_ prefix + 32 hex characters = 128 bits of entropy
 */
export const WORKSPACE_ID_PATTERN = /^ws_[a-f0-9]{32}$/;

/**
 * Expected workspace ID length (ws_ + 32 hex = 35 chars)
 */
export const WORKSPACE_ID_LENGTH = 35;

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
 * Validate workspace ID format
 *
 * @param workspaceId - The workspace ID to validate
 * @returns True if valid format
 */
export function isValidWorkspaceId(workspaceId: string | undefined): workspaceId is string {
	if (!workspaceId) {
		return false;
	}
	return WORKSPACE_ID_PATTERN.test(workspaceId);
}

/**
 * Get or create a workspace ID for this VS Code instance
 *
 * If a workspace ID already exists in SecretStorage, returns it.
 * Otherwise, generates a new one and stores it.
 *
 * The workspace ID is persistent per VS Code installation/profile,
 * enabling consistent tier resolution across MCP sessions.
 *
 * @param secrets - VS Code SecretStorage instance
 * @returns The workspace ID (existing or newly generated)
 *
 * @example
 * ```ts
 * // In extension activation
 * const workspaceId = await getOrCreateWorkspaceId(context.secrets);
 * console.log(`Workspace ID: ${workspaceId}`);
 * // First run: "ws_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" (newly generated)
 * // Subsequent runs: same ID (retrieved from storage)
 * ```
 */
export async function getOrCreateWorkspaceId(secrets: vscode.SecretStorage): Promise<string> {
	// Try to retrieve existing workspace ID
	let workspaceId = await secrets.get(WORKSPACE_ID_KEY);

	// Validate existing ID (could be corrupted or old format)
	if (workspaceId && !isValidWorkspaceId(workspaceId)) {
		// Invalid format - regenerate
		workspaceId = undefined;
	}

	if (!workspaceId) {
		// Generate new workspace ID with 128 bits of entropy
		workspaceId = generateWorkspaceId();
		await secrets.store(WORKSPACE_ID_KEY, workspaceId);
	}

	return workspaceId;
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
	const workspaceId = await secrets.get(WORKSPACE_ID_KEY);

	if (workspaceId && isValidWorkspaceId(workspaceId)) {
		return workspaceId;
	}

	return undefined;
}
