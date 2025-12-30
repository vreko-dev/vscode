/**
 * AIDetectionToast Tests
 *
 * Tests for the AI detection toast notification.
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
	// SHOW TESTS
	// ===========================================================================

	describe("show", () => {
		it("should display information message with tool options", async () => {
			const showMessageSpy = vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Cursor" as any);

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			expect(showMessageSpy).toHaveBeenCalledWith(
				"🧢 AI activity detected. Which assistant are you using?",
				"Cursor",
				"Copilot",
				"Claude",
				"Windsurf",
				"Other",
				"Not AI",
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
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Claude" as any);

			const result = await toast.show([{ type: "burst", confidence: 0.8 }]);

			expect(result).toBe("Claude");
		});

		it("should return undefined if dismissed", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			const result = await toast.show([{ type: "burst", confidence: 0.8 }]);

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
		it("should track feedback when user selects option", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Copilot" as any);

			await toast.show([
				{ type: "burst", confidence: 0.8 },
				{ type: "pattern", confidence: 0.9 },
			]);

			expect(mockTrack).toHaveBeenCalledWith("ai_tool_feedback", {
				detected_signals: [
					{ type: "burst", confidence: 0.8 },
					{ type: "pattern", confidence: 0.9 },
				],
				user_selection: "Copilot",
			});
		});

		it("should not track feedback when user dismisses", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);

			await toast.show([{ type: "burst", confidence: 0.8 }]);

			expect(mockTrack).not.toHaveBeenCalled();
		});

		it("should handle telemetry service not initialized", async () => {
			vi.mocked(TelemetryService.isInitialized).mockReturnValue(false);
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue("Cursor" as any);

			// Should not throw
			await expect(toast.show([{ type: "burst", confidence: 0.8 }])).resolves.toBe("Cursor");
		});
	});

	// ===========================================================================
	// EDGE CASES
	// ===========================================================================

	describe("edge cases", () => {
		it("should handle all tool options", async () => {
			const tools = ["Cursor", "Copilot", "Claude", "Windsurf", "Other", "Not AI"];

			for (const tool of tools) {
				// Create new toast for each test
				const newToast = new AIDetectionToast();
				vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(tool as any);

				const result = await newToast.show([{ type: "burst", confidence: 0.8 }]);

				expect(result).toBe(tool);
			}
		});

		it("should only mark as shown if user makes selection", async () => {
			// First call: user dismisses
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
			await toast.show([{ type: "burst", confidence: 0.8 }]);

			// Advance past cooldown
			vi.advanceTimersByTime(31000);

			// Second call: should show again since user didn't select
			// (hasShownThisSession should not be set when dismissed)
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(undefined);
			await toast.show([{ type: "burst", confidence: 0.8 }]);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(2);
		});
	});
});
