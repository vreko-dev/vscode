/**
 * Shared Event Bus Types
 *
 * Unified types for event bus implementations across the extension.
 * Used by EventBridge, IntelligenceBridge, and LocalEventBus.
 *
 * @module types/event-bus
 */

/**
 * Generic event bus interface compatible with both Node.js EventEmitter
 * and EventEmitter2 patterns.
 *
 * This is the minimal interface required for event subscription/unsubscription.
 * Implementations may extend this with emit(), once(), etc.
 *
 * @example
 * ```typescript
 * function subscribeToEvents(eventBus: EventBusLike) {
 *   eventBus.on('snapshot.created', handleSnapshot);
 *   // Later: eventBus.off('snapshot.created', handleSnapshot);
 * }
 * ```
 */
export interface EventBusLike {
	/**
	 * Subscribe to one or more events
	 * @param event - Event name or array of event names
	 * @param listener - Callback function for the event
	 */
	on(event: string | string[], listener: (...args: unknown[]) => void): void;

	/**
	 * Unsubscribe from one or more events
	 * @param event - Event name or array of event names
	 * @param listener - The same callback function passed to on()
	 */
	off(event: string | string[], listener: (...args: unknown[]) => void): void;
}

/**
 * Extended event bus interface with emission capabilities.
 * Extends EventBusLike with methods to emit events.
 */
export interface EventEmitterLike extends EventBusLike {
	/**
	 * Emit an event to all listeners
	 * @param event - Event name
	 * @param args - Event arguments
	 */
	emit(event: string, ...args: unknown[]): void;

	/**
	 * Subscribe to an event (one-time)
	 * @param event - Event name
	 * @param listener - Callback function
	 */
	once?(event: string, listener: (...args: unknown[]) => void): void;

	/**
	 * Remove all listeners for an event, or all listeners
	 * @param event - Optional event name. If omitted, removes all.
	 */
	removeAllListeners?(event?: string): void;
}

/**
 * Type alias for backward compatibility.
 * EventBusLike is the canonical name.
 */
export type EventBus = EventBusLike;
