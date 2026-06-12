/**
 * Signal Event Bus - Typed Event Bus for Daemon Communication
 *
 * A single EventEmitter<VrekoSignalEvent> that replaces scattered per-type emitters.
 * The DaemonBridge deserializes IPC notifications and fires onto this bus.
 *
 * Features:
 * - Discriminated union type narrowing
 * - Single routing point for all daemon events
 * - Testability through typed events
 * - Graceful degradation for unwired events
 *
 * @module signals/SignalEventBus
 * @see docs/plans/vreko_signal_communicaton.md Appendix A.1
 */

import * as vscode from "vscode";
import type { VrekoSignalEvent } from "./types";

/**
 * Typed event bus for Vreko signals
 *
 * This is the central event bus that all daemon events flow through.
 * Use discriminated union narrowing in subscribers:
 *
 * @example
 * ```typescript
 * eventBus.event(e => {
 *   switch (e.type) {
 *     case 'snapshot.created':
 *       signalState.onSnapshotCreated(e.data);
 *       break;
 *     case 'learning.promoted':
 *       handlePatternPromotion(e);
 *       break;
 *   }
 * });
 * ```
 */
export class SignalEventBus implements vscode.Disposable {
	private _emitter = new vscode.EventEmitter<VrekoSignalEvent>();

	/**
	 * Event to subscribe to
	 */
	readonly event = this._emitter.event;

	/**
	 * Fire an event onto the bus
	 *
	 * Called by DaemonBridge when IPC notifications arrive
	 */
	fire(event: VrekoSignalEvent): void {
		this._emitter.fire(event);
	}

	/**
	 * Dispose the event bus
	 */
	dispose(): void {
		this._emitter.dispose();
	}
}

/**
 * Global singleton instance
 */
let globalEventBus: SignalEventBus | null = null;

/**
 * Get or create the global SignalEventBus instance
 */
export function getSignalEventBus(): SignalEventBus {
	if (!globalEventBus) {
		globalEventBus = new SignalEventBus();
	}
	return globalEventBus;
}

/**
 * Dispose the global event bus (for testing/cleanup)
 */
export function disposeSignalEventBus(): void {
	if (globalEventBus) {
		globalEventBus.dispose();
		globalEventBus = null;
	}
}
