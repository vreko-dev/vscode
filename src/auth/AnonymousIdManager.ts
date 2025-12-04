/**
 * AnonymousIdManager - Anonymous Identifier Lifecycle
 *
 * Single responsibility: Generate and persist anonymous ID for unauthenticated users.
 * Uses UUID v4 format and persists to VS Code globalState.
 *
 * Reference: feedback.md §3.1 Issue 1 - Split AnonymousMode God Object
 * TDD Status: GREEN (implementation)
 *
 * @package apps/vscode/src/auth
 */

import { randomUUID } from "node:crypto";
import type * as vscode from "vscode";

/**
 * AnonymousIdManager - Manages anonymous user identifiers
 *
 * Responsibilities:
 * - Generate: Create new UUID if doesn't exist
 * - Retrieve: Get existing ID from storage
 * - Persist: Store ID in VS Code globalState
 * - Reset: Clear ID on demand (user action)
 *
 * NOT responsible for:
 * - Auth checking (AuthState)
 * - Feature gating (FeatureGate)
 * - Nudges (NudgeManager)
 * - Analytics tracking
 */
export class AnonymousIdManager {
	private readonly STORAGE_KEY = "snapback.anonymousId";

	constructor(private globalState: vscode.Memento) {}

	/**
	 * Get or create anonymous ID
	 *
	 * On first call: generates new UUID v4
	 * On subsequent calls: returns same ID (persisted)
	 *
	 * @returns UUID v4 string (e.g., "550e8400-e29b-41d4-a716-446655440000")
	 */
	async getOrCreate(): Promise<string> {
		// Try to get existing ID
		const existingId = this.globalState.get<string>(this.STORAGE_KEY);
		if (existingId && this.isValidUUID(existingId)) {
			return existingId;
		}

		// Generate new UUID v4
		const newId = randomUUID();

		// Persist to storage
		await this.globalState.update(this.STORAGE_KEY, newId);

		return newId;
	}

	/**
	 * Get current anonymous ID without creating if missing
	 *
	 * @returns UUID if exists, null otherwise
	 */
	async get(): Promise<string | null> {
		const id = this.globalState.get<string>(this.STORAGE_KEY);
		return id && this.isValidUUID(id) ? id : null;
	}

	/**
	 * Reset anonymous ID (clear and allow new ID to be generated)
	 *
	 * Used when:
	 * - User explicitly opts out of telemetry
	 * - User migrates to authenticated account
	 * - Testing/development
	 */
	async reset(): Promise<void> {
		await this.globalState.update(this.STORAGE_KEY, undefined);
	}

	/**
	 * Validate UUID v4 format
	 *
	 * @internal
	 */
	private isValidUUID(value: string): boolean {
		const uuidRegex =
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
		return uuidRegex.test(value);
	}
}
