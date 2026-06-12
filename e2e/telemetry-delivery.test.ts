/**
 * Telemetry Delivery E2E Tests
 *
 * End-to-end tests for telemetry batch delivery including aggregation,
 * rate limiting, and actual delivery to telemetry proxy.
 *
 * BASELINE: v1.0 - Batch delivery <100ms, rate limit drops tracked
 * COVERAGE TARGET: Behavior contracts (not coverage-driven)
 *
 * @module test/e2e/telemetry-delivery
 */

import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { ExtensionContext } from "vscode";
import { VSCodeTelemetry } from "../../src/telemetry";

// Mock VS Code API
vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string) => {
				if (key === "posthogKey") return "test-key-e2e";
				if (key === "telemetryProxy") return "https://e2e.test.proxy";
				return undefined;
			}),
		})),
	},
	version: "1.85.0",
}));

// Mock telemetry client with delivery tracking
const mockDeliveredEvents: any[] = [];
vi.mock("../../src/telemetry/local-telemetry-client", () => ({
	TelemetryClient: vi.fn().mockImplementation(() => ({
		initialize: vi.fn().mockResolvedValue(undefined),
		trackEvent: vi.fn((event: any) => {
			mockDeliveredEvents.push(event);
		}),
	})),
}));

describe("Telemetry Batch Delivery (E2E)", () => {
	let telemetry: VSCodeTelemetry;
	let mockContext: ExtensionContext;

	beforeAll(async () => {
		vi.clearAllMocks();
		mockDeliveredEvents.length = 0;
		vi.useFakeTimers();

		mockContext = {
			extension: {
				packageJSON: { version: "1.0.0-e2e" },
			},
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		} as any;

		telemetry = new VSCodeTelemetry(mockContext);
		await telemetry.initialize();
	});

	afterAll(() => {
		vi.useRealTimers();
	});

	it("should complete full cycle: aggregate → flush → verify delivery", async () => {
		// PHASE 1: Aggregate events
		const startTime = Date.now();

		for (let i = 0; i < 25; i++) {
			telemetry.trackCommandExecution(`command.${i}`, 100 + i, true);
		}

		// Verify buffering (not delivered yet)
		expect(mockDeliveredEvents.length).toBe(1); // Only initial activation event

		const snapshot = telemetry.getMetricsSnapshot();
		expect(snapshot.bufferedEvents).toBe(25);
		expect(snapshot.totalCount).toBe(25);

		// PHASE 2: Trigger flush (60s timer)
		vi.advanceTimersByTime(60000);

		// PHASE 3: Verify delivery
		// Should have delivered batch event
		const batchEvents = mockDeliveredEvents.filter(
			(e) => e.event === "telemetry.metrics_batch"
		);
		expect(batchEvents.length).toBeGreaterThan(0);

		const batchEvent = batchEvents[batchEvents.length - 1];
		expect(batchEvent.properties.totalEvents).toBe(25);
		expect(batchEvent.properties.uniqueEvents).toBe(25);
		expect(batchEvent.properties.droppedEvents).toBe(0); // No drops

		// BASELINE: Full cycle <100ms (excluding timer wait)
		const deliveryDuration = Date.now() - startTime;
		expect(deliveryDuration).toBeLessThan(100);
	});

	it("should apply rate limiting: 200 events → 100 delivered + 100 dropped", async () => {
		// Clear previous events
		mockDeliveredEvents.length = 0;

		// PHASE 1: Generate 200 unique events (exceeds 100 limit)
		for (let i = 0; i < 200; i++) {
			telemetry.trackCommandExecution(`overload.command.${i}`, 50, true);
		}

		// Verify all buffered
		const beforeFlush = telemetry.getMetricsSnapshot();
		expect(beforeFlush.bufferedEvents).toBe(200);

		// PHASE 2: Flush and apply rate limit
		vi.advanceTimersByTime(60000);

		// PHASE 3: Verify rate limiting applied
		const batchEvents = mockDeliveredEvents.filter(
			(e) => e.event === "telemetry.metrics_batch"
		);
		expect(batchEvents.length).toBeGreaterThan(0);

		const batchEvent = batchEvents[batchEvents.length - 1];
		expect(batchEvent.properties.totalEvents).toBe(200); // Total tracked
		expect(batchEvent.properties.uniqueEvents).toBe(200); // Unique events
		expect(batchEvent.properties.droppedEvents).toBe(100); // Rate limit drops

		// Only 100 events should be in the metrics array
		expect(batchEvent.properties.metrics.length).toBe(100);

		// PHASE 4: Verify buffer cleared after flush
		const afterFlush = telemetry.getMetricsSnapshot();
		expect(afterFlush.bufferedEvents).toBe(0);
		expect(afterFlush.totalCount).toBe(0);
	});
});
