/**
 * VS Code mocks for SnapBack extension testing
 * Provides comprehensive mocks for VS Code API objects and functions
 */

import { vi } from "vitest";
import type * as vscode from "vscode";
import { VSCodeMockFactory } from "./vscodeHelpers";

// Create a global mock factory instance
const mockFactory = VSCodeMockFactory.getInstance();

// Mock VS Code API
const mockVSCode = {
	// Extension API
	ExtensionMode: {
		Development: 1,
		Test: 2,
		Production: 3,
	},
	ExtensionKind: {
		UI: 1,
		Workspace: 2,
	},

	// Workspace API
	workspace: {
		workspaceFolders: [] as vscode.WorkspaceFolder[] | undefined,
		name: "",
		getConfiguration: vi.fn().mockReturnValue({
			get: vi.fn(),
			has: vi.fn(),
			update: vi.fn().mockResolvedValue(undefined),
		}),
		findFiles: vi.fn().mockResolvedValue([]),
		openTextDocument: vi.fn(),
		onDidChangeConfiguration: vi.fn(),
		onDidChangeWorkspaceFolders: vi.fn(),
		onDidCreateFiles: vi.fn(),
		onDidDeleteFiles: vi.fn(),
		onDidRenameFiles: vi.fn(),
		onDidSaveTextDocument: vi.fn(),
		onDidChangeTextDocument: vi.fn(),
		textDocuments: [] as vscode.TextDocument[],
	},

	// Window API
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		createStatusBarItem: vi.fn().mockReturnValue({
			text: "",
			command: "",
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		}),
		createTreeView: vi.fn(),
		registerTreeDataProvider: vi.fn(),
		registerWebviewViewProvider: vi.fn(),
		activeTextEditor: undefined as vscode.TextEditor | undefined,
		onDidChangeActiveTextEditor: vi.fn(),
		showTextDocument: vi.fn(),
		showQuickPick: vi.fn(),
		showInputBox: vi.fn(),
		withProgress: vi.fn(),
	},

	// Commands API
	commands: {
		registerCommand: vi.fn(),
		registerTextEditorCommand: vi.fn(),
		executeCommand: vi.fn(),
		getCommands: vi.fn().mockResolvedValue([]),
	},

	// Event API
	Event: {
		None: () => ({ dispose: vi.fn() }),
	},

	// Disposable API
	Disposable: {
		from: vi.fn(),
	},

	// Uri API
	Uri: {
		file: vi.fn().mockImplementation((path) => ({
			scheme: "file",
			path,
			with: vi.fn().mockReturnThis(),
		})),
		parse: vi.fn().mockImplementation((value) => ({
			toString: () => value,
			with: vi.fn().mockReturnThis(),
		})),
	},

	// Range API
	Range: vi.fn().mockImplementation((start, end) => ({
		start,
		end,
		isEmpty: false,
		isSingleLine: true,
		contains: vi.fn().mockReturnValue(true),
		isEqual: vi.fn().mockReturnValue(true),
		intersection: vi.fn().mockReturnValue(null),
		union: vi.fn().mockReturnValue({}),
	})),

	// Position API
	Position: vi.fn().mockImplementation((line, character) => ({
		line,
		character,
		isBefore: vi.fn().mockReturnValue(false),
		isBeforeOrEqual: vi.fn().mockReturnValue(true),
		isAfter: vi.fn().mockReturnValue(false),
		isAfterOrEqual: vi.fn().mockReturnValue(true),
		isEqual: vi.fn().mockReturnValue(true),
		translate: vi.fn().mockReturnThis(),
		with: vi.fn().mockReturnThis(),
	})),

	// Selection API
	Selection: vi.fn(),

	// TextDocument API
	TextDocument: vi.fn(),

	// TextEditor API
	TextEditor: vi.fn(),

	// TreeView API
	TreeItem: vi.fn().mockImplementation(() => ({})),
	TreeView: vi.fn(),
	TreeDataProvider: vi.fn(),

	// Webview API
	WebviewView: vi.fn(),
	WebviewViewProvider: vi.fn(),

	// Progress API
	ProgressLocation: {
		SourceControl: 1,
		Window: 2,
		Notification: 3,
	},

	// EndOfLine API
	EndOfLine: {
		LF: 1,
		CRLF: 2,
	},

	// ViewColumn API
	ViewColumn: {
		One: 1,
		Two: 2,
		Three: 3,
	},

	// ThemeColor API
	ThemeColor: vi.fn(),

	// ThemeIcon API
	ThemeIcon: vi.fn(),

	// MarkdownString API
	MarkdownString: vi.fn(),

	// Diagnostic API
	Diagnostic: vi.fn(),
	DiagnosticSeverity: {
		Error: 0,
		Warning: 1,
		Information: 2,
		Hint: 3,
	},

	// CodeLens API
	CodeLens: vi.fn(),

	// Location API
	Location: vi.fn(),

	// SymbolKind API
	SymbolKind: {
		File: 0,
		Module: 1,
		Namespace: 2,
		Package: 3,
		Class: 4,
		Method: 5,
		Property: 6,
		Field: 7,
		Constructor: 8,
		Enum: 9,
		Interface: 10,
		Function: 11,
		Variable: 12,
		Constant: 13,
		String: 14,
		Number: 15,
		Boolean: 16,
		Array: 17,
		Object: 18,
		Key: 19,
		Null: 20,
		EnumMember: 21,
		Struct: 22,
		Event: 23,
		Operator: 24,
		TypeParameter: 25,
	},

	// QuickInput API
	QuickInputButtons: {
		Back: { iconPath: {} },
	},

	// FileSystem API
	workspaceFs: {
		readFile: vi.fn(),
		writeFile: vi.fn(),
		delete: vi.fn(),
		rename: vi.fn(),
		copy: vi.fn(),
		createDirectory: vi.fn(),
		readDirectory: vi.fn(),
		stat: vi.fn(),
	},

	// Authentication API
	authentication: {
		getSessions: vi.fn(),
		requestSession: vi.fn(),
		onDidChangeSessions: vi.fn(),
	},

	// SecretStorage API
	SecretStorage: vi.fn(),

	// Memento API
	Memento: vi.fn(),
};

// Export the mock factory for creating specific mocks
export { mockFactory, mockVSCode };

// Default export for easy importing
export default mockVSCode;
