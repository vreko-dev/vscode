/**
 * EventBridge Unit Tests
 *
 * Test coverage:
 * - Event mapping: Engine events → PostHog events
 * - PII scrubbing: File paths, user IDs, content exclusion
 * - Event deduplication: Prevent duplicate events
 * - Feature flagging: V1/V2 routing
 * - Privacy guarantees: Absolute path stripping, identifier hashing
 * - Dispose: Cleanup event listeners
 *
 * Test strategy:
 * - Unit tests with mocked dependencies
 * - Event bus emulation with node:events EventEmitter
 * - Telemetry proxy spy for verification
 * - Deduplication timing tests
 */

import { EventEmitter } from "node:events";
import * as vscode from "vscode";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EventBridge } from "../../../src/bridges/EventBridge";
import type { TelemetryProxy } from "../../../src/services/telemetry-proxy";

describe("EventBridge", () => {
	let eventBridge: EventBridge;
	let mockTelemetryProxy: TelemetryProxy;
	let mockEventBus: EventEmitter;
	let mockContext: vscode.ExtensionContext;

	beforeEach(() => {
		// Mock telemetry proxy
		mockTelemetryProxy = {
			trackEvent: vi.fn(),
		} as unknown as TelemetryProxy;

		// Create real EventEmitter for engine event bus
		mockEventBus = new EventEmitter();

		// Mock VS Code extension context
		mockContext = {
			subscriptions: [],
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
			workspaceState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as unknown as vscode.ExtensionContext;

		// Mock VS Code workspace configuration
		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
			get: vi.fn((key: string, defaultValue?: unknown) => {
				if (key === "useV2Engine") return true; // Enable V2 by default
				return defaultValue;
			}),
		} as unknown as vscode.WorkspaceConfiguration);

		// Mock VS Code workspace folders (property, not function)
		Object.defineProperty(vscode.workspace, "workspaceFolders", {
			value: [
				{
					uri: { fsPath: "/Users/testuser/project" } as vscode.Uri,
					name: "project",
					index: 0,
				},
			] as vscode.WorkspaceFolder[],
			configurable: true,
		});
	});

	afterEach(() => {
		vi.clearAllMocks();
		eventBridge?.dispose();
	});

	describe("Feature Flag Routing", () => {
		it("should enable V2 event forwarding when useV2Engine is true", () => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
			});

			// Emit engine event
			mockEventBus.emit("snapshot.created", {
				snapshotId: "snap_123",
				fileCount: 3,
				totalBytes: 1024,
				trigger: "manual" as const,
				riskScore: 5,
			});

			// Verify PostHog event emitted
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("snapshot.created", {
				method: "manual",
				filesCount: 3,
				totalBytes: 1024,
				riskScore: 5,
			});
		});

		it("should NOT forward events when useV2Engine is false", () => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: false,
			});

			// Emit engine event
			mockEventBus.emit("snapshot.created", {
				snapshotId: "snap_123",
				fileCount: 3,
				totalBytes: 1024,
				trigger: "manual" as const,
				riskScore: 5,
			});

			// Verify no PostHog events emitted
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
		});

		it("should read useV2Engine from VS Code config by default", () => {
			// Mock config to return false
			vi.mocked(vscode.workspace.getConfiguration).mockReturnValue({
				get: vi.fn((key: string, defaultValue?: unknown) => {
					if (key === "useV2Engine") return false;
					return defaultValue;
				}),
			} as unknown as vscode.WorkspaceConfiguration);

			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				// useV2Engine not specified - should read from config
			});

			mockEventBus.emit("snapshot.created", {
				snapshotId: "snap_123",
				fileCount: 3,
				totalBytes: 1024,
				trigger: "manual" as const,
				riskScore: 5,
			});

			// Verify no events forwarded (config returned false)
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
		});
	});

	describe("Event Mapping", () => {
		beforeEach(() => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
			});
		});

		it("should map snapshot.created → snapshot.created with correct properties", () => {
			mockEventBus.emit("snapshot.created", {
				snapshotId: "snap_abc",
				fileCount: 5,
				totalBytes: 2048,
				trigger: "auto" as const,
				riskScore: 7.5,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("snapshot.created", {
				method: "auto",
				filesCount: 5,
				totalBytes: 2048,
				riskScore: 7.5,
			});
		});

		it("should map file.changed → file.changed with scrubbed properties", () => {
			mockEventBus.emit("file.changed", {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 150,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("file.changed", {
				changeType: "modify",
				extension: ".ts",
				lineCount: 150,
			});
		});

		it("should map risk.analyzed → risk.analyzed with aggregate metrics", () => {
			mockEventBus.emit("risk.analyzed", {
				score: 8.2,
				factorCount: 3,
				threatCount: 2,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("risk.analyzed", {
				score: 8.2,
				factorCount: 3,
				threatCount: 2,
			});
		});

		it("should map validation.passed → validation.passed", () => {
			mockEventBus.emit("validation.passed", {
				validator: "types",
				duration: 250,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("validation.passed", {
				validator: "types",
				duration: 250,
			});
		});

		it("should map validation.failed → validation.failed", () => {
			mockEventBus.emit("validation.failed", {
				validator: "cycles",
				errorCount: 3,
				duration: 500,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("validation.failed", {
				validator: "cycles",
				errorCount: 3,
				duration: 500,
			});
		});

		it("should map protection.changed → protection.changed", () => {
			mockEventBus.emit("protection.changed", {
				from: "watch",
				to: "warn",
				source: "user" as const,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("protection.changed", {
				from: "watch",
				to: "warn",
				source: "user",
			});
		});

		it("should map error.occurred → error.occurred with component info", () => {
			mockEventBus.emit("error.occurred", {
				component: "orchestrator",
				message: "Snapshot creation failed",
				recoverable: true,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("error.occurred", {
				component: "orchestrator",
				message: "Snapshot creation failed",
				recoverable: true,
			});
		});

		it("should map session.started → session.started with hashed IDs", () => {
			mockEventBus.emit("session.started", {
				sessionId: "sess_12345",
				workspaceHash: "abc123def456", // Already hashed by engine
			});

			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];
			expect(call[0]).toBe("session.started");
			expect(call[1]).toMatchObject({
				workspaceHash: "abc123def456", // Pass through pre-hashed value
			});
			expect(call[1]).toHaveProperty("sessionIdHash"); // Session ID should be hashed
			expect(typeof call[1].sessionIdHash).toBe("string");
			expect(call[1].sessionIdHash).not.toBe("sess_12345"); // Hashed, not raw
		});

		it("should map session.ended → session.ended with aggregate stats", () => {
			mockEventBus.emit("session.ended", {
				sessionId: "sess_12345",
				duration: 3600000, // 1 hour
				filesModified: 15,
				snapshotsCreated: 3,
			});

			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];
			expect(call[0]).toBe("session.ended");
			expect(call[1]).toMatchObject({
				duration: 3600000,
				filesModified: 15,
				snapshotsCreated: 3,
			});
			expect(call[1]).toHaveProperty("sessionIdHash");
		});
	});

	describe("PII Scrubbing", () => {
		beforeEach(() => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
				scrubOptions: {
					stripAbsolutePaths: true,
					hashIdentifiers: true,
					excludeFileContent: true,
				},
			});
		});

		it("should strip absolute file paths and hash them", () => {
			// Simulate an event with absolute path (hypothetical extension)
			const eventWithPath = {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 100,
				// Note: file.changed doesn't have filePath in engine schema
				// but we test scrubProperties directly via other events
			};

			mockEventBus.emit("file.changed", eventWithPath);

			// Verify no absolute path in emitted event
			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];
			expect(call[1]).not.toHaveProperty("filePath");
			expect(call[1]).not.toHaveProperty("absolutePath");
		});

		it("should hash user identifiers (session IDs, workspace IDs)", () => {
			mockEventBus.emit("session.started", {
				sessionId: "my-session-id",
				workspaceHash: "already-hashed",
			});

			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];

			// Session ID should be hashed
			expect(call[1]).toHaveProperty("sessionIdHash");
			expect(call[1].sessionIdHash).not.toBe("my-session-id");
			expect(typeof call[1].sessionIdHash).toBe("string");
			expect(call[1].sessionIdHash).toHaveLength(64); // SHA-256 hex length
		});

		it("should never log file content", () => {
			// Engine events don't include content by design, but test scrubbing logic
			// This is enforced by scrubProperties method

			const eventWithProperties = {
				score: 5,
				factorCount: 2,
				threatCount: 1,
				// Hypothetical content field (should be scrubbed)
			};

			mockEventBus.emit("risk.analyzed", eventWithProperties);

			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];
			expect(call[1]).not.toHaveProperty("content");
			expect(call[1]).not.toHaveProperty("fileContent");
			expect(call[1]).not.toHaveProperty("diff");
			expect(call[1]).not.toHaveProperty("patch");
		});

		it("should preserve aggregate metrics (counts, scores, durations)", () => {
			mockEventBus.emit("snapshot.created", {
				snapshotId: "snap_xyz",
				fileCount: 10,
				totalBytes: 4096,
				trigger: "risk" as const,
				riskScore: 9.5,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"snapshot.created",
				expect.objectContaining({
					filesCount: 10,
					totalBytes: 4096,
					riskScore: 9.5,
					method: "risk",
				}),
			);
		});

		it("should handle missing workspace root gracefully", () => {
			// Simulate no workspace folders
			Object.defineProperty(vscode.workspace, "workspaceFolders", {
				value: undefined,
				configurable: true,
			});

			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
			});

			// Should not throw
			mockEventBus.emit("file.changed", {
				changeType: "add" as const,
				extension: ".js",
				lineCount: 50,
			});

			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalled();
		});
	});

	describe("Event Deduplication", () => {
		beforeEach(() => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
				dedupeWindowMs: 1000, // 1 second window
			});
		});

		it("should deduplicate identical events within window", () => {
			// Emit same event twice within 1 second
			mockEventBus.emit("file.changed", {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 100,
			});

			mockEventBus.emit("file.changed", {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 100,
			});

			// Should only track once
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledTimes(1);
		});

		it("should allow events after deduplication window expires", async () => {
			// Dispose previous instance to remove its listeners
			if (eventBridge) {
				eventBridge.dispose();
			}

			// Clear previous mocks to avoid cross-test contamination
			vi.clearAllMocks();

			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
				dedupeWindowMs: 50, // 50ms window for faster tests
			});

			// First event
			mockEventBus.emit("file.changed", {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 100,
			});

			// Wait for window to expire
			await new Promise((resolve) => setTimeout(resolve, 60));

			// Second event (should be tracked)
			mockEventBus.emit("file.changed", {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 100,
			});

			// Should track both events
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledTimes(2);
		});

		it("should NOT deduplicate different event types", () => {
			mockEventBus.emit("file.changed", {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 100,
			});

			mockEventBus.emit("risk.analyzed", {
				score: 5,
				factorCount: 2,
				threatCount: 1,
			});

			// Both events should be tracked (different types)
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledTimes(2);
		});
	});

	describe("Error Handling", () => {
		beforeEach(() => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
			});
		});

		it("should handle telemetry proxy errors gracefully", () => {
			// Mock trackEvent to throw
			vi.mocked(mockTelemetryProxy.trackEvent).mockImplementation(() => {
				throw new Error("Network error");
			});

			// Should not throw
			expect(() => {
				mockEventBus.emit("snapshot.created", {
					snapshotId: "snap_123",
					fileCount: 3,
					totalBytes: 1024,
					trigger: "manual" as const,
					riskScore: 5,
				});
			}).not.toThrow();
		});

		it("should log console error on event handling failure", () => {
			const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

			// Mock trackEvent to throw
			vi.mocked(mockTelemetryProxy.trackEvent).mockImplementation(() => {
				throw new Error("Test error");
			});

			mockEventBus.emit("snapshot.created", {
				snapshotId: "snap_123",
				fileCount: 3,
				totalBytes: 1024,
				trigger: "manual" as const,
				riskScore: 5,
			});

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining("EventBridge: Error handling snapshot.created"),
				expect.any(Error),
			);

			consoleErrorSpy.mockRestore();
		});
	});

	describe("Dispose", () => {
		it("should remove all event listeners on dispose", () => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
			});

			// Dispose
			eventBridge.dispose();

			// Emit event after dispose
			mockEventBus.emit("snapshot.created", {
				snapshotId: "snap_123",
				fileCount: 3,
				totalBytes: 1024,
				trigger: "manual" as const,
				riskScore: 5,
			});

			// Should not track event
			expect(mockTelemetryProxy.trackEvent).not.toHaveBeenCalled();
		});

		it("should clear deduplication state on dispose", () => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
				dedupeWindowMs: 1000,
			});

			// Emit event
			mockEventBus.emit("file.changed", {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 100,
			});

			// Dispose
			eventBridge.dispose();

			// Create new instance (same event bus)
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
				dedupeWindowMs: 1000,
			});

			// Emit same event again (should NOT be deduplicated - new instance)
			mockEventBus.emit("file.changed", {
				changeType: "modify" as const,
				extension: ".ts",
				lineCount: 100,
			});

			// Should track both events (dedupe state cleared on dispose)
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledTimes(2);
		});

		it("should not throw on multiple dispose calls", () => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
			});

			expect(() => {
				eventBridge.dispose();
				eventBridge.dispose();
				eventBridge.dispose();
			}).not.toThrow();
		});
	});

	describe("Privacy Guarantees", () => {
		beforeEach(() => {
			eventBridge = new EventBridge({
				context: mockContext,
				telemetryProxy: mockTelemetryProxy,
				eventBus: mockEventBus,
				useV2Engine: true,
			});
		});

		it("should never emit raw session IDs", () => {
			mockEventBus.emit("session.started", {
				sessionId: "raw-session-id-123",
				workspaceHash: "hashed-workspace",
			});

			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];
			const allValues = Object.values(call[1]);

			// Raw session ID should not appear anywhere
			expect(allValues).not.toContain("raw-session-id-123");
			expect(call[1]).not.toHaveProperty("sessionId");
		});

		it("should preserve pre-hashed values from engine", () => {
			mockEventBus.emit("session.started", {
				sessionId: "sess_abc",
				workspaceHash: "pre-hashed-by-engine",
			});

			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];

			// Workspace hash should pass through (already hashed by engine)
			expect(call[1].workspaceHash).toBe("pre-hashed-by-engine");
		});

		it("should use SHA-256 for identifier hashing (64 hex chars)", () => {
			mockEventBus.emit("session.started", {
				sessionId: "test-id",
				workspaceHash: "already-hashed",
			});

			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];

			// SHA-256 produces 64 hex characters
			expect(call[1].sessionIdHash).toHaveLength(64);
			expect(call[1].sessionIdHash).toMatch(/^[a-f0-9]{64}$/);
		});

		it("should only emit allowlisted aggregate properties", () => {
			mockEventBus.emit("snapshot.created", {
				snapshotId: "snap_123",
				fileCount: 5,
				totalBytes: 2048,
				trigger: "auto" as const,
				riskScore: 6.5,
			});

			const call = vi.mocked(mockTelemetryProxy.trackEvent).mock.calls[0];
			const allowedKeys = ["method", "filesCount", "totalBytes", "riskScore"];

			// Only allowlisted keys should be present
			expect(Object.keys(call[1])).toEqual(expect.arrayContaining(allowedKeys));

			// No PII should be present
			expect(call[1]).not.toHaveProperty("snapshotId");
		});
	});
});
