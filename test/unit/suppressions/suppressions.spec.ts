import { beforeEach, describe, expect, it, vi } from "vitest";
import { SuppressionCodeActionsProvider } from "@vscode/suppressions/code-actions";
import { SuppressionManager } from "@vscode/suppressions/manager";

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
			// Simple mock implementation that always returns a truthy value
			return this;
		}
	};

	const mockUri = {
		toString: () => "file:///test.ts",
		fsPath: "/test.ts",
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
		},
		ThemeColor: vi.fn(),
		StatusBarAlignment: { Left: 1 },
		CodeAction: class {
			title: string;
			kind: any;
			command: any;

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
		Uri: mockUri,
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

describe("Suppressions", () => {
	let suppressionManager: SuppressionManager;
	let mockContext: any;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create mock context
		mockContext = {
			globalState: {
				get: vi.fn().mockReturnValue([]),
				update: vi.fn().mockResolvedValue(undefined),
			},
			workspaceState: {
				get: vi.fn().mockReturnValue([]),
				update: vi.fn().mockResolvedValue(undefined),
			},
		};

		suppressionManager = new SuppressionManager(mockContext);
	});

	describe("SuppressionManager", () => {
		it("should add and check line-level suppression", async () => {
			const uri = { toString: () => "file:///test.ts", fsPath: "/test.ts" };
			const line = 10;
			const content = "test content";

			// Add suppression
			await suppressionManager.addSuppression(
				"line",
				uri,
				line,
				content,
				"Test reason",
			);

			// Check if suppressed
			const isSuppressed = await suppressionManager.isSuppressed(
				"line",
				uri,
				line,
				content,
			);
			expect(isSuppressed).toBe(true);
		});

		it("should add and check file-level suppression", async () => {
			const uri = { toString: () => "file:///test.ts", fsPath: "/test.ts" };

			// Add suppression
			await suppressionManager.addSuppression("file", uri, "Test reason");

			// Check if suppressed
			const isSuppressed = await suppressionManager.isSuppressed("file", uri);
			expect(isSuppressed).toBe(true);
		});

		it("should add and check repo-level suppression", async () => {
			const pattern = "test-pattern";

			// Add suppression
			await suppressionManager.addSuppression("repo", pattern, "Test reason");

			// Check if suppressed
			const isSuppressed = await suppressionManager.isSuppressed(
				"repo",
				pattern,
			);
			expect(isSuppressed).toBe(true);
		});

		it("should expire line-level suppressions after 7 days", async () => {
			const uri = { toString: () => "file:///test.ts", fsPath: "/test.ts" };
			const line = 10;
			const content = "test content";

			// Add suppression with a timestamp from 8 days ago
			const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
			const expiredSuppression = {
				id: "line:file:///test.ts:10",
				type: "line",
				uri: "file:///test.ts",
				line,
				content,
				reason: "Test reason",
				createdAt: eightDaysAgo,
				expiresAt: eightDaysAgo + 7 * 24 * 60 * 60 * 1000,
			};

			mockContext.globalState.get.mockReturnValue([expiredSuppression]);

			// Create a new suppression manager with the expired suppression
			const newSuppressionManager = new SuppressionManager(mockContext);

			// Check if suppressed (should be false due to expiration)
			const isSuppressed = await newSuppressionManager.isSuppressed(
				"line",
				uri,
				line,
				content,
			);
			expect(isSuppressed).toBe(false);
		});

		it("should expire file-level suppressions after 30 days", async () => {
			const uri = { toString: () => "file:///test.ts", fsPath: "/test.ts" };

			// Add suppression with a timestamp from 31 days ago
			const thirtyOneDaysAgo = Date.now() - 31 * 24 * 60 * 60 * 1000;
			const expiredSuppression = {
				id: "file:file:///test.ts",
				type: "file",
				uri: "file:///test.ts",
				reason: "Test reason",
				createdAt: thirtyOneDaysAgo,
				expiresAt: thirtyOneDaysAgo + 30 * 24 * 60 * 60 * 1000,
			};

			mockContext.globalState.get.mockReturnValue([expiredSuppression]);

			// Create a new suppression manager with the expired suppression
			const newSuppressionManager = new SuppressionManager(mockContext);

			// Check if suppressed (should be false due to expiration)
			const isSuppressed = await newSuppressionManager.isSuppressed(
				"file",
				uri,
			);
			expect(isSuppressed).toBe(false);
		});

		it("should expire repo-level suppressions after 90 days", async () => {
			const pattern = "test-pattern";

			// Add suppression with a timestamp from 91 days ago
			const ninetyOneDaysAgo = Date.now() - 91 * 24 * 60 * 60 * 1000;
			const expiredSuppression = {
				id: "repo:test-pattern",
				type: "repo",
				pattern: pattern,
				reason: "Test reason",
				createdAt: ninetyOneDaysAgo,
				expiresAt: ninetyOneDaysAgo + 90 * 24 * 60 * 60 * 1000,
			};

			mockContext.globalState.get.mockReturnValue([expiredSuppression]);

			// Create a new suppression manager with the expired suppression
			const newSuppressionManager = new SuppressionManager(mockContext);

			// Check if suppressed (should be false due to expiration)
			const isSuppressed = await newSuppressionManager.isSuppressed(
				"repo",
				pattern,
			);
			expect(isSuppressed).toBe(false);
		});

		it("should remove suppressions", async () => {
			const uri = { toString: () => "file:///test.ts", fsPath: "/test.ts" };
			const line = 10;
			const content = "test content";

			// Add suppression first
			await suppressionManager.addSuppression(
				"line",
				uri,
				line,
				content,
				"Test reason",
			);

			// Verify it's suppressed
			let isSuppressed = await suppressionManager.isSuppressed(
				"line",
				uri,
				line,
				content,
			);
			expect(isSuppressed).toBe(true);

			// Remove suppression
			await suppressionManager.removeSuppression("line", uri, line);

			// Verify it's no longer suppressed
			isSuppressed = await suppressionManager.isSuppressed(
				"line",
				uri,
				line,
				content,
			);
			expect(isSuppressed).toBe(false);
		});
	});

	describe("SuppressionCodeActionsProvider", () => {
		it("should provide code actions when diagnostics are present", () => {
			const provider = new SuppressionCodeActionsProvider(suppressionManager);

			const mockDocument = {
				uri: { toString: () => "file:///test.ts", fsPath: "/test.ts" },
			} as any;

			const mockRange = {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 10 },
			};
			const mockDiagnosticRange = {
				intersection: vi.fn().mockReturnValue({}),
			};
			const mockContext = {
				diagnostics: [
					{
						range: mockDiagnosticRange,
						message: "Test diagnostic",
					},
				],
			} as any;

			const actions = provider.provideCodeActions(
				mockDocument,
				mockRange as any,
				mockContext,
				{} as any,
			);

			expect(actions).toBeDefined();
			expect(Array.isArray(actions)).toBe(true);
			expect((actions as any[]).length).toBe(3); // line, file, and repo suppressions
		});

		it("should not provide code actions when no diagnostics are present", () => {
			const provider = new SuppressionCodeActionsProvider(suppressionManager);

			const mockDocument = {
				uri: { toString: () => "file:///test.ts", fsPath: "/test.ts" },
			} as any;

			const mockRange = {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 10 },
			};
			const mockContext = {
				diagnostics: [],
			} as any;

			const actions = provider.provideCodeActions(
				mockDocument,
				mockRange as any,
				mockContext,
				{} as any,
			);

			expect(actions).toBeDefined();
			expect(Array.isArray(actions)).toBe(true);
			expect((actions as any[]).length).toBe(0);
		});
	});
});
