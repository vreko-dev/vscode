/**
 * LazyLoader - Deferred service loading with caching
 *
 * Enables lazy initialization of heavy services to improve extension activation time.
 * Features:
 * - Lazy loading: Factory only called on first access
 * - Caching: Service reused after first load
 * - Concurrency-safe: Multiple get() calls wait for same load
 * - Preloading: Start loading before first access (for idle-time init)
 * - Type-safe: Full TypeScript support
 * - Disposable: Cleanup when service has dispose()
 */

/**
 * Service that can be disposed
 */
export interface Disposable {
	dispose(): void;
}

/**
 * Factory function that creates a service
 */
export type ServiceFactory<T> = () => Promise<T>;

/**
 * Lazy loader for heavy services
 *
 * @example
 * ```typescript
 * const guardianLoader = new LazyLoader(
 *   async () => {
 *     const { Guardian } = await import('./Guardian');
 *     return new Guardian();
 *   },
 *   'Guardian'
 * );
 *
 * // Later, on first access:
 * const guardian = await guardianLoader.get();
 *
 * // Or preload during idle time:
 * guardianLoader.preload();
 * ```
 */
export class LazyLoader<T> {
	private factory: ServiceFactory<T>;
	private name: string;
	private service: T | undefined;
	private loadingPromise: Promise<T> | undefined;

	constructor(factory: ServiceFactory<T>, name = "unnamed") {
		this.factory = factory;
		this.name = name;
	}

	/**
	 * Get service name (for debugging)
	 */
	getName(): string {
		return this.name;
	}

	/**
	 * Get the service, loading it if necessary
	 * Concurrent calls wait for the same load operation
	 */
	async get(): Promise<T> {
		// Return cached service if already loaded
		if (this.service !== undefined) {
			return this.service;
		}

		// If already loading, wait for that promise
		if (this.loadingPromise) {
			return this.loadingPromise;
		}

		// Start loading
		this.loadingPromise = this.factory();

		try {
			this.service = await this.loadingPromise;
			return this.service;
		} catch (error) {
			// Clear loading promise on error to allow retry
			this.loadingPromise = undefined;
			throw error;
		}
	}

	/**
	 * Check if service is already loaded
	 */
	isLoaded(): boolean {
		return this.service !== undefined;
	}

	/**
	 * Check if service is currently loading
	 */
	isLoading(): boolean {
		return this.loadingPromise !== undefined && this.service === undefined;
	}

	/**
	 * Get service if already loaded, otherwise return undefined
	 * Does not trigger loading
	 */
	getIfLoaded(): T | undefined {
		return this.service;
	}

	/**
	 * Start loading the service without waiting
	 * Useful for preloading during idle time
	 */
	preload(): void {
		// Don't preload if already loaded or loading
		if (this.service !== undefined || this.loadingPromise) {
			return;
		}

		// Start loading (don't await)
		this.get().catch(() => {
			// Silently ignore errors during preload
			// Error will be thrown when get() is actually called
		});
	}

	/**
	 * Reset the loader, clearing the cached service
	 * Disposes the service if it has a dispose method
	 */
	reset(): void {
		// Dispose existing service
		if (this.service !== undefined) {
			this.disposeService(this.service);
		}

		// Clear state
		this.service = undefined;
		this.loadingPromise = undefined;
	}

	/**
	 * Dispose the loader and its loaded service
	 */
	dispose(): void {
		this.reset();
	}

	/**
	 * Dispose a service if it has a dispose method
	 */
	private disposeService(service: T): void {
		if (
			service &&
			typeof (service as unknown as Disposable).dispose === "function"
		) {
			(service as unknown as Disposable).dispose();
		}
	}
}
