import { TELEMETRY_EVENTS } from "@snapback/contracts/src/telemetry/events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VSCodeTelemetry } from "../../src/telemetry";

// Mock VS Code
vi.mock("vscode", () => {
	return {
		workspace: {
			getConfiguration: vi.fn().mockReturnValue({
				get: vi.fn().mockImplementation((key: string) => {
					if (key === "posthogKey") return "test-key";
					if (key === "telemetryProxy") return "https://test-proxy.com";
					return undefined;
				}),
			}),
		},
		version: "1.75.0",
	};
});

// Mock TelemetryClient
const mockTelemetryClient = {
	trackEvent: vi.fn(),
	track: vi.fn(),
};

vi.mock("@snapback/infrastructure/src/tracing/telemetry-client", () => {
	return {
		TelemetryClient: vi.fn().mockImplementation(() => mockTelemetryClient),
	};
});

describe("VS Code Telemetry Wrapper", () => {
	let vscodeTelemetry: VSCodeTelemetry;
	const mockContext: any = {
		extension: {
			packageJSON: {
				version: "1.0.0",
			},
		},
	};

	beforeEach(() => {
		vscodeTelemetry = new VSCodeTelemetry(mockContext);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should track extension activation with typed event", async () => {
		await vscodeTelemetry.initialize();

		expect(mockTelemetryClient.trackEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: TELEMETRY_EVENTS.EXTENSION_ACTIVATED,
				properties: {
					version: "1.0.0",
					vscodeVersion: "1.75.0",
				},
			}),
		);
	});

	it("should track command execution with typed event", () => {
		vscodeTelemetry.trackCommandExecution("test.command", 100, true);

		expect(mockTelemetryClient.trackEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: TELEMETRY_EVENTS.COMMAND_EXECUTION,
				properties: {
					command: "test.command",
					duration: 100,
					success: true,
				},
			}),
		);
	});

	it("should track snapshot creation with typed event", () => {
		vscodeTelemetry.trackSnapshotCreated("manual", 5);

		expect(mockTelemetryClient.trackEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: TELEMETRY_EVENTS.SNAPSHOT_CREATED,
				properties: {
					method: "manual",
					filesCount: 5,
				},
			}),
		);
	});

	it("should track SnapBack usage with typed event", () => {
		vscodeTelemetry.trackSnapBackUsed(3, 200, true);

		expect(mockTelemetryClient.trackEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: TELEMETRY_EVENTS.SNAPBACK_USED,
				properties: {
					filesRestored: 3,
					duration: 200,
					success: true,
				},
			}),
		);
	});

	it("should track error with typed event", () => {
		vscodeTelemetry.trackError("TestError", "Test error message");

		expect(mockTelemetryClient.trackEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: TELEMETRY_EVENTS.ERROR,
				properties: {
					errorType: "TestError",
					errorMessage: "Test error message",
				},
			}),
		);
	});

	it("should track extension deactivation with typed event", async () => {
		await vscodeTelemetry.shutdown();

		expect(mockTelemetryClient.trackEvent).toHaveBeenCalledWith(
			expect.objectContaining({
				event: TELEMETRY_EVENTS.EXTENSION_DEACTIVATED,
				properties: {},
			}),
		);
	});
});
