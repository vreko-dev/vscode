/**
 * VS Code Extension Unit Test Setup
 *
 * Configures global mocks for VS Code extension testing.
 * Provides minimal setup to allow tests to run without external dependencies.
 */

import { afterEach, beforeEach, vi } from "vitest";

// ============================================
// Global Mock Extension Context (for tests that need it)
// ============================================

const globalStateMap = new Map<string, unknown>();
const workspaceStateMap = new Map<string, unknown>();

export const mockExtensionContext = {
	subscriptions: [] as { dispose: () => void }[],
	globalStorageUri: { fsPath: "/test-global-storage", scheme: "file" },
	storageUri: { fsPath: "/test-storage", scheme: "file" },
	extensionUri: { fsPath: "/test-extension", scheme: "file" },
	extensionPath: "/test-extension",
	extension: {
		packageJSON: { version: "1.0.0-test" },
	},
	globalState: {
		get: (key: string) => globalStateMap.get(key),
		update: vi.fn((key: string, value: unknown) => {
			globalStateMap.set(key, value);
			return Promise.resolve();
		}),
		keys: () => Array.from(globalStateMap.keys()),
		setKeysForSync: vi.fn(),
	},
	workspaceState: {
		get: (key: string) => workspaceStateMap.get(key),
		update: vi.fn((key: string, value: unknown) => {
			workspaceStateMap.set(key, value);
			return Promise.resolve();
		}),
		keys: () => Array.from(workspaceStateMap.keys()),
	},
	secrets: {
		get: vi.fn().mockResolvedValue(undefined),
		store: vi.fn().mockResolvedValue(undefined),
		delete: vi.fn().mockResolvedValue(undefined),
		onDidChange: vi.fn(),
	},
	environmentVariableCollection: {
		replace: vi.fn(),
		append: vi.fn(),
		prepend: vi.fn(),
		get: vi.fn(),
		forEach: vi.fn(),
		delete: vi.fn(),
		clear: vi.fn(),
	},
	asAbsolutePath: (relativePath: string) => `/test-extension/${relativePath}`,
	logUri: { fsPath: "/test-logs", scheme: "file" },
	extensionMode: 1, // Development
};

// ============================================
// Mock vscode module to prevent import errors in tests
// CANONICAL MOCK - Do NOT re-mock vscode in individual tests!
// Use vi.mocked() to override specific methods instead.
// ============================================

// Create mock objects that can be accessed/modified by tests
export const mockVscodeWorkspace = {
	onDidSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
	onWillSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
	onDidOpenTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	onDidCloseTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	getConfiguration: vi.fn((section?: string) => {
		const configMap = new Map<string, unknown>([
			["mcp.enabled", true],
			["enabled", true],
			["protection.level", "watch"],
			["testMode", false],
			["offlineMode.enabled", false],
			["apiBaseUrl", "https://api.snapback.dev"],
		]);
		return {
			get: vi.fn((key: string, defaultValue?: unknown) => configMap.get(key) ?? defaultValue),
			update: vi.fn().mockResolvedValue(undefined),
			has: vi.fn((key: string) => configMap.has(key)),
			inspect: vi.fn(() => ({ defaultValue: undefined, globalValue: undefined, workspaceValue: undefined })),
		};
	}),
	workspaceFolders: [{ uri: { fsPath: "/test/workspace", scheme: "file" }, name: "test", index: 0 }],
	getWorkspaceFolder: vi.fn(() => ({ uri: { fsPath: "/test/workspace", scheme: "file" }, name: "test", index: 0 })),
	asRelativePath: vi.fn((p: string) => p),
	isTrusted: true,
	fs: {
		readFile: vi.fn(() => Promise.resolve(Buffer.from(""))),
		writeFile: vi.fn(() => Promise.resolve(undefined)),
		stat: vi.fn(() => Promise.resolve({ type: 1, ctime: 0, mtime: 0, size: 0 })),
		delete: vi.fn(() => Promise.resolve(undefined)),
		readDirectory: vi.fn(() => Promise.resolve([])),
		createDirectory: vi.fn(() => Promise.resolve(undefined)),
		copy: vi.fn(() => Promise.resolve(undefined)),
		rename: vi.fn(() => Promise.resolve(undefined)),
	},
	createFileSystemWatcher: vi.fn(() => ({
		onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
		onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
		dispose: vi.fn(),
	})),
	applyEdit: vi.fn().mockResolvedValue(true),
	openTextDocument: vi.fn().mockResolvedValue({
		uri: { fsPath: "/test/file.ts", scheme: "file" },
		getText: vi.fn(() => ""),
		lineCount: 0,
	}),
	findFiles: vi.fn().mockResolvedValue([]),
	registerTextDocumentContentProvider: vi.fn(() => ({ dispose: vi.fn() })),
};

export const mockVscodeWindow = {
	createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), append: vi.fn(), show: vi.fn(), clear: vi.fn(), dispose: vi.fn(), name: "SnapBack" })),
	createStatusBarItem: vi.fn(() => ({ show: vi.fn(), hide: vi.fn(), dispose: vi.fn(), text: "", tooltip: "", command: undefined })),
	createTreeView: vi.fn((_viewId: string, _options: unknown) => ({
		dispose: vi.fn(),
		visible: true,
		onDidChangeVisibility: vi.fn(() => ({ dispose: vi.fn() })),
		reveal: vi.fn(),
	})),
	showErrorMessage: vi.fn().mockResolvedValue(undefined),
	showWarningMessage: vi.fn().mockResolvedValue(undefined),
	showInformationMessage: vi.fn().mockResolvedValue(undefined),
	setStatusBarMessage: vi.fn(() => ({ dispose: vi.fn() })),
	withProgress: vi.fn(async (_options, task) => task({ report: vi.fn() }, { isCancellationRequested: false, onCancellationRequested: vi.fn() })),
	showQuickPick: vi.fn().mockResolvedValue(undefined),
	showInputBox: vi.fn().mockResolvedValue(undefined),
	showTextDocument: vi.fn().mockResolvedValue(undefined),
	showOpenDialog: vi.fn().mockResolvedValue(undefined),
	showSaveDialog: vi.fn().mockResolvedValue(undefined),
	createQuickPick: vi.fn(() => ({
		title: "",
		placeholder: "",
		canSelectMany: false,
		matchOnDetail: false,
		matchOnDescription: false,
		items: [],
		selectedItems: [],
		activeItems: [],
		value: "",
		onDidAccept: vi.fn(() => ({ dispose: vi.fn() })),
		onDidHide: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeValue: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeActive: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeSelection: vi.fn(() => ({ dispose: vi.fn() })),
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
	})),
	tabGroups: {
		all: [],
		activeTabGroup: undefined,
		close: vi.fn().mockResolvedValue(undefined),
		onDidChangeTabGroups: vi.fn(() => ({ dispose: vi.fn() })),
	},
	activeTextEditor: undefined,
	visibleTextEditors: [],
	onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
	onDidChangeVisibleTextEditors: vi.fn(() => ({ dispose: vi.fn() })),
	registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
	registerWebviewViewProvider: vi.fn(() => ({ dispose: vi.fn() })),
	registerFileDecorationProvider: vi.fn(() => ({ dispose: vi.fn() })),
	registerUriHandler: vi.fn(() => ({ dispose: vi.fn() })),
};

export const mockVscodeAuthentication = {
	getSession: vi.fn().mockResolvedValue(null),
	onDidChangeSessions: vi.fn(() => ({ dispose: vi.fn() })),
	registerAuthenticationProvider: vi.fn(() => ({ dispose: vi.fn() })),
};

vi.mock("vscode", () => ({
	EventEmitter: class MockEventEmitter {
		private listeners: Map<string, Function[]> = new Map();
		event = vi.fn();
		fire(data?: unknown): void {
			this.listeners.forEach((handlers) => handlers.forEach((h) => h(data)));
		}
		dispose(): void {
			this.listeners.clear();
		}
	},
	Position: class MockPosition {
		constructor(public line: number, public character: number) {}
	},
	Range: class MockRange {
		constructor(public start: any, public end: any) {}
	},
	Selection: class MockSelection {
		constructor(public anchor: any, public active: any) {}
	},
	WorkspaceEdit: class MockWorkspaceEdit {
		private edits: any[] = [];
		replace() {}
		insert() {}
		delete() {}
		has() { return false; }
		entries() { return []; }
	},
	TreeItem: class MockTreeItem {
		constructor(public label: string, public collapsibleState?: number) {}
	},
	FileSystemWatcher: class MockFileSystemWatcher {
		dispose(): void {}
	},
	Disposable: class MockDisposable {
		static from(...disposables: any[]): MockDisposable { return new MockDisposable(); }
		dispose(): void {}
	},
	RelativePattern: class MockRelativePattern {
		constructor(public base: string, public pattern: string) {}
	},
	CancellationError: class MockCancellationError extends Error {
		constructor() { super("CancellationError"); }
	},
	CancellationTokenSource: class MockCancellationTokenSource {
		token = { isCancellationRequested: false, onCancellationRequested: vi.fn() };
		cancel() { this.token.isCancellationRequested = true; }
		dispose() {}
	},
	FileSystemError: class MockFileSystemError extends Error {
		static FileNotFound(uri?: any) { return new MockFileSystemError("FileNotFound"); }
		static FileExists(uri?: any) { return new MockFileSystemError("FileExists"); }
		static NoPermissions(uri?: any) { return new MockFileSystemError("NoPermissions"); }
		code = "Unknown";
		constructor(message: string) {
			super(message);
			this.code = message;
		}
	},
	FileType: { Unknown: 0, File: 1, Directory: 2, SymbolicLink: 64 },
	Uri: {
		file: (path: string) => ({ scheme: "file", fsPath: path, path }),
		parse: (value: string) => ({ scheme: "file", fsPath: value, path: value }),
		joinPath: (base: { fsPath: string; scheme?: string }, ...segments: string[]) => {
			const path = [base.fsPath, ...segments].join("/").replace(/\/+/g, "/");
			return { scheme: base.scheme || "file", fsPath: path, path };
		},
		from: (components: { scheme: string; path: string }) => ({
			scheme: components.scheme,
			fsPath: components.path,
			path: components.path,
		}),
	},
	window: mockVscodeWindow,
	workspace: mockVscodeWorkspace,
	authentication: mockVscodeAuthentication,
	languages: {
		createDiagnosticCollection: vi.fn(() => ({ set: vi.fn(), clear: vi.fn(), delete: vi.fn(), dispose: vi.fn() })),
		registerCodeLensProvider: vi.fn(() => ({ dispose: vi.fn() })),
		registerCodeActionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
		registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
		registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
	},
	commands: {
		registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
		executeCommand: vi.fn().mockResolvedValue(undefined),
		getCommands: vi.fn().mockResolvedValue([]),
	},
	env: {
		openExternal: vi.fn(),
	},
	extensions: {
		all: [],
		getExtension: vi.fn(() => ({
			packageJSON: { version: "1.0.0-test" },
			extensionPath: "/test/extension",
			isActive: true,
		})),
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
	// Logger class - fixes 23 test failures
	LogOutputChannel: vi.fn().mockImplementation(() => ({
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
		trace: vi.fn(),
		appendLine: vi.fn(),
		append: vi.fn(),
		show: vi.fn(),
		clear: vi.fn(),
		dispose: vi.fn(),
		name: "SnapBack",
		logLevel: 1,
		onDidChangeLogLevel: vi.fn(() => ({ dispose: vi.fn() })),
	})),
	// MarkdownString class - fixes 22 test failures
	MarkdownString: class MockMarkdownString {
		value: string;
		isTrusted: boolean = false;
		supportHtml: boolean = false;
		supportThemeIcons: boolean = false;
		baseUri?: { scheme: string; fsPath: string };
		constructor(value?: string, supportThemeIcons?: boolean) {
			this.value = value || "";
			this.supportThemeIcons = supportThemeIcons || false;
		}
		appendMarkdown(value: string): MockMarkdownString {
			this.value += value;
			return this;
		}
		appendText(value: string): MockMarkdownString {
			this.value += value;
			return this;
		}
		appendCodeblock(value: string, _language?: string): MockMarkdownString {
			this.value += `
\`\`\`
${value}
\`\`\`
`;
			return this;
		}
	},
	// ViewColumn enum
	ViewColumn: { Active: -1, Beside: -2, One: 1, Two: 2, Three: 3, Four: 4, Five: 5, Six: 6, Seven: 7, Eight: 8, Nine: 9 },
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
// Mock @snapback/engine - Prevent real filesystem operations
// ============================================
vi.mock("@snapback/engine", () => {
	// Mock SnapshotManifest type
	const mockSnapshotManifest = {
		id: "mock_snap_123",
		createdAt: Date.now(),
		files: [],
		totalSize: 0,
		description: "Mock snapshot",
		trigger: "manual" as const,
	};

	// Mock BurstDetector class
	class MockBurstDetector {
		constructor(_config: any) {}
		analyze() {
			return { score: 0, changeCount: 0, largeChanges: [] };
		}
		processChange(filePath: string, charCount: number, timestamp: number) {
			return null; // Return null for no burst
		}
		setThreshold() {}
		updateThreshold() {}
		reset() {}
		clear() {}
		cleanup() {}
	}

	// Mock AIDetector class
	class MockAIDetector {
		constructor(_config: any) {}
		detect(input: any) {
			// Detect GitHub Copilot from extension IDs
			if (input.extensionIds && input.extensionIds.includes("github.copilot")) {
				return {
					tool: "GitHub Copilot",
					confidence: 0.95,
					method: "extension",
					indicators: ["GitHub Copilot extension active"],
				};
			}
			return {
				tool: null,
				confidence: 0,
				method: null,
				indicators: [],
			};
		}
		processChange(content: string, filePath: string) {
			return { detected: false, tool: null, confidence: 0 };
		}
		reset() {}
		cleanup() {}
	}

	return {
		Storage: vi.fn().mockImplementation(() => ({
			createSnapshot: vi.fn().mockResolvedValue(mockSnapshotManifest),
			restore: vi.fn().mockResolvedValue([]),
			getSnapshot: vi.fn().mockReturnValue(null),
			listSnapshots: vi.fn().mockReturnValue([]),
			deleteSnapshot: vi.fn().mockReturnValue(false),
		})),
		BurstDetector: MockBurstDetector,
		AIDetector: MockAIDetector,
		eventBus: {
			emit: vi.fn(),
			on: vi.fn(),
			off: vi.fn(),
		},
		orchestrator: {},
		Orchestrator: vi.fn(),
		VERSION: "2.0.0-alpha.1",
	};
});

// ============================================
// Mock PostHog / Analytics
// ============================================
vi.mock("posthog-node", () => ({
	PostHog: vi.fn().mockImplementation(() => ({
		capture: vi.fn(),
		identify: vi.fn(),
		shutdown: vi.fn().mockResolvedValue(undefined),
		flush: vi.fn().mockResolvedValue(undefined),
	})),
}));

// ============================================
// Global Test Hooks
// ============================================

beforeEach(() => {
	vi.clearAllMocks();
	// Reset global state between tests
	globalStateMap.clear();
	workspaceStateMap.clear();
	mockExtensionContext.subscriptions.length = 0;
});

afterEach(() => {
	vi.restoreAllMocks();
});
