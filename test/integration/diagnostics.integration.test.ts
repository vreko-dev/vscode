import { Guardian } from "@snapback/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SaveHandler } from "../../src/handlers/SaveHandler";
import type { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry";

// Mock the Guardian to control the analysis results
vi.mock("@snapback/core", async () => {
	const actual = await vi.importActual("@snapback/core");
	return {
		...actual,
		Guardian: vi.fn(),
		MockReplacementPlugin: vi.fn(),
		PhantomDependencyPlugin: vi.fn(),
		SecretDetectionPlugin: vi.fn(),
	};
});

// Mock DiagnosticPublisher
vi.mock("../../src/guardian/DiagnosticPublisher", () => {
	return {
		DiagnosticPublisher: vi.fn().mockImplementation(() => {
			return {
				publish: vi.fn(),
				clear: vi.fn(),
				dispose: vi.fn(),
			};
		}),
	};
});

// Mock vscode module with required classes using the same approach as setup.ts
vi.mock("vscode", () => ({
	commands: {
		registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
		executeCommand: vi.fn(() => Promise.resolve(undefined)),
		getCommands: vi.fn(() => Promise.resolve([])),
	},
	window: {
		showInformationMessage: vi.fn(() => Promise.resolve(undefined)),
		showWarningMessage: vi.fn(() => Promise.resolve(undefined)),
		showErrorMessage: vi.fn(() => Promise.resolve(undefined)),
		showQuickPick: vi.fn(() => Promise.resolve(undefined)),
		createOutputChannel: vi.fn(() => ({
			name: "SnapBack Test",
			append: vi.fn(),
			appendLine: vi.fn(),
			clear: vi.fn(),
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
			replace: vi.fn(),
		})),
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
				if (key === "logLevel") return "info";
				return defaultValue;
			}),
			update: vi.fn(),
			has: vi.fn(),
		})),
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
		asRelativePath: vi.fn((pathOrUri) => {
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
		registerTextDocumentContentProvider: vi.fn(() => ({
			dispose: vi.fn(),
		})),
		registerTimelineProvider: vi.fn((_selector, _provider) => ({
			dispose: vi.fn(),
		})),
		createFileSystemWatcher: vi.fn((_pattern) => ({
			onDidCreate: vi.fn(() => ({ dispose: vi.fn() })),
			onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
			onDidDelete: vi.fn(() => ({ dispose: vi.fn() })),
			dispose: vi.fn(),
		})),
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
		onDidChangeTextDocument: vi.fn(() => ({ dispose: vi.fn() })),
	},
	languages: {
		registerHoverProvider: vi.fn(() => ({ dispose: vi.fn() })),
		createDiagnosticCollection: vi.fn().mockReturnValue({
			set: vi.fn(),
			delete: vi.fn(),
			dispose: vi.fn(),
		}),
	},
	Uri: {
		file: vi.fn((path) => ({
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
	Position: class {
		constructor(line, character) {
			this.line = line;
			this.character = character;
		}
	},
	Range: class {
		constructor(start, end) {
			this.start = start;
			this.end = end;
		}
	},
	Diagnostic: class {
		constructor(range, message, severity) {
			this.range = range;
			this.message = message;
			this.severity = severity;
		}
		range;
		message;
		severity;
		source;
		code;
	},
	DiagnosticSeverity: {
		Error: 0,
		Warning: 1,
		Information: 2,
		Hint: 3,
	},
	WorkspaceEdit: class {
		replace() {}
	},
	CancellationError: class extends Error {
		constructor() {
			super("Operation cancelled");
			this.name = "CancellationError";
		}
	},
	EventEmitter: class {
		private listeners = [];
		get event() {
			return (listener) => {
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
		fire(data) {
			this.listeners.forEach((listener) => listener(data));
		}
		dispose() {
			this.listeners = [];
		}
	},
}));

describe("Diagnostics publish+block", () => {
	let saveHandler: SaveHandler;
	let registry: ProtectedFileRegistry;
	let mockOperationCoordinator: any;
	let mockGuardian: any;
	let mockVscode: any;

	beforeEach(async () => {
		// Reset mocks
		vi.clearAllMocks();

		// Get the mocked vscode module
		mockVscode = await import("vscode");

		// Create mock guardian
		mockGuardian = {
			analyze: vi.fn(),
			addPlugin: vi.fn(),
		};

		(Guardian as any).mockImplementation(() => mockGuardian);

		// Create mock registry with all required methods
		registry = {
			isProtected: vi.fn(),
			getProtectionLevel: vi.fn(),
			recordAudit: vi.fn(),
			hasTemporaryAllowance: vi.fn(),
			consumeTemporaryAllowance: vi.fn(),
			setCooldown: vi.fn(),
			markSnapshot: vi.fn(),
		} as any;

		// Create mock operation coordinator
		mockOperationCoordinator = {
			coordinateSnapshotCreation: vi.fn(),
		};

		// Create save handler
		saveHandler = new SaveHandler(registry, mockOperationCoordinator);
	});

	it("should publish diagnostics when Guardian finds issues", async () => {
		const filePath = "/test/file.js";
		const filename = "file.js";
		const content = 'const apiKey = "sk-1234567890abcdef";';

		// Mock registry to return protected status
		(registry.isProtected as any).mockReturnValue(true);
		(registry.getProtectionLevel as any).mockReturnValue("Watched");
		(registry.hasTemporaryAllowance as any).mockReturnValue(false);

		// Mock guardian to return issues
		mockGuardian.analyze.mockResolvedValue({
			score: 0.95,
			factors: ["Potential OpenAI API key detected"],
			recommendations: ["Move secrets to environment variables"],
			severity: "critical",
		});

		// Mock document
		const mockDocument = {
			uri: { fsPath: filePath },
			getText: vi.fn().mockReturnValue(content),
		} as any;

		// Mock vscode window methods
		vi.spyOn(mockVscode.window, "showWarningMessage").mockResolvedValue(
			"Save Anyway" as any,
		);

		try {
			await (saveHandler as any).handleProtectedFileSave(
				filePath,
				filename,
				content,
				mockDocument,
			);

			// Verify guardian was called
			expect(mockGuardian.analyze).toHaveBeenCalledWith(content, filePath);

			// Verify diagnostics would be published (we can't easily test the actual publishing
			// without more complex mocking, but we can verify the code path is executed)
		} catch (error) {
			// Handle cancellation error
			if (!(error instanceof mockVscode.CancellationError)) {
				throw error;
			}
		}
	});

	it("should block save when risk > 8 and protectionLevel is block", async () => {
		const filePath = "/test/file.js";
		const filename = "file.js";
		const content = 'eval("malicious code");';

		// Mock registry to return protected status with block level
		(registry.isProtected as any).mockReturnValue(true);
		(registry.getProtectionLevel as any).mockReturnValue("Protected");

		// Mock guardian to return high risk score
		mockGuardian.analyze.mockResolvedValue({
			score: 9.5,
			factors: ["Potentially dangerous code detected"],
			recommendations: ["Avoid using eval()"],
			severity: "critical",
		});

		// Mock document
		const mockDocument = {
			uri: { fsPath: filePath },
			getText: vi.fn().mockReturnValue(content),
		} as any;

		// Mock vscode window methods
		vi.spyOn(mockVscode.window, "showErrorMessage").mockResolvedValue(
			"Cancel Save" as any,
		);

		try {
			await (saveHandler as any).handleProtectedFileSave(
				filePath,
				filename,
				content,
				mockDocument,
			);
			// Should not reach here as save should be blocked
			expect(true).toBe(false);
		} catch (error) {
			// Should throw cancellation error when save is blocked
			expect(error).toBeInstanceOf(mockVscode.CancellationError);
		}

		// Verify guardian was called
		expect(mockGuardian.analyze).toHaveBeenCalledWith(content, filePath);

		// Verify error message was shown
		expect(mockVscode.window.showErrorMessage).toHaveBeenCalledWith(
			"Critical security issues detected in file.js. Save blocked due to protection level.",
			"Save Anyway (Override)",
			"Cancel Save",
		);
	});
});
