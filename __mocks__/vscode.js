/**
 * Comprehensive VS Code API mock for SnapBack extension testing
 * Provides realistic mocks for all VS Code APIs used by the extension
 */

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
		return this._onDidChangeTreeData.onDidChange.bind(
			this._onDidChangeTreeData,
		);
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
			postMessage: jest.fn(),
			onDidReceiveMessage: jest.fn(),
		};
		this.visible = true;
		this.viewType = "";
		this.title = "";
		this.description = "";
		this.onDidDispose = jest.fn();
		this.onDidChangeVisibility = jest.fn();
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
		this.onDidChange = jest.fn();
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
		showInformationMessage: jest.fn().mockResolvedValue(undefined),
		showWarningMessage: jest.fn().mockResolvedValue(undefined),
		showErrorMessage: jest.fn().mockResolvedValue(undefined),
		showQuickPick: jest.fn().mockResolvedValue(undefined),
		showInputBox: jest.fn().mockResolvedValue(undefined),
		showSaveDialog: jest.fn().mockResolvedValue(undefined),
		showOpenDialog: jest.fn().mockResolvedValue(undefined),
		showWorkspaceFolderPick: jest.fn().mockResolvedValue(undefined),

		createStatusBarItem: jest.fn(() => new MockStatusBarItem()),
		createOutputChannel: jest.fn(() => ({
			append: jest.fn(),
			appendLine: jest.fn(),
			clear: jest.fn(),
			show: jest.fn(),
			hide: jest.fn(),
			dispose: jest.fn(),
		})),
		createTreeView: jest.fn((viewId, options) => ({
			viewId,
			options,
			visible: true,
			title: options.treeDataProvider?.title || "",
			message: "",
			description: "",
			selection: [],
			reveal: jest.fn(),
			dispose: jest.fn(),
			onDidChangeSelection: jest.fn(),
			onDidChangeVisibility: jest.fn(),
			onDidCollapseElement: jest.fn(),
			onDidExpandElement: jest.fn(),
		})),
		createWebviewPanel: jest.fn(() => new MockWebviewView()),
		registerTreeDataProvider: jest.fn(),
		registerWebviewViewProvider: jest.fn(),

		activeTextEditor: null,
		visibleTextEditors: [],
		terminals: [],

		onDidChangeActiveTextEditor: jest.fn(),
		onDidChangeVisibleTextEditors: jest.fn(),
		onDidChangeWindowState: jest.fn(),
		onDidChangeTextEditorSelection: jest.fn(),
		onDidChangeTextEditorViewColumn: jest.fn(),
		onDidChangeTextEditorVisibleRanges: jest.fn(),
	},

	// Workspace API
	workspace: {
		workspaceFolders: [],
		name: "Test Workspace",
		workspaceFile: null,

		getConfiguration: jest.fn((_section) => ({
			get: jest.fn((_key, defaultValue) => defaultValue),
			update: jest.fn().mockResolvedValue(undefined),
			inspect: jest.fn(() => ({})),
			has: jest.fn(() => false),
		})),

		createFileSystemWatcher: jest.fn(() => new MockFileSystemWatcher()),
		findFiles: jest.fn().mockResolvedValue([]),
		saveAll: jest.fn().mockResolvedValue(true),
		openTextDocument: jest.fn().mockResolvedValue(new MockTextDocument()),

		// Add the TimelineProvider registration function
		registerTimelineProvider: jest.fn((_selector, _provider) => ({
			dispose: jest.fn(),
		})),

		onDidChangeConfiguration: jest.fn(),
		onDidChangeWorkspaceFolders: jest.fn(),
		onDidCreateFiles: jest.fn(),
		onDidDeleteFiles: jest.fn(),
		onDidRenameFiles: jest.fn(),
		onDidSaveTextDocument: jest.fn(),
		onDidOpenTextDocument: jest.fn(),
		onDidCloseTextDocument: jest.fn(),
		onDidChangeTextDocument: jest.fn(),
		onWillSaveTextDocument: jest.fn(),
	},

	// Commands API
	commands: {
		registerCommand: jest.fn((_command, _callback) => ({
			dispose: jest.fn(),
		})),
		registerTextEditorCommand: jest.fn((_command, _callback) => ({
			dispose: jest.fn(),
		})),
		executeCommand: jest.fn().mockResolvedValue(undefined),
		getCommands: jest.fn().mockResolvedValue([]),
	},

	// Languages API
	languages: {
		registerCodeActionsProvider: jest.fn(() => ({ dispose: jest.fn() })),
		registerCompletionItemProvider: jest.fn(() => ({ dispose: jest.fn() })),
		registerHoverProvider: jest.fn(() => ({ dispose: jest.fn() })),
		registerDefinitionProvider: jest.fn(() => ({ dispose: jest.fn() })),
		registerDocumentFormattingEditProvider: jest.fn(() => ({
			dispose: jest.fn(),
		})),
		createDiagnosticCollection: jest.fn(() => ({
			set: jest.fn(),
			delete: jest.fn(),
			clear: jest.fn(),
			forEach: jest.fn(),
			get: jest.fn(),
			has: jest.fn(),
			dispose: jest.fn(),
		})),
	},

	// Extensions API
	extensions: {
		getExtension: jest.fn(),
		all: [],
		onDidChange: jest.fn(),
	},

	// Debug API
	debug: {
		activeDebugSession: null,
		activeDebugConsole: null,
		breakpoints: [],
		onDidChangeActiveDebugSession: jest.fn(),
		onDidStartDebugSession: jest.fn(),
		onDidReceiveDebugSessionCustomEvent: jest.fn(),
		onDidTerminateDebugSession: jest.fn(),
		onDidChangeBreakpoints: jest.fn(),
		registerDebugConfigurationProvider: jest.fn(() => ({
			dispose: jest.fn(),
		})),
		registerDebugAdapterDescriptorFactory: jest.fn(() => ({
			dispose: jest.fn(),
		})),
		startDebugging: jest.fn().mockResolvedValue(true),
		stopDebugging: jest.fn().mockResolvedValue(undefined),
		addBreakpoints: jest.fn(),
		removeBreakpoints: jest.fn(),
	},

	// Tasks API
	tasks: {
		registerTaskProvider: jest.fn(() => ({ dispose: jest.fn() })),
		fetchTasks: jest.fn().mockResolvedValue([]),
		executeTask: jest.fn().mockResolvedValue({}),
		onDidStartTask: jest.fn(),
		onDidEndTask: jest.fn(),
		onDidStartTaskProcess: jest.fn(),
		onDidEndTaskProcess: jest.fn(),
	},

	// Environment API
	env: {
		appName: "Visual Studio Code - Insiders",
		appRoot: "/test/vscode",
		language: "en",
		clipboard: {
			readText: jest.fn().mockResolvedValue(""),
			writeText: jest.fn().mockResolvedValue(undefined),
		},
		machineId: "test-machine-id",
		sessionId: "test-session-id",
		openExternal: jest.fn().mockResolvedValue(true),
		asExternalUri: jest.fn().mockResolvedValue(null),
	},

	// URI utilities
	Uri: {
		file: jest.fn((path) => ({
			scheme: "file",
			path,
			toString: () => `file://${path}`,
		})),
		parse: jest.fn((uri) => ({
			scheme: "file",
			path: uri,
			toString: () => uri,
		})),
		joinPath: jest.fn((base, ...segments) => ({
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
