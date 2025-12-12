/**
 * Comprehensive VS Code API mock for SnapBack extension testing
 * Provides realistic mocks for all VS Code APIs used by the extension
 */

const { vi } = require("vitest");
const EventEmitter = require("node:events");

// Mock event emitter for VS Code events
class MockEventEmitter extends EventEmitter {
	constructor() {
		super();
		this.listeners = new Map();
	}

	fire(event, ...args) {
		this.emit(event, ...args);
		const listeners = this.listeners.get(event) || [];
		for (const listener of listeners) {
			listener(...args);
		}
	}

	onDidChange(listener) {
		const event = "change";
		if (!this.listeners.has(event)) {
			this.listeners.set(event, []);
		}
		this.listeners.get(event).push(listener);
		return { dispose: () => this.removeListener(event, listener) };
	}
}

// Mock TreeItem for tree views
class MockTreeItem {
	constructor(label, collapsibleState = 0) {
		this.label = label;
		this.collapsibleState = collapsibleState;
		this.children = [];
		this.contextValue = "";
		this.tooltip = "";
		this.description = "";
		this.iconPath = null;
		this.command = null;
	}
}

// Mock TreeDataProvider
class MockTreeDataProvider extends MockEventEmitter {
	constructor() {
		super();
		this.data = [];
		this._onDidChangeTreeData = new MockEventEmitter();
	}

	get onDidChangeTreeData() {
		return this._onDidChangeTreeData.onDidChange.bind(this._onDidChangeTreeData);
	}

	getTreeItem(element) {
		return element;
	}

	getChildren(element) {
		if (!element) {
			return Promise.resolve(this.data);
		}
		return Promise.resolve(element.children || []);
	}

	refresh() {
		this._onDidChangeTreeData.fire();
	}
}

// Mock WebviewView
class MockWebviewView {
	constructor() {
		this.webview = {
			html: "",
			options: {},
			cspSource: "vscode-resource:",
			asWebviewUri: (uri) => uri,
			postMessage: vi.fn(),
			onDidReceiveMessage: vi.fn(),
		};
		this.visible = true;
		this.viewType = "";
		this.title = "";
		this.description = "";
		this.onDidDispose = vi.fn();
		this.onDidChangeVisibility = vi.fn();
	}

	show(_preserveFocus) {
		this.visible = true;
	}

	dispose() {
		this.visible = false;
		if (this.onDidDispose) {
			this.onDidDispose();
		}
	}
}

// Mock StatusBarItem
class MockStatusBarItem {
	constructor() {
		this.text = "";
		this.tooltip = "";
		this.command = "";
		this.color = "";
		this.backgroundColor = null;
		this.priority = 0;
		this.alignment = 1; // StatusBarAlignment.Left
		this.accessibilityInformation = null;
	}

	show() {
		this.visible = true;
	}

	hide() {
		this.visible = false;
	}

	dispose() {
		this.visible = false;
	}
}

// Mock ExtensionContext
class MockExtensionContext {
	constructor() {
		this.subscriptions = [];
		this.workspaceState = new MockMemento();
		this.globalState = new MockMemento();
		this.secrets = new MockSecretStorage();
		this.extensionUri = { scheme: "file", path: "/test/extension" };
		this.extensionPath = "/test/extension";
		this.storagePath = "/test/storage";
		this.globalStoragePath = "/test/global-storage";
		this.logPath = "/test/logs";
		this.extensionMode = 1; // ExtensionMode.Development
		this.environment = {
			appName: "Visual Studio Code - Insiders",
			appRoot: "/test/vscode",
			language: "en",
			sessionId: "test-session-id",
			machineId: "test-machine-id",
		};
	}
}

// Mock Memento (workspace/global state)
class MockMemento {
	constructor() {
		this.storage = new Map();
	}

	get(key, defaultValue) {
		return this.storage.get(key) ?? defaultValue;
	}

	update(key, value) {
		this.storage.set(key, value);
		return Promise.resolve();
	}

	keys() {
		return Array.from(this.storage.keys());
	}
}

// Mock Secret Storage
class MockSecretStorage {
	constructor() {
		this.secrets = new Map();
		this.onDidChange = vi.fn();
	}

	get(key) {
		return Promise.resolve(this.secrets.get(key));
	}

	store(key, value) {
		this.secrets.set(key, value);
		return Promise.resolve();
	}

	delete(key) {
		this.secrets.delete(key);
		return Promise.resolve();
	}
}

// Mock FileSystemWatcher
class MockFileSystemWatcher extends MockEventEmitter {
	constructor() {
		super();
		this.ignoreCreateEvents = false;
		this.ignoreChangeEvents = false;
		this.ignoreDeleteEvents = false;
	}

	dispose() {
		this.removeAllListeners();
	}
}

// Mock TextDocument
class MockTextDocument {
	constructor(uri = { scheme: "file", path: "/test/file.ts" }, content = "") {
		this.uri = uri;
		this.fileName = uri.path;
		this.isUntitled = false;
		this.languageId = "typescript";
		this.version = 1;
		this.isDirty = false;
		this.isClosed = false;
		this.eol = 1; // EndOfLine.LF
		this.lineCount = content.split("\n").length;
		this._content = content;
	}

	save() {
		this.isDirty = false;
		return Promise.resolve(true);
	}

	getText(_range) {
		return this._content;
	}

	getWordRangeAtPosition(_position, _regex) {
		return null;
	}

	validateRange(range) {
		return range;
	}

	validatePosition(position) {
		return position;
	}

	offsetAt(_position) {
		return 0;
	}

	positionAt(_offset) {
		return { line: 0, character: 0 };
	}

	lineAt(_lineOrPosition) {
		return {
			lineNumber: 0,
			text: "",
			range: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 0 },
			},
			rangeIncludingLineBreak: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 0 },
			},
			firstNonWhitespaceCharacterIndex: 0,
			isEmptyOrWhitespace: true,
		};
	}
}

// Mock TimelineItem
class MockTimelineItem {
	constructor(label, timestamp) {
		this.label = label;
		this.timestamp = timestamp;
		this.id = undefined;
		this.description = undefined;
		this.iconPath = undefined;
		this.command = undefined;
	}
}

// Main VS Code API mock
const vscode = {
	// Enums
	TreeItemCollapsibleState: {
		None: 0,
		Collapsed: 1,
		Expanded: 2,
	},

	StatusBarAlignment: {
		Left: 1,
		Right: 2,
	},

	ExtensionMode: {
		Production: 0,
		Development: 1,
		Test: 2,
	},

	// Window API
	window: {
		showInformationMessage: vi.fn().mockResolvedValue(undefined),
		showWarningMessage: vi.fn().mockResolvedValue(undefined),
		showErrorMessage: vi.fn().mockResolvedValue(undefined),
		showQuickPick: vi.fn().mockResolvedValue(undefined),
		showInputBox: vi.fn().mockResolvedValue(undefined),
		showSaveDialog: vi.fn().mockResolvedValue(undefined),
		showOpenDialog: vi.fn().mockResolvedValue(undefined),
		showWorkspaceFolderPick: vi.fn().mockResolvedValue(undefined),
		setStatusBarMessage: vi.fn((_message, _hideAfterTimeout) => ({
			dispose: vi.fn(),
		})),

		createStatusBarItem: vi.fn(() => new MockStatusBarItem()),
		createOutputChannel: vi.fn(() => ({
			append: vi.fn(),
			appendLine: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		})),
		createTreeView: vi.fn((viewId, options) => ({
			viewId,
			options,
			visible: true,
			title: options.treeDataProvider?.title || "",
			message: "",
			description: "",
			selection: [],
			reveal: vi.fn(),
			dispose: vi.fn(),
			onDidChangeSelection: vi.fn(),
			onDidChangeVisibility: vi.fn(),
			onDidCollapseElement: vi.fn(),
			onDidExpandElement: vi.fn(),
		})),
		createWebviewPanel: vi.fn(() => new MockWebviewView()),
		registerTreeDataProvider: vi.fn(),
		registerWebviewViewProvider: vi.fn(),

		activeTextEditor: null,
		visibleTextEditors: [],
		terminals: [],

		onDidChangeActiveTextEditor: vi.fn(),
		onDidChangeVisibleTextEditors: vi.fn(),
		onDidChangeWindowState: vi.fn(),
		onDidChangeTextEditorSelection: vi.fn(),
		onDidChangeTextEditorViewColumn: vi.fn(),
		onDidChangeTextEditorVisibleRanges: vi.fn(),
	},

	// Workspace API
	workspace: {
		workspaceFolders: [],
		name: "Test Workspace",
		workspaceFile: null,

		getConfiguration: vi.fn((_section) => ({
			get: vi.fn((_key, defaultValue) => defaultValue),
			update: vi.fn().mockResolvedValue(undefined),
			inspect: vi.fn(() => ({})),
			has: vi.fn(() => false),
		})),

		createFileSystemWatcher: vi.fn(() => new MockFileSystemWatcher()),
		findFiles: vi.fn().mockResolvedValue([]),
		saveAll: vi.fn().mockResolvedValue(true),
		openTextDocument: vi.fn().mockResolvedValue(new MockTextDocument()),

		// Add the TimelineProvider registration function
		registerTimelineProvider: vi.fn((_selector, _provider) => ({
			dispose: vi.fn(),
		})),

		onDidChangeConfiguration: vi.fn(),
		onDidChangeWorkspaceFolders: vi.fn(),
		onDidCreateFiles: vi.fn(),
		onDidDeleteFiles: vi.fn(),
		onDidRenameFiles: vi.fn(),
		onDidSaveTextDocument: vi.fn(),
		onDidOpenTextDocument: vi.fn(),
		onDidCloseTextDocument: vi.fn(),
		onDidChangeTextDocument: vi.fn(),
		onWillSaveTextDocument: vi.fn(),
	},

	// Commands API
	commands: {
		registerCommand: vi.fn((_command, _callback) => ({
			dispose: vi.fn(),
		})),
		registerTextEditorCommand: vi.fn((_command, _callback) => ({
			dispose: vi.fn(),
		})),
		executeCommand: vi.fn().mockResolvedValue(undefined),
		getCommands: vi.fn().mockResolvedValue([]),
	},

	// Languages API
	languages: {
		registerCodeActionsProvider: vi.fn(() => ({ dispose: vi.fn() })),
		registerCompletionItemProvider: vi.fn(() => ({ dispose: vi.fn() })),
		registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
		registerDefinitionProvider: vi.fn(() => ({ dispose: vi.fn() })),
		registerDocumentFormattingEditProvider: vi.fn(() => ({
			dispose: vi.fn(),
		})),
		createDiagnosticCollection: vi.fn(() => ({
			set: vi.fn(),
			delete: vi.fn(),
			clear: vi.fn(),
			forEach: vi.fn(),
			get: vi.fn(),
			has: vi.fn(),
			dispose: vi.fn(),
		})),
	},

	// Extensions API
	extensions: {
		getExtension: vi.fn(),
		all: [],
		onDidChange: vi.fn(),
	},

	// Debug API
	debug: {
		activeDebugSession: null,
		activeDebugConsole: null,
		breakpoints: [],
		onDidChangeActiveDebugSession: vi.fn(),
		onDidStartDebugSession: vi.fn(),
		onDidReceiveDebugSessionCustomEvent: vi.fn(),
		onDidTerminateDebugSession: vi.fn(),
		onDidChangeBreakpoints: vi.fn(),
		registerDebugConfigurationProvider: vi.fn(() => ({
			dispose: vi.fn(),
		})),
		registerDebugAdapterDescriptorFactory: vi.fn(() => ({
			dispose: vi.fn(),
		})),
		startDebugging: vi.fn().mockResolvedValue(true),
		stopDebugging: vi.fn().mockResolvedValue(undefined),
		addBreakpoints: vi.fn(),
		removeBreakpoints: vi.fn(),
	},

	// Tasks API
	tasks: {
		registerTaskProvider: vi.fn(() => ({ dispose: vi.fn() })),
		fetchTasks: vi.fn().mockResolvedValue([]),
		executeTask: vi.fn().mockResolvedValue({}),
		onDidStartTask: vi.fn(),
		onDidEndTask: vi.fn(),
		onDidStartTaskProcess: vi.fn(),
		onDidEndTaskProcess: vi.fn(),
	},

	// Environment API
	env: {
		appName: "Visual Studio Code - Insiders",
		appRoot: "/test/vscode",
		language: "en",
		clipboard: {
			readText: vi.fn().mockResolvedValue(""),
			writeText: vi.fn().mockResolvedValue(undefined),
		},
		machineId: "test-machine-id",
		sessionId: "test-session-id",
		openExternal: vi.fn().mockResolvedValue(true),
		asExternalUri: vi.fn().mockResolvedValue(null),
	},

	// URI utilities
	Uri: {
		file: vi.fn((path) => ({
			scheme: "file",
			path,
			toString: () => `file://${path}`,
		})),
		parse: vi.fn((uri) => ({
			scheme: "file",
			path: uri,
			toString: () => uri,
		})),
		joinPath: vi.fn((base, ...segments) => ({
			scheme: base.scheme,
			path: `${base.path}/${segments.join("/")}`,
			toString: () => `${base.scheme}://${base.path}/${segments.join("/")}`,
		})),
	},

	// Classes and constructors
	EventEmitter: MockEventEmitter,
	TreeItem: MockTreeItem,
	TreeDataProvider: MockTreeDataProvider,
	WebviewView: MockWebviewView,
	StatusBarItem: MockStatusBarItem,
	ExtensionContext: MockExtensionContext,
	Memento: MockMemento,
	FileSystemWatcher: MockFileSystemWatcher,
	TextDocument: MockTextDocument,
	TimelineItem: MockTimelineItem,

	// Disposable
	Disposable: class {
		constructor(callback) {
			this.callback = callback;
		}
		dispose() {
			if (this.callback) {
				this.callback();
			}
		}
		static from(...disposables) {
			return new vscode.Disposable(() => {
				for (const d of disposables) {
					d.dispose();
				}
			});
		}
	},

	// Position and Range
	Position: class {
		constructor(line, character) {
			this.line = line;
			this.character = character;
		}
	},

	Range: class {
		constructor(startLine, startCharacter, endLine, endCharacter) {
			this.start = new vscode.Position(startLine, startCharacter);
			this.end = new vscode.Position(endLine, endCharacter);
		}
	},
};

// Selection (defined after vscode is fully constructed)
vscode.Selection = class extends vscode.Range {
	constructor(anchorLine, anchorCharacter, activeLine, activeCharacter) {
		super(anchorLine, anchorCharacter, activeLine, activeCharacter);
		this.anchor = new vscode.Position(anchorLine, anchorCharacter);
		this.active = new vscode.Position(activeLine, activeCharacter);
	}
};

module.exports = vscode;
