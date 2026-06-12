/**
 * @file LocalEventBus.test.ts
 * Unit tests for LocalEventBus - VS Code extension event bus implementation
 *
 * Tests cover:
 * - Event subscription (on/once)
 * - Event unsubscription (off)
 * - Event emission (emit/publish)
 * - Dispose behavior
 * - Handler tracking via handlerMap
 *
 * IMPORTANT: Uses global vscode mock from __mocks__/vscode.mjs
 * Do NOT re-mock vscode here - see test/unit/setup.ts
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LocalEventBus } from "../../../src/events/LocalEventBus";

describe("LocalEventBus", () => {
	let eventBus: LocalEventBus;

	beforeEach(() => {
		eventBus = new LocalEventBus();
	});

	afterEach(() => {
		eventBus.dispose();
	});

	describe("on()", () => {
		it("should subscribe to events and receive payloads", () => {
			const handler = vi.fn();
			eventBus.on("test:event", handler);

			eventBus.emit("test:event", { data: "payload" });

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith({ data: "payload" });
		});

		it("should return a disposable that unsubscribes", () => {
			const handler = vi.fn();
			const disposable = eventBus.on("test:event", handler);

			eventBus.emit("test:event", { first: true });
			expect(handler).toHaveBeenCalledTimes(1);

			disposable.dispose();
			eventBus.emit("test:event", { second: true });
			expect(handler).toHaveBeenCalledTimes(1); // Still 1, not called again
		});

		it("should allow multiple handlers for the same event", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			eventBus.on("test:event", handler1);
			eventBus.on("test:event", handler2);

			eventBus.emit("test:event", { data: "shared" });

			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(1);
		});

		it("should support different event types", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			eventBus.on("event:a", handler1);
			eventBus.on("event:b", handler2);

			eventBus.emit("event:a", { type: "a" });

			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(0);
		});
	});

	describe("off()", () => {
		it("should unsubscribe a specific handler", () => {
			const handler = vi.fn();
			eventBus.on("test:event", handler);

			eventBus.emit("test:event", { before: true });
			expect(handler).toHaveBeenCalledTimes(1);

			eventBus.off("test:event", handler);
			eventBus.emit("test:event", { after: true });
			expect(handler).toHaveBeenCalledTimes(1); // Still 1
		});

		it("should only remove the specified handler, not others", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			eventBus.on("test:event", handler1);
			eventBus.on("test:event", handler2);

			eventBus.off("test:event", handler1);
			eventBus.emit("test:event", { data: "test" });

			expect(handler1).toHaveBeenCalledTimes(0);
			expect(handler2).toHaveBeenCalledTimes(1);
		});

		it("should handle off() for non-existent handler gracefully", () => {
			const handler = vi.fn();
			// Don't subscribe, just call off
			expect(() => eventBus.off("test:event", handler)).not.toThrow();
		});

		it("should be idempotent - multiple off() calls are safe", () => {
			const handler = vi.fn();
			eventBus.on("test:event", handler);

			eventBus.off("test:event", handler);
			eventBus.off("test:event", handler); // Second call should not throw
			eventBus.off("test:event", handler); // Third call should not throw

			eventBus.emit("test:event", { data: "test" });
			expect(handler).toHaveBeenCalledTimes(0);
		});

		it("should clean up internal handlerMap on off()", () => {
			const handler = vi.fn();
			eventBus.on("test:event", handler);

			// Access private handlerMap for testing (using type assertion)
			const busWithInternals = eventBus as unknown as {
				handlerMap: Map<unknown, unknown>;
			};
			expect(busWithInternals.handlerMap.size).toBe(1);

			eventBus.off("test:event", handler);
			expect(busWithInternals.handlerMap.size).toBe(0);
		});

		it("should remove handler from disposables array on off()", () => {
			const handler = vi.fn();
			eventBus.on("test:event", handler);

			const busWithInternals = eventBus as unknown as {
				disposables: Array<{ dispose: () => void }>;
			};
			const initialLength = busWithInternals.disposables.length;

			eventBus.off("test:event", handler);
			expect(busWithInternals.disposables.length).toBe(initialLength - 1);
		});
	});

	describe("once()", () => {
		it("should only fire handler once then auto-unsubscribe", () => {
			const handler = vi.fn();
			eventBus.once("test:event", handler);

			eventBus.emit("test:event", { first: true });
			eventBus.emit("test:event", { second: true });

			expect(handler).toHaveBeenCalledTimes(1);
			expect(handler).toHaveBeenCalledWith({ first: true });
		});

		it("should return a disposable that can cancel before fire", () => {
			const handler = vi.fn();
			const disposable = eventBus.once("test:event", handler);

			disposable.dispose();
			eventBus.emit("test:event", { data: "test" });

			expect(handler).toHaveBeenCalledTimes(0);
		});
	});

	describe("emit() and publish()", () => {
		it("should emit events to subscribers", () => {
			const handler = vi.fn();
			eventBus.on("test:event", handler);

			eventBus.emit("test:event", { source: "emit" });

			expect(handler).toHaveBeenCalledWith({ source: "emit" });
		});

		it("should publish as alias for emit", () => {
			const handler = vi.fn();
			eventBus.on("test:event", handler);

			eventBus.publish("test:event", { source: "publish" });

			expect(handler).toHaveBeenCalledWith({ source: "publish" });
		});

		it("should handle emit with no subscribers gracefully", () => {
			expect(() => eventBus.emit("no:subscribers", { data: "test" })).not.toThrow();
		});
	});

	describe("initialize()", () => {
		it("should resolve without error (no-op)", async () => {
			await expect(eventBus.initialize()).resolves.toBeUndefined();
		});
	});

	describe("close()", () => {
		it("should call dispose", () => {
			const handler = vi.fn();
			eventBus.on("test:event", handler);

			eventBus.close();
			eventBus.emit("test:event", { data: "test" });

			// After close, handlers should be cleaned up
			expect(handler).toHaveBeenCalledTimes(0);
		});
	});

	describe("dispose()", () => {
		it("should clean up all handlers", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			eventBus.on("event:a", handler1);
			eventBus.on("event:b", handler2);

			eventBus.dispose();

			eventBus.emit("event:a", { data: "a" });
			eventBus.emit("event:b", { data: "b" });

			expect(handler1).toHaveBeenCalledTimes(0);
			expect(handler2).toHaveBeenCalledTimes(0);
		});

		it("should clear emitters map", () => {
			eventBus.on("test:event", vi.fn());

			const busWithInternals = eventBus as unknown as {
				emitters: Map<string, unknown>;
			};
			expect(busWithInternals.emitters.size).toBe(1);

			eventBus.dispose();
			expect(busWithInternals.emitters.size).toBe(0);
		});

		it("should be safe to call multiple times", () => {
			expect(() => {
				eventBus.dispose();
				eventBus.dispose();
				eventBus.dispose();
			}).not.toThrow();
		});
	});

	describe("integration: on/off lifecycle", () => {
		it("should handle complex subscribe/unsubscribe patterns", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			const handler3 = vi.fn();

			// Subscribe all
			eventBus.on("test:event", handler1);
			eventBus.on("test:event", handler2);
			eventBus.on("test:event", handler3);

			eventBus.emit("test:event", { round: 1 });
			expect(handler1).toHaveBeenCalledTimes(1);
			expect(handler2).toHaveBeenCalledTimes(1);
			expect(handler3).toHaveBeenCalledTimes(1);

			// Unsubscribe middle one
			eventBus.off("test:event", handler2);

			eventBus.emit("test:event", { round: 2 });
			expect(handler1).toHaveBeenCalledTimes(2);
			expect(handler2).toHaveBeenCalledTimes(1); // Still 1
			expect(handler3).toHaveBeenCalledTimes(2);

			// Unsubscribe first
			eventBus.off("test:event", handler1);

			eventBus.emit("test:event", { round: 3 });
			expect(handler1).toHaveBeenCalledTimes(2); // Still 2
			expect(handler2).toHaveBeenCalledTimes(1); // Still 1
			expect(handler3).toHaveBeenCalledTimes(3);
		});

		it("should handle re-subscription after off()", () => {
			const handler = vi.fn();

			eventBus.on("test:event", handler);
			eventBus.emit("test:event", { phase: 1 });
			expect(handler).toHaveBeenCalledTimes(1);

			eventBus.off("test:event", handler);
			eventBus.emit("test:event", { phase: 2 });
			expect(handler).toHaveBeenCalledTimes(1);

			// Re-subscribe
			eventBus.on("test:event", handler);
			eventBus.emit("test:event", { phase: 3 });
			expect(handler).toHaveBeenCalledTimes(2);
		});
	});
});
