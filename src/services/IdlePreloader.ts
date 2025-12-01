import { logger } from "../utils/logger";
import type { LazyLoader } from "./LazyLoader";

/**
 * IdlePreloader - Preload heavy services during idle time
 *
 * Optimizes user experience by loading expensive services in the background
 * after extension activation completes, ensuring they're ready when needed.
 *
 * Features:
 * - Idle-time preloading (doesn't block activation)
 * - Configurable delay before starting preload
 * - Tracks preload progress and status
 * - Graceful error handling (failures don't crash extension)
 * - Disposable for cleanup
 *
 * @example
 * ```typescript
 * const preloader = new IdlePreloader();
 * preloader.register(guardianLoader, 'Guardian', 2000); // Preload after 2s
 * preloader.register(mcpLoader, 'MCP', 5000);          // Preload after 5s
 * preloader.start();
 *
 * // Later...
 * const status = preloader.getStatus();
 * console.log(status); // { Guardian: 'loaded', MCP: 'loading' }
 * ```
 */

/**
 * Entry for a lazy loader to preload
 */
interface PreloadEntry {
	/** The lazy loader to preload */
	loader: LazyLoader<unknown>;
	/** Human-readable name for logging */
	name: string;
	/** Delay in ms before starting preload */
	delayMs: number;
}

/**
 * Status of a preload operation
 */
export type PreloadStatus = "pending" | "loading" | "loaded" | "failed";

/**
 * Service for preloading lazy loaders during idle time
 */
export class IdlePreloader {
	private entries: PreloadEntry[] = [];
	private status = new Map<string, PreloadStatus>();
	private timers: NodeJS.Timeout[] = [];
	private started = false;

	/**
	 * Register a lazy loader for preloading
	 *
	 * @param loader - LazyLoader instance to preload
	 * @param name - Human-readable name for logging
	 * @param delayMs - Delay in milliseconds before starting preload (default: 1000)
	 */
	register<T>(loader: LazyLoader<T>, name: string, delayMs = 1000): void {
		// Don't register if already preloading or loaded
		if (loader.isLoaded() || loader.isLoading()) {
			logger.debug(
				`${name} already loaded/loading, skipping preload registration`,
			);
			return;
		}

		this.entries.push({ loader, name, delayMs });
		this.status.set(name, "pending");
		logger.debug(`Registered ${name} for preloading (delay: ${delayMs}ms)`);
	}

	/**
	 * Start preloading registered loaders
	 * Can be called multiple times (idempotent)
	 */
	start(): void {
		if (this.started) {
			logger.debug("IdlePreloader already started");
			return;
		}

		this.started = true;
		logger.info(`Starting IdlePreloader with ${this.entries.length} services`);

		// Schedule preloads
		for (const entry of this.entries) {
			const timer = setTimeout(() => {
				this.preloadEntry(entry);
			}, entry.delayMs);

			this.timers.push(timer);
		}
	}

	/**
	 * Preload a single entry
	 */
	private async preloadEntry(entry: PreloadEntry): Promise<void> {
		const { loader, name } = entry;

		// Skip if already loaded or loading
		if (loader.isLoaded()) {
			this.status.set(name, "loaded");
			logger.debug(`${name} already loaded, skipping preload`);
			return;
		}

		if (loader.isLoading()) {
			this.status.set(name, "loading");
			logger.debug(`${name} already loading, skipping preload`);
			return;
		}

		try {
			this.status.set(name, "loading");
			logger.info(`Preloading ${name}...`);

			const startTime = Date.now();
			loader.preload();

			// Wait for loader to finish (but don't block)
			// We'll check status asynchronously
			setTimeout(async () => {
				try {
					await loader.get(); // Wait for it to finish
					const duration = Date.now() - startTime;
					this.status.set(name, "loaded");
					logger.info(`${name} preloaded successfully (${duration}ms)`);
				} catch (error) {
					this.status.set(name, "failed");
					logger.error(
						`Failed to preload ${name}`,
						error instanceof Error ? error : undefined,
					);
				}
			}, 0);
		} catch (error) {
			this.status.set(name, "failed");
			logger.error(
				`Failed to preload ${name}`,
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Get preload status for all registered loaders
	 */
	getStatus(): Record<string, PreloadStatus> {
		const result: Record<string, PreloadStatus> = {};
		for (const [name, status] of this.status) {
			result[name] = status;
		}
		return result;
	}

	/**
	 * Get status for a specific loader
	 */
	getStatusFor(name: string): PreloadStatus | undefined {
		return this.status.get(name);
	}

	/**
	 * Check if all registered loaders have completed (loaded or failed)
	 */
	isComplete(): boolean {
		for (const status of this.status.values()) {
			if (status === "pending" || status === "loading") {
				return false;
			}
		}
		return true;
	}

	/**
	 * Get count of loaders in each status
	 */
	getStats(): {
		total: number;
		pending: number;
		loading: number;
		loaded: number;
		failed: number;
	} {
		const stats = {
			total: this.entries.length,
			pending: 0,
			loading: 0,
			loaded: 0,
			failed: 0,
		};

		for (const status of this.status.values()) {
			stats[status]++;
		}

		return stats;
	}

	/**
	 * Clear all pending timers and reset state
	 */
	dispose(): void {
		// Clear all pending timers
		for (const timer of this.timers) {
			clearTimeout(timer);
		}
		this.timers = [];

		logger.info("IdlePreloader disposed");
	}
}
