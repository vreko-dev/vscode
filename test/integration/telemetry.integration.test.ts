import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";
import * as vscode from "vscode";
import { VSCodeTelemetry } from "../../src/telemetry.js";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		workspace: {
			getConfiguration: vi.fn().mockReturnValue({
				get: vi.fn().mockImplementation((key: string) => {
					if (key === "posthogKey") return "test-key";
					if (key === "posthogHost") return "https://test.posthog.com";
					return undefined;
				}),
			}),
		},
		version: "1.75.0",
	};
});

// Mock the telemetry client to verify calls
const mockTelemetryClient = {
	initialize: vi.fn().mockResolvedValue(undefined),
	track: vi.fn(),
	trackCommandExecution: vi.fn(),
	trackCheckpointCreated: vi.fn(),
	trackSnapBackUsed: vi.fn(),
	trackRiskDetected: vi.fn(),
	trackViewActivated: vi.fn(),
	trackNotificationShown: vi.fn(),
	trackFeatureUsed: vi.fn(),
	trackError: vi.fn(),
	shutdown: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@snapback/telemetry", () => {
	return {
		TelemetryClient: vi.fn().mockImplementation(() => mockTelemetryClient),
	};
});

describe("Telemetry Integration", () => {
	let vscodeTelemetry: VSCodeTelemetry;
	let mockContext: unknown;

	beforeEach(() => {
		// Clear all mocks before each test
		vi.clearAllMocks();

		mockContext = {
			extension: {
				packageJSON: {
					version: "0.1.0",
				},
			},
		};

		vscodeTelemetry = new VSCodeTelemetry(mockContext);
	});

	it("should track extension activation", async () => {
		await vscodeTelemetry.initialize();

		// Verify that extension activation is tracked
		expect(mockTelemetryClient.track).toHaveBeenCalledWith(
			"extension.activated",
			{
				version: "0.1.0",
				vscodeVersion: "1.75.0",
			},
		);
	});

	it("should track extension deactivation", async () => {
		await vscodeTelemetry.initialize();
		await vscodeTelemetry.shutdown();

		// Verify that extension deactivation is tracked
		expect(mockTelemetryClient.track).toHaveBeenCalledWith(
			"extension.deactivated",
		);
	});

	it("should track all specialized telemetry events", async () => {
		await vscodeTelemetry.initialize();

		// Test all specialized tracking methods
		vscodeTelemetry.trackCommandExecution(
			"snapback.createSnapshot",
			120,
			true,
			{ filesAffected: 5 },
		);
		vscodeTelemetry.trackSnapshotCreated("manual", 10, {
			trigger: "user_action",
		});
		vscodeTelemetry.trackSnapBackUsed(3, 450, true, {
			snapshotId: "test-snapshot",
		});
		vscodeTelemetry.trackRiskDetected(
			"HIGH",
			["suspicious_pattern", "api_key_detected"],
			0.85,
			{ fileName: "test.js" },
		);
		vscodeTelemetry.trackViewActivated("snapback.main", {
			activationSource: "command_palette",
		});
		vscodeTelemetry.trackNotificationShown("risk_detected", "create_snapshot", {
			riskLevel: "HIGH",
		});
		vscodeTelemetry.trackFeatureUsed("semantic_naming", {
			namingPattern: "dependency_update",
		});
		vscodeTelemetry.trackError("file_access", "Permission denied", {
			filePath: "/test/file.js",
		});

		// Verify all tracking methods were called
		expect(mockTelemetryClient.trackCommandExecution).toHaveBeenCalledWith(
			"snapback.createSnapshot",
			120,
			true,
			{ filesAffected: 5 },
		);
		expect(mockTelemetryClient.trackSnapshotCreated).toHaveBeenCalledWith(
			"manual",
			10,
			{ trigger: "user_action" },
		);
		expect(mockTelemetryClient.trackSnapBackUsed).toHaveBeenCalledWith(
			3,
			450,
			true,
			{ snapshotId: "test-snapshot" },
		);
		expect(mockTelemetryClient.trackRiskDetected).toHaveBeenCalledWith(
			"HIGH",
			["suspicious_pattern", "api_key_detected"],
			0.85,
			{ fileName: "test.js" },
		);
		expect(mockTelemetryClient.trackViewActivated).toHaveBeenCalledWith(
			"snapback.main",
			{ activationSource: "command_palette" },
		);
		expect(mockTelemetryClient.trackNotificationShown).toHaveBeenCalledWith(
			"risk_detected",
			"create_snapshot",
			{ riskLevel: "HIGH" },
		);
		expect(mockTelemetryClient.trackFeatureUsed).toHaveBeenCalledWith(
			"semantic_naming",
			{ namingPattern: "dependency_update" },
		);
		expect(mockTelemetryClient.trackError).toHaveBeenCalledWith(
			"file_access",
			"Permission denied",
			{ filePath: "/test/file.js" },
		);
	});

	it("should not track events when telemetry is disabled", async () => {
		// Mock configuration to return no PostHog key (telemetry disabled)
		const mockGetConfiguration = vscode.workspace.getConfiguration as Mock;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockReturnValue(undefined),
		});

		await vscodeTelemetry.initialize();

		// Try to track events
		vscodeTelemetry.trackCommandExecution(
			"snapback.createSnapshot",
			120,
			true,
			{ filesAffected: 5 },
		);

		// Verify that no tracking methods were called
		expect(mockTelemetryClient.trackCommandExecution).not.toHaveBeenCalled();
	});
});
