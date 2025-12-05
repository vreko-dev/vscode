/**
 * GlobalState Storage Adapter
 *
 * Adapts VS Code's ExtensionContext.globalState to the platform-agnostic
 * IKeyValueStorage interface from @snapback/sdk.
 */

import type { IKeyValueStorage } from "@snapback/sdk";
import type * as vscode from "vscode";

/**
 * Adapter that wraps VS Code globalState to implement SDK's IKeyValueStorage interface
 */
export class GlobalStateStorageAdapter implements IKeyValueStorage {
	constructor(private globalState: vscode.Memento) {}

	/**
	 * Get a value from storage
	 * @param key - Storage key
	 * @param defaultValue - Default value if key doesn't exist
	 * @returns Value from storage or default
	 */
	async get<T>(key: string, defaultValue?: T): Promise<T | undefined> {
		return this.globalState.get<T>(key, defaultValue as T);
	}

	/**
	 * Set a value in storage
	 * @param key - Storage key
	 * @param value - Value to store
	 */
	async set<T>(key: string, value: T): Promise<void> {
		await this.globalState.update(key, value);
	}
}
