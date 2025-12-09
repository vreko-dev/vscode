/**
 * VS Code Extension Unit Test Setup
 *
 * Configures global mocks and test utilities for VS Code extension testing.
 * Uses centralized testing utilities from @snapback/testing.
 */

import { afterEach, beforeEach, vi } from "vitest";

// Import centralized VS Code mocks
import {
	mockVscode,
	MockEventEmitter,
	MockPosition,
	MockRange,
	MockWorkspaceEdit,
	MockTreeItem,
	MockDisposable,
	MockRelativePattern,
	MockCancellationError,
	createMockOutputChannel,
	createMockStatusBarItem,
	createMockDiagnosticCollection,
	createMockFileSystemWatcher,
} from "@snapback/testing/mocks/vscode";

// Import centralized test utilities
import {
	createTestWorkspace,
	createPerformanceMonitor,
} from "../__mocks__/factories";

// Mock Sentry modules to prevent native module loading errors
// These must be mocked BEFORE any imports that use them
vi.mock("@sentry/profiling-node", () => ({
	default: {},
	nodeProfilingIntegration: vi.fn(() => ({})),
	ProfilingIntegration: vi.fn(),
}));

vi.mock("@sentry/node", () => ({
	default: {
		init: vi.fn(),
		captureException: vi.fn(),
		captureMessage: vi.fn(),
		setUser: vi.fn(),
		setContext: vi.fn(),
	},
	init: vi.fn(),
	captureException: vi.fn(),
	captureMessage: vi.fn(),
	setUser: vi.fn(),
	setContext: vi.fn(),
}));

// Mock sdk-types to prevent module resolution errors
vi.mock("../../src/sdk-types", () => ({
	SnapbackClient: vi.fn().mockImplementation(() => ({
		getHttpClient: vi.fn(),
	})),
	analyze: vi.fn().mockResolvedValue({
		decision: "allow",
		confidence: 0.9,
		rules_hit: [],
	}),
	evaluatePolicy: vi.fn().mockResolvedValue({
		decision: "allow",
		confidence: 0.9,
		rules_hit: [],
		policyVersion: "1.0.0",
	}),
	ingestTelemetry: vi.fn().mockResolvedValue({
		id: "test-id",
		received: true,
	}),
}));

// Mock @snapback/infrastructure completely to avoid Sentry import
vi.mock("@snapback/infrastructure", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		fatal: vi.fn(),
		trace: vi.fn(),
	},
	initializeSentry: vi.fn(),
	captureSentryException: vi.fn(),
}));

// Mock the local Logger utility to prevent initialization errors
vi.mock("../../src/utils/logger", () => {
	const mockLogger = {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		show: vi.fn(),
		dispose: vi.fn(),
	};
	return {
		Logger: {
			getInstance: vi.fn(() => mockLogger),
		},
		logger: mockLogger,
	};
});

// Define mock output channel
const mockOutputChannel = createMockOutputChannel("SnapBack Test");

// Extended mock for VSCode with project-specific overrides
const extendedMockVscode = {
	...mockVscode,
	window: {
		...mockVscode.window,
		createOutputChannel: vi.fn(() => mockOutputChannel),
		createStatusBarItem: vi.fn(() => createMockStatusBarItem()),
	},
	workspace: {
		...mockVscode.workspace,
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue?: unknown) => {
				// Return default values for configuration
				if (key === "logLevel") return "info";
				if (key === "preSnapshot.debounceMs") return 500;
				if (key === "preSnapshot.enabled") return true;
				return defaultValue;
			}),
			update: vi.fn(),
			has: vi.fn(),
		})),
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
		getWorkspaceFolder: vi.fn((uri: { scheme?: string }) => {
			if (uri?.scheme === "file") {
				return { uri: { fsPath: "/test/workspace" } };
			}
			return undefined;
		}),
		asRelativePath: vi.fn((pathOrUri: string | { fsPath: string }) => {
			const path = typeof pathOrUri === "string" ? pathOrUri : pathOrUri.fsPath;
			return path.replace(/^.*workspace\//, "");
		}),
		fs: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			stat: vi.fn(),
			delete: vi.fn(),
			rename: vi.fn(),
			readDirectory: vi.fn(async () => []),
		},
		createFileSystemWatcher: vi.fn(() => createMockFileSystemWatcher()),
		applyEdit: vi.fn(async () => true),
		openTextDocument: vi.fn(async (uri) => ({
			uri,
			fileName: uri.fsPath,
			isUntitled: false,
			languageId: "typescript",
			version: 1,
			isDirty: false,
			isClosed: false,
			save: vi.fn(async () => true),
			eol: 1,
			lineCount: 1,
			lineAt: vi.fn(),
			offsetAt: vi.fn(),
			positionAt: vi.fn(),
			getText: vi.fn(() => ""),
			getWordRangeAtPosition: vi.fn(),
			validateRange: vi.fn(),
			validatePosition: vi.fn(),
		})),
	},
	languages: {
		...mockVscode.languages,
		createDiagnosticCollection: vi.fn((name?: string) => createMockDiagnosticCollection(name)),
	},
	// Ensure all top-level exports are included
	env: mockVscode.env,
	extensions: mockVscode.extensions,
	version: "1.75.0",
	// Use classes from centralized mocks
	EventEmitter: MockEventEmitter,
	Position: MockPosition,
	Range: MockRange,
	WorkspaceEdit: MockWorkspaceEdit,
	TreeItem: MockTreeItem,
	Disposable: MockDisposable,
	RelativePattern: MockRelativePattern,
	CancellationError: MockCancellationError,
	// Ensure other enums and constants are available
	ThemeColor: mockVscode.ThemeColor,
	ThemeIcon: mockVscode.ThemeIcon,
	FileDecoration: mockVscode.FileDecoration,
	ConfigurationTarget: mockVscode.ConfigurationTarget,
	LogLevel: mockVscode.LogLevel,
	TreeItemCollapsibleState: mockVscode.TreeItemCollapsibleState,
	ProgressLocation: mockVscode.ProgressLocation,
	StatusBarAlignment: mockVscode.StatusBarAlignment,
	OverviewRulerLane: mockVscode.OverviewRulerLane,
	CancellationTokenSource: mockVscode.CancellationTokenSource,
	Selection: mockVscode.Selection,
	DiagnosticSeverity: mockVscode.DiagnosticSeverity,
	Uri: mockVscode.Uri,
	FileType: mockVscode.FileType,
};

vi.mock("vscode", () => extendedMockVscode);

// Also set it globally for direct access
(globalThis as Record<string, unknown>).vscode = extendedMockVscode;

// ============================================
// Global Test Utilities & Setup Hooks
// ============================================

// Reset mocks between tests
beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});

// Global test utilities for test authors
(globalThis as Record<string, unknown>).createTestWorkspace = createTestWorkspace;
(globalThis as Record<string, unknown>).createPerformanceMonitor = createPerformanceMonitor;
