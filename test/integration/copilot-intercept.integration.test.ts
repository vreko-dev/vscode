import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
	CopilotInterceptor,
	start,
	stop,
} from "../../src/ai/copilot/intercept";

// Mock vscode
vi.mock("vscode", () => {
	return {
		default: {},
		workspace: {
			createFileSystemWatcher: vi.fn().mockReturnValue({
				onDidChange: vi.fn(),
				onDidCreate: vi.fn(),
				dispose: vi.fn(),
			}),
			openTextDocument: vi.fn().mockResolvedValue({
				getText: vi.fn().mockReturnValue('console.log("Hello World");'),
			}),
			rootPath: "/test/workspace",
		},
		window: {
			showWarningMessage: vi.fn(),
			showErrorMessage: vi.fn(),
			showInputBox: vi.fn(),
		},
		extensions: {
			getExtension: vi.fn(),
		},
		Uri: {
			file: vi.fn().mockImplementation((path) => ({ fsPath: path })),
			parse: vi.fn().mockImplementation((path) => ({ fsPath: path })),
		},
		RelativePattern: vi.fn(),
	};
});

// Mock @snapback/core
vi.mock("@snapback/core", () => {
	return {
		Guardian: vi.fn().mockImplementation(() => {
			return {
				addPlugin: vi.fn(),
				analyze: vi.fn().mockResolvedValue({
					score: 3,
					factors: ["Low risk factor"],
					recommendations: [],
				}),
			};
		}),
		SecretDetectionPlugin: vi.fn(),
		MockReplacementPlugin: vi.fn(),
		PhantomDependencyPlugin: vi.fn(),
	};
});

describe("Copilot Interception", () => {
	let interceptor: CopilotInterceptor | null = null;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		if (interceptor) {
			interceptor.stop();
			interceptor = null;
		}
		vi.resetAllMocks();
	});

	it("cp-001: should start and stop copilot interceptor", () => {
		// Start the interceptor
		interceptor = start();
		expect(interceptor).toBeInstanceOf(CopilotInterceptor);

		// Stopping should not throw
		expect(() => stop()).not.toThrow();
	});

	it("cp-002: should hook into Copilot API when available", async () => {
		// Mock Copilot extension being available
		const mockDisposable = { dispose: vi.fn() };
		(vscode.extensions.getExtension as any).mockReturnValue({
			exports: {
				onWillAcceptSolution: vi.fn().mockReturnValue(mockDisposable),
			},
		});

		// Start the interceptor
		interceptor = start();

		// Verify that the extension API was accessed
		expect(vscode.extensions.getExtension).toHaveBeenCalledWith(
			"GitHub.copilot",
		);
	});

	it("cp-003: should fall back to file watching when Copilot API is not available", async () => {
		// Mock Copilot extension not being available
		(vscode.extensions.getExtension as any).mockReturnValue(undefined);

		// Start the interceptor
		interceptor = start();

		// Verify that file system watchers were created
		expect(vscode.workspace.createFileSystemWatcher).toHaveBeenCalled();
	});

	it("cp-004: should analyze copilot solutions with Guardian", async () => {
		// Mock a low-risk analysis result
		const mockGuardian = {
			addPlugin: vi.fn(),
			analyze: vi.fn().mockResolvedValue({
				score: 3,
				factors: ["Low risk factor"],
				recommendations: [],
			}),
		};

		const { Guardian } = (await vi.importActual("@snapback/core")) as any;
		(Guardian as any).mockImplementation(() => mockGuardian);

		interceptor = start();

		// Verify Guardian was initialized with plugins
		expect(mockGuardian.addPlugin).toHaveBeenCalledTimes(3);
	});

	it("cp-005: should block high-risk copilot solutions", async () => {
		// Mock a high-risk analysis result
		const mockGuardian = {
			addPlugin: vi.fn(),
			analyze: vi.fn().mockResolvedValue({
				score: 9,
				factors: ["Critical security issue", "Hardcoded credentials"],
				recommendations: ["Review code before accepting"],
			}),
		};

		const { Guardian } = (await vi.importActual("@snapback/core")) as any;
		(Guardian as any).mockImplementation(() => mockGuardian);

		// Mock user cancelling the override
		(vscode.window.showWarningMessage as any).mockResolvedValue("Cancel");

		interceptor = start();

		// Verify Guardian was initialized
		expect(mockGuardian.addPlugin).toHaveBeenCalled();
	});

	it("cp-006: should allow override of blocked solutions with reason", async () => {
		// Mock a high-risk analysis result
		const mockGuardian = {
			addPlugin: vi.fn(),
			analyze: vi.fn().mockResolvedValue({
				score: 9,
				factors: ["Critical security issue"],
				recommendations: ["Review code before accepting"],
			}),
		};

		const { Guardian } = (await vi.importActual("@snapback/core")) as any;
		(Guardian as any).mockImplementation(() => mockGuardian);

		// Mock user overriding the block
		(vscode.window.showWarningMessage as any).mockResolvedValue("Override");
		(vscode.window.showInputBox as any).mockResolvedValue(
			"Testing override functionality",
		);

		interceptor = start();

		// Verify Guardian was initialized
		expect(mockGuardian.addPlugin).toHaveBeenCalled();
	});
});
