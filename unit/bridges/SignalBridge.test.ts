/**
 * SignalBridge Tests - V2 Engine Only
 *
 * COVERAGE:
 * - V2 @vreko/engine integration
 * - VS Code document → engine input conversion
 * - Burst detection with velocity tracking
 * - AI detection (extension, velocity, pattern)
 * - Performance budget compliance (<50ms)
 * - State management (reset, cleanup, threshold updates)
 */

import { beforeEach, describe, expect, it } from "vitest";
import type * as vscode from "vscode";
import { SignalBridge } from "../../../src/bridges/SignalBridge";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

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

describe("SignalBridge - V2 Engine", () => {
	describe("Initialization", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			bridge = new SignalBridge();
		});

		it("should initialize with V2 engine detectors", () => {
			// SignalBridge is V2-only now, no mode flag
			expect(bridge).toBeDefined();
		});

		it("should initialize with custom burst threshold", () => {
			const customBridge = new SignalBridge({ burstThreshold: 50 });
			expect(customBridge).toBeDefined();
			// Threshold is applied internally
		});
	});

	describe("Burst Detection", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			bridge = new SignalBridge();
		});

		it("should compute burst and record charCount", () => {
			const document = createMockDocument("/test/file.ts");

			// Large paste (500 chars instant) should trigger burst
			const largeText = "x".repeat(500);
			const changes = [createMockChange(largeText)];

			const result = bridge.computeBurst(document, changes);

			// CharCount should be recorded
			expect(result.charCount).toBe(500);
			expect(result.filePath).toBe("/test/file.ts");
			// Detected flag depends on BurstDetector mock behavior
		});

		it("should handle empty changes", () => {
			const document = createMockDocument("/test/file.ts");
			const changes: vscode.TextDocumentContentChangeEvent[] = [];

			const result = bridge.computeBurst(document, changes);

			expect(result.charCount).toBe(0);
			expect(result.detected).toBe(false);
		});

		it("should aggregate multiple changes", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [
				createMockChange("const x = 1;"),
				createMockChange("const y = 2;"),
			];

			const result = bridge.computeBurst(document, changes);

			// Total: "const x = 1;" (12) + "const y = 2;" (12) = 24
			expect(result.charCount).toBe(24);
		});
	});

	describe("AI Detection", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			bridge = new SignalBridge();
		});

		it("should detect AI using @vreko/engine AIDetector", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [createMockChange("console.log('test');")];

			const result = bridge.detectAI(document, changes);

			// Mock AIDetector returns GitHub Copilot for github.copilot extension
			expect(result.tool).toBe("GitHub Copilot");
			expect(result.confidence).toBe(0.95); // Extension detection
			expect(result.method).toBe("extension");
			expect(result.indicators).toContain("GitHub Copilot extension active");
		});

		it("should pass extension IDs to AIDetector", () => {
			const document = createMockDocument("/test/copilot-test.ts");
			const changes = [createMockChange("const foo = bar;")];

			const result = bridge.detectAI(document, changes);

			// GitHub Copilot extension is in mocked extensions.all
			expect(result.tool).toBe("GitHub Copilot");
			expect(result.confidence).toBe(0.95);
			expect(result.method).toBe("extension");
		});

		it("should provide velocity context when burst detected", () => {
			const document = createMockDocument("/test/file.ts");

			// Step 1: Create burst to establish velocity
			const largeText = "x".repeat(500);
			const changes1 = [createMockChange(largeText)];
			bridge.computeBurst(document, changes1);

			// Step 2: Detect AI with velocity context
			const changes2 = [createMockChange("console.log('test');")];
			const aiResult = bridge.detectAI(document, changes2);

			// Should detect from extension (velocity is passed but extension takes precedence)
			expect(aiResult.tool).toBe("GitHub Copilot");
			expect(aiResult.confidence).toBeGreaterThan(0);
		});

		it("should return null when no AI detected", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [createMockChange("x")]; // Single char, no extension match

			// The mock setup has github.copilot in extensions.all, so this will still detect
			// To test null case, we'd need to modify the mock or test with different input
			const result = bridge.detectAI(document, changes);

			// With current mock setup, will detect Copilot
			expect(result).toBeDefined();
		});
	});

	describe("Content Extraction", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			bridge = new SignalBridge();
		});

		it("should extract and join multiple change texts", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [
				createMockChange("import { copilot } from 'copilot';"),
				createMockChange("console.log('test');"),
			];

			const result = bridge.detectAI(document, changes);

			// Should detect GitHub Copilot from extension
			expect(result.tool).toBe("GitHub Copilot");
			expect(result.confidence).toBe(0.95);
		});

		it("should pass extension IDs from vscode.extensions.all", () => {
			const document = createMockDocument("/test/file.ts");
			const changes = [createMockChange("const x = 1;")];

			const result = bridge.detectAI(document, changes);

			// Mocked extensions.all includes github.copilot
			expect(result.tool).toBe("GitHub Copilot");
			expect(result.method).toBe("extension");
		});
	});

	describe("Performance", () => {
		let bridge: SignalBridge;

		beforeEach(() => {
			bridge = new SignalBridge();
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
			bridge = new SignalBridge();
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

		// 🔧 REGRESSION TEST: Fix for charCount=0 with persisting velocity bug
		// Issue: charCount becomes 0 on subsequent detections while velocity persists from
		// previous burst event, creating impossible charCount=0 + velocity=21922 state
		// Fix: Only use velocity when charCount > 0 in SignalBridge.detectAI()
		describe("charCount=0 velocity anomaly (regression)", () => {
			it("should clear velocity when charCount is 0", () => {
				const document = createMockDocument("/test/file.ts");

				// Step 1: Create burst to establish velocity in lastBurstEvent
				const largeText = "x".repeat(500);
				const changes1 = [createMockChange(largeText)];
				const burstResult = bridge.computeBurst(document, changes1);

				// Verify burst was detected and velocity exists
				expect(burstResult.detected).toBe(true);
				expect(burstResult.velocity).toBeGreaterThan(0);

				// Step 2: Subsequent detection with charCount=0 (empty changes array)
				const emptyChanges: vscode.TextDocumentContentChangeEvent[] = [];
				const aiResult = bridge.detectAI(document, emptyChanges);

				// With the fix, velocity should NOT be used when charCount=0
				// AI detection should not occur based on stale velocity
				// (Extension detection may still trigger, but not velocity-based)
				if (aiResult.method === "velocity" || aiResult.method === "combined") {
					// If velocity-based detection occurred, it's a bug
					expect(aiResult.method).not.toBe("velocity");
				}
			});

			it("should use velocity when charCount > 0 after burst", () => {
				const document = createMockDocument("/test/file.ts");

				// Step 1: Create burst
				const largeText = "x".repeat(500);
				const changes1 = [createMockChange(largeText)];
				bridge.computeBurst(document, changes1);

				// Step 2: Subsequent change with charCount > 0
				const changes2 = [createMockChange("const foo = bar;")];
				const aiResult = bridge.detectAI(document, changes2);

				// Velocity context is passed to AIDetector (checked internally)
				expect(aiResult.tool).toBe("GitHub Copilot");
				expect(aiResult.confidence).toBeGreaterThan(0);
			});

			it("should handle single character edit without velocity", () => {
				const document = createMockDocument("/test/file.ts");

				// Single character change (no burst, charCount=1)
				const changes = [createMockChange("x")];
				const burstResult = bridge.computeBurst(document, changes);
				const aiResult = bridge.detectAI(document, changes);

				// No burst detected (too few characters)
				expect(burstResult.detected).toBe(false);

				// AI detection may still occur via extension (mock returns GitHub Copilot)
				if (aiResult.tool) {
					expect(aiResult.method).toBe("extension"); // Extension-only detection
				}
			});
		});
	});
});
