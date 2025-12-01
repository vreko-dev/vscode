import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { FileHealthDecorationProvider } from "../../../src/decorations/FileHealthDecorationProvider.js";
import { SaveHandler } from "../../../src/handlers/SaveHandler.js";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry.js";
import type { AnalysisResult } from "../../../src/types/api.js";

describe("SaveHandler Decoration Integration", () => {
	let saveHandler: SaveHandler;
	let registry: ProtectedFileRegistry;
	let decorationProvider: FileHealthDecorationProvider;
	let mockOperationCoordinator: any;
	let mockStorage: Map<string, any>;
	let context: vscode.ExtensionContext;
	let onWillSaveHandlers: Array<(event: any) => void>;

	beforeEach(() => {
		onWillSaveHandlers = [];

		// Create proper storage mock
		mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		registry = new ProtectedFileRegistry(mockState as any);
		decorationProvider = new FileHealthDecorationProvider();

		// Mock operation coordinator
		mockOperationCoordinator = {
			coordinateCheckpointCreation: vi.fn(
				async () => `checkpoint-${Date.now()}`,
			),
		};

		// Spy on onWillSaveTextDocument
		vi.spyOn(vscode.workspace, "onWillSaveTextDocument").mockImplementation(
			(handler: any) => {
				onWillSaveHandlers.push(handler);
				return { dispose: vi.fn() };
			},
		);
		vi.spyOn(vscode.workspace, "applyEdit").mockResolvedValue(true);
		vi.spyOn(vscode.workspace.fs, "readFile").mockResolvedValue(
			Buffer.from("/* disk snapshot */", "utf8"),
		);

		// Create context
		context = { subscriptions: [] } as any;

		// Initialize save handler with decoration provider
		saveHandler = new SaveHandler(registry, mockOperationCoordinator);
		(saveHandler as any).decorationProvider = decorationProvider;
		saveHandler.register(context);
	});

	afterEach(async () => {
		saveHandler.dispose();
		decorationProvider.dispose();
		await registry.clearAll();
		vi.restoreAllMocks();
	});

	const triggerSave = async (saveEvent: any) => {
		for (const handler of onWillSaveHandlers) {
			handler(saveEvent);
		}
		expect(saveEvent.waitUntil).toHaveBeenCalled();
		return saveEvent.waitUntil.mock.calls[0][0];
	};

	it("should update decoration to 'protected' for watch level with no risk", async () => {
		const testFilePath = "/test/workspace/watched-file.ts";

		// Mock: protected file with watch level, no risk detected
		await registry.add(testFilePath, { protectionLevel: "watch" });

		// Mock the analysis coordinator to return no risk
		const mockAnalysisResult: AnalysisResult = {
			score: 0,
			severity: "low",
			factors: [],
			recommendations: [],
			riskLevel: "low",
			riskScore: 0,
		};

		// Spy on the analysis coordinator
		vi.spyOn(
			(saveHandler as any).analysisCoordinator,
			"analyzeAndPublish",
		).mockResolvedValue({
			analysis: mockAnalysisResult,
			shouldBlock: false,
			userOverride: false,
		});

		const updateFileHealthSpy = vi.spyOn(
			decorationProvider,
			"updateFileHealth",
		);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: vi.fn().mockReturnValue("const test = 1;"),
				fileName: "watched-file.ts",
			},
			waitUntil: vi.fn(),
		};

		const promise = await triggerSave(saveEvent);
		await promise;

		// Expect: updateFileHealth called with 'protected', 'watch'
		expect(updateFileHealthSpy).toHaveBeenCalledWith(
			vscode.Uri.file(testFilePath),
			"protected",
			"watch",
		);
	});

	it("should update decoration to 'warning' for warn level", async () => {
		const testFilePath = "/test/workspace/warned-file.ts";

		// Mock: protected file with warn level
		await registry.add(testFilePath, { protectionLevel: "warn" });

		// Mock the analysis coordinator to return no risk
		const mockAnalysisResult: AnalysisResult = {
			score: 0,
			severity: "low",
			factors: [],
			recommendations: [],
			riskLevel: "low",
			riskScore: 0,
		};

		// Spy on the analysis coordinator
		vi.spyOn(
			(saveHandler as any).analysisCoordinator,
			"analyzeAndPublish",
		).mockResolvedValue({
			analysis: mockAnalysisResult,
			shouldBlock: false,
			userOverride: false,
		});

		const updateFileHealthSpy = vi.spyOn(
			decorationProvider,
			"updateFileHealth",
		);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: vi.fn().mockReturnValue("const test = 1;"),
				fileName: "warned-file.ts",
			},
			waitUntil: vi.fn(),
		};

		const promise = await triggerSave(saveEvent);
		await promise;

		// Expect: updateFileHealth called with 'warning', 'warn'
		expect(updateFileHealthSpy).toHaveBeenCalledWith(
			vscode.Uri.file(testFilePath),
			"warning",
			"warn",
		);
	});

	it("should update decoration to 'risk' for high severity (>=60)", async () => {
		const testFilePath = "/test/workspace/risky-file.ts";

		// Mock: protected file with any level
		await registry.add(testFilePath, { protectionLevel: "watch" });

		// Mock: risk detected with severity 70
		const mockAnalysisResult: AnalysisResult = {
			score: 70,
			severity: "critical",
			factors: [{ message: "High risk pattern detected" }],
			recommendations: ["Review this code carefully"],
			riskLevel: "critical",
			riskScore: 70,
		};

		// Spy on the analysis coordinator
		vi.spyOn(
			(saveHandler as any).analysisCoordinator,
			"analyzeAndPublish",
		).mockResolvedValue({
			analysis: mockAnalysisResult,
			shouldBlock: false,
			userOverride: false,
		});

		const updateFileHealthSpy = vi.spyOn(
			decorationProvider,
			"updateFileHealth",
		);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: vi.fn().mockReturnValue("const risky = 'code';"),
				fileName: "risky-file.ts",
			},
			waitUntil: vi.fn(),
		};

		const promise = await triggerSave(saveEvent);
		await promise;

		// Expect: updateFileHealth called with 'risk', level
		expect(updateFileHealthSpy).toHaveBeenCalledWith(
			vscode.Uri.file(testFilePath),
			"risk",
			"watch",
		);
	});

	it("should update decoration to 'warning' for moderate risk (30-59)", async () => {
		const testFilePath = "/test/workspace/moderate-risk-file.ts";

		// Mock: protected file
		await registry.add(testFilePath, { protectionLevel: "watch" });

		// Mock: risk detected with severity 45
		const mockAnalysisResult: AnalysisResult = {
			score: 45,
			severity: "high",
			factors: [{ message: "Moderate risk pattern detected" }],
			recommendations: ["Review this code"],
			riskLevel: "high",
			riskScore: 45,
		};

		// Spy on the analysis coordinator
		vi.spyOn(
			(saveHandler as any).analysisCoordinator,
			"analyzeAndPublish",
		).mockResolvedValue({
			analysis: mockAnalysisResult,
			shouldBlock: false,
			userOverride: false,
		});

		const updateFileHealthSpy = vi.spyOn(
			decorationProvider,
			"updateFileHealth",
		);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: vi.fn().mockReturnValue("const moderate = 'risk';"),
				fileName: "moderate-risk-file.ts",
			},
			waitUntil: vi.fn(),
		};

		const promise = await triggerSave(saveEvent);
		await promise;

		// Expect: updateFileHealth called with 'warning', level
		expect(updateFileHealthSpy).toHaveBeenCalledWith(
			vscode.Uri.file(testFilePath),
			"warning",
			"watch",
		);
	});

	it("should fire decoration update after analysis completes", async () => {
		const testFilePath = "/test/workspace/timed-file.ts";

		// Mock: protected file
		await registry.add(testFilePath, { protectionLevel: "watch" });

		// Mock: analysis result
		const mockAnalysisResult: AnalysisResult = {
			score: 20,
			severity: "medium",
			factors: [{ message: "Low risk pattern detected" }],
			recommendations: [],
			riskLevel: "medium",
			riskScore: 20,
		};

		// Spy on the analysis coordinator
		vi.spyOn(
			(saveHandler as any).analysisCoordinator,
			"analyzeAndPublish",
		).mockResolvedValue({
			analysis: mockAnalysisResult,
			shouldBlock: false,
			userOverride: false,
		});

		const updateFileHealthSpy = vi.spyOn(
			decorationProvider,
			"updateFileHealth",
		);

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(testFilePath),
				getText: vi.fn().mockReturnValue("const timed = 'code';"),
				fileName: "timed-file.ts",
			},
			waitUntil: vi.fn(),
		};

		const startTime = Date.now();
		const promise = await triggerSave(saveEvent);
		await promise;
		const endTime = Date.now();

		// Verify timing: analysis → then decoration update
		expect(updateFileHealthSpy).toHaveBeenCalled();
		expect(endTime - startTime).toBeLessThan(100); // Should complete quickly
	});
});
