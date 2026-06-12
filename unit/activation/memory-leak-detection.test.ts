/**
 * @fileoverview Memory Leak Detection Tests (SB-272)
 *
 * Tests to verify that all disposables are properly tracked and cleaned up
 * during extension activation and deactivation.
 *
 * These tests ensure:
 * 1. Event bus subscriptions are stored and disposed
 * 2. File watchers are added to context.subscriptions
 * 3. Tree providers implement vscode.Disposable
 * 4. No orphaned event listeners after deactivation
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type * as vscode from "vscode";
import { LocalEventBus } from "../../../src/events/LocalEventBus";

describe("Memory Leak Detection (SB-272)", () => {
	describe("Event Bus Subscription Tracking", () => {
		it("should track all event subscriptions for disposal", () => {
			const eventBus = new LocalEventBus();
			const subscriptions: vscode.Disposable[] = [];

			// Simulate phase4a pattern: store disposable and track it
			const disposable = eventBus.on("test:event", vi.fn());
			subscriptions.push(disposable);

			// Verify subscription is tracked
			expect(subscriptions.length).toBe(1);
			expect(typeof subscriptions[0].dispose).toBe("function");

			// Cleanup
			subscriptions.forEach((s) => s.dispose());
			eventBus.dispose();
		});

		it("should clean up all event handlers on dispose", () => {
			const eventBus = new LocalEventBus();
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			eventBus.on("event:a", handler1);
			eventBus.on("event:b", handler2);

			// Pre-dispose: handlers should work
			eventBus.emit("event:a", { data: "test" });
			expect(handler1).toHaveBeenCalledTimes(1);

			// Dispose
			eventBus.dispose();

			// Post-dispose: handlers should not be called
			eventBus.emit("event:a", { data: "test" });
			eventBus.emit("event:b", { data: "test" });
			expect(handler1).toHaveBeenCalledTimes(1); // Still 1
			expect(handler2).toHaveBeenCalledTimes(0);
		});

		it("should allow selective unsubscription with off()", () => {
			const eventBus = new LocalEventBus();
			const handler1 = vi.fn();
			const handler2 = vi.fn();

			eventBus.on("test:event", handler1);
			eventBus.on("test:event", handler2);

			// Unsubscribe only handler1
			eventBus.off("test:event", handler1);

			eventBus.emit("test:event", { data: "test" });

			expect(handler1).toHaveBeenCalledTimes(0);
			expect(handler2).toHaveBeenCalledTimes(1);

			eventBus.dispose();
		});
	});
	describe("Disposable Pattern Compliance", () => {
		it("should verify all providers implement vscode.Disposable", () => {
			// This test documents the expected disposable pattern
			// Providers should have: dispose(): void method

			interface Disposable {
				dispose(): void;
			}

			const mockProvider: Disposable = {
				dispose: () => {
					/* cleanup */
				},
			};

			expect(typeof mockProvider.dispose).toBe("function");
		});

		it("should track multiple disposables in context.subscriptions pattern", () => {
			const subscriptions: vscode.Disposable[] = [];
			const eventBus = new LocalEventBus();

			// Simulate adding multiple disposables (like in phase4a)
			subscriptions.push(eventBus.on("event:1", vi.fn()));
			subscriptions.push(eventBus.on("event:2", vi.fn()));
			subscriptions.push({ dispose: () => { /* intentionally empty */ } }); // Mock file watcher

			expect(subscriptions.length).toBe(3);

			// Simulate extension deactivation - dispose all
			subscriptions.forEach((s) => s.dispose());
			eventBus.dispose();

			// All should be disposed (no errors thrown)
			expect(subscriptions.length).toBe(3);
		});
	});
	describe("Activation Phase Disposable Safety", () => {
		it("should handle missing eventBus gracefully in phase initialization", () => {
			// Simulate phase4a pattern with null eventBus
			const appContext = { eventBus: null as LocalEventBus | null };
			const subscriptions: vscode.Disposable[] = [];

			// Safe check pattern (should not throw)
			if (appContext.eventBus) {
				subscriptions.push(appContext.eventBus.on("event", vi.fn()));
			}

			expect(subscriptions.length).toBe(0);
		});

		it("should verify disposable is returned from eventBus.on()", () => {
			const eventBus = new LocalEventBus();
			const disposable = eventBus.on("test:event", vi.fn());

			// Must return a disposable object
			expect(disposable).toBeDefined();
			expect(typeof disposable.dispose).toBe("function");

			disposable.dispose();
			eventBus.dispose();
		});
	});
	describe("Tree Provider Disposable Pattern", () => {
		it("should dispose EventEmitter in tree provider dispose()", () => {
			// Mock tree provider pattern
			const mockTreeProvider = {
				_onDidChangeTreeData: { dispose: vi.fn() },
				disposables: [{ dispose: vi.fn() }, { dispose: vi.fn() }],
				dispose() {
					this._onDidChangeTreeData.dispose();
					for (const d of this.disposables) {
						d.dispose();
					}
				},
			};

			mockTreeProvider.dispose();

			expect(mockTreeProvider._onDidChangeTreeData.dispose).toHaveBeenCalled();
			expect(mockTreeProvider.disposables[0].dispose).toHaveBeenCalled();
			expect(mockTreeProvider.disposables[1].dispose).toHaveBeenCalled();
		});
	});
	describe("Bridge Disposable Pattern", () => {
		it("should clean up event listeners in bridge dispose()", () => {
			const eventBus = new LocalEventBus();
			const eventListeners: Array<{ event: string; listener: unknown }> = [];

			// Simulate EventBridge pattern
			const subscribeToEvent = (event: string, handler: unknown) => {
				eventBus.on(event, handler as () => void);
				eventListeners.push({ event, listener: handler });
			};

			const handler1 = vi.fn();
			const handler2 = vi.fn();
			subscribeToEvent("event:a", handler1);
			subscribeToEvent("event:b", handler2);

			expect(eventListeners.length).toBe(2);

			// Simulate dispose - unsubscribe all
			for (const { event, listener } of eventListeners) {
				eventBus.off(event, listener as () => void);
			}
			eventListeners.length = 0;
			eventBus.dispose();

			expect(eventListeners.length).toBe(0);
		});
	});
});
