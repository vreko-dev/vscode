/**
 * @fileoverview Authenticated API Client - Placeholder for auth task implementation
 *
 * This module provides placeholder interfaces for authenticated API calls.
 * The actual implementation will be provided by a separate auth task.
 *
 * @see Design: .qoder/quests/snapback-explorer-tree.md
 */

import type * as vscode from "vscode";

/**
 * Authenticated API client interface
 */
export interface AuthedApiClient {
	/**
	 * Perform authenticated fetch
	 *
	 * Automatically:
	 * - Adds Authorization header with access token
	 * - Refreshes tokens when needed
	 * - Throws "Session expired - please reconnect your account" when session invalid
	 *
	 * @param path - API path relative to base URL (e.g., "/api/v1/workspace/safety")
	 * @param init - Optional request init options
	 * @returns Parsed response data
	 * @throws Error with "Session expired" message when auth fails
	 */
	fetch<T>(path: string, init?: RequestInit): Promise<T>;
}

/**
 * Create authenticated API client instance
 *
 * TODO: This is a placeholder implementation. The auth task will provide the real implementation.
 *
 * @param context - VS Code extension context
 * @returns AuthedApiClient instance
 */
export function createAuthedApiClient(
	_context: vscode.ExtensionContext,
): AuthedApiClient {
	return {
		async fetch<T>(_path: string, _init?: RequestInit): Promise<T> {
			// TODO: Implement actual authenticated fetch with token refresh
			// For now, throw session expired to show connect node
			throw new Error("Session expired - please reconnect your account");
		},
	};
}
