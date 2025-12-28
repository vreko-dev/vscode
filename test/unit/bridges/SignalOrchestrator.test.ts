/**
 * SignalOrchestrator Tests - TDD Red Phase
 *
 * Unit tests for SignalOrchestrator - the signal computation layer that
 * orchestrates complexity, cycles, phantom-deps, threats, velocity, and
 * risk-score signals for the VS Code extension.
 *
 * Following TDD Red-Green-Refactor cycle:
 * 1. RED: Write failing tests ← Current
 * 2. GREEN: Write minimal code to pass tests
 * 3. REFACTOR: Clean up while keeping tests green
 *
 * @see apps/vscode/src/integration/INTELLIGENCE_INTEGRATION_PLAN.md Task 6
 * @see packages/engine/src/signals/
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock the engine signal modules
vi.mock("@snapback/engine/signals", () => ({
	calculateComplexityAggregate: vi.fn().mockReturnValue({
		avgComplexity: 0.45,
		maxComplexity: 0.72,
		highComplexityFiles: ["src/bigFile.ts"],
		fileCount: 3,
		value: 0.45,
	}),
	calculateRiskScore: vi.fn().mockReturnValue({
		score: 3.5,
		factors: ["Sensitive file: .env", "High complexity: src/bigFile.ts"],
	}),
	isSensitiveFile: vi.fn().mockImplementation((path: string) => {
		return path.includes(".env") || path.includes("secret");
	}),
	detectTriggers: vi.fn().mockReturnValue([]),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import after mocks are set up
import {
	disposeSignalOrchestrator,
	getSignalOrchestrator,
	SignalOrchestrator,
	type FileForSignals,
	type SignalOrchestratorResult,
} from "../../../src/bridges/SignalOrchestrator";
import type { SignalAggregator } from "../../../src/domain/signalAggregator";

// Get mock functions for test access
const mockCalculateComplexityAggregate = vi.mocked(
	(await import("@snapback/engine/signals")).calculateComplexityAggregate
);
const mockCalculateRiskScore = vi.mocked(
	(await import("@snapback/engine/signals")).calculateRiskScore
);
const mockIsSensitiveFile = vi.mocked(
	(await import("@snapback/engine/signals")).isSensitiveFile
);

describe("SignalOrchestrator", () => {
	let orchestrator: SignalOrchestrator;

	beforeEach(() => {
		vi.clearAllMocks();
		// Re-apply default mock return values after clearAllMocks
		mockCalculateComplexityAggregate.mockReturnValue({
			avgComplexity: 0.45,
			maxComplexity: 0.72,
			highComplexityFiles: ["src/bigFile.ts"],
			fileCount: 3,
			value: 0.45,
		});
		mockCalculateRiskScore.mockReturnValue({
			score: 3.5,
			factors: ["Sensitive file: .env", "High complexity: src/bigFile.ts"],
		});
		mockIsSensitiveFile.mockImplementation((path: string) => {
			return path.includes(".env") || path.includes("secret");
		});
		// Reset singleton between tests
		disposeSignalOrchestrator();
	});

	afterEach(() => {
		disposeSignalOrchestrator();
	});

	describe("Initialization", () => {
		it("should create an instance", () => {
			orchestrator = new SignalOrchestrator();
			expect(orchestrator).toBeDefined();
		});
	});

	describe("Singleton Pattern", () => {
		it("should return same instance from getSignalOrchestrator", () => {
			const instance1 = getSignalOrchestrator();
			const instance2 = getSignalOrchestrator();
			expect(instance1).toBe(instance2);
		});

		it("should reset singleton after disposeSignalOrchestrator", () => {
			const instance1 = getSignalOrchestrator();
			disposeSignalOrchestrator();
			const instance2 = getSignalOrchestrator();
			expect(instance1).not.toBe(instance2);
		});
	});

	describe("computeSignals", () => {
		const sampleFiles: FileForSignals[] = [
			{
				path: "src/index.ts",
				content: "const x = 1; function foo() { return x; }",
				lineCount: 50,
			},
			{
				path: ".env",
				content: "API_KEY=secret123",
				lineCount: 5,
			},
			{
				path: "src/bigFile.ts",
				content: "// complex file with many functions\n".repeat(100),
				lineCount: 500,
			},
		];

		it("should return SignalOrchestratorResult with all fields", () => {
			orchestrator = new SignalOrchestrator();

			const result = orchestrator.computeSignals(sampleFiles);

			expect(result).toHaveProperty("riskScore");
			expect(result).toHaveProperty("complexity");
			expect(result).toHaveProperty("factors");
			expect(result).toHaveProperty("sensitiveFiles");
			expect(result).toHaveProperty("threatCount");
		});

		it("should compute risk score between 0 and 10", () => {
			orchestrator = new SignalOrchestrator();

			const result = orchestrator.computeSignals(sampleFiles);

			expect(result.riskScore).toBeGreaterThanOrEqual(0);
			expect(result.riskScore).toBeLessThanOrEqual(10);
		});

		it("should compute complexity between 0 and 1", () => {
			orchestrator = new SignalOrchestrator();

			const result = orchestrator.computeSignals(sampleFiles);

			expect(result.complexity).toBeGreaterThanOrEqual(0);
			expect(result.complexity).toBeLessThanOrEqual(1);
		});

		it("should identify sensitive files", () => {
			orchestrator = new SignalOrchestrator();

			const result = orchestrator.computeSignals(sampleFiles);

			expect(result.sensitiveFiles).toContain(".env");
		});

		it("should return factors array", () => {
			orchestrator = new SignalOrchestrator();

			const result = orchestrator.computeSignals(sampleFiles);

			expect(Array.isArray(result.factors)).toBe(true);
		});

		it("should handle empty file array", () => {
			orchestrator = new SignalOrchestrator();

			const result = orchestrator.computeSignals([]);

			expect(result.riskScore).toBe(0);
			expect(result.complexity).toBe(0);
			expect(result.sensitiveFiles).toEqual([]);
			expect(result.factors).toEqual([]);
			expect(result.threatCount).toBe(0);
		});

		it("should handle files without content", () => {
			orchestrator = new SignalOrchestrator();

			const filesWithNoContent: FileForSignals[] = [
				{ path: "empty.ts", content: "", lineCount: 0 },
			];

			const result = orchestrator.computeSignals(filesWithNoContent);

			expect(result).toBeDefined();
			expect(result.riskScore).toBeGreaterThanOrEqual(0);
		});
	});

	describe("populateAggregator", () => {
		const sampleFiles: FileForSignals[] = [
			{
				path: "src/index.ts",
				content: "const x = 1;",
				lineCount: 10,
			},
		];

		it("should populate SignalAggregator with risk signal", () => {
			orchestrator = new SignalOrchestrator();
			const mockAggregator = {
				setRiskSignal: vi.fn(),
				setCriticalFileSignal: vi.fn(),
			} as unknown as SignalAggregator;

			orchestrator.populateAggregator(mockAggregator, sampleFiles);

			expect(mockAggregator.setRiskSignal).toHaveBeenCalledWith(
				expect.objectContaining({
					score: expect.any(Number),
					factors: expect.any(Array),
				})
			);
		});

		it("should populate SignalAggregator with critical file signal", () => {
			orchestrator = new SignalOrchestrator();
			const mockAggregator = {
				setRiskSignal: vi.fn(),
				setCriticalFileSignal: vi.fn(),
			} as unknown as SignalAggregator;

			orchestrator.populateAggregator(mockAggregator, sampleFiles);

			expect(mockAggregator.setCriticalFileSignal).toHaveBeenCalledWith(
				expect.objectContaining({
					detected: expect.any(Boolean),
					count: expect.any(Number),
				})
			);
		});

		it("should detect critical files when sensitive files present", () => {
			orchestrator = new SignalOrchestrator();
			const filesWithSensitive: FileForSignals[] = [
				{ path: ".env", content: "SECRET=123", lineCount: 1 },
			];
			const mockAggregator = {
				setRiskSignal: vi.fn(),
				setCriticalFileSignal: vi.fn(),
			} as unknown as SignalAggregator;

			orchestrator.populateAggregator(mockAggregator, filesWithSensitive);

			expect(mockAggregator.setCriticalFileSignal).toHaveBeenCalledWith(
				expect.objectContaining({
					detected: true,
					count: 1,
				})
			);
		});

		it("should handle empty files array", () => {
			orchestrator = new SignalOrchestrator();
			const mockAggregator = {
				setRiskSignal: vi.fn(),
				setCriticalFileSignal: vi.fn(),
			} as unknown as SignalAggregator;

			// Should not throw
			orchestrator.populateAggregator(mockAggregator, []);

			expect(mockAggregator.setRiskSignal).toHaveBeenCalled();
		});
	});

	describe("Performance Constraints", () => {
		it("should complete signal computation in under 100ms", () => {
			orchestrator = new SignalOrchestrator();
			const largeFileSet: FileForSignals[] = Array.from({ length: 10 }, (_, i) => ({
				path: `src/file${i}.ts`,
				content: `const x${i} = ${i}; function foo${i}() { return x${i}; }`.repeat(50),
				lineCount: 100,
			}));

			const startTime = Date.now();
			orchestrator.computeSignals(largeFileSet);
			const duration = Date.now() - startTime;

			// Per CLAUDE.md: Save latency <100ms
			expect(duration).toBeLessThan(100);
		});
	});

	describe("Disposal", () => {
		it("should dispose cleanly", () => {
			orchestrator = getSignalOrchestrator();
			disposeSignalOrchestrator();

			// Getting new instance should work
			const newInstance = getSignalOrchestrator();
			expect(newInstance).toBeDefined();
		});
	});
});
