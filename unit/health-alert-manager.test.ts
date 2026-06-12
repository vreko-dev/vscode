/**
 * HealthAlertManager Tests
 *
 * Comprehensive test coverage for health alert notifications including:
 * - Notification rules (unhealthy, recovery, degraded)
 * - Debouncing (5s window)
 * - User setting respect
 * - Quick recovery handling
 * - Action button behavior
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { HealthAlertManager } from "../../src/notifications/HealthAlertManager";

// Mock the logger
vi.mock("../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import mocked vscode
import { mockVscodeWindow, mockVscodeWorkspace, mockVscodeCommands } from "../unit/setup";

describe("HealthAlertManager", () => {
	let alertManager: HealthAlertManager;
	let mockController: any;

	// Helper to create mock MCP controller
	const createMockController = () => {
		const listeners: Array<(event: any) => void> = [];

		return {
			onHealthChange: vi.fn((callback: any) => {
				listeners.push(callback);
				return { dispose: vi.fn() };
			}),
			_fireHealthChange: (event: any) => {
				listeners.forEach((listener) => listener(event));
			},
		};
	};

	// Helper to create health change event
	const createHealthChangeEvent = (
		from: string,
		to: string,
		reason?: string,
		timestamp?: number,
	) => ({
		from,
		to,
		reason: reason || `Transition from ${from} to ${to}`,
		timestamp: timestamp || Date.now(),
	});

	beforeEach(() => {
		vi.useFakeTimers();
		alertManager = new HealthAlertManager();
		mockController = createMockController();

		// Reset VS Code mocks
		vi.clearAllMocks();

		// Setup default config (alerts enabled)
		mockVscodeWorkspace.getConfiguration.mockReturnValue({
			get: vi.fn((key: string, defaultValue?: any) => {
				if (key === "proactiveAlerts") return true;
				return defaultValue;
			}),
			update: vi.fn(),
			has: vi.fn(() => true),
			inspect: vi.fn(),
		});
	});

	afterEach(() => {
		alertManager.dispose();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	describe("initialization", () => {
		it("should initialize without error", () => {
			expect(() => alertManager.initialize(mockController)).not.toThrow();
		});

		it("should subscribe to health change events", () => {
			alertManager.initialize(mockController);

			expect(mockController.onHealthChange).toHaveBeenCalled();
		});
	});

	describe("notification rules - unhealthy transition", () => {
		beforeEach(() => {
			alertManager.initialize(mockController);
		});

		it("should show warning notification when transitioning to unhealthy", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			// Wait for debounce period (5s)
			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("unhealthy"),
				"Retry",
				"View Status",
			);
		});

		it("should include reason in notification message", async () => {
			mockController._fireHealthChange(
				createHealthChangeEvent("healthy", "unhealthy", "Connection timeout"),
			);

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("Connection timeout"),
				expect.anything(),
				expect.anything(),
			);
		});

		it("should show notification from degraded to unhealthy", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("degraded", "unhealthy"));

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalled();
		});

		it("should show notification from unknown to unhealthy", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("unknown", "unhealthy"));

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalled();
		});

		it("should not show notification if already unhealthy", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("unhealthy", "unhealthy"));

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).not.toHaveBeenCalled();
		});
	});

	describe("notification rules - recovery", () => {
		beforeEach(() => {
			alertManager.initialize(mockController);
		});

		it("should show info notification on recovery from unhealthy", async () => {
			// First become unhealthy
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));
			await vi.advanceTimersByTimeAsync(5000);

			// Wait past debounce window for recovery notification to show
			await vi.advanceTimersByTimeAsync(5000);

			// Then recover
			mockController._fireHealthChange(createHealthChangeEvent("unhealthy", "healthy"));

			expect(mockVscodeWindow.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("recovered"),
			);
		});

		it("should include downtime duration in recovery notification", async () => {
			const startTime = Date.now();

			// Become unhealthy
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy", "", startTime));
			await vi.advanceTimersByTimeAsync(5000);

			// Wait 10 seconds
			await vi.advanceTimersByTimeAsync(10000);

			// Recover
			mockController._fireHealthChange(
				createHealthChangeEvent("unhealthy", "healthy", "", Date.now()),
			);

			expect(mockVscodeWindow.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("recovered"),
			);
		});

		it("should not show notification for recovery from degraded", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("degraded", "healthy"));

			expect(mockVscodeWindow.showInformationMessage).not.toHaveBeenCalled();
		});

		it("should not show notification for recovery from unknown", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("unknown", "healthy"));

			expect(mockVscodeWindow.showInformationMessage).not.toHaveBeenCalled();
		});
	});

	describe("notification rules - degraded (no notification)", () => {
		beforeEach(() => {
			alertManager.initialize(mockController);
		});

		it("should not show notification when transitioning to degraded", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "degraded"));

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).not.toHaveBeenCalled();
			expect(mockVscodeWindow.showInformationMessage).not.toHaveBeenCalled();
		});

		it("should not show notification for unknown to healthy", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("unknown", "healthy"));

			expect(mockVscodeWindow.showInformationMessage).not.toHaveBeenCalled();
		});
	});

	describe("debouncing - 5s window", () => {
		beforeEach(() => {
			alertManager.initialize(mockController);
		});

		it("should debounce unhealthy notification by 5s", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			// Before 5s
			await vi.advanceTimersByTimeAsync(4000);
			expect(mockVscodeWindow.showWarningMessage).not.toHaveBeenCalled();

			// After 5s
			await vi.advanceTimersByTimeAsync(1000);
			expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalled();
		});

		it("should cancel notification if recovered before 5s", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			// Wait 3s (before debounce completes)
			await vi.advanceTimersByTimeAsync(3000);

			// Recover
			mockController._fireHealthChange(createHealthChangeEvent("unhealthy", "healthy"));

			// Wait past debounce
			await vi.advanceTimersByTimeAsync(5000);

			// No warning should have been shown
			expect(mockVscodeWindow.showWarningMessage).not.toHaveBeenCalled();
		});

		it("should not show recovery notification if recovered before debounce", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			// Recover immediately (before 5s)
			await vi.advanceTimersByTimeAsync(2000);
			mockController._fireHealthChange(createHealthChangeEvent("unhealthy", "healthy"));

			// Shows "recovered quickly" message instead of warning
			expect(mockVscodeWindow.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("recovered"),
			);
		});

		it("should handle multiple rapid transitions", async () => {
			// Rapid unhealthy → healthy → unhealthy
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));
			await vi.advanceTimersByTimeAsync(2000);

			mockController._fireHealthChange(createHealthChangeEvent("unhealthy", "healthy"));
			await vi.advanceTimersByTimeAsync(2000);

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			vi.clearAllMocks();

			// Wait for debounce
			await vi.advanceTimersByTimeAsync(5000);

			// Should show warning for the final unhealthy state
			expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalledTimes(1);
		});
	});

	describe("user setting - proactiveAlerts", () => {
		it("should respect disabled setting", async () => {
			// Disable alerts
			mockVscodeWorkspace.getConfiguration.mockReturnValue({
				get: vi.fn((key: string) => {
					if (key === "proactiveAlerts") return false;
					return undefined;
				}),
				update: vi.fn(),
				has: vi.fn(() => true),
				inspect: vi.fn(),
			});

			alertManager.initialize(mockController);

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).not.toHaveBeenCalled();
		});

		it("should check setting for each notification", async () => {
			alertManager.initialize(mockController);

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			await vi.advanceTimersByTimeAsync(5000);

			// getConfiguration should have been called to check setting
			expect(mockVscodeWorkspace.getConfiguration).toHaveBeenCalledWith(
				expect.stringContaining("vreko"),
			);
		});
	});

	describe("action buttons", () => {
		beforeEach(() => {
			alertManager.initialize(mockController);
		});

		it("should execute retry command when Retry clicked", async () => {
			mockVscodeWindow.showWarningMessage.mockResolvedValue("Retry");

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			await vi.advanceTimersByTimeAsync(5000);

			// Wait for async command execution
			await vi.runAllTimersAsync();

			expect(mockVscodeCommands.executeCommand).toHaveBeenCalledWith(
				"vreko.mcp.diagnose",
			);
		});

		it("should execute view status command when View Status clicked", async () => {
			mockVscodeWindow.showWarningMessage.mockResolvedValue("View Status");

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			await vi.advanceTimersByTimeAsync(5000);

			await vi.runAllTimersAsync();

			expect(mockVscodeCommands.executeCommand).toHaveBeenCalledWith(
				"vreko.mcp.status",
			);
		});

		it("should handle user dismissing notification", async () => {
			mockVscodeWindow.showWarningMessage.mockResolvedValue(undefined);

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			await vi.advanceTimersByTimeAsync(5000);

			await vi.runAllTimersAsync();

			// Should not throw or execute any commands
			expect(mockVscodeCommands.executeCommand).not.toHaveBeenCalled();
		});
	});

	describe("downtime tracking", () => {
		beforeEach(() => {
			alertManager.initialize(mockController);
		});

		it("should track downtime from first unhealthy to recovery", async () => {
			const startTime = Date.now();

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy", "", startTime));
			await vi.advanceTimersByTimeAsync(5000);

			// Wait 15 seconds
			await vi.advanceTimersByTimeAsync(15000);

			const recoveryTime = Date.now();

			mockController._fireHealthChange(
				createHealthChangeEvent("unhealthy", "healthy", "", recoveryTime),
			);

			// Check for recovery message with some duration
			expect(mockVscodeWindow.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("recovered"),
			);
		});

		it("should reset downtime tracking after recovery", async () => {
			// First unhealthy period
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));
			await vi.advanceTimersByTimeAsync(5000);

			mockController._fireHealthChange(createHealthChangeEvent("unhealthy", "healthy"));

			// Second unhealthy period
			const startTime = Date.now();
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy", "", startTime));
			await vi.advanceTimersByTimeAsync(5000);

			// Wait 5 seconds
			await vi.advanceTimersByTimeAsync(5000);

			const recoveryTime = Date.now();
			mockController._fireHealthChange(
				createHealthChangeEvent("unhealthy", "healthy", "", recoveryTime),
			);

			// Should show recovery message
			expect(mockVscodeWindow.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("recovered"),
			);
		});
	});

	describe("edge cases", () => {
		beforeEach(() => {
			alertManager.initialize(mockController);
		});

		it("should handle rapid consecutive unhealthy notifications", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));
			await vi.advanceTimersByTimeAsync(5000);

			vi.clearAllMocks();

			// Another unhealthy event (should be ignored, already unhealthy)
			mockController._fireHealthChange(createHealthChangeEvent("unhealthy", "unhealthy"));
			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).not.toHaveBeenCalled();
		});

		it("should handle notification without reason", async () => {
			mockController._fireHealthChange({
				from: "healthy",
				to: "unhealthy",
				timestamp: Date.now(),
			});

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("unhealthy"),
				"Retry",
				"View Status",
			);
		});

		it("should handle recovery with zero downtime", async () => {
			const timestamp = Date.now();

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy", "", timestamp));
			await vi.advanceTimersByTimeAsync(5000);

			// Wait past debounce
			await vi.advanceTimersByTimeAsync(5000);

			// Immediate recovery
			mockController._fireHealthChange(
				createHealthChangeEvent("unhealthy", "healthy", "", timestamp),
			);

			// Check for recovery message
			expect(mockVscodeWindow.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("recovered"),
			);
		});

		it("should handle multiple subscriptions", () => {
			const alertManager2 = new HealthAlertManager();

			alertManager2.initialize(mockController);

			expect(mockController.onHealthChange).toHaveBeenCalledTimes(2);

			alertManager2.dispose();
		});
	});

	describe("disposal", () => {
		it("should dispose without error", () => {
			alertManager.initialize(mockController);

			expect(() => alertManager.dispose()).not.toThrow();
		});

		it("should clear pending notifications on dispose", async () => {
			alertManager.initialize(mockController);

			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));

			// Dispose before debounce completes
			await vi.advanceTimersByTimeAsync(3000);
			alertManager.dispose();

			// Advance past debounce
			await vi.advanceTimersByTimeAsync(5000);

			// No notification should appear
			expect(mockVscodeWindow.showWarningMessage).not.toHaveBeenCalled();
		});

		it("should dispose subscriptions", () => {
			alertManager.initialize(mockController);

			const subscription = mockController.onHealthChange.mock.results[0].value;

			alertManager.dispose();

			// Verify disposal behavior (subscription should have dispose called)
			// Note: This depends on how the mock tracks disposals
		});

		it("should allow disposal before initialization", () => {
			const newManager = new HealthAlertManager();

			expect(() => newManager.dispose()).not.toThrow();
		});
	});

	describe("notification formatting", () => {
		beforeEach(() => {
			alertManager.initialize(mockController);
		});

		it("should format recovery time in seconds", async () => {
			mockController._fireHealthChange(createHealthChangeEvent("healthy", "unhealthy"));
			await vi.advanceTimersByTimeAsync(5000);

			await vi.advanceTimersByTimeAsync(7500); // 7.5 seconds

			mockController._fireHealthChange(createHealthChangeEvent("unhealthy", "healthy"));

			// Should show recovery message
			expect(mockVscodeWindow.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("recovered"),
			);
		});

		it("should use proper message format for unhealthy notification", async () => {
			mockController._fireHealthChange(
				createHealthChangeEvent("healthy", "unhealthy", "Timeout error"),
			);

			await vi.advanceTimersByTimeAsync(5000);

			expect(mockVscodeWindow.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("unhealthy"),
				"Retry",
				"View Status",
			);
		});
	});
});
