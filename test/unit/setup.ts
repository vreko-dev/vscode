/**
 * VS Code Extension Unit Test Setup
 *
 * Configures global mocks for VS Code extension testing.
 * Provides minimal setup to allow tests to run without external dependencies.
 */

import { afterEach, beforeEach, vi } from "vitest";

// Mock vscode module to prevent import errors in tests
vi.mock("vscode", () => ({
	EventEmitter: class MockEventEmitter {
		fire(): void {}
		dispose(): void {}
	},
	Position: class MockPosition {
		constructor(public line: number, public character: number) {}
	},
	Range: class MockRange {
		constructor(public start: any, public end: any) {}
	},
	WorkspaceEdit: class MockWorkspaceEdit {},
	TreeItem: class MockTreeItem {
		constructor(public label: string) {}
	},
	FileSystemWatcher: class MockFileSystemWatcher {
		dispose(): void {}
	},
	Disposable: class MockDisposable {
		static from(): MockDisposable { return new MockDisposable(); }
		dispose(): void {}
	},
	RelativePattern: class MockRelativePattern {
		constructor(public base: string, public pattern: string) {}
	},
	CancellationError: class MockCancellationError extends Error {
		constructor() { super("CancellationError"); }
	},
	Uri: {
		file: (path: string) => ({ scheme: "file", fsPath: path }),
		parse: (value: string) => ({ scheme: "file", fsPath: value }),
	},
	window: {
		createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), show: vi.fn(), clear: vi.fn() })),
		createStatusBarItem: vi.fn(() => ({ show: vi.fn(), hide: vi.fn(), dispose: vi.fn() })),
		showErrorMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		withProgress: vi.fn(async (_, callback) => callback()),
	},
	workspace: {
		onDidSaveTextDocument: {
			once: vi.fn(),
			on: vi.fn(),
			dispose: vi.fn(),
		},
		onDidChangeTextDocument: {
			on: vi.fn(),
			dispose: vi.fn(),
		},
		getConfiguration: vi.fn(() => ({
			get: vi.fn(() => undefined),
			update: vi.fn(),
			has: vi.fn(() => false),
		})),
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
		getWorkspaceFolder: vi.fn(() => ({ uri: { fsPath: "/test/workspace" } })),
		asRelativePath: vi.fn((p: string) => p),
		fs: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			stat: vi.fn(),
			delete: vi.fn(),
		},
		createFileSystemWatcher: vi.fn(() => ({ onDidCreate: { on: vi.fn() }, onDidDelete: { on: vi.fn() }, dispose: vi.fn() })),
		applyEdit: vi.fn(async () => true),
		openTextDocument: vi.fn(async () => ({} as any)),
	},
	languages: {
		createDiagnosticCollection: vi.fn(() => ({ set: vi.fn(), clear: vi.fn(), delete: vi.fn(), dispose: vi.fn() })),
	},
	commands: {
		registerCommand: vi.fn(),
		executeCommand: vi.fn(),
	},
	env: {
		openExternal: vi.fn(),
	},
	extensions: {
		all: [],
		getExtension: vi.fn(),
	},
	version: "1.75.0",
	ThemeColor: class MockThemeColor { constructor(public id: string) {} },
	ThemeIcon: class MockThemeIcon { constructor(public id: string) {} },
	FileDecoration: class MockFileDecoration {},
	ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
	LogLevel: { Trace: 0, Debug: 1, Info: 2, Warning: 3, Error: 4, Off: 5 },
	TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
	ProgressLocation: { SourceControl: 1, Window: 10, Notification: 15 },
	StatusBarAlignment: { Left: 0, Right: 1 },
	DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
}));

// Mock Sentry modules
vi.mock("@sentry/profiling-node", () => ({ default: {}, nodeProfilingIntegration: vi.fn() }));
vi.mock("@sentry/node", () => ({
	default: { init: vi.fn(), captureException: vi.fn() },
	init: vi.fn(),
	captureException: vi.fn(),
}));

// Mock @snapback/infrastructure
vi.mock("@snapback/infrastructure", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Mock local logger
vi.mock("../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// ============================================
// Global Test Hooks
// ============================================

beforeEach(() => {
	vi.clearAllMocks();
});

afterEach(() => {
	vi.restoreAllMocks();
});
