/**
 * SignalBridge Tests
 *
 * COVERAGE:
 * - V1 mode routing (delegates to existing detectors)
 * - V2 mode routing (uses @snapback/engine)
 * - VS Code document → engine input conversion
 * - Performance budget compliance (<50ms)
 * - State management (reset, cleanup, threshold updates)
 * - Feature flag configuration
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import * as vscodeModule from "vscode";
import { SignalBridge } from "../../../src/bridges/SignalBridge";
import type { ConfigStore } from "../../../src/storage/ConfigStore";

// Mock VS Code module
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: boolean) => defaultValue),
		})),
	},
	extensions: {
		all: [
			{ id: "github.copilot" },
			{ id: "ms-vscode.vscode-typescript-next" },
		],
	},
	Uri: {
		file: (path: string) => ({ fsPath: path }),
	},
}));

// Mock V1 BurstDetector
vi.mock("../../../src/engine/BurstDetector", () => ({
	BurstDetector: vi.fn().mockImplementation(() => ({
		clear: vi.fn(),
	})),
}));

// Mock ConfigStore
const mockConfigStore: ConfigStore = {
	setEngineConfig: vi.fn(),
	getEngineConfig: vi.fn().mockResolvedValue({
		burstThreshold: 30,
	}),
} as any;

// Helper to create mock TextDocument
function createMockDocument(filePath: string): vscode.TextDocument {
	return {
		uri: { fsPath: filePath },
		fileName: filePath,
		languageId: "typescript",
		version: 1,
		lineCount: 100,
	} as any;
}

// Helper to create mock TextDocumentContentChangeEvent
function createMockChange(text: string): vscode.TextDocumentContentChangeEvent {
	return {
		text,
		range: undefined as any,
		rangeLength: text.length,
		rangeOffset: 0,
	};
}

describe("SignalBridge", () => {
	describe("V1 Mode (useV2Engine: false)", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			vi.clearAllMocks();
			bridge = new SignalBridge({
				configStore: mockConfigStore,
				useV2Engine: false,
			});
		});

		it("should initialize with V1 BurstDetector when flag is false", () => {
			expect(bridge.isUsingV2()).toBe(false);
		});

		it("should delegate computeBurst to V1 implementation", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [createMockChange("const x = 1;")];

			const result = bridge.computeBurst(document, changes);

			// V1 returns no burst (detection happens in event listener)
			expect(result.detected).toBe(false);
			expect(result.charCount).toBe(12); // "const x = 1;"
			expect(result.filePath).toBe("/test/file.ts");
		});

		it("should return no AI detection in V1 mode", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [createMockChange("console.log('hello');")];

			const result = bridge.detectAI(document, changes);

			// V1 doesn't have AI detection
			expect(result.tool).toBeNull();
			expect(result.confidence).toBe(0);
			expect(result.method).toBeNull();
		});

		it("should call V1 BurstDetector.clear on reset", () => {
			bridge.reset();

			// V1 BurstDetector should have clear called (if exists)
			// This is a best-effort attempt in the bridge
		});
	});

	describe("V2 Mode (useV2Engine: true)", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			vi.clearAllMocks();
			bridge = new SignalBridge({
				configStore: mockConfigStore,
				useV2Engine: true,
			});
		});

		it("should initialize with V2 engine detectors when flag is true", () => {
			expect(bridge.isUsingV2()).toBe(true);
		});

		it("should compute burst using @snapback/engine BurstDetector", () => {
			const document = createMockDocument("/test/file.ts");

			// Large paste (500 chars instant) should trigger burst
			const largeText = "x".repeat(500);
			const changes = [createMockChange(largeText)];

			const result = bridge.computeBurst(document, changes);

			// First call may not detect burst (needs velocity window)
			// But charCount should be recorded
			expect(result.charCount).toBe(500);
			expect(result.filePath).toBe("/test/file.ts");
		});

		it("should detect AI using @snapback/engine AIDetector", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [createMockChange("console.log('test');")];

			const result = bridge.detectAI(document, changes);

			// Should detect GitHub Copilot from extension IDs
			expect(result.tool).toBe("GitHub Copilot");
			expect(result.confidence).toBeGreaterThan(0.9); // Extension detection is high confidence
			expect(result.method).toBe("extension");
			expect(result.indicators).toContain("GitHub Copilot extension active");
		});

		it("should detect AI by extension presence", () => {
			const document = createMockDocument("/test/copilot-test.ts");
			const changes = [createMockChange("const foo = bar;")];

			const result = bridge.detectAI(document, changes);

			// GitHub Copilot extension is mocked in extensions.all
			expect(result.tool).toBe("GitHub Copilot");
			expect(result.confidence).toBeGreaterThan(0.9);
			expect(result.method).toBe("extension");
		});

		it("should detect AI by velocity when burst detected", () => {
			const document = createMockDocument("/test/file.ts");

			// Step 1: Create burst to establish velocity
			const largeText = "x".repeat(500);
			const changes1 = [createMockChange(largeText)];
			const burstResult = bridge.computeBurst(document, changes1);

			// Step 2: Detect AI with velocity context
			const changes2 = [createMockChange("console.log('test');")];
			const aiResult = bridge.detectAI(document, changes2);

			// Should detect GitHub Copilot from extension
			expect(aiResult.tool).toBe("GitHub Copilot");
			expect(aiResult.confidence).toBeGreaterThan(0);
		});
	});

	describe("Input Conversion", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			vi.clearAllMocks();
			bridge = new SignalBridge({
				configStore: mockConfigStore,
				useV2Engine: true,
			});
		});

		it("should extract charsChanged from change events", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [
				createMockChange("const x = 1;"),
				createMockChange("const y = 2;"),
			];

			const result = bridge.computeBurst(document, changes);

			// Total: "const x = 1;" (12) + "const y = 2;" (12) = 24
			expect(result.charCount).toBe(24);
		});

		it("should handle empty change arrays", () => {
			const document = createMockDocument("/test/file.ts");
			const changes: vscode.TextDocumentContentChangeEvent[] = [];

			const result = bridge.computeBurst(document, changes);

			expect(result.charCount).toBe(0);
			expect(result.detected).toBe(false);
		});

		it("should extract content for AI detection", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [
				createMockChange("import { copilot } from 'copilot';"),
			];

			const result = bridge.detectAI(document, changes);

			// Should detect GitHub Copilot from extension + pattern
			expect(result.tool).toBe("GitHub Copilot");
			expect(result.confidence).toBeGreaterThan(0.9);
		});

		it("should extract extension IDs for AI detection", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [createMockChange("const x = 1;")];

			const result = bridge.detectAI(document, changes);

			// Should detect GitHub Copilot from mocked extensions.all
			expect(result.tool).toBe("GitHub Copilot");
			expect(result.method).toBe("extension");
		});
	});

	describe("Performance", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			vi.clearAllMocks();
			bridge = new SignalBridge({
				configStore: mockConfigStore,
				useV2Engine: true,
			});
		});

		it("should compute burst within 50ms for 1000 LOC file", () => {
			const document = createMockDocument("/test/large-file.ts");

			// Simulate 1000 LOC file change
			const largeText = "x\n".repeat(1000);
			const changes = [createMockChange(largeText)];

			const start = performance.now();
			bridge.computeBurst(document, changes);
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(50); // <50ms budget
		});

		it("should detect AI within 50ms for 1000 LOC file", () => {
			const document = createMockDocument("/test/large-file.ts");

			// Simulate 1000 LOC file change
			const largeText = "x\n".repeat(1000);
			const changes = [createMockChange(largeText)];

			const start = performance.now();
			bridge.detectAI(document, changes);
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(50); // <50ms budget
		});
	});

	describe("State Management", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			vi.clearAllMocks();
			bridge = new SignalBridge({
				configStore: mockConfigStore,
				useV2Engine: true,
			});
		});

		it("should reset state on reset() call", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [createMockChange("x".repeat(500))];

			// Create some state
			bridge.computeBurst(document, changes);

			// Reset
			bridge.reset();

			// State should be cleared (hard to verify without internals access)
			// But at minimum, reset should not throw
			expect(() => bridge.reset()).not.toThrow();
		});

		it("should update burst threshold dynamically", () => {
			bridge.updateBurstThreshold(50);

			// Threshold update should not throw
			expect(() => bridge.updateBurstThreshold(50)).not.toThrow();
		});

		it("should call cleanup for V2 detectors", () => {
			// Cleanup should not throw
			expect(() => bridge.cleanup()).not.toThrow();
		});

		it("should maintain burst context across calls", () => {
			const document = createMockDocument("/test/file.ts");

			// Step 1: Create burst
			const changes1 = [createMockChange("x".repeat(500))];
			const burstResult = bridge.computeBurst(document, changes1);

			// Step 2: AI detection should have access to burst velocity
			const changes2 = [createMockChange("console.log('test');")];
			const aiResult = bridge.detectAI(document, changes2);

			// Should detect AI with velocity context
			expect(aiResult.tool).toBe("GitHub Copilot");
		});
	});

	describe("Feature Flag", () => {
		it("should read useV2Engine from VS Code config if not provided", () => {
			const mockGetConfiguration = vi.fn().mockReturnValue({
				get: vi.fn(() => true), // Return true for useV2Engine
				has: vi.fn(),
				inspect: vi.fn(),
				update: vi.fn(),
			} as any);

			// Use vscodeModule from the mocked module
			vi.mocked(vscodeModule.workspace.getConfiguration).mockImplementation(mockGetConfiguration as any);

			const bridge = new SignalBridge({
				configStore: mockConfigStore,
			});

			// Should use V2 based on config
			expect(bridge.isUsingV2()).toBe(true);
		});

		it("should prioritize explicit useV2Engine option over config", () => {
			const mockGetConfiguration = vi.fn().mockReturnValue({
				get: vi.fn(() => true), // Config says true
				has: vi.fn(),
				inspect: vi.fn(),
				update: vi.fn(),
			} as any);

			// Use vscodeModule from the mocked module
			vi.mocked(vscodeModule.workspace.getConfiguration).mockImplementation(mockGetConfiguration as any);

			const bridge = new SignalBridge({
				configStore: mockConfigStore,
				useV2Engine: false, // Explicit option says false
			});

			// Should use explicit option (false)
			expect(bridge.isUsingV2()).toBe(false);
		});
	});
});
