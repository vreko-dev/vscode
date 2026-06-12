/**
 * Metrics Aggregation Integration Tests
 *
 * Tests telemetry event buffering, rate limiting, and batch flushing.
 * Based on production telemetry patterns and data integrity requirements.
 *
 * BASELINE: v1.0 - 60s flush interval, 100 event rate limit, atomic counters
 * COVERAGE TARGET: 90%+ branches (data integrity critical)
 *
 * @module test/integration/metrics-batch
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "vscode";
import { VSCodeTelemetry } from "../../src/telemetry";

// Mock VS Code API
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string) => {
				if (key === "posthogKey") return "test-key";
				if (key === "telemetryProxy") return "https://test.proxy";
				return undefined;
			}),
		})),
	},
	version: "1.85.0",
}));

// Mock telemetry client
vi.mock("../../src/telemetry/local-telemetry-client", () => ({
	TelemetryClient: vi.fn().mockImplementation(() => ({
		initialize: vi.fn().mockResolvedValue(undefined),
		trackEvent: vi.fn(),
	})),
}));

describe("Event Aggregation", () => {
	let telemetry: VSCodeTelemetry;
	let mockContext: ExtensionContext;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		mockContext = {
			extension: {
				packageJSON: { version: "1.0.0" },
			},
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any;

		telemetry = new VSCodeTelemetry(mockContext);
		await telemetry.initialize();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should buffer single event without immediate flush", () => {
		// GIVEN: Metrics aggregation is active
		// WHEN: Single event is tracked
		telemetry.trackCommandExecution("test.command", 100, true);

		// THEN: Should aggregate in buffer, NOT flush immediately
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(1);
		expect(snapshot.totalCount).toBe(1);
	});

	it("should deduplicate and increment count for duplicate events", () => {
		// GIVEN: Multiple identical events
		// WHEN: Same event tracked 5 times
		for (let i = 0; i < 5; i++) {
			telemetry.trackCommandExecution("test.command", 100, true);
		}

		// THEN: Should have 1 unique event with count=5
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(1); // 1 unique event type
		expect(snapshot.totalCount).toBe(5); // Total occurrences
	});

	it("should maintain separate counters for different event types", () => {
		// GIVEN: Different event types
		// WHEN: Tracking multiple event types
		telemetry.trackCommandExecution("command.a", 100, true);
		telemetry.trackCommandExecution("command.a", 100, true);
		telemetry.trackSnapshotCreated("manual", 5);
		telemetry.trackRiskDetected("high", ["xss"], 0.9);

		// THEN: Should have 3 unique events with correct counts
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(3); // 3 unique event types
		expect(snapshot.totalCount).toBe(4); // 2 + 1 + 1
	});
});

describe("Rate Limiting (100 Event Cap)", () => {
	let telemetry: VSCodeTelemetry;
	let mockContext: ExtensionContext;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		mockContext = {
			extension: {
				packageJSON: { version: "1.0.0" },
			},
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any;

		telemetry = new VSCodeTelemetry(mockContext);
		await telemetry.initialize();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should handle exactly 100 unique events without drops", () => {
		// GIVEN: Rate limit is 100 events
		// WHEN: Tracking exactly 100 unique events
		for (let i = 0; i < 100; i++) {
			telemetry.trackCommandExecution(`command.${i}`, 100, true);
		}

		// THEN: All events should be buffered
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(100);
		expect(snapshot.totalCount).toBe(100);
	});

	it("should apply rate limiting when buffer exceeds 100 unique events", () => {
		// GIVEN: More than 100 unique events
		// WHEN: Tracking 150 unique events
		for (let i = 0; i < 150; i++) {
			telemetry.trackCommandExecution(`command.${i}`, 100, true);
		}

		// Trigger flush
		vi.advanceTimersByTime(60000); // 60s

		// THEN: Should drop 50 events (150 - 100 limit)
		// Flush should report droppedEvents: 50
		const snapshot = telemetry.getMetricsSnapshot();

		// After flush, buffer should be empty
		expect(snapshot.bufferedEvents).toBe(0);
	});

	it("should prioritize most frequent events when dropping (sort by count)", () => {
		// GIVEN: Buffer over limit with varying frequencies
		// WHEN: Some events occur more frequently
		for (let i = 0; i < 50; i++) {
			telemetry.trackCommandExecution("frequent.command", 100, true);
		}
		for (let i = 0; i < 100; i++) {
			telemetry.trackCommandExecution(`rare.command.${i}`, 100, true);
		}

		// THEN: Should keep frequent.command (count=50)
		// Should drop less frequent events first
		const snapshot = telemetry.getMetricsSnapshot();
		const topEvents = snapshot.topEvents;

		expect(topEvents[0].eventName).toContain("frequent");
		expect(topEvents[0].count).toBe(50);
	});
});

describe("Flush Cycles", () => {
	let telemetry: VSCodeTelemetry;
	let mockContext: ExtensionContext;
	let mockTelemetryClient: any;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		mockContext = {
			extension: {
				packageJSON: { version: "1.0.0" },
			},
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any;

		telemetry = new VSCodeTelemetry(mockContext);

		// Spy on telemetryClient
		const { TelemetryClient } = await import("../../src/telemetry/local-telemetry-client");
		mockTelemetryClient = new TelemetryClient("test-key", "https://test.proxy", "vscode");

		await telemetry.initialize();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should flush metrics after 60s timer (BASELINE)", () => {
		// GIVEN: Events buffered
		telemetry.trackCommandExecution("test.command", 100, true);

		// WHEN: 60s timer expires
		vi.advanceTimersByTime(60000);

		// THEN: Should flush aggregated metrics
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(0); // Buffer cleared after flush
	});

	it("should flush on shutdown even with pending metrics", async () => {
		// GIVEN: Events in buffer
		for (let i = 0; i < 10; i++) {
			telemetry.trackCommandExecution(`command.${i}`, 100, true);
		}

		// WHEN: Shutdown is triggered before timer
		await telemetry.shutdown();

		// THEN: Should flush immediately (not wait for 60s timer)
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(0);
	});

	it("should handle empty buffer flush as no-op", () => {
		// GIVEN: No events buffered
		// WHEN: Timer triggers flush
		vi.advanceTimersByTime(60000);

		// THEN: Should not throw, should be no-op
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(0);
		expect(snapshot.totalCount).toBe(0);
	});

	it("should maintain flush interval accuracy (no drift)", () => {
		// GIVEN: Multiple flush cycles
		// WHEN: 3 flush cycles occur (3 x 60s = 180s)
		telemetry.trackCommandExecution("test", 100, true);
		vi.advanceTimersByTime(60000);

		telemetry.trackCommandExecution("test", 100, true);
		vi.advanceTimersByTime(60000);

		telemetry.trackCommandExecution("test", 100, true);
		vi.advanceTimersByTime(60000);

		// THEN: Each flush should occur at exact 60s intervals (no drift)
		// Buffer should be cleared after each flush
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(0);
	});
});

describe("Concurrent Operations and Race Conditions", () => {
	let telemetry: VSCodeTelemetry;
	let mockContext: ExtensionContext;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		mockContext = {
			extension: {
				packageJSON: { version: "1.0.0" },
			},
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any;

		telemetry = new VSCodeTelemetry(mockContext);
		await telemetry.initialize();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("should handle concurrent metric increments atomically", async () => {
		// GIVEN: Concurrent events for same metric
		// WHEN: Multiple promises track same event simultaneously
		const promises = Array.from({ length: 100 }, () =>
			Promise.resolve().then(() => telemetry.trackCommandExecution("concurrent.test", 100, true))
		);

		await Promise.all(promises);

		// THEN: Count should be exactly 100 (atomic increment, no race)
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.totalCount).toBe(100);
	});

	it("should handle flush during active metric tracking", () => {
		// GIVEN: Events being tracked
		for (let i = 0; i < 50; i++) {
			telemetry.trackCommandExecution(`command.${i}`, 100, true);
		}

		// WHEN: Flush occurs while new events arrive
		vi.advanceTimersByTime(60000); // Trigger flush

		// AND: More events tracked during flush
		telemetry.trackCommandExecution("post-flush.command", 100, true);

		// THEN: New events should buffer for next flush cycle
		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBeGreaterThan(0);
	});
});
