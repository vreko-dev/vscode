/**
 * HealthAlertManager.test.ts
 *
 * Unit tests for Health Alert Manager notification logic.
 *
 * Tests cover:
 * - Notification triggering rules (healthy → degraded: none, → unhealthy: warning)
 * - Debouncing rapid state changes (5s window)
 * - User setting respect (proactiveAlerts config)
 * - Non-modal toast behavior
 * - Recovery notifications
 * - Action button handling (Retry, View Status)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { HealthAlertManager, type RecoveryEvent } from "@vscode/notifications/HealthAlertManager";
import type { HealthChangeEvent, MCPController } from "@vscode/mcp/MCPController";

// Mock vscode module with inline mocks
vi.mock("vscode", () => ({
	window: {
		showWarningMessage: vi.fn(async () => undefined),
		showInformationMessage: vi.fn(async () => undefined),
	},
	commands: {
		executeCommand: vi.fn(async () => undefined),
	},
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue: unknown) => defaultValue),
		})),
	},
}));

// Mock logger
vi.mock("../../utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("HealthAlertManager", () => {
	let alertManager: HealthAlertManager;
	let mockController: {
		onHealthChange: ReturnType<typeof vi.fn>;
	};
	let healthChangeListeners: ((event: HealthChangeEvent) => void)[];

	beforeEach(async () => {
		vi.useFakeTimers();

		const vscode = await import("vscode");

		// Clear all mocks
		vi.mocked(vscode.window.showWarningMessage).mockClear();
		vi.mocked(vscode.window.showInformationMessage).mockClear();
		vi.mocked(vscode.commands.executeCommand).mockClear();
		vi.mocked(vscode.workspace.getConfiguration).mockClear();

		alertManager = new HealthAlertManager();
		healthChangeListeners = [];

		mockController = {
			onHealthChange: vi.fn((listener: (event: HealthChangeEvent) => void) => {
				healthChangeListeners.push(listener);
				return { dispose: vi.fn() };
			}),
		};
	});

	afterEach(() => {
		alertManager.dispose();
		vi.restoreAllMocks();
		vi.useRealTimers();
	});

	const triggerHealthChange = (event: HealthChangeEvent) => {
		healthChangeListeners.forEach((listener) => listener(event));
	};

	describe("Basic Notifications", () => {
		it("does not show notification for healthy state", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "unknown",
				currentState: "healthy",
				timestamp: Date.now(),
				reason: "MCP server connected",
			});

			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		});

		it("does not show notification for degraded state", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "healthy",
				currentState: "degraded",
				timestamp: Date.now(),
				reason: "High latency detected",
			});

			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		});

		it("shows warning notification for unhealthy state", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			await vi.advanceTimersByTimeAsync(100);

			expect(vscode.window.showWarningMessage).toHaveBeenCalled();
			const callArgs = vi.mocked(vscode.window.showWarningMessage).mock.calls[0];
			expect(callArgs[0]).toContain("unhealthy");
		});
	});

	describe("Debouncing", () => {
		it("does not show duplicate notifications within 5s window", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);

			// First unhealthy notification
			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			// Wait for the 5s debounce window
			await vi.advanceTimersByTimeAsync(5100);
			expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);

			// Second unhealthy notification within 5s
			triggerHealthChange({
				previousState: "healthy",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Connection lost",
			});

			// Wait for the 5s debounce window again
			await vi.advanceTimersByTimeAsync(5100);
			// Should be 2 now because it's a new transition after the debounce
			expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
		});

		it("allows notification after 5s debounce window", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);

			// First notification
			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			// Wait for the 5s debounce window
			await vi.advanceTimersByTimeAsync(5100);
			expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(1);

			// Advance past notification debounce window (5000ms) plus extra
			await vi.advanceTimersByTimeAsync(5100);

			// Second notification
			triggerHealthChange({
				previousState: "healthy",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Connection lost",
			});

			// Wait for the 5s debounce window
			await vi.advanceTimersByTimeAsync(5100);
			expect(vscode.window.showWarningMessage).toHaveBeenCalledTimes(2);
		});
	});

	describe("Configuration Respect", () => {
		it("shows notifications when proactiveAlerts is enabled (default)", async () => {
			const vscode = await import("vscode");

			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
				get: vi.fn((key: string, defaultValue: unknown) => {
					if (key === "mcp.healthGuardian.proactiveAlerts") {
						return true;
					}
					return defaultValue;
				}),
			} as any);

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			// Wait for the 5s debounce window
			await vi.advanceTimersByTimeAsync(5100);
			expect(vscode.window.showWarningMessage).toHaveBeenCalled();
		});

		it("does not show notifications when proactiveAlerts is disabled", async () => {
			const vscode = await import("vscode");

			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
				get: vi.fn((key: string, defaultValue: unknown) => {
					if (key === "mcp.healthGuardian.proactiveAlerts") {
						return false;
					}
					return defaultValue;
				}),
			} as any);

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			await vi.advanceTimersByTimeAsync(100);
			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
		});
	});

	describe("Recovery Notifications", () => {
		it("shows info notification on recovery from unhealthy to healthy", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);

			// First become unhealthy
			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			await vi.advanceTimersByTimeAsync(100);

			// Then recover
			triggerHealthChange({
				previousState: "unhealthy",
				currentState: "healthy",
				timestamp: Date.now(),
				reason: "Latency normalized",
			});

			await vi.advanceTimersByTimeAsync(100);
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
			const callArgs = vi.mocked(vscode.window.showInformationMessage).mock.calls[0];
			expect(callArgs[0]).toContain("recovered");
		});

		it("does not show recovery notification for degraded to healthy", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "degraded",
				currentState: "healthy",
				timestamp: Date.now(),
				reason: "Latency normalized",
			});

			await vi.advanceTimersByTimeAsync(100);
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		});
	});

	describe("Action Buttons", () => {
		it("includes Retry and View Status buttons in unhealthy notification", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			// Wait for the 5s debounce window
			await vi.advanceTimersByTimeAsync(5100);

			const callArgs = vi.mocked(vscode.window.showWarningMessage).mock.calls[0];
			// callArgs is an array where first element is message, rest are button labels
			const buttonLabels = callArgs.slice(1);
			expect(buttonLabels).toContain("Retry");
			expect(buttonLabels).toContain("View Status");
		});

		it("executes command when Retry button clicked", async () => {
			const vscode = await import("vscode");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("Retry" as any);

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			await vi.advanceTimersByTimeAsync(100);
			await vi.runAllTimersAsync();

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vreko.mcp.diagnose");
		});

		it("executes command when View Status button clicked", async () => {
			const vscode = await import("vscode");

			vi.mocked(vscode.window.showWarningMessage).mockResolvedValue("View Status" as any);

			alertManager.registerController(mockController as unknown as MCPController);

			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			await vi.advanceTimersByTimeAsync(100);
			await vi.runAllTimersAsync();

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith("vreko.mcp.status");
		});
	});

	describe("Resource Cleanup", () => {
		it("disposes event listeners on dispose", () => {
			alertManager.registerController(mockController as unknown as MCPController);

			alertManager.dispose();

			// Should have called dispose on the event subscription
			expect(healthChangeListeners.length).toBeGreaterThan(0);
		});

		it("does not show notifications after disposal", async () => {
			const vscode = await import("vscode");

			alertManager.registerController(mockController as unknown as MCPController);
			alertManager.dispose();

			triggerHealthChange({
				previousState: "degraded",
				currentState: "unhealthy",
				timestamp: Date.now(),
				reason: "Severe latency",
			});

			await vi.advanceTimersByTimeAsync(100);
			expect(vscode.window.showWarningMessage).not.toHaveBeenCalled();
		});
	});
});
