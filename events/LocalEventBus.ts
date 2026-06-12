/**
 * Local EventBus for VSCode extension
 * Lightweight implementation using VSCode's EventEmitter to avoid @vreko/contracts dependency
 *
 * DISPOSAL PATTERN (SB-274):
 * - Always store the disposable returned by .on() when subscribing to events
 * - Add disposables to context.subscriptions for automatic cleanup on deactivation
 * - Use .off() for selective unsubscription, or .dispose() for complete cleanup
 *
 * Example:
 *   const disposable = eventBus.on('event', handler);
 *   context.subscriptions.push(disposable); // Auto-cleanup on deactivation
 *
 * @see packages/contracts/src/eventBus.emitter.ts (source)
 */
import * as vscode from "vscode";
import type { VrekoEvent, VrekoEventPayloads } from "../constants/events";

type EventHandler<T> = (payload: T) => void;

/**
 * Lightweight event bus using VSCode's EventEmitter
 * Replaces VrekoEventBus from @vreko/contracts
 */
export class LocalEventBus implements vscode.Disposable {
	private emitters = new Map<string, vscode.EventEmitter<unknown>>();
	private disposables: vscode.Disposable[] = [];
	private handlerMap = new Map<EventHandler<unknown>, vscode.Disposable>();

	/**
	 * Subscribe to an event
	 * @param event - Event name
	 * @param handler - Event handler function
	 * @returns Disposable to unsubscribe
	 */
	on<K extends VrekoEvent>(event: K, handler: EventHandler<VrekoEventPayloads[K]>): vscode.Disposable;
	on<T>(event: string, handler: EventHandler<T>): vscode.Disposable;
	on<T>(event: string, handler: EventHandler<T>): vscode.Disposable {
		let emitter = this.emitters.get(event);
		if (!emitter) {
			emitter = new vscode.EventEmitter<unknown>();
			this.emitters.set(event, emitter);
		}

		// Wrap handler with error handling to prevent one listener from breaking others
		const safeHandler = (payload: unknown) => {
			try {
				handler(payload as T);
			} catch {
				/* intentionally empty */
			}
		};

		const disposable = emitter.event(safeHandler);
		this.disposables.push(disposable);
		this.handlerMap.set(handler as EventHandler<unknown>, disposable);
		return disposable;
	}

	/**
	 * Unsubscribe a handler from an event
	 * @param event - Event name (unused but kept for API compatibility)
	 * @param handler - Event handler function to remove
	 */
	off<K extends VrekoEvent>(event: K, handler: EventHandler<VrekoEventPayloads[K]>): void;
	off<T>(event: string, handler: EventHandler<T>): void;
	off<T>(_event: string, handler: EventHandler<T>): void {
		const disposable = this.handlerMap.get(handler as EventHandler<unknown>);
		if (disposable) {
			disposable.dispose();
			this.handlerMap.delete(handler as EventHandler<unknown>);
			const index = this.disposables.indexOf(disposable);
			if (index > -1) {
				this.disposables.splice(index, 1);
			}
		}
	}

	/**
	 * Subscribe to an event (one-time)
	 * @param event - Event name
	 * @param handler - Event handler function
	 * @returns Disposable to unsubscribe
	 */
	once<K extends VrekoEvent>(event: K, handler: EventHandler<VrekoEventPayloads[K]>): vscode.Disposable;
	once<T>(event: string, handler: EventHandler<T>): vscode.Disposable;
	once<T>(event: string, handler: EventHandler<T>): vscode.Disposable {
		const disposable = this.on<T>(event, (payload) => {
			handler(payload);
			disposable.dispose();
		});
		return disposable;
	}

	/**
	 * Emit an event
	 * @param event - Event name
	 * @param payload - Event payload
	 */
	emit<K extends VrekoEvent>(event: K, payload: VrekoEventPayloads[K]): void;
	emit<T>(event: string, payload: T): void;
	emit<T>(event: string, payload: T): void {
		const emitter = this.emitters.get(event);
		if (emitter) {
			emitter.fire(payload);
		}
	}

	/**
	 * Alias for emit() - for compatibility with VrekoEventBus
	 */
	publish<K extends VrekoEvent>(event: K, payload: VrekoEventPayloads[K]): void;
	publish<T>(event: string, payload: T): void;
	publish<T>(event: string, payload: T): void {
		this.emit(event, payload);
	}

	/**
	 * Initialize the event bus (no-op for local implementation)
	 * Maintains API compatibility with VrekoEventBus
	 */
	async initialize(): Promise<void> {
		// No initialization needed for local implementation
	}

	/**
	 * Close the event bus and dispose all emitters
	 * Maintains API compatibility with VrekoEventBus
	 */
	close(): void {
		this.dispose();
	}

	/**
	 * Dispose all event emitters and handlers
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];

		for (const emitter of this.emitters.values()) {
			emitter.dispose();
		}
		this.emitters.clear();
	}
}

/**
 * Type alias for backward compatibility
 * Allows existing code to use VrekoEventBus type
 */
export type VrekoEventBus = LocalEventBus;
