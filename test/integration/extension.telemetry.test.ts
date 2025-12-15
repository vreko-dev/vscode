import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import { createMockExtensionContext } from "../__mocks__/factories";
import { VSCodeTelemetry } from "../../src/telemetry";

// Simple integration test to verify telemetry can be instantiated and initialized
describe("Extension Telemetry Integration", () => {
	let mockContext: ReturnType<typeof createMockExtensionContext>;

	beforeEach(() => {
		mockContext = createMockExtensionContext({
			extension: {
				packageJSON: {
					version: "0.1.0",
				},
			},
		});
	});

	it("should create and initialize VSCodeTelemetry instance", async () => {
		// This test verifies that the VSCodeTelemetry class can be instantiated
		// and initialized without errors, which is a basic integration test

		const telemetry = new VSCodeTelemetry(mockContext);
		expect(telemetry).toBeDefined();

		// Mock the VS Code configuration to provide a PostHog key
		const mockVscode = await import("vscode");
		const mockGetConfiguration = mockVscode.workspace.getConfiguration as Mock;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		// Initialize should not throw errors
		await expect(telemetry.initialize()).resolves.not.toThrow();
	});

	it("should handle telemetry initialization without PostHog key", async () => {
		const telemetry = new VSCodeTelemetry(mockContext);

		// Mock the VS Code configuration to return no PostHog key
		const mockVscode = await import("vscode");
		const mockGetConfiguration = mockVscode.workspace.getConfiguration as Mock;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockReturnValue(undefined),
		});

		// Initialize should not throw errors even without a PostHog key
		await expect(telemetry.initialize()).resolves.not.toThrow();
	});
});
