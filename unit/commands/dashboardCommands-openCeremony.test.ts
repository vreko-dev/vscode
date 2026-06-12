/**
 * dashboardCommands - openCeremony Tests
 *
 * Tests for the vreko.openCeremony command with optional sessionId.
 *
 * TEST PATHS:
 * 1. Happy: Opens ceremony panel without sessionId
 * 2. Happy: Opens ceremony panel and selects specific session with sessionId
 * 3. Error: Handles missing ceremony provider gracefully
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vscode
vi.mock("vscode", () => ({
	commands: {
		registerCommand: vi.fn((name, callback) => {
			// Store callback for testing
			(global as any).__commandCallbacks = (global as any).__commandCallbacks || {};
			(global as any).__commandCallbacks[name] = callback;
			return { dispose: vi.fn() };
		}),
	},
	window: {
		showErrorMessage: vi.fn(),
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
		debug: vi.fn(),
	},
}));

// Import vscode for test assertions
import * as vscode from "vscode";
import { logger } from "../../../src/utils/logger";

describe("dashboardCommands - openCeremony", () => {
	let mockShow: ReturnType<typeof vi.fn>;
	let mockShowCeremony: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockShow = vi.fn();
		mockShowCeremony = vi.fn().mockResolvedValue(undefined);

		// Setup global host
		(globalThis as any).vrekoHost = {
			ceremonyWebViewProvider: {
				show: mockShow,
				showCeremony: mockShowCeremony,
			},
		};

		// Clear command callbacks
		(global as any).__commandCallbacks = {};
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete (globalThis as any).vrekoHost;
		delete (global as any).__commandCallbacks;
	});

	// =========================================================================
	// HAPPY PATH: Opens without sessionId
	// =========================================================================

	describe("happy path - no sessionId", () => {
		it("should open ceremony panel when called without sessionId", async () => {
			// Import to register commands
			const { registerDashboardCommands } = await import(
				"../../../src/commands/dashboardCommands"
			);

			// Register commands
			const disposables = registerDashboardCommands();

			// Get the registered callback
			const openCeremonyCallback = (global as any).__commandCallbacks["vreko.openCeremony"];
			expect(openCeremonyCallback).toBeDefined();

			// Execute without sessionId
			await openCeremonyCallback();

			expect(mockShow).toHaveBeenCalled();
			expect(mockShowCeremony).not.toHaveBeenCalled();
			expect(logger.info).toHaveBeenCalledWith("Opened Closing Ceremonies panel");

			// Cleanup
			disposables.forEach((d) => d.dispose());
		});
	});

	// =========================================================================
	// HAPPY PATH: Opens with sessionId
	// =========================================================================

	describe("happy path - with sessionId", () => {
		it("should open ceremony panel and select session when sessionId provided", async () => {
			// Import to register commands
			const { registerDashboardCommands } = await import(
				"../../../src/commands/dashboardCommands"
			);

			// Register commands
			const disposables = registerDashboardCommands();

			// Get the registered callback
			const openCeremonyCallback = (global as any).__commandCallbacks["vreko.openCeremony"];
			expect(openCeremonyCallback).toBeDefined();

			// Execute with sessionId
			await openCeremonyCallback("session-123");

			expect(mockShow).toHaveBeenCalled();
			expect(mockShowCeremony).toHaveBeenCalledWith("session-123");
			expect(logger.info).toHaveBeenCalledWith(
				"Opened Closing Ceremonies panel for session: session-123"
			);

			// Cleanup
			disposables.forEach((d) => d.dispose());
		});
	});

	// =========================================================================
	// ERROR: Missing provider
	// =========================================================================

	describe("error handling - missing provider", () => {
		it("should show error message when ceremony provider not available", async () => {
			// Remove the provider
			(globalThis as any).vrekoHost = {};

			// Import to register commands
			const { registerDashboardCommands } = await import(
				"../../../src/commands/dashboardCommands"
			);

			// Register commands
			const disposables = registerDashboardCommands();

			// Get the registered callback
			const openCeremonyCallback = (global as any).__commandCallbacks["vreko.openCeremony"];

			// Execute
			await openCeremonyCallback();

			expect(logger.warn).toHaveBeenCalledWith("CeremonyWebViewProvider not available");
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Closing Ceremonies not available. Try reloading the window."
			);

			// Cleanup
			disposables.forEach((d) => d.dispose());
		});

		it("should handle errors gracefully", async () => {
			// Make showCeremony throw
			mockShowCeremony.mockRejectedValue(new Error("Test error"));

			// Import to register commands
			const { registerDashboardCommands } = await import(
				"../../../src/commands/dashboardCommands"
			);

			// Register commands
			const disposables = registerDashboardCommands();

			// Get the registered callback
			const openCeremonyCallback = (global as any).__commandCallbacks["vreko.openCeremony"];

			// Execute with sessionId (which will trigger showCeremony)
			await openCeremonyCallback("session-error");

			expect(logger.error).toHaveBeenCalledWith(
				"Failed to open Closing Ceremonies",
				expect.any(Error)
			);
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				"Failed to open Closing Ceremonies: Test error"
			);

			// Cleanup
			disposables.forEach((d) => d.dispose());
		});
	});
});
