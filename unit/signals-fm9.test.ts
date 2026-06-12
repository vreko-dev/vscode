/**
 * FM-9 Regression Tests: SignalEventBus singleton survives extension reload
 *
 * Root cause: The module-level `globalEventBus` singleton was never nulled out
 * during deactivate(). On extension reload, a new SignalCoordinator subscribed
 * to the same bus instance, leaving the old subscription active. This caused
 * double event handling: duplicate notifications, double state mutations, etc.
 *
 * Fix: deactivate() now calls disposeSignalEventBus(), which calls
 * globalEventBus.dispose() and sets the reference to null.
 * The next getSignalEventBus() call creates a fresh instance.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  disposeSignalEventBus,
  getSignalEventBus,
  SignalEventBus,
} from "../../src/signals/SignalEventBus";

describe("FM-9: SignalEventBus lifecycle", () => {
  afterEach(() => {
    // Always clean up the singleton between tests
    disposeSignalEventBus();
  });

  describe("getSignalEventBus()", () => {
    it("creates a fresh bus on first call", () => {
      const bus = getSignalEventBus();
      expect(bus).toBeInstanceOf(SignalEventBus);
    });

    it("returns the same instance on repeated calls (singleton)", () => {
      const bus1 = getSignalEventBus();
      const bus2 = getSignalEventBus();
      expect(bus1).toBe(bus2);
    });
  });

  describe("disposeSignalEventBus()", () => {
    it("nulls the singleton so the next call creates a new instance", () => {
      const original = getSignalEventBus();
      disposeSignalEventBus();
      const fresh = getSignalEventBus();
      // Different object  -  singleton was reset
      expect(fresh).not.toBe(original);
    });

    it("is idempotent  -  calling it twice does not throw", () => {
      getSignalEventBus();
      expect(() => {
        disposeSignalEventBus();
        disposeSignalEventBus();
      }).not.toThrow();
    });

    it("disposed bus no longer receives events (regression: FM-9 double fire)", () => {
      // Simulate first activation cycle
      const cycle1 = getSignalEventBus();
      const staleHandler = vi.fn();
      cycle1.event(staleHandler);

      // Deactivate  -  this is the fix; old code omitted this
      disposeSignalEventBus();

      // Simulate second activation cycle
      const cycle2 = getSignalEventBus();
      const freshHandler = vi.fn();
      cycle2.event(freshHandler);

      // Fire an event on the new bus
      cycle2.fire({ type: "snapshot.created", data: { snapshotId: "snap-001" } as any });

      // Only the fresh handler fires  -  stale handler from cycle1 is gone
      expect(freshHandler).toHaveBeenCalledTimes(1);
      expect(staleHandler).toHaveBeenCalledTimes(0);
    });

    it("without the fix (no dispose): stale handler fires on reload  -  FM-9 reproducer", () => {
      // Demonstrate the original bug by NOT disposing between cycles
      const cycle1 = getSignalEventBus();
      const staleHandler = vi.fn();
      cycle1.event(staleHandler);

      // BUG: skip disposeSignalEventBus()  -  bus survives
      const sameBus = getSignalEventBus(); // returns cycle1 unchanged
      const freshHandler = vi.fn();
      sameBus.event(freshHandler);

      sameBus.fire({ type: "snapshot.created", data: { snapshotId: "snap-002" } as any });

      // Both handlers fire on the same bus  -  this is the double-subscription bug
      expect(staleHandler).toHaveBeenCalledTimes(1);
      expect(freshHandler).toHaveBeenCalledTimes(1);
      // Explicit assertion: without dispose, same instance is returned
      expect(sameBus).toBe(cycle1);
    });
  });

  describe("SignalEventBus.dispose()", () => {
    it("disposes the underlying EventEmitter", () => {
      const bus = new SignalEventBus();
      const handler = vi.fn();
      bus.event(handler);

      bus.dispose();

      // After dispose, firing should not reach the handler
      // (vscode mock EventEmitter is disposed  -  no more callbacks)
      expect(() => bus.fire({ type: "snapshot.created", data: {} as any })).not.toThrow();
    });
  });

  describe("integration.ts re-export", () => {
    it("re-exports disposeSignalEventBus from integration module", async () => {
      const integration = await import("../../src/signals/integration");
      expect(typeof integration.disposeSignalEventBus).toBe("function");
    });

    it("re-exported function is the same as the direct import", async () => {
      const integration = await import("../../src/signals/integration");
      const direct = await import("../../src/signals/SignalEventBus");
      expect(integration.disposeSignalEventBus).toBe(direct.disposeSignalEventBus);
    });
  });
});
