import { beforeEach, describe, expect, it, vi } from "vitest";
import { OnWillSaveHandler } from "../../../src/save/onWillSave";
import { SnapBackDialogs } from "../../../src/ui/dialogs";

// Mock VS Code API
vi.mock("vscode", () => {
	const mockRange = class {
		start: any;
		end: any;

		constructor(
			startLine: number,
			startCharacter: number,
			endLine: number,
			endCharacter: number,
		) {
			this.start = { line: startLine, character: startCharacter };
			this.end = { line: endLine, character: endCharacter };
		}

		intersection(_range: any) {
			return this;
		}
	};

	return {
		window: {
			createStatusBarItem: vi.fn().mockReturnValue({
				text: "",
				backgroundColor: undefined,
				command: "",
				tooltip: undefined,
				show: vi.fn(),
				hide: vi.fn(),
				dispose: vi.fn(),
			}),
			showErrorMessage: vi.fn(),
			showInputBox: vi.fn(),
			showWarningMessage: vi.fn(),
		},
		workspace: {
			onWillSaveTextDocument: vi.fn(),
		},
		ThemeColor: vi.fn(),
		StatusBarAlignment: { Left: 1 },
		CodeAction: class {
			title: string;
			kind: any;

			constructor(title: string, kind: any) {
				this.title = title;
				this.kind = kind;
			}
		},
		CodeActionKind: {
			QuickFix: { append: vi.fn().mockReturnValue({} as any) },
		},
		Range: mockRange,
		Selection: class extends mockRange {},
		Uri: {
			file: vi.fn().mockImplementation((path) => ({
				path,
				fsPath: path,
				toString: () => `file://${path}`,
			})),
		},
		MarkdownString: vi.fn().mockImplementation(() => {
			const markdownString = {
				value: "",
				appendMarkdown: vi.fn().mockImplementation((content) => {
					markdownString.value += content;
				}),
				supportHtml: false,
				isTrusted: false,
			};
			return markdownString;
		}),
	};
});

// Mock the dialogs
vi.mock("../../../src/ui/dialogs", () => {
	return {
		SnapBackDialogs: {
			showBlockDialog: vi.fn(),
			showOverrideDialog: vi.fn(),
			showAccessibilityWarning: vi.fn(),
			createFocusTrappedDialog: vi.fn(),
		},
	};
});

describe("OnWillSaveHandler", () => {
	let onWillSaveHandler: OnWillSaveHandler;
	let mockRegistry: {
		get: ReturnType<typeof vi.fn>;
		list: ReturnType<typeof vi.fn>;
		onDidChangeProtectedFiles: ReturnType<typeof vi.fn>;
	};
	let mockContext: {
		globalState: {
			get: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		};
		workspaceState: {
			get: ReturnType<typeof vi.fn>;
			update: ReturnType<typeof vi.fn>;
		};
		subscriptions: any[];
	};

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create mock registry
		mockRegistry = {
			get: vi.fn(),
			list: vi.fn().mockResolvedValue([]),
			onDidChangeProtectedFiles: vi.fn(),
		};

		// Create mock context with proper state management
		const globalStateData: Record<string, any> = {
			"snapback.justifications": {},
			"snapback.budgetProbes": {},
		};

		mockContext = {
			globalState: {
				get: vi.fn().mockImplementation((key, defaultValue) => {
					return globalStateData[key] ?? defaultValue ?? {};
				}),
				update: vi.fn().mockImplementation((key, value) => {
					globalStateData[key] = value;
					return Promise.resolve();
				}),
			},
			workspaceState: {
				get: vi.fn().mockReturnValue([]),
				update: vi.fn().mockResolvedValue(undefined),
			},
			subscriptions: [],
		};

		onWillSaveHandler = new OnWillSaveHandler(mockRegistry, mockContext);
	});

	describe("handleWillSave", () => {
		it("UX1-E-001: should allow save for non-protected files", async () => {
			const mockDocument = {
				uri: { path: "/test.txt", fsPath: "/test.txt" },
				getText: vi.fn().mockReturnValue("test content"),
			};

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			// Mock registry to return null (not protected)
			mockRegistry.get.mockResolvedValue(null);

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// Should not call waitUntil (which would block the save)
			expect(mockEvent.waitUntil).not.toHaveBeenCalled();
		});

		it("UX1-E-002: should allow save for Watch level files", async () => {
			const mockDocument = {
				uri: { path: "/test.txt", fsPath: "/test.txt" },
				getText: vi.fn().mockReturnValue("test content"),
			};

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			// Mock registry to return Watch level protection
			mockRegistry.get.mockResolvedValue({
				protectionLevel: "Watched",
			});

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// Should not call waitUntil (which would block the save)
			expect(mockEvent.waitUntil).not.toHaveBeenCalled();
		});

		it("UX1-E-003: should block save for Protected level files with Block decision", async () => {
			// Create content that will result in a high risk score (8 or more)
			const highRiskContent = "AKIA1234567890123456"; // Valid AWS key pattern

			const mockDocument = {
				uri: { path: "/config.json", fsPath: "/config.json" },
				getText: vi.fn().mockReturnValue(highRiskContent),
			};

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			// Mock registry to return Protected level
			mockRegistry.get.mockResolvedValue({
				protectionLevel: "Protected",
			});

			// Mock showBlockDialog to return 'cancel'
			(SnapBackDialogs.showBlockDialog as any).mockResolvedValue("cancel");

			// Mock the rejection to avoid unhandled promise rejection
			const mockPromise = Promise.reject(
				new Error("Save cancelled by SnapBack protection"),
			);
			mockEvent.waitUntil.mockImplementation(() => mockPromise.catch(() => {}));

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// Should call waitUntil with a rejected promise to cancel the save
			expect(mockEvent.waitUntil).toHaveBeenCalled();
		});

		it("UX1-E-004: should allow save with snapshot for Protected level files when user chooses Create Snapshot", async () => {
			// Create content that will result in a high risk score (8 or more)
			const highRiskContent = "sk_" + "live_" + "abcdefghijklmnopqrstuvwxyzABCDEF"; // Valid Stripe key pattern (obfuscated)

			const mockDocument = {
				uri: { path: "/config.json", fsPath: "/config.json" },
				getText: vi.fn().mockReturnValue(highRiskContent),
			};

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			// Mock registry to return Protected level
			mockRegistry.get.mockResolvedValue({
				protectionLevel: "Protected",
			});

			// Mock showBlockDialog to return 'createSnapshot'
			(SnapBackDialogs.showBlockDialog as any).mockResolvedValue(
				"createSnapshot",
			);

			// Mock showOverrideDialog to return override with justification
			(SnapBackDialogs.showOverrideDialog as any).mockResolvedValue({
				action: "override",
				justification: "This is a safe change for testing",
			});

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// Should not call waitUntil with a rejected promise
			expect(mockEvent.waitUntil).not.toHaveBeenCalled();

			// Should call showOverrideDialog to collect justification
			expect(SnapBackDialogs.showOverrideDialog).toHaveBeenCalled();
		});

		it("UX1-E-005: should allow save without snapshot when user chooses Continue", async () => {
			// Create content that will result in a high risk score (8 or more)
			const highRiskContent =
				'const API_KEY = "sk-abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345";'; // Valid OpenAI key pattern

			const mockDocument = {
				uri: { path: "/config.json", fsPath: "/config.json" },
				getText: vi.fn().mockReturnValue(highRiskContent),
			};

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			// Mock registry to return Protected level
			mockRegistry.get.mockResolvedValue({
				protectionLevel: "Protected",
			});

			// Mock showBlockDialog to return 'continue'
			(SnapBackDialogs.showBlockDialog as any).mockResolvedValue("continue");

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// Should not call waitUntil with a rejected promise
			expect(mockEvent.waitUntil).not.toHaveBeenCalled();
		});

		it("UX1-E-008: should record justification when user chooses Create Snapshot & Continue", async () => {
			// Create content that will result in a high risk score (8 or more)
			const highRiskContent =
				"xoxp-123456789012-123456789012-123456789012-abcdefghijklmnopqrstuvwxyz123456"; // Valid Slack token pattern

			const mockDocument = {
				uri: {
					path: "/config.json",
					fsPath: "/config.json",
					toString: () => "file:///config.json",
				},
				getText: vi.fn().mockReturnValue(highRiskContent),
			};

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			// Mock registry to return Protected level
			mockRegistry.get.mockResolvedValue({
				protectionLevel: "Protected",
			});

			// Mock showBlockDialog to return 'createSnapshot'
			(SnapBackDialogs.showBlockDialog as any).mockResolvedValue(
				"createSnapshot",
			);

			// Mock showOverrideDialog to return override with justification
			(SnapBackDialogs.showOverrideDialog as any).mockResolvedValue({
				action: "override",
				justification: "This is a safe API key for testing purposes",
			});

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// Should record justification in global state
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"snapback.justifications",
				expect.objectContaining({
					"file:///config.json": "This is a safe API key for testing purposes",
				}),
			);
		});

		it("UX1-E-009: should record budget probes for analysis and UI actions", async () => {
			// Create content that will result in a high risk score (8 or more)
			const highRiskContent = 'password = "mysecretpassword123"'; // Password pattern

			const mockDocument = {
				uri: { path: "/config.json", fsPath: "/config.json" },
				getText: vi.fn().mockReturnValue(highRiskContent),
			};

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			// Mock registry to return Protected level
			mockRegistry.get.mockResolvedValue({
				protectionLevel: "Protected",
			});

			// Mock showBlockDialog to return 'cancel'
			(SnapBackDialogs.showBlockDialog as any).mockResolvedValue("cancel");

			// Mock the rejection to avoid unhandled promise rejection
			const mockPromise = Promise.reject(
				new Error("Save cancelled by SnapBack protection"),
			);
			mockEvent.waitUntil.mockImplementation(() => mockPromise.catch(() => {}));

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// Should record budget probes - check that update was called with budget probes
			const updateCalls = (mockContext.globalState.update as any).mock.calls;
			const budgetCalls = [];

			// Find all calls that update budget probes
			for (const call of updateCalls) {
				if (call[0] === "snapback.budgetProbes") {
					budgetCalls.push(call);
				}
			}

			// Should have at least one call for budget probes
			expect(budgetCalls.length).toBeGreaterThan(0);

			// Check that at least one call contains the expected probes
			let foundAnalysis = false;
			let foundUI = false;

			for (const call of budgetCalls) {
				const probes = call[1];
				if (probes.analysis_kickoff_ms) {
					foundAnalysis = true;
				}
				if (probes.ui_action_ms) {
					foundUI = true;
				}
			}

			expect(foundAnalysis).toBe(true);
			expect(foundUI).toBe(true);
		});
	});

	describe("getProtectionDecision", () => {
		it("UX1-E-006: should return Block decision for high-risk content", async () => {
			// Create content that will result in a high risk score (8 or more)
			const highRiskContent =
				'github_token = "ghpabcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ012345"'; // GitHub token pattern

			const mockDocument = {
				uri: { path: "/config.json", fsPath: "/config.json" },
				getText: vi.fn().mockReturnValue(highRiskContent),
			};

			mockRegistry.get.mockResolvedValue({
				protectionLevel: "Protected",
			});

			// Mock showBlockDialog to return 'cancel'
			(SnapBackDialogs.showBlockDialog as any).mockResolvedValue("cancel");

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			// Mock the rejection to avoid unhandled promise rejection
			const mockPromise = Promise.reject(
				new Error("Save cancelled by SnapBack protection"),
			);
			mockEvent.waitUntil.mockImplementation(() => mockPromise.catch(() => {}));

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// Should call showBlockDialog for high-risk content
			expect(SnapBackDialogs.showBlockDialog).toHaveBeenCalled();
		});

		it("UX1-E-007: should return Allow decision for low-risk content", async () => {
			const mockDocument = {
				uri: { path: "/readme.md", fsPath: "/readme.md" },
				getText: vi
					.fn()
					.mockReturnValue("# README\nThis is a safe readme file."),
			};

			mockRegistry.get.mockResolvedValue({
				protectionLevel: "Protected",
			});

			// For low-risk content, the decision should be 'Allow', so no dialog should be shown
			(SnapBackDialogs.showBlockDialog as any).mockResolvedValue("cancel");

			const mockEvent = {
				document: mockDocument,
				waitUntil: vi.fn(),
			};

			await onWillSaveHandler.handleWillSave(mockEvent as any);

			// For low-risk content with Protected level, we expect the decision to be 'Allow'
			// so the dialog should NOT be called
			expect(SnapBackDialogs.showBlockDialog).not.toHaveBeenCalled();
		});
	});
});
