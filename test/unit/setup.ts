import { vi, beforeEach, afterEach } from "vitest";
import {
	createTestWorkspace,
	createPerformanceMonitor,
} from "../__mocks__/factories";

// Create a proper EventEmitter mock that actually works
class MockEventEmitter<T> {
	private listeners: Array<(e: T) => any> = [];

	get event() {
		return (listener: (e: T) => any) => {
			this.listeners.push(listener);
			return {
				dispose: () => {
					const index = this.listeners.indexOf(listener);
					if (index > -1) {
						this.listeners.splice(index, 1);
					}
				},
			};
		};
	}

	fire(data: T): void {
		for (const listener of this.listeners) {
			listener(data);
		}
	}

	dispose(): void {
		this.listeners = [];
	}
}

// Define mock output channel first
const mockOutputChannel = {
	name: "SnapBack Test",
	append: vi.fn(),
	appendLine: vi.fn(),
	clear: vi.fn(),
	show: vi.fn(),
	hide: vi.fn(),
	dispose: vi.fn(),
	replace: vi.fn(),
};

// Mock VS Code API globally for unit tests
const mockVscode = {
	commands: {
		registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
		executeCommand: vi.fn(() => Promise.resolve(undefined)),
		getCommands: vi.fn(() => Promise.resolve([])),
	},
	window: {
		showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
		showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
		showErrorMessage: vi.fn(() => Promise.resolve(undefined)), // Return a promise
		showQuickPick: vi.fn(() => Promise.resolve(undefined)),
		showWorkspaceFolderPick: vi.fn(() => Promise.resolve(undefined)),
		createOutputChannel: vi.fn(() => mockOutputChannel),
		createStatusBarItem: vi.fn(() => ({
			text: "",
			tooltip: "",
			command: undefined,
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		})),
		withProgress: vi
			.fn()
			.mockImplementation((_options, task) => task({ report: vi.fn() })),
		registerTreeDataProvider: vi.fn(),
		registerFileDecorationProvider: vi.fn(),
		showTextDocument: vi.fn(async (document) => ({
			document,
			edit: vi.fn(async (callback) => {
				const editBuilder = {
					insert: vi.fn(),
					delete: vi.fn(),
					replace: vi.fn(),
				};
				callback(editBuilder);
				return true;
			}),
		})),
		setStatusBarMessage: vi.fn(() => ({ dispose: vi.fn() })),
		createTextEditorDecorationType: vi.fn(() => ({
			dispose: vi.fn(),
		})),
		onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		visibleTextEditors: [],
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key, defaultValue) => {
				// Return default values for configuration
				if (key === "logLevel") return "info";
				return defaultValue;
			}),
			update: vi.fn(),
			has: vi.fn(),
		})),
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
		asRelativePath: vi.fn((pathOrUri: any) => {
			const path = typeof pathOrUri === "string" ? pathOrUri : pathOrUri.fsPath;
			return path.replace(/^.*\//, "");
		}),
		findFiles: vi.fn(async () => []),
		fs: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			stat: vi.fn(),
			delete: vi.fn(),
			rename: vi.fn(),
		},
		onDidChangeConfiguration: vi.fn(() => ({ dispose: vi.fn() })),
		onWillSaveTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
		onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
		registerTextDocumentContentProvider: vi.fn(() => ({
			dispose: vi.fn(),
		})),
		// Add the TimelineProvider registration function
		registerTimelineProvider: vi.fn((_selector, _provider) => ({
			dispose: vi.fn(),
		})),
		// Add createFileSystemWatcher mock
		createFileSystemWatcher: vi.fn((_pattern) => ({
			onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
			onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
			onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
			dispose: vi.fn(),
		})),
		applyEdit: vi.fn(async () => true),
		// Add openTextDocument mock
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
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	},
	languages: {
		registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
	},
	Uri: {
		file: vi.fn((path: string) => ({
			fsPath: path,
			path,
			scheme: "file",
		})),
		parse: vi.fn(),
		joinPath: vi.fn((base, ...pathSegments) => ({
			fsPath: [base.fsPath, ...pathSegments].join("/"),
			path: [base.path, ...pathSegments].join("/"),
			scheme: "file",
		})),
	},
	extensions: {
		all: [],
		getExtension: vi.fn(),
	},
	// Use the real MockEventEmitter class
	EventEmitter: MockEventEmitter,
	Position: class {
		constructor(
			public line: number,
			public character: number,
		) {}
	},
	Range: class {
		constructor(
			public start: any,
			public end: any,
		) {}
	},
	WorkspaceEdit: class {
		private edits: Array<{ uri: any; range: any; text: string }> = [];
		replace(uri: any, range: any, text: string) {
			this.edits.push({ uri, range, text });
		}
		getEdits() {
			return this.edits;
		}
	},
	ThemeColor: vi.fn((id: string) => ({ id })),
	ThemeIcon: vi.fn((id: string) => ({ id })),
	FileDecoration: vi.fn((badge, tooltip, color) => ({
		badge,
		tooltip,
		color,
	})),
	TreeItem: class {
		constructor(label: string, collapsibleState?: any) {
			this.label = label;
			this.collapsibleState = collapsibleState;
		}
		label: string;
		collapsibleState: any;
	},
	TreeItemCollapsibleState: {
		None: 0,
		Collapsed: 1,
		Expanded: 2,
	},
	ProgressLocation: {
		Notification: 15,
	},
	StatusBarAlignment: {
		Left: 1,
		Right: 2,
	},
	Disposable: class {
		dispose() {}
	},
	RelativePattern: class {
		constructor(
			public base: string,
			public pattern: string,
		) {}
	},
	OverviewRulerLane: {
		Left: 0,
		Center: 1,
		Right: 2,
		Full: 3,
	},
	CancellationError: class extends Error {
		constructor() {
			super("Operation cancelled");
			this.name = "CancellationError";
		}
	},
};

vi.mock("vscode", () => mockVscode);

// Also set it globally for direct access
global.vscode = mockVscode as any;

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
global.createTestWorkspace = createTestWorkspace as any;
global.createPerformanceMonitor = createPerformanceMonitor as any;

// Initialize logger for tests - do this after the mock is set up
setTimeout(() => {
	import("../../src/utils/logger").then(({ logger }) => {
		logger.getInstance(mockOutputChannel);
	});
}, 0);
