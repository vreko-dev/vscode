import { beforeEach, describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";

// Mock dependencies
const mockGlobalState = {
	get: vi.fn(),
	update: vi.fn(),
	setKeysForSync: vi.fn(),
};

const mockContext: vscode.ExtensionContext = {
	globalState: mockGlobalState,
	subscriptions: [],
} as unknown as vscode.ExtensionContext;

describe("OfflineEventQueue", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGlobalState.get.mockReturnValue(undefined);
		mockGlobalState.update.mockResolvedValue(undefined);
	});

	describe("Constructor", () => {
		it("should create queue with empty state", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			expect(queue).toBeDefined();
			expect(queue.size()).toBe(0);
		});

		it("should restore queue from persisted state", async () => {
			const persistedEvents = [
				{
					id: "event-1",
					event: "test.event",
					properties: { foo: "bar" },
					timestamp: Date.now(),
					retryCount: 0,
				},
			];

			mockGlobalState.get.mockReturnValue(persistedEvents);

			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			expect(queue.size()).toBe(1);
			expect(mockGlobalState.get).toHaveBeenCalledWith(
				"snapback.offlineEventQueue",
				[],
			);
		});

		it("should enforce maximum queue size on restore", async () => {
			const largeQueue = Array.from({ length: 150 }, (_, i) => ({
				id: `event-${i}`,
				event: "test.event",
				properties: {},
				timestamp: Date.now(),
				retryCount: 0,
			}));

			mockGlobalState.get.mockReturnValue(largeQueue);

			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			// Should keep only the most recent 100 events (default max)
			expect(queue.size()).toBe(100);
		});
	});

	describe("enqueue()", () => {
		it("should add event to queue", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("test.event", { foo: "bar" });

			expect(queue.size()).toBe(1);
		});

		it("should persist queue to globalState", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("test.event", { foo: "bar" });

			expect(mockGlobalState.update).toHaveBeenCalledWith(
				"snapback.offlineEventQueue",
				expect.arrayContaining([
					expect.objectContaining({
						event: "test.event",
						properties: { foo: "bar" },
					}),
				]),
			);
		});

		it("should assign unique ID to each event", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			queue.enqueue("event2", {});

			const events = queue.getAll();
			expect(events[0].id).toBeDefined();
			expect(events[1].id).toBeDefined();
			expect(events[0].id).not.toBe(events[1].id);
		});

		it("should add timestamp to event", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			const before = Date.now();
			queue.enqueue("test.event", {});
			const after = Date.now();

			const events = queue.getAll();
			expect(events[0].timestamp).toBeGreaterThanOrEqual(before);
			expect(events[0].timestamp).toBeLessThanOrEqual(after);
		});

		it("should initialize retryCount to 0", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("test.event", {});

			const events = queue.getAll();
			expect(events[0].retryCount).toBe(0);
		});

		it("should enforce maximum queue size", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext, { maxSize: 3 });

			queue.enqueue("event1", {});
			queue.enqueue("event2", {});
			queue.enqueue("event3", {});
			queue.enqueue("event4", {}); // Should evict oldest

			expect(queue.size()).toBe(3);
			const events = queue.getAll();
			expect(events.map((e) => e.event)).toEqual([
				"event2",
				"event3",
				"event4",
			]);
		});

		it("should drop oldest events when queue is full", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext, { maxSize: 2 });

			queue.enqueue("old", { order: 1 });
			queue.enqueue("middle", { order: 2 });
			queue.enqueue("new", { order: 3 });

			const events = queue.getAll();
			expect(events).toHaveLength(2);
			expect(events[0].event).toBe("middle");
			expect(events[1].event).toBe("new");
		});
	});

	describe("dequeue()", () => {
		it("should remove and return first event", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			queue.enqueue("event2", {});

			const event = queue.dequeue();

			expect(event?.event).toBe("event1");
			expect(queue.size()).toBe(1);
		});

		it("should return null when queue is empty", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			const event = queue.dequeue();

			expect(event).toBeNull();
		});

		it("should persist updated queue after dequeue", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			vi.clearAllMocks();

			queue.dequeue();

			expect(mockGlobalState.update).toHaveBeenCalledWith(
				"snapback.offlineEventQueue",
				[],
			);
		});
	});

	describe("peek()", () => {
		it("should return first event without removing it", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			queue.enqueue("event2", {});

			const event = queue.peek();

			expect(event?.event).toBe("event1");
			expect(queue.size()).toBe(2); // Not removed
		});

		it("should return null when queue is empty", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			const event = queue.peek();

			expect(event).toBeNull();
		});
	});

	describe("incrementRetryCount()", () => {
		it("should increment retry count for event by ID", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("test.event", {});
			const event = queue.peek();

			queue.incrementRetryCount(event!.id);

			const updatedEvent = queue.peek();
			expect(updatedEvent?.retryCount).toBe(1);
		});

		it("should persist updated retry count", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("test.event", {});
			const event = queue.peek();
			vi.clearAllMocks();

			queue.incrementRetryCount(event!.id);

			expect(mockGlobalState.update).toHaveBeenCalledWith(
				"snapback.offlineEventQueue",
				expect.arrayContaining([
					expect.objectContaining({
						retryCount: 1,
					}),
				]),
			);
		});

		it("should handle multiple increments", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("test.event", {});
			const event = queue.peek();

			queue.incrementRetryCount(event!.id);
			queue.incrementRetryCount(event!.id);
			queue.incrementRetryCount(event!.id);

			const updatedEvent = queue.peek();
			expect(updatedEvent?.retryCount).toBe(3);
		});
	});

	describe("removeById()", () => {
		it("should remove event by ID", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			queue.enqueue("event2", {});
			const events = queue.getAll();

			queue.removeById(events[0].id);

			expect(queue.size()).toBe(1);
			expect(queue.peek()?.event).toBe("event2");
		});

		it("should persist after removal", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			const event = queue.peek();
			vi.clearAllMocks();

			queue.removeById(event!.id);

			expect(mockGlobalState.update).toHaveBeenCalledWith(
				"snapback.offlineEventQueue",
				[],
			);
		});

		it("should do nothing if ID not found", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			const sizeBefore = queue.size();

			queue.removeById("non-existent-id");

			expect(queue.size()).toBe(sizeBefore);
		});
	});

	describe("clear()", () => {
		it("should remove all events", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			queue.enqueue("event2", {});
			queue.enqueue("event3", {});

			queue.clear();

			expect(queue.size()).toBe(0);
			expect(queue.getAll()).toEqual([]);
		});

		it("should persist empty queue", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			vi.clearAllMocks();

			queue.clear();

			expect(mockGlobalState.update).toHaveBeenCalledWith(
				"snapback.offlineEventQueue",
				[],
			);
		});
	});

	describe("getAll()", () => {
		it("should return all events in order", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", { order: 1 });
			queue.enqueue("event2", { order: 2 });
			queue.enqueue("event3", { order: 3 });

			const events = queue.getAll();

			expect(events).toHaveLength(3);
			expect(events[0].event).toBe("event1");
			expect(events[1].event).toBe("event2");
			expect(events[2].event).toBe("event3");
		});

		it("should return copy of events (not mutate original)", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});

			const events1 = queue.getAll();
			const events2 = queue.getAll();

			expect(events1).not.toBe(events2); // Different array instances
			expect(events1).toEqual(events2); // Same content
		});
	});

	describe("size()", () => {
		it("should return current queue size", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			expect(queue.size()).toBe(0);

			queue.enqueue("event1", {});
			expect(queue.size()).toBe(1);

			queue.enqueue("event2", {});
			expect(queue.size()).toBe(2);

			queue.dequeue();
			expect(queue.size()).toBe(1);
		});
	});

	describe("isEmpty()", () => {
		it("should return true when queue is empty", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			expect(queue.isEmpty()).toBe(true);
		});

		it("should return false when queue has events", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});

			expect(queue.isEmpty()).toBe(false);
		});
	});

	describe("getRetryDelay()", () => {
		it("should calculate exponential backoff delay", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			// Retry 0: 1s (base delay)
			expect(queue.getRetryDelay(0)).toBe(1000);

			// Retry 1: 2s (2^1 * 1s)
			expect(queue.getRetryDelay(1)).toBe(2000);

			// Retry 2: 4s (2^2 * 1s)
			expect(queue.getRetryDelay(2)).toBe(4000);

			// Retry 3: 8s (2^3 * 1s)
			expect(queue.getRetryDelay(3)).toBe(8000);
		});

		it("should cap delay at maximum", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			// Retry 10: Should cap at 60s (not 1024s)
			expect(queue.getRetryDelay(10)).toBe(60000);
		});

		it("should use custom base and max delay", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext, {
				baseRetryDelay: 500,
				maxRetryDelay: 10000,
			});

			expect(queue.getRetryDelay(0)).toBe(500);
			expect(queue.getRetryDelay(1)).toBe(1000);
			expect(queue.getRetryDelay(2)).toBe(2000);
			expect(queue.getRetryDelay(10)).toBe(10000); // Capped
		});
	});

	describe("shouldRetry()", () => {
		it("should allow retry when under max retry count", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			queue.enqueue("event1", {});
			const event = queue.peek();

			expect(queue.shouldRetry(event!)).toBe(true);
		});

		it("should deny retry when max retry count exceeded", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext, { maxRetries: 3 });

			queue.enqueue("event1", {});
			const event = queue.peek();

			// Simulate 3 retries
			queue.incrementRetryCount(event!.id);
			queue.incrementRetryCount(event!.id);
			queue.incrementRetryCount(event!.id);

			const retriedEvent = queue.peek();
			expect(queue.shouldRetry(retriedEvent!)).toBe(false);
		});

		it("should use custom max retries", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext, { maxRetries: 1 });

			queue.enqueue("event1", {});
			const event = queue.peek();

			queue.incrementRetryCount(event!.id);

			const retriedEvent = queue.peek();
			expect(queue.shouldRetry(retriedEvent!)).toBe(false);
		});
	});

	describe("Edge Cases", () => {
		it("should handle corrupted persisted state", async () => {
			mockGlobalState.get.mockReturnValue("invalid-json");

			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			// Should initialize with empty queue
			expect(queue.size()).toBe(0);
		});

		it("should handle partial event data in persisted state", async () => {
			const partialEvents = [
				{ id: "event-1", event: "test" }, // Missing properties, timestamp, retryCount
			];

			mockGlobalState.get.mockReturnValue(partialEvents);

			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			// Should skip invalid events
			expect(queue.size()).toBe(0);
		});

		it("should handle very old events in persisted state", async () => {
			const oldTimestamp = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
			const oldEvents = [
				{
					id: "old-event",
					event: "test",
					properties: {},
					timestamp: oldTimestamp,
					retryCount: 0,
				},
			];

			mockGlobalState.get.mockReturnValue(oldEvents);

			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext, { maxAge: 86400000 }); // 1 day

			// Should drop events older than maxAge
			expect(queue.size()).toBe(0);
		});

		it("should handle concurrent enqueue operations", async () => {
			const { OfflineEventQueue } = await import(
				"../../../src/telemetry/OfflineEventQueue"
			);
			const queue = new OfflineEventQueue(mockContext);

			// Simulate concurrent enqueues
			queue.enqueue("event1", {});
			queue.enqueue("event2", {});
			queue.enqueue("event3", {});

			expect(queue.size()).toBe(3);
			expect(queue.getAll().map((e) => e.event)).toEqual([
				"event1",
				"event2",
				"event3",
			]);
		});
	});
});
