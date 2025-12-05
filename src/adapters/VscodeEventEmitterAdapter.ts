/**
 * VSCode EventEmitter Adapter
 *
 * Adapts vscode.EventEmitter to the platform-agnostic IEventEmitter interface
 * from @snapback/sdk, enabling SessionCoordinator to work in VSCode.
 */

import type { IDisposable, IEventEmitter } from "@snapback/sdk";
import * as vscode from "vscode";

/**
 * Adapter that wraps vscode.EventEmitter to implement SDK's IEventEmitter interface
 */
export class VscodeEventEmitterAdapter<T> implements IEventEmitter<T> {
	private emitter: vscode.EventEmitter<T>;

	constructor() {
		this.emitter = new vscode.EventEmitter<T>();
	}

	/**
	 * Fire an event with the given data
	 */
	fire(data: T): void {
		this.emitter.fire(data);
	}

	/**
	 * Subscribe to events
	 * @param listener - Function to call when event is fired
	 * @returns Disposable to unsubscribe
	 */
	subscribe(listener: (data: T) => void): IDisposable {
		return this.emitter.event(listener);
	}

	/**
	 * Dispose the emitter and clean up resources
	 */
	dispose(): void {
		this.emitter.dispose();
	}

	/**
	 * Expose the underlying VSCode event for compatibility
	 */
	get event(): vscode.Event<T> {
		return this.emitter.event;
	}
}
