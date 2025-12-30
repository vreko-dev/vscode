/**
 * Core Event Tracker Unit Tests
 *
 * Tests the CoreEventTracker class for P0 product events:
 * - save_attempt
 * - snapshot_created
 * - session_finalized
 *
 * Verifies:
 * - Type-safe event properties
 * - Fire-and-forget pattern (no blocking)
 * - Singleton initialization
 * - Event version and timestamp injection
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { CORE_TELEMETRY_EVENTS, EVENT_VERSION } from "@snapback/contracts";
import {
	CoreEventTracker,
	getCoreEventTracker,
	initializeCoreEventTracker,
} from "../../../src/telemetry/core-event-tracker";

// Mock TelemetryProxy
const mockTrackEvent = vi.fn().mockResolvedValue(undefined);
const mockTelemetryProxy = {
	trackEvent: mockTrackEvent,
} as any;

describe("CoreEventTracker", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Reset the singleton
		(globalThis as any).__coreEventTrackerInstance = null;
	});

	describe("constructor", () => {
		it("should create a CoreEventTracker instance", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);
			expect(tracker).toBeDefined();
			expect(tracker).toBeInstanceOf(CoreEventTracker);
		});
	});

	describe("trackSaveAttempt", () => {
		it("should track save_attempt event with correct properties", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackSaveAttempt({
				protection: "watch",
				severity: "low",
				file_kind: "typescript",
				reason: "user_save",
				ai_present: false,
				ai_burst: false,
				outcome: "saved",
			});

			expect(mockTrackEvent).toHaveBeenCalledTimes(1);
			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.SAVE_ATTEMPT,
				expect.objectContaining({
					protection: "watch",
					severity: "low",
					file_kind: "typescript",
					reason: "user_save",
					ai_present: false,
					ai_burst: false,
					outcome: "saved",
					event_version: EVENT_VERSION,
					timestamp: expect.any(Number),
				}),
			);
		});

		it("should support all protection levels", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);
			const protectionLevels = ["watch", "warn", "block"] as const;

			for (const protection of protectionLevels) {
				mockTrackEvent.mockClear();
				tracker.trackSaveAttempt({
					protection,
					severity: "low",
					file_kind: "typescript",
					reason: "user_save",
					ai_present: false,
					ai_burst: false,
					outcome: "saved",
				});

				expect(mockTrackEvent).toHaveBeenCalledWith(
					CORE_TELEMETRY_EVENTS.SAVE_ATTEMPT,
					expect.objectContaining({ protection }),
				);
			}
		});

		it("should support all outcome types", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);
			const outcomes = ["saved", "canceled", "blocked"] as const;

			for (const outcome of outcomes) {
				mockTrackEvent.mockClear();
				tracker.trackSaveAttempt({
					protection: "watch",
					severity: "low",
					file_kind: "typescript",
					reason: "user_save",
					ai_present: false,
					ai_burst: false,
					outcome,
				});

				expect(mockTrackEvent).toHaveBeenCalledWith(
					CORE_TELEMETRY_EVENTS.SAVE_ATTEMPT,
					expect.objectContaining({ outcome }),
				);
			}
		});

		it("should track AI-related properties", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackSaveAttempt({
				protection: "warn",
				severity: "high",
				file_kind: "javascript",
				reason: "auto_save",
				ai_present: true,
				ai_burst: true,
				outcome: "saved",
			});

			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.SAVE_ATTEMPT,
				expect.objectContaining({
					ai_present: true,
					ai_burst: true,
				}),
			);
		});
	});

	describe("trackSnapshotCreated", () => {
		it("should track snapshot_created event with correct properties", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackSnapshotCreated({
				session_id: "session_123",
				snapshot_id: "snap_456",
				bytes_original: 1024,
				bytes_stored: 512,
				dedup_hit: true,
				latency_ms: 45,
			});

			expect(mockTrackEvent).toHaveBeenCalledTimes(1);
			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.SNAPSHOT_CREATED,
				expect.objectContaining({
					session_id: "session_123",
					snapshot_id: "snap_456",
					bytes_original: 1024,
					bytes_stored: 512,
					dedup_hit: true,
					latency_ms: 45,
					event_version: EVENT_VERSION,
					timestamp: expect.any(Number),
				}),
			);
		});

		it("should track dedup_hit = false when no deduplication", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackSnapshotCreated({
				session_id: "session_123",
				snapshot_id: "snap_789",
				bytes_original: 2048,
				bytes_stored: 2048,
				dedup_hit: false,
				latency_ms: 100,
			});

			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.SNAPSHOT_CREATED,
				expect.objectContaining({
					dedup_hit: false,
					bytes_original: 2048,
					bytes_stored: 2048,
				}),
			);
		});
	});

	describe("trackSessionFinalized", () => {
		it("should track session_finalized event with correct properties", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackSessionFinalized({
				session_id: "session_123",
				files: ["src/index.ts", "package.json"],
				triggers: ["save", "idle"],
				duration_ms: 120000,
				ai_present: true,
				ai_burst: false,
				highest_severity: "medium",
			});

			expect(mockTrackEvent).toHaveBeenCalledTimes(1);
			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.SESSION_FINALIZED,
				expect.objectContaining({
					session_id: "session_123",
					files: ["src/index.ts", "package.json"],
					triggers: ["save", "idle"],
					duration_ms: 120000,
					ai_present: true,
					ai_burst: false,
					highest_severity: "medium",
					event_version: EVENT_VERSION,
					timestamp: expect.any(Number),
				}),
			);
		});

		it("should support all severity levels", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);
			const severities = ["info", "low", "medium", "high", "critical"] as const;

			for (const severity of severities) {
				mockTrackEvent.mockClear();
				tracker.trackSessionFinalized({
					session_id: "session_123",
					files: [],
					triggers: ["manual"],
					duration_ms: 1000,
					ai_present: false,
					ai_burst: false,
					highest_severity: severity,
				});

				expect(mockTrackEvent).toHaveBeenCalledWith(
					CORE_TELEMETRY_EVENTS.SESSION_FINALIZED,
					expect.objectContaining({ highest_severity: severity }),
				);
			}
		});

		it("should include optional AI detection v1 fields when provided", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackSessionFinalized({
				session_id: "session_123",
				files: ["file.ts"],
				triggers: ["ai_burst"],
				duration_ms: 60000,
				ai_present: true,
				ai_burst: true,
				highest_severity: "high",
				ai_assist_level: "heavy",
				ai_confidence_score: 8.5,
				ai_provider: "cursor",
				ai_large_insert_count: 5,
				ai_total_chars: 2000,
			});

			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.SESSION_FINALIZED,
				expect.objectContaining({
					ai_assist_level: "heavy",
					ai_confidence_score: 8.5,
					ai_provider: "cursor",
					ai_large_insert_count: 5,
					ai_total_chars: 2000,
				}),
			);
		});
	});

	describe("trackIssueCreated", () => {
		it("should track issue_created event with correct properties", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackIssueCreated({
				issue_id: "issue_123",
				session_id: "session_456",
				file_kind: "typescript",
				type: "secret",
				severity: "high",
				recommendation: "Remove the secret from the file",
			});

			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.ISSUE_CREATED,
				expect.objectContaining({
					issue_id: "issue_123",
					session_id: "session_456",
					file_kind: "typescript",
					type: "secret",
					severity: "high",
					recommendation: "Remove the secret from the file",
				}),
			);
		});
	});

	describe("trackIssueResolved", () => {
		it("should track issue_resolved event with correct properties", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackIssueResolved({
				issue_id: "issue_123",
				resolution: "fixed",
			});

			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.ISSUE_RESOLVED,
				expect.objectContaining({
					issue_id: "issue_123",
					resolution: "fixed",
				}),
			);
		});
	});

	describe("trackSessionRestored", () => {
		it("should track session_restored event with correct properties", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackSessionRestored({
				session_id: "session_123",
				files_restored: ["file1.ts", "file2.ts"],
				time_to_restore_ms: 2500,
				reason: "user_request",
			});

			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.SESSION_RESTORED,
				expect.objectContaining({
					session_id: "session_123",
					files_restored: ["file1.ts", "file2.ts"],
					time_to_restore_ms: 2500,
					reason: "user_request",
				}),
			);
		});
	});

	describe("trackPolicyChanged", () => {
		it("should track policy_changed event with correct properties", () => {
			const tracker = new CoreEventTracker(mockTelemetryProxy);

			tracker.trackPolicyChanged({
				pattern: "*.env",
				from: "watch",
				to: "block",
				source: "user",
			});

			expect(mockTrackEvent).toHaveBeenCalledWith(
				CORE_TELEMETRY_EVENTS.POLICY_CHANGED,
				expect.objectContaining({
					pattern: "*.env",
					from: "watch",
					to: "block",
					source: "user",
				}),
			);
		});
	});

	describe("singleton pattern", () => {
		it("should return null before initialization", () => {
			expect(getCoreEventTracker()).toBeNull();
		});

		it("should return the instance after initialization", () => {
			initializeCoreEventTracker(mockTelemetryProxy);
			const tracker = getCoreEventTracker();

			expect(tracker).toBeDefined();
			expect(tracker).toBeInstanceOf(CoreEventTracker);
		});

		it("should return the same instance on subsequent calls", () => {
			initializeCoreEventTracker(mockTelemetryProxy);
			const tracker1 = getCoreEventTracker();
			const tracker2 = getCoreEventTracker();

			expect(tracker1).toBe(tracker2);
		});
	});

	describe("fire-and-forget pattern", () => {
		it("should not block when tracking events", async () => {
			const slowTrackEvent = vi.fn().mockImplementation(
				() =>
					new Promise((resolve) => {
						setTimeout(resolve, 100);
					}),
			);
			const slowProxy = { trackEvent: slowTrackEvent } as any;
			const tracker = new CoreEventTracker(slowProxy);

			const startTime = Date.now();

			// These should all complete immediately (fire-and-forget)
			tracker.trackSaveAttempt({
				protection: "watch",
				severity: "low",
				file_kind: "ts",
				reason: "test",
				ai_present: false,
				ai_burst: false,
				outcome: "saved",
			});

			tracker.trackSnapshotCreated({
				session_id: "s1",
				snapshot_id: "snap1",
				bytes_original: 100,
				bytes_stored: 100,
				dedup_hit: false,
				latency_ms: 10,
			});

			tracker.trackSessionFinalized({
				session_id: "s1",
				files: [],
				triggers: ["test"],
				duration_ms: 1000,
				ai_present: false,
				ai_burst: false,
				highest_severity: "info",
			});

			const elapsed = Date.now() - startTime;

			// Should complete in less than 50ms (way less than 300ms if we awaited all 3)
			expect(elapsed).toBeLessThan(50);
			expect(slowTrackEvent).toHaveBeenCalledTimes(3);
		});
	});
});
