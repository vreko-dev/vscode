/**
 * AIDetectionToast Tests
 *
 * Tests for the AI detection toast notification.
 *
 * Philosophy: "Invisible until needed, surface when beneficial."
 * The toast INFORMS users about AI detection, it does NOT ASK questions.
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import { AIDetectionToast } from "../../../src/notifications/AIDetectionToast";
import { TelemetryService } from "../../../src/analytics/telemetry";

// Create persistent mock for telemetry
const mockTrack = vi.fn();
const mockTelemetryInstance = { track: mockTrack };

// Mock TelemetryService
vi.mock("../../../src/analytics/telemetry", () => ({
	TelemetryService: {
		isInitialized: vi.fn(() => true),
		getInstance: vi.fn(() => mockTelemetryInstance),
	},
}));

describe("AIDetectionToast", () => {
	let toast: AIDetectionToast;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		mockTrack.mockClear();
		toast = new AIDetectionToast();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	// ===========================================================================
	// SHOW TESTS - "Inform, Don't Ask" Philosophy
	// ===========================================================================

	describe("show", () => {
		it("should display informative message with 🦎 Vreko branding (no options to click)", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([{ type: "cursor", confidence: 0.8 }]);

			// Should show branded informative message - NO tool options
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"🦎 Vreko detected Cursor. Protection active."
			);
		});

		it("should show generic message when tool cannot be inferred", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([{ type: "unknown-signal", confidence: 0.8 }]);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				"🦎 Vreko: AI activity detected. Protection active."
			);
		});

		it("should not show if confidence below threshold", async () => {
			const showMessageSpy = vi.mocked(vscode.window.showInformationMessage);

			await toast.show([{ type: "burst", confidence: 0.5 }]);

			expect(showMessageSpy).not.toHaveBeenCalled();
		});

		it("should not show if confidence exactly at threshold", async () => {
			const showMessageSpy = vi.mocked(vscode.window.showInformationMessage);

			await toast.show([{ type: "burst", confidence: 0.7 }]);

			// 0.7 is NOT > 0.7, so should not show
			expect(showMessageSpy).not.toHaveBeenCalled();
		});

		it("should show if confidence above threshold", async () => {
			const showMessageSpy = vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([{ type: "burst", confidence: 0.71 }]);

			expect(showMessageSpy).toHaveBeenCalled();
		});

		it("should use max confidence from multiple signals", async () => {
			const showMessageSpy = vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([
				{ type: "burst", confidence: 0.3 },
				{ type: "pattern", confidence: 0.9 },
				{ type: "timing", confidence: 0.5 },
			]);

			// Max is 0.9, which is > 0.7, so should show
			expect(showMessageSpy).toHaveBeenCalled();
		});

		it("should not show if already shown this session", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Cursor" as any);

			await toast.show([{ type: "burst", confidence: 0.8 }]);
			await toast.show([{ type: "burst", confidence: 0.9 }]);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});

		it("should respect cooldown period", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Reset session state but not cooldown
			toast.resetSession();

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Should still be blocked by cooldown
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});

		it("should allow show after cooldown expires", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Advance past cooldown (30 seconds)
			vi.advanceTimersByTime(31000);

			// Reset session state
			toast.resetSession();

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
		});

		it("should return selected tool", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			const result = await toast.show([{ type: "claude", confidence: 0.8 }]);

			// Returns inferred tool (no user selection needed)
			expect(result).toBe("Claude");
		});

		it("should return undefined if not shown (below threshold)", async () => {
			const result = await toast.show([{ type: "burst", confidence: 0.5 }]);

			expect(result).toBeUndefined();
		});

		it("should handle empty signals array", async () => {
			const showMessageSpy = vi.mocked(vscode.window.showInformationMessage);

			await toast.show([]);

			expect(showMessageSpy).not.toHaveBeenCalled();
		});
	});

	// ===========================================================================
	// SESSION RESET TESTS
	// ===========================================================================

	describe("resetSession", () => {
		it("should allow showing toast again after reset (with cooldown passed)", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Cursor" as any);

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Advance past cooldown
			vi.advanceTimersByTime(31000);

			toast.resetSession();

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
		});

		it("should not reset cooldown timer", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Advance only 10 seconds (not past cooldown)
			vi.advanceTimersByTime(10000);

			toast.resetSession();

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Should still be blocked by cooldown (only 10s passed)
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});
	});

	// ===========================================================================
	// TELEMETRY TESTS
	// ===========================================================================

	describe("telemetry", () => {
		it("should track detection with inferred tool", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([
				{ type: "copilot", confidence: 0.8 },
				{ type: "pattern", confidence: 0.9 },
			]);

			expect(mockTrack).toHaveBeenCalledWith("ai_detection", {
				detected_signals: [
					{ type: "copilot", confidence: 0.8 },
					{ type: "pattern", confidence: 0.9 },
				],
				inferred_tool: "Copilot",
			});
		});

		it("should always track when toast is shown (no user interaction needed)", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Now we always track (no user interaction needed)
			expect(mockTrack).toHaveBeenCalledWith("ai_detection", expect.objectContaining({
				inferred_tool: "Other",
			}));
		});

		it("should handle telemetry service not initialized", async () => {
			vi.mocked(TelemetryService.isInitialized).mockReturnValue(false);
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// Should not throw, returns inferred tool
			const result = await toast.show([{ type: "cursor", confidence: 0.8 }]);
			expect(result).toBe("Cursor");
		});
	});

	// ===========================================================================
	// EDGE CASES
	// ===========================================================================

	describe("edge cases", () => {
		it("should infer all supported tools correctly", async () => {
			const toolMappings = [
				{ signal: "cursor", expected: "Cursor" },
				{ signal: "copilot", expected: "Copilot" },
				{ signal: "claude", expected: "Claude" },
				{ signal: "windsurf", expected: "Windsurf" },
				{ signal: "github-copilot", expected: "Copilot" },
				{ signal: "cursor-ai", expected: "Cursor" },
				{ signal: "unknown", expected: "Other" },
			];

			for (const { signal, expected } of toolMappings) {
				const newToast = new AIDetectionToast();
				vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

				const result = await newToast.show([{ type: signal, confidence: 0.8 }]);

				expect(result).toBe(expected);
			}
		});

		it("should mark as shown immediately (no user selection required)", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			// First call shows toast
			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Second call should NOT show (hasShownThisSession is true)
			await toast.show([{ type: "burst", confidence: 0.9 }]);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});
	});
});
