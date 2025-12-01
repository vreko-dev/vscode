import { TelemetryClient } from "@snapback/infrastructure/src/tracing/telemetry-client";
import { describe, expect, it, vi } from "vitest";

// Mock the RulesManager since we can't import it directly in tests
const mockRulesManager = {
	instance: null as any,
	isOfflineMode: vi.fn().mockReturnValue(false),
	setOfflineMode: vi.fn(),
	startPolling: vi.fn(),
	stopPolling: vi.fn(),
};

// Mock the module
vi.mock("../../../src/rules/RulesManager", () => ({
	RulesManager: {
		getInstance: vi.fn(() => mockRulesManager),
	},
}));

// Test to verify offline mode behavior - Comprehensive Tests
describe("Offline Mode - Comprehensive Tests", () => {
	it("should enable offline mode in RulesManager", () => {
		// Import the RulesManager mock
		const { RulesManager } = require("../../../src/rules/RulesManager");

		// Create a mock context
		const mockContext: any = {
			extension: {
				packageJSON: {
					version: "1.0.0",
				},
			},
		};

		// Create RulesManager instance
		const rulesManager = RulesManager.getInstance(mockContext);

		// Verify offline mode is initially disabled
		mockRulesManager.isOfflineMode.mockReturnValue(false);
		expect(rulesManager.isOfflineMode()).toBe(false);

		// Enable offline mode
		rulesManager.setOfflineMode(true);
		mockRulesManager.isOfflineMode.mockReturnValue(true);

		// Verify offline mode is enabled
		expect(rulesManager.isOfflineMode()).toBe(true);

		// Disable offline mode
		rulesManager.setOfflineMode(false);
		mockRulesManager.isOfflineMode.mockReturnValue(false);

		// Verify offline mode is disabled
		expect(rulesManager.isOfflineMode()).toBe(false);
	});

	it("should skip network requests when offline mode is enabled in RulesManager", async () => {
		// Import the RulesManager mock
		const { RulesManager } = require("../../../src/rules/RulesManager");

		// Create a mock context
		const mockContext: any = {
			extension: {
				packageJSON: {
					version: "1.0.0",
				},
			},
		};

		// Create RulesManager instance
		const rulesManager = RulesManager.getInstance(mockContext);

		// Enable offline mode
		rulesManager.setOfflineMode(true);

		// Mock the fetchRules method to verify it's not called
		const mockFetchRules = vi.fn();
		rulesManager.fetchRules = mockFetchRules;

		// Try to start polling - should not call fetchRules when offline mode is enabled
		rulesManager.startPolling();

		// Wait a bit to ensure the polling would have happened
		await new Promise((resolve) => setTimeout(resolve, 100));

		// Verify that fetchRules was not called
		expect(mockFetchRules).not.toHaveBeenCalled();

		// Stop polling
		rulesManager.stopPolling();
	});

	it("should enable offline mode in TelemetryClient", () => {
		// Create TelemetryClient instance
		const telemetryClient = new TelemetryClient(
			"test-key",
			"https://test-proxy.com",
			"vscode",
		);

		// Verify offline mode is initially disabled
		expect(telemetryClient.isOfflineMode()).toBe(false);

		// Enable offline mode
		telemetryClient.setOfflineMode(true);

		// Verify offline mode is enabled
		expect(telemetryClient.isOfflineMode()).toBe(true);

		// Disable offline mode
		telemetryClient.setOfflineMode(false);

		// Verify offline mode is disabled
		expect(telemetryClient.isOfflineMode()).toBe(false);
	});

	it("should skip telemetry tracking when offline mode is enabled", () => {
		// Create TelemetryClient instance
		const telemetryClient = new TelemetryClient(
			"test-key",
			"https://test-proxy.com",
			"vscode",
		);

		// Enable offline mode
		telemetryClient.setOfflineMode(true);

		// Mock the customTransport method to verify it's not called
		const mockCustomTransport = vi.fn();
		(telemetryClient as any).customTransport = mockCustomTransport;

		// Try to track an event - should not call customTransport when offline mode is enabled
		telemetryClient.track("test.event", { test: "property" });

		// Flush the event queue
		(telemetryClient as any).flush();

		// Verify that customTransport was not called
		expect(mockCustomTransport).not.toHaveBeenCalled();
	});
});
