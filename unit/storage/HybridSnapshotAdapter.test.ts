/**
 * HybridSnapshotAdapter Tests
 *
 * Verifies the cold-start–safe adapter selection logic:
 *   1. Starts with local adapter when daemon is not connected
 *   2. Upgrades to daemon adapter on first `connected` state-change event
 *   3. Only creates DaemonSnapshotAdapter once even if the event fires repeatedly
 *   4. Delegates all IStorage methods to whichever adapter is currently active
 *   5. Switch is atomic  -  no half-delegated calls between local and daemon
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { StateChangeEvent } from "../../../src/services/DaemonBridge";

// ---------------------------------------------------------------------------
// vi.hoisted()  -  variables that must exist when vi.mock() factories are called.
// Vitest hoists vi.mock() calls above module-level const declarations, so any
// variable referenced inside a factory MUST be declared via vi.hoisted().
// ---------------------------------------------------------------------------

const { mockLocalMethods, mockDaemonMethods } = vi.hoisted(() => {
	const makeMethods = () => ({
		create: vi.fn(),
		save: vi.fn(),
		get: vi.fn(),
		getAll: vi.fn(),
		delete: vi.fn(),
		update: vi.fn(),
	});
	return {
		mockLocalMethods: makeMethods(),
		mockDaemonMethods: makeMethods(),
	};
});

// ---------------------------------------------------------------------------
// Module mocks  -  must come after vi.hoisted() but before any imports that
// pull in the mocked modules.
// ---------------------------------------------------------------------------

// Mock the logger so we don't need a real VS Code output channel
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

vi.mock("../../../src/snapshot/SnapshotStorageAdapter", () => ({
	SnapshotStorageAdapter: vi.fn().mockImplementation(() => mockLocalMethods),
}));

vi.mock("../../../src/adapters/DaemonSnapshotAdapter", () => ({
	DaemonSnapshotAdapter: vi.fn().mockImplementation(() => mockDaemonMethods),
}));

// ---------------------------------------------------------------------------
// Import the module under test AFTER mocks are registered
// ---------------------------------------------------------------------------
import { HybridSnapshotAdapter } from "../../../src/storage/HybridSnapshotAdapter";
import { DaemonSnapshotAdapter } from "../../../src/adapters/DaemonSnapshotAdapter";
import { SnapshotStorageAdapter } from "../../../src/snapshot/SnapshotStorageAdapter";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock DaemonBridge.
 *
 * `onStateChange` is implemented as a lightweight event registrar: call
 * `fireStateChange(event)` to synchronously notify all registered listeners.
 */
function createMockDaemonBridge(initiallyConnected = false) {
	const listeners: Array<(event: StateChangeEvent) => void> = [];

	const bridge = {
		isConnected: vi.fn().mockReturnValue(initiallyConnected),
		/** Mimic `vscode.Event<StateChangeEvent>`  -  registers a listener and returns a disposable. */
		onStateChange: vi.fn().mockImplementation((listener: (event: StateChangeEvent) => void) => {
			listeners.push(listener);
			return {
				dispose: () => {
					const idx = listeners.indexOf(listener);
					if (idx >= 0) listeners.splice(idx, 1);
				},
			};
		}),
	};

	/** Helper to synchronously trigger all registered onStateChange listeners. */
	function fireStateChange(event: StateChangeEvent) {
		for (const listener of listeners) {
			listener(event);
		}
	}

	return { bridge, fireStateChange, listeners };
}

/** Minimal IStorageManager stub  -  only needs to satisfy the constructor signature. */
const mockStorage = {} as any;

/** A sample connected StateChangeEvent. */
function connectedEvent(): StateChangeEvent {
	return { state: "connected", previousState: "disconnected" };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("HybridSnapshotAdapter", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// Re-attach implementations after any clearAllMocks reset
		vi.mocked(SnapshotStorageAdapter).mockImplementation(() => mockLocalMethods);
		vi.mocked(DaemonSnapshotAdapter).mockImplementation(() => mockDaemonMethods);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	// -------------------------------------------------------------------------
	// Test 1  -  starts with local adapter when daemon is not connected
	// -------------------------------------------------------------------------
	it("starts with local adapter when daemon is not connected", async () => {
		const { bridge } = createMockDaemonBridge(false);

		mockLocalMethods.getAll.mockResolvedValue([{ id: "local-snap" }]);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		const result = await adapter.getAll();

		// Local adapter was called
		expect(mockLocalMethods.getAll).toHaveBeenCalledTimes(1);
		// Daemon adapter was NOT created
		expect(DaemonSnapshotAdapter).not.toHaveBeenCalled();
		expect(result).toEqual([{ id: "local-snap" }]);
	});

	// -------------------------------------------------------------------------
	// Test 2  -  switches to daemon adapter on connection state change
	// -------------------------------------------------------------------------
	it("switches to daemon adapter on connection state change to connected", async () => {
		const { bridge, fireStateChange } = createMockDaemonBridge(false);

		mockLocalMethods.getAll.mockResolvedValue([]);
		mockDaemonMethods.getAll.mockResolvedValue([{ id: "daemon-snap" }]);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		// Before the event: local adapter
		await adapter.getAll();
		expect(mockLocalMethods.getAll).toHaveBeenCalledTimes(1);
		expect(DaemonSnapshotAdapter).not.toHaveBeenCalled();

		// Fire the connected event
		fireStateChange(connectedEvent());

		// After the event: daemon adapter should have been created
		expect(DaemonSnapshotAdapter).toHaveBeenCalledTimes(1);

		const result = await adapter.getAll();
		expect(mockDaemonMethods.getAll).toHaveBeenCalledTimes(1);
		expect(result).toEqual([{ id: "daemon-snap" }]);
	});

	// -------------------------------------------------------------------------
	// Test 3  -  does not create daemon adapter twice if connected fires multiple times
	// -------------------------------------------------------------------------
	it("does not create daemon adapter twice if connected fires multiple times", async () => {
		const { bridge, fireStateChange } = createMockDaemonBridge(false);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		// Fire connected three times
		fireStateChange(connectedEvent());
		fireStateChange(connectedEvent());
		fireStateChange(connectedEvent());

		// DaemonSnapshotAdapter constructor called exactly once
		expect(DaemonSnapshotAdapter).toHaveBeenCalledTimes(1);

		// Suppress unused variable warning
		void adapter;
	});

	// -------------------------------------------------------------------------
	// Test 4  -  delegates all IStorage methods to the active adapter
	// -------------------------------------------------------------------------
	it("delegates all IStorage methods to active adapter", async () => {
		const { bridge, fireStateChange } = createMockDaemonBridge(false);

		mockDaemonMethods.create.mockResolvedValue({ id: "snap-1" });
		mockDaemonMethods.save.mockResolvedValue(undefined);
		mockDaemonMethods.get.mockResolvedValue({ id: "snap-1" });
		mockDaemonMethods.getAll.mockResolvedValue([{ id: "snap-1" }]);
		mockDaemonMethods.delete.mockResolvedValue(undefined);
		mockDaemonMethods.update.mockResolvedValue(undefined);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		// Upgrade to daemon
		fireStateChange(connectedEvent());

		const fakeFiles = [{ path: "a.ts", content: "" }];
		const fakeSnap = { id: "snap-1" } as any;

		await adapter.create(fakeFiles, { description: "test" });
		await adapter.save(fakeSnap);
		await adapter.get("snap-1");
		await adapter.getAll();
		await adapter.delete("snap-1");
		await adapter.update("snap-1", { name: "renamed" });

		expect(mockDaemonMethods.create).toHaveBeenCalledWith(fakeFiles, { description: "test" });
		expect(mockDaemonMethods.save).toHaveBeenCalledWith(fakeSnap);
		expect(mockDaemonMethods.get).toHaveBeenCalledWith("snap-1");
		expect(mockDaemonMethods.getAll).toHaveBeenCalled();
		expect(mockDaemonMethods.delete).toHaveBeenCalledWith("snap-1");
		expect(mockDaemonMethods.update).toHaveBeenCalledWith("snap-1", { name: "renamed" });

		// None of the local adapter methods should have been called
		for (const method of Object.values(mockLocalMethods)) {
			expect(method).not.toHaveBeenCalled();
		}
	});

	// -------------------------------------------------------------------------
	// Test 5  -  switches atomically  -  no half-delegated calls
	// -------------------------------------------------------------------------
	it("switches atomically  -  no half-delegated calls", async () => {
		const { bridge, fireStateChange } = createMockDaemonBridge(false);

		mockLocalMethods.getAll.mockResolvedValue([{ id: "local" }]);
		mockDaemonMethods.getAll.mockResolvedValue([{ id: "daemon" }]);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		// Phase 1: local adapter is active
		const before = await adapter.getAll();
		expect(before).toEqual([{ id: "local" }]);
		expect(mockLocalMethods.getAll).toHaveBeenCalledTimes(1);
		expect(mockDaemonMethods.getAll).not.toHaveBeenCalled();

		// Trigger the atomic switch
		fireStateChange(connectedEvent());

		// Phase 2: daemon adapter is active for all subsequent calls
		const after1 = await adapter.getAll();
		const after2 = await adapter.getAll();

		expect(after1).toEqual([{ id: "daemon" }]);
		expect(after2).toEqual([{ id: "daemon" }]);

		// Local adapter received exactly 1 call (from phase 1), never again
		expect(mockLocalMethods.getAll).toHaveBeenCalledTimes(1);
		// Daemon adapter received exactly 2 calls (both from phase 2)
		expect(mockDaemonMethods.getAll).toHaveBeenCalledTimes(2);
	});

	// -------------------------------------------------------------------------
	// Bonus: already-connected at construction time
	// -------------------------------------------------------------------------
	it("uses daemon adapter immediately when daemon is already connected at construction", async () => {
		const { bridge } = createMockDaemonBridge(true); // already connected

		mockDaemonMethods.getAll.mockResolvedValue([{ id: "daemon-snap" }]);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		// DaemonSnapshotAdapter created in constructor, no event needed
		expect(DaemonSnapshotAdapter).toHaveBeenCalledTimes(1);

		const result = await adapter.getAll();
		expect(mockDaemonMethods.getAll).toHaveBeenCalledTimes(1);
		expect(mockLocalMethods.getAll).not.toHaveBeenCalled();
		expect(result).toEqual([{ id: "daemon-snap" }]);
	});

	// -------------------------------------------------------------------------
	// Bonus: dispose releases the state-change subscription
	// -------------------------------------------------------------------------
	it("dispose releases the onStateChange subscription", () => {
		const { bridge, listeners } = createMockDaemonBridge(false);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		expect(listeners).toHaveLength(1);
		adapter.dispose();
		expect(listeners).toHaveLength(0);
	});

	// -------------------------------------------------------------------------
	// Bonus: non-connected state changes do not trigger upgrade
	// -------------------------------------------------------------------------
	it("does not upgrade on non-connected state changes", async () => {
		const { bridge, fireStateChange } = createMockDaemonBridge(false);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		fireStateChange({ state: "reconnecting", previousState: "disconnected" });
		fireStateChange({ state: "degraded", previousState: "connected" });
		fireStateChange({ state: "cli_missing", previousState: "disconnected" });

		// No daemon adapter created for any non-connected states
		expect(DaemonSnapshotAdapter).not.toHaveBeenCalled();

		// Local adapter is still active
		mockLocalMethods.getAll.mockResolvedValue([]);
		await adapter.getAll();
		expect(mockLocalMethods.getAll).toHaveBeenCalledTimes(1);
	});

	// -------------------------------------------------------------------------
	// Bonus: SnapshotStorageAdapter is always created exactly once
	// -------------------------------------------------------------------------
	it("creates SnapshotStorageAdapter exactly once regardless of state changes", () => {
		const { bridge, fireStateChange } = createMockDaemonBridge(false);

		const adapter = new HybridSnapshotAdapter(bridge as any, mockStorage, "/workspace");

		fireStateChange(connectedEvent());
		fireStateChange(connectedEvent());

		expect(SnapshotStorageAdapter).toHaveBeenCalledTimes(1);

		// Suppress unused variable warning
		void adapter;
	});
});
