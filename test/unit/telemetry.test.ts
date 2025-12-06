import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { VSCodeTelemetry } from "../../src/telemetry";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		workspace: {
			getConfiguration: vi.fn().mockReturnValue({
				get: vi.fn().mockReturnValue(undefined),
			}),
		},
		version: "1.75.0",
	};
});

// Mock the telemetry client
const mockTelemetryClient = {
	initialize: vi.fn().mockResolvedValue(undefined),
	track: vi.fn(),
	shutdown: vi.fn().mockResolvedValue(undefined),
};

vi.mock("@snapback/infrastructure/src/tracing/telemetry-client", () => {
	return {
		TelemetryClient: vi.fn().mockImplementation(() => mockTelemetryClient),
	};
});

describe("VSCodeTelemetry", () => {
	let vscodeTelemetry: VSCodeTelemetry;
	let mockContext: any;

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

	it("should create a VSCodeTelemetry instance", () => {
		expect(vscodeTelemetry).toBeDefined();
	});

	it("should initialize telemetry client when PostHog key is available", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();

		// The telemetry client should be initialized
		expect(mockTelemetryClient.initialize).toHaveBeenCalled();
		expect(mockTelemetryClient.track).toHaveBeenCalledWith(
			"extension.activated",
			{
				version: "0.1.0",
				vscodeVersion: "1.75.0",
			},
		);
	});

	it("should not initialize telemetry client when PostHog key is not available", async () => {
		// Mock configuration to return no PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockReturnValue(undefined),
		});

		await vscodeTelemetry.initialize();

		// The telemetry client should not be initialized
		expect(mockTelemetryClient.initialize).not.toHaveBeenCalled();
	});

	it("should track command execution", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		vscodeTelemetry.trackCommandExecution(
			"snapback.createCheckpoint",
			120,
			true,
			{ filesAffected: 5 },
		);

		// Tracking methods should be called with correct event name
		expect(mockTelemetryClient.track).toHaveBeenCalledWith(
			"command.execution",
			{
				command: "snapback.createCheckpoint",
				duration: 120,
				success: true,
				filesAffected: 5,
			},
		);
	});

	it("should track checkpoint creation", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		vscodeTelemetry.trackSnapshotCreated("manual", 10, {
			trigger: "user_action",
		});

		// Tracking methods should be called with correct event name
		expect(mockTelemetryClient.track).toHaveBeenCalledWith("snapshot.created", {
			method: "manual",
			filesCount: 10,
			trigger: "user_action",
		});
	});

	it("should track SnapBack usage", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		vscodeTelemetry.trackSnapBackUsed(3, 450, true, {
			checkpointId: "test-checkpoint",
		});

		// Tracking methods should be called with correct event name
		expect(mockTelemetryClient.track).toHaveBeenCalledWith("snapback.used", {
			filesRestored: 3,
			duration: 450,
			success: true,
			checkpointId: "test-checkpoint",
		});
	});

	it("should track risk detection", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		vscodeTelemetry.trackRiskDetected(
			"HIGH",
			["suspicious_pattern", "api_key_detected"],
			0.85,
			{ fileName: "test.js" },
		);

		// Tracking methods should be called with correct event name
		expect(mockTelemetryClient.track).toHaveBeenCalledWith("risk.detected", {
			riskLevel: "HIGH",
			patterns: ["suspicious_pattern", "api_key_detected"],
			confidence: 0.85,
			fileName: "test.js",
		});
	});

	it("should track view activation", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		vscodeTelemetry.trackViewActivated("snapback.main", {
			activationSource: "command_palette",
		});

		// Tracking methods should be called with correct event name
		expect(mockTelemetryClient.track).toHaveBeenCalledWith("view.activated", {
			viewId: "snapback.main",
			activationSource: "command_palette",
		});
	});

	it("should track notification shown", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		vscodeTelemetry.trackNotificationShown(
			"risk_detected",
			"create_checkpoint",
			{ riskLevel: "HIGH" },
		);

		// Tracking methods should be called with correct event name
		expect(mockTelemetryClient.track).toHaveBeenCalledWith(
			"notification.shown",
			{
				notificationType: "risk_detected",
				actionTaken: "create_checkpoint",
				riskLevel: "HIGH",
			},
		);
	});

	it("should track feature usage", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		vscodeTelemetry.trackFeatureUsed("semantic_naming", {
			namingPattern: "dependency_update",
		});

		// Tracking methods should be called with correct event name
		expect(mockTelemetryClient.track).toHaveBeenCalledWith("feature.used", {
			feature: "semantic_naming",
			namingPattern: "dependency_update",
		});
	});

	it("should track errors", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		vscodeTelemetry.trackError("TypeError", "Test error message", {
			context: "test_context",
		});

		// Tracking methods should be called with correct event name
		expect(mockTelemetryClient.track).toHaveBeenCalledWith("error", {
			errorType: "TypeError",
			errorMessage: "Test error message",
			context: "test_context",
		});
	});

	it("should shutdown telemetry client", async () => {
		// Mock configuration to return a PostHog key
		const mockGetConfiguration = vscode.workspace
			.getConfiguration as unknown as ReturnType<typeof vi.fn>;
		mockGetConfiguration.mockReturnValue({
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "posthogHost") return "https://test.posthog.com";
				return undefined;
			}),
		});

		await vscodeTelemetry.initialize();
		vi.clearAllMocks(); // Clear the initialization calls

		await vscodeTelemetry.shutdown();

		// Track deactivation event should be called
		expect(mockTelemetryClient.track).toHaveBeenCalledWith(
			"extension.deactivated",
			{},
		);
	});
});
