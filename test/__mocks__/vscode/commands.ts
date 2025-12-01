import { vi } from "vitest";

/**
 * Mock for VS Code commands API
 *
 * Provides test doubles for command registration and execution.
 * Used to verify command handlers without actual VS Code command system.
 */

/**
 * Registers a command handler
 * @returns Disposable for cleanup
 */
export const registerCommand = vi.fn();

/**
 * Executes a registered command
 * @returns Promise resolving to command result (default: undefined)
 */
export const executeCommand = vi.fn().mockResolvedValue(undefined);
