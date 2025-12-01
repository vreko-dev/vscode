import { vi } from "vitest";

export const useFakeTimers = () => {
	return {
		restore: () => vi.useRealTimers(),
	};
};

export const withTmp = async (fn: (dir: string) => Promise<void>) => {
	// tmp dir helper
	const tmpDir = `/tmp/snapback-test-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
	try {
		await fn(tmpDir);
	} finally {
		// Cleanup would go here
	}
};

export const noNetwork = () => {
	// stub http/https, posthog, fetch
};

// Mock VS Code API for unit tests
const mockVscode = {
	commands: {
		registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
		executeCommand: vi.fn(() => Promise.resolve(undefined)),
	},
	window: {
		showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
		showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
		showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((_key, defaultValue) => defaultValue),
			update: vi.fn(),
		})),
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
};

// Make vscode available globally
(global as any).vscode = mockVscode;
