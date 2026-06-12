/**
 * Test Setup for @vreko/vscode extension
 *
 * Configures the test environment with:
 * - Standard test hooks for mock cleanup and isolation
 * - Environment variables for test mode
 * - Logger initialization with mock output channel
 * - Consistent behavior across all test files
 */

import { afterEach, beforeAll, beforeEach, vi } from "vitest";
import * as vscode from "vscode";
import { Logger } from "../../src/utils/logger";

// Set test environment variables
process.env.NODE_ENV = "test";
process.env.VREKO_TEST_MODE = "true";

// Export mock vscode APIs for tests that need direct access to mock functions
// Cast to any to allow mock function properties like mockReturnValue, mockResolvedValue
export const mockVscodeWindow = vscode.window as any;
export const mockVscodeWorkspace = vscode.workspace as any;
export const mockVscodeCommands = vscode.commands as any;

// Initialize Logger singleton once for all tests
beforeAll(() => {
	// Create a mock LogOutputChannel for Logger initialization
	const mockOutputChannel = vscode.window.createOutputChannel("Vreko Test", {
		log: true,
	}) as vscode.LogOutputChannel;

	// Initialize Logger singleton - this prevents "Logger not initialized" errors
	Logger.getInstance(mockOutputChannel);
});

// Configure test hooks for consistent behavior
beforeEach(() => {
	// Clear all mocks before each test for isolation
	vi.clearAllMocks();
});

afterEach(() => {
	// Restore all mocks after each test
	vi.restoreAllMocks();
	// Clear any pending timers
	vi.clearAllTimers();
});

/**
 * Create a mock VS Code ExtensionContext for testing
 * Used by tests that need to instantiate services requiring extension context
 */
export function createMockExtensionContext(): vscode.ExtensionContext {
	return {
		subscriptions: [],
		extensionUri: vscode.Uri.file("/test/extension"),
		globalState: {
			get: vi.fn(),
			update: vi.fn(),
			keys: vi.fn(() => []),
			setKeysForSync: vi.fn(),
		},
		workspaceState: {
			get: vi.fn(),
			update: vi.fn(),
			keys: vi.fn(() => []),
		},
		secrets: {
			get: vi.fn(),
			store: vi.fn(),
			delete: vi.fn(),
			onDidChange: vi.fn(),
		},
		extensionPath: "/test/extension",
		storagePath: "/test/storage",
		globalStoragePath: "/test/global-storage",
		logPath: "/test/logs",
		extension: {} as any,
		environmentVariableCollection: {} as any,
		extensionMode: 3,
		storageUri: vscode.Uri.file("/test/storage"),
		globalStorageUri: vscode.Uri.file("/test/global-storage"),
		logUri: vscode.Uri.file("/test/logs"),
		asAbsolutePath: (path: string) => `/test/extension/${path}`,
		languageModelAccessInformation: {} as any,
	} as any;
}
