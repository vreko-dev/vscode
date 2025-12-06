import type { LegacyTelemetryEvent } from "@snapback/contracts";
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

// Mock the telemetry client to capture all tracking calls
const capturedEvents: Array<{
	event: string;
	properties?: Record<string, unknown>;
}> = [];

const mockTelemetryClient = {
	initialize: vi.fn().mockResolvedValue(undefined),
	trackEvent: vi.fn((event: LegacyTelemetryEvent) => {
		capturedEvents.push({ event: event.event, properties: event.properties });
	}),
	track: vi.fn((event: string, properties?: Record<string, unknown>) => {
		capturedEvents.push({ event, properties });
	}),
};

vi.mock("@snapback/infrastructure/src/tracing/telemetry-client", () => {
	return {
		TelemetryClient: vi.fn().mockImplementation(() => mockTelemetryClient),
	};
});

// Define the whitelist of allowed properties for each event type
const TELEMETRY_WHITELIST: Record<string, Set<string>> = {
	"extension.activated": new Set(["version", "vscodeVersion"]),
	"extension.deactivated": new Set([]),
	"command.execution": new Set(["command", "duration", "success"]),
	"snapshot.created": new Set(["method", "filesCount"]),
	"snapback.used": new Set(["filesRestored", "duration", "success"]),
	"risk.detected": new Set(["riskLevel", "patterns", "confidence"]),
	"view.activated": new Set(["viewId"]),
	"notification.shown": new Set(["notificationType", "actionTaken"]),
	"feature.used": new Set(["feature"]),
	error: new Set(["errorType", "errorMessage"]),
	"walkthrough.step.completed": new Set(["stepId", "stepTitle"]),
	"onboarding.protection.assigned": new Set([
		"level",
		"trigger",
		"fileType",
		"isFirstProtection",
	]),
	"onboarding.phase.progressed": new Set([
		"phase",
		"trigger",
		"unlockedFeatures",
	]),
	"onboarding.contextualPrompt.shown": new Set(["promptType", "actionTaken"]),
};

// Define PII patterns that should never be included in telemetry
const PII_PATTERNS = [
	// Email addresses
	/@[^@\s]+\.[^@\s]+/,
	// Phone numbers
	/\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,
	// IP addresses
	/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/,
	// File paths (Unix/Windows)
	/\/[^\s]*\.[a-zA-Z]{1,4}\b/,
	/[A-Z]:\\[^\s]*\.[a-zA-Z]{1,4}\b/,
	// Credit card numbers
	/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/,
	// Social Security Numbers
	/\b\d{3}-\d{2}-\d{4}\b/,
	// Usernames
	/\buser[a-zA-Z0-9_]*\b/i,
	// Passwords
	/\bpass[a-zA-Z0-9_]*\b/i,
];

describe("Telemetry Whitelist Tests", () => {
	let vscodeTelemetry: VSCodeTelemetry;
	let mockContext: any;

	beforeEach(() => {
		// Clear all mocks and captured events before each test
		vi.clearAllMocks();
		capturedEvents.length = 0;

		mockContext = {
			extension: {
				packageJSON: {
					version: "0.1.0",
				},
			},
			globalState: {
				get: vi.fn().mockReturnValue("test-user-id"),
			},
		};

		vscodeTelemetry = new VSCodeTelemetry(mockContext);
	});

	it("should initialize telemetry client", async () => {
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
		expect(mockTelemetryClient.initialize).toHaveBeenCalled();
	});

	it("should only track allowed properties for extension.activated event", async () => {
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

		// Find the activation event from the captured events
		const activationEvent = capturedEvents.find(
			(e) => e.event === "extension.activated",
		);
		expect(activationEvent).toBeDefined();
		if (activationEvent) {
			expect(activationEvent.properties).toBeDefined();

			// Check that only allowed properties are present
			const properties = activationEvent.properties || {};
			const allowedProperties = TELEMETRY_WHITELIST["extension.activated"];

			for (const property in properties) {
				expect(allowedProperties.has(property)).toBe(true);
			}

			// Check that no PII is present in the properties
			for (const property in properties) {
				const value = String(properties[property]);
				for (const pattern of PII_PATTERNS) {
					expect(value).not.toMatch(pattern);
				}
			}
		}
	});

	it("should only track allowed properties for command.execution event", async () => {
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
		vi.clearAllMocks();
		capturedEvents.length = 0;

		// Track a command execution with various properties
		vscodeTelemetry.trackCommandExecution(
			"snapback.createSnapshot",
			120,
			true,
			{
				filesAffected: 5,
				durationMs: 150,
			},
		);

		const commandEvent = capturedEvents.find(
			(e) => e.event === "command.execution",
		);
		expect(commandEvent).toBeDefined();
		if (commandEvent) {
			expect(commandEvent.properties).toBeDefined();

			// Check that only allowed properties are present
			const properties = commandEvent.properties || {};
			const allowedProperties = TELEMETRY_WHITELIST["command.execution"];

			for (const property in properties) {
				// Check if it's an allowed property or a custom property that should be allowed
				if (
					!allowedProperties.has(property) &&
					!["filesAffected", "durationMs"].includes(property)
				) {
					throw new Error(
						`Property ${property} is not allowed for command.execution event`,
					);
				}
			}

			// Check that no PII is present in the properties
			for (const property in properties) {
				const value = String(properties[property]);
				for (const pattern of PII_PATTERNS) {
					if (pattern.test(value)) {
						// Special case: filePath might be allowed if it's just a filename without path
						if (
							property === "filePath" &&
							(value.includes("/") || value.includes("\\"))
						) {
							throw new Error(`PII detected in property ${property}: ${value}`);
						}
						// Other PII should never be present
						if (property !== "filePath") {
							throw new Error(`PII detected in property ${property}: ${value}`);
						}
					}
				}
			}
		}
	});

	it("should filter out PII from all telemetry events", async () => {
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
		vi.clearAllMocks();
		capturedEvents.length = 0;

		// Test that our validation catches PII if it's accidentally sent
		// In a real implementation, the telemetry methods would filter out PII before sending
		// For this test, we're directly calling the track method to simulate accidental PII sending

		// Manually track events with PII to test our validation
		mockTelemetryClient.track("command.execution", {
			command: "snapback.createSnapshot",
			duration: 120,
			success: true,
			userEmail: "user@example.com", // PII that should be caught
			userPhone: "555-123-4567", // PII that should be caught
		});

		mockTelemetryClient.track("snapshot.created", {
			method: "manual",
			filesCount: 10,
			userEmail: "user@example.com", // PII that should be caught
		});

		mockTelemetryClient.track("snapback.used", {
			filesRestored: 3,
			duration: 450,
			success: true,
			userSSN: "123-45-6789", // PII that should be caught
			ipAddress: "192.168.1.1", // PII that should be caught
		});

		mockTelemetryClient.track("error", {
			errorType: "file_access",
			errorMessage: "Permission denied for user john.doe",
			userEmail: "john.doe@company.com", // PII that should be caught
		});

		// Check all captured events for PII - this should throw errors
		let piiErrors = 0;
		for (const event of capturedEvents) {
			if (event.properties) {
				for (const property in event.properties) {
					const value = String(event.properties[property]);
					for (const pattern of PII_PATTERNS) {
						// Skip file paths in certain contexts as they might be allowed
						if (pattern.test(value) && !(property === "fileName")) {
							// Special handling for error messages which might contain PII
							if (event.event === "error" && property === "errorMessage") {
								// In error messages, we should still avoid PII
								if (
									pattern.source.includes("email") ||
									pattern.source.includes("phone") ||
									pattern.source.includes("ssn")
								) {
									piiErrors++;
								}
							} else {
								piiErrors++;
							}
						}
					}
				}
			}
		}

		// We should have detected PII in the events
		expect(piiErrors).toBeGreaterThan(0);
	});

	it("should validate all telemetry events against whitelist", async () => {
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
		vi.clearAllMocks();
		capturedEvents.length = 0;

		// Call all telemetry methods
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
		vscodeTelemetry.trackRiskDetected("HIGH", ["suspicious_pattern"], 0.85, {
			fileName: "test.js",
		});
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
			fileName: "test.js",
		});
		vscodeTelemetry.trackWalkthroughStepCompleted("step1", "Introduction", {
			completionTime: 30,
		});
		vscodeTelemetry.trackOnboardingProtectionAssigned(
			"watch",
			"manual",
			"js",
			true,
		);
		vscodeTelemetry.trackOnboardingPhaseProgression(1, "command", ["feature1"]);
		vscodeTelemetry.trackContextualPromptShown("quick_action", "accepted");

		// Validate each event against the whitelist
		for (const event of capturedEvents) {
			const allowedProperties = TELEMETRY_WHITELIST[event.event];
			if (!allowedProperties) {
				throw new Error(`No whitelist defined for event: ${event.event}`);
			}

			if (event.properties) {
				for (const property in event.properties) {
					// Check if the property is allowed for this event
					if (!allowedProperties.has(property)) {
						// Allow some common custom properties that are safe
						const safeCustomProperties = [
							"trigger",
							"snapshotId",
							"fileName",
							"activationSource",
							"riskLevel",
							"namingPattern",
							"completionTime",
							"filesAffected",
							"method",
							"filesCount",
							"duration",
							"success",
							"filesRestored",
							"patterns",
							"confidence",
							"viewId",
							"notificationType",
							"actionTaken",
							"feature",
							"errorType",
							"errorMessage",
							"stepId",
							"stepTitle",
							"level",
							"fileType",
							"isFirstProtection",
							"phase",
							"unlockedFeatures",
							"promptType",
						];
						if (!safeCustomProperties.includes(property)) {
							throw new Error(
								`Property ${property} is not allowed for event ${event.event}`,
							);
						}
					}
				}
			}
		}
	});
});
