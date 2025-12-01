import { vi } from "vitest";

/**
 * Mock for VS Code workspace API
 *
 * Provides test doubles for workspace configuration, file system events, and workspace folders.
 * Used to verify workspace operations without actual VS Code workspace access.
 */

/**
 * Gets workspace or folder configuration
 * @returns Mock configuration object with get/update methods
 */
export const getConfiguration = vi.fn(() => ({
	/**
	 * Retrieves configuration value
	 * @returns Configuration value for the given key
	 */
	get: vi.fn(),

	/**
	 * Updates configuration value
	 * @returns Promise resolving when update completes
	 */
	update: vi.fn().mockResolvedValue(undefined),
}));

/**
 * Event fired when a text document is saved
 * @returns Disposable for cleanup
 */
export const onDidSaveTextDocument = vi.fn();

/**
 * Event fired when a text document is about to be saved
 * @returns Disposable for cleanup
 */
export const onWillSaveTextDocument = vi.fn();

/**
 * Event fired when configuration changes
 * @returns Disposable for cleanup
 */
export const onDidChangeConfiguration = vi.fn();

/**
 * Registers a timeline provider
 * @returns Disposable for cleanup
 */
export const registerTimelineProvider = vi.fn();

/**
 * All workspace folders currently opened
 * @default Empty array (no workspace folders)
 */
export const workspaceFolders = [];

/**
 * Finds files matching glob patterns
 * @returns Promise resolving to an empty array by default
 */
export const findFiles = vi.fn(async () => []);

/**
 * Registers a text document content provider
 * @returns Disposable handle (mocked)
 */
export const registerTextDocumentContentProvider = vi.fn(() => ({
	dispose: vi.fn(),
}));
