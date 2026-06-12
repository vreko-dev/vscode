/**
 * HybridSnapshotAdapter  -  cold-start–safe IStorage implementation
 *
 * ## The Problem It Solves
 *
 * Phase 3 initialises snapshot storage at extension activation time.  On a
 * cold start the Vreko daemon can take 1–8 s to become ready.  If we pick
 * an adapter at that moment we are racing the daemon: `isConnected()` returns
 * `false`, we lock in `SnapshotStorageAdapter`, and the daemon connects 5–10 s
 * later  -  but all snapshot operations remain on local storage forever.
 *
 * ## How This Fixes It
 *
 * `HybridSnapshotAdapter` starts with a local adapter and transparently
 * upgrades to the daemon adapter the first time the daemon reports
 * `state === 'connected'`.  Every `IStorage` method delegates to whichever
 * adapter is currently active, so callers never need to be aware of the
 * upgrade.
 *
 * ```
 * t=0s    HybridSnapshotAdapter created
 *         activeAdapter → SnapshotStorageAdapter (local)
 *
 * t=6s    DaemonBridge fires onStateChange { state: 'connected' }
 *         activeAdapter → DaemonSnapshotAdapter (daemon)
 *         [HybridAdapter] Switched to daemon adapter  ← log
 *
 * t=6s+   All subsequent IStorage calls go to daemon
 * ```
 *
 * @module storage/HybridSnapshotAdapter
 */

import { DaemonSnapshotAdapter } from "../adapters/DaemonSnapshotAdapter";
import type { DaemonBridge } from "../services/DaemonBridge";
import { SnapshotStorageAdapter } from "../snapshot/SnapshotStorageAdapter";
import type { FileInput, IStorage, IStorageCreateOptions, RichSnapshot as Snapshot } from "../types/snapshot";
import { logger } from "../utils/logger";
import type { IStorageManager } from "./types";

const LOG_PREFIX = "[HybridAdapter]";

/**
 * HybridSnapshotAdapter  -  delegates all IStorage calls to the best
 * available backend, upgrading from local → daemon on first connection.
 *
 * @example
 * ```typescript
 * const snapshotStorage = new HybridSnapshotAdapter(daemonBridge, storage, workspaceRoot);
 * const manager = new SnapshotManager(workspaceRoot, snapshotStorage, confirmationService, ...);
 * ```
 */
export class HybridSnapshotAdapter implements IStorage {
	/** Local adapter: always available, used until daemon connects. */
	private readonly localAdapter: SnapshotStorageAdapter;

	/**
	 * Daemon adapter: created once, on first `connected` state event.
	 * `null` until the daemon has become ready.
	 */
	private daemonAdapter: DaemonSnapshotAdapter | null = null;

	/** Subscription disposable so we can clean up in dispose(). */
	private readonly stateSubscription: { dispose(): void };

	constructor(
		readonly daemonBridge: DaemonBridge,
		storage: IStorageManager,
		readonly workspaceRoot: string,
	) {
		this.localAdapter = new SnapshotStorageAdapter(storage);

		// If the daemon is already connected at construction time, go straight
		// to the daemon adapter  -  no event subscription needed.
		if (daemonBridge.isConnected()) {
			this.daemonAdapter = new DaemonSnapshotAdapter(daemonBridge, workspaceRoot);
			logger.info(`${LOG_PREFIX} Daemon already connected at construction  -  using daemon adapter`);
		}

		// Subscribe to future connection state changes.  We upgrade exactly once
		// (guarded by `daemonAdapter === null`) so firing `connected` multiple
		// times does not recreate the adapter.
		this.stateSubscription = daemonBridge.onStateChange((event) => {
			if (event.state === "connected" && this.daemonAdapter === null) {
				this.daemonAdapter = new DaemonSnapshotAdapter(daemonBridge, workspaceRoot);
				logger.info(`${LOG_PREFIX} Switched to daemon adapter`);
			}
		});
	}

	// =========================================================================
	// ADAPTER SELECTOR
	// =========================================================================

	/**
	 * Returns the currently active storage backend.
	 * Atomic: the assignment `this.daemonAdapter = ...` is synchronous, so
	 * every method call within a JS turn sees a consistent snapshot of this
	 * getter's value.
	 */
	private get activeAdapter(): IStorage {
		return this.daemonAdapter ?? this.localAdapter;
	}

	// =========================================================================
	// IStorage DELEGATION
	// =========================================================================

	async create(files: FileInput[], options?: IStorageCreateOptions): Promise<Snapshot> {
		return this.activeAdapter.create(files, options);
	}

	async save(snapshot: Snapshot): Promise<void> {
		return this.activeAdapter.save(snapshot);
	}

	async get(id: string): Promise<Snapshot | undefined> {
		return this.activeAdapter.get(id);
	}

	async getAll(): Promise<Snapshot[]> {
		return this.activeAdapter.getAll();
	}

	async delete(id: string): Promise<void> {
		return this.activeAdapter.delete(id);
	}

	async update(id: string, updates: Partial<Snapshot>): Promise<void> {
		return this.activeAdapter.update(id, updates);
	}

	// =========================================================================
	// LIFECYCLE
	// =========================================================================

	/**
	 * Release the state-change subscription.
	 * Call when the extension is deactivated or the adapter is no longer needed.
	 */
	dispose(): void {
		this.stateSubscription.dispose();
	}
}
