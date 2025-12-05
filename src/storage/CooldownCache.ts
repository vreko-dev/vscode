// apps/vscode/src/storage/CooldownCache.ts

import type { CooldownEntry } from "./types";

/**
 * In-memory cooldown cache with automatic expiration.
 *
 * IMPORTANT: This is intentionally NOT persisted!
 * Cooldowns are ephemeral and should reset on extension reload.
 * This fixes the Memento contradiction in the original design.
 */
export class CooldownCache {
	private cache = new Map<string, CooldownEntry>();
	private cleanupInterval: ReturnType<typeof setInterval> | null = null;

	constructor(private readonly cleanupIntervalMs: number = 60_000) {} // 1 minute

	/**
	 * Start periodic cleanup of expired entries
	 */
	start(): void {
		if (this.cleanupInterval) return;

		this.cleanupInterval = setInterval(() => {
			this.removeExpired();
		}, this.cleanupIntervalMs);
	}

	/**
	 * Stop cleanup and clear all entries
	 */
	dispose(): void {
		if (this.cleanupInterval) {
			clearInterval(this.cleanupInterval);
			this.cleanupInterval = null;
		}
		this.cache.clear();
	}

	/**
	 * Generate cache key from file path and protection level
	 */
	private getKey(filePath: string, protectionLevel: string): string {
		return `${filePath}::${protectionLevel}`;
	}

	/**
	 * Set a cooldown entry
	 */
	set(entry: CooldownEntry): void {
		const key = this.getKey(entry.filePath, entry.protectionLevel);
		this.cache.set(key, entry);
	}

	/**
	 * Get cooldown entry if exists and not expired
	 */
	get(filePath: string, protectionLevel: string): CooldownEntry | null {
		const key = this.getKey(filePath, protectionLevel);
		const entry = this.cache.get(key);

		if (!entry) return null;

		// Check expiration
		if (Date.now() > entry.expiresAt) {
			this.cache.delete(key);
			return null;
		}

		return entry;
	}

	/**
	 * Check if a file is in cooldown
	 */
	isInCooldown(filePath: string, protectionLevel: string): boolean {
		return this.get(filePath, protectionLevel) !== null;
	}

	/**
	 * Get remaining cooldown time in ms (0 if not in cooldown)
	 */
	getRemainingTime(filePath: string, protectionLevel: string): number {
		const entry = this.get(filePath, protectionLevel);
		if (!entry) return 0;
		return Math.max(0, entry.expiresAt - Date.now());
	}

	/**
	 * Remove a specific cooldown
	 */
	remove(filePath: string, protectionLevel: string): boolean {
		const key = this.getKey(filePath, protectionLevel);
		return this.cache.delete(key);
	}

	/**
	 * Clear all cooldowns
	 */
	clear(): void {
		this.cache.clear();
	}

	/**
	 * Remove all expired entries
	 */
	removeExpired(): number {
		const now = Date.now();
		let removed = 0;

		for (const [key, entry] of this.cache) {
			if (now > entry.expiresAt) {
				this.cache.delete(key);
				removed++;
			}
		}

		return removed;
	}

	/**
	 * Get current cache size
	 */
	get size(): number {
		return this.cache.size;
	}

	/**
	 * Get all active (non-expired) cooldowns
	 */
	getAll(): CooldownEntry[] {
		const now = Date.now();
		const entries: CooldownEntry[] = [];

		for (const entry of this.cache.values()) {
			if (now <= entry.expiresAt) {
				entries.push(entry);
			}
		}

		return entries;
	}
}
