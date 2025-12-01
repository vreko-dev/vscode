import { vi } from "vitest";

/**
 * Mock for VS Code window API
 *
 * Provides test doubles for UI interactions, status bar, and output channels.
 * Used to verify user-facing operations without actual VS Code UI.
 */

/**
 * Shows an information message to the user
 * @returns Promise resolving to user's selection (default: undefined)
 */
export const showInformationMessage = vi.fn().mockResolvedValue(undefined);

/**
 * Shows a warning message to the user
 * @returns Promise resolving to user's selection (default: undefined)
 */
export const showWarningMessage = vi.fn().mockResolvedValue(undefined);

/**
 * Shows an error message to the user
 * @returns Promise resolving to user's selection (default: undefined)
 */
export const showErrorMessage = vi.fn().mockResolvedValue(undefined);

/**
 * Creates a status bar item for displaying extension status
 * @returns Mock status bar item with show/hide/dispose methods
 */
export const createStatusBarItem = vi.fn(() => ({
	text: "",
	show: vi.fn(),
	hide: vi.fn(),
	dispose: vi.fn(),
}));

/**
 * Creates an output channel for logging extension activity
 * @returns Mock output channel with appendLine/show/dispose methods
 */
export const createOutputChannel = vi.fn(() => ({
	appendLine: vi.fn(),
	show: vi.fn(),
	dispose: vi.fn(),
}));
