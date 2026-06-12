// PostHogClient interface definition (mirrors @vreko/contracts)
interface PostHogClient {
	isFeatureEnabled(flag: string, userId: string, context?: Record<string, unknown>): Promise<boolean | null>;
	getFeatureFlag(
		flag: string,
		userId: string,
		context?: Record<string, unknown>,
	): Promise<string | boolean | number | null>;
	capture(event: string, properties: Record<string, unknown>): void;
	shutdown(): Promise<void>;
	clearCache?(): Promise<void> | void;
	getMetrics?(): FlagMetrics | Promise<FlagMetrics>;
	resetMetrics?(): void | Promise<void>;
	reportMetrics?(): void | Promise<void>;
}

import * as vscode from "vscode";
import { toError } from "../utils/errorHelpers";
import { logger } from "../utils/logger";

/**
 * PostHog Client for VS Code Extension
 *
 * Implements feature flag evaluation with:
 * - Local caching with TTL for offline support
 * - LRU (Least Recently Used) eviction to prevent memory leaks
 * - Privacy-respecting telemetry (checks vreko.telemetry.enabled)
 * - Lightweight fetch-based API calls
 * - Graceful error handling and fallback behavior
 * - VS Code storage for persistent cache
 * - Metrics telemetry for flag evaluation performance and cache statistics
 *
 * @module PostHogClient
 */

interface CacheEntry<T> {
	value: T;
	timestamp: number;
	expiresAt: number;
}

interface FeatureFlagCache {
	[userId: string]: {
		[flagName: string]: CacheEntry<string | boolean | number | null>;
	};
}

interface LRUEntry {
	userId: string;
	flag: string;
}

/**
 * Metrics interface for tracking flag evaluation performance and cache statistics
 */
export interface FlagMetrics {
	evaluations: number;
	cacheHits: number;
	cacheMisses: number;
	apiCalls: number;
	errors: number;
	totalLatencyMs: number;
}

export class PostHogClientImpl implements PostHogClient {
	private apiBaseUrl: string;
	private postHogApiKey: string | undefined;
	private cache: FeatureFlagCache = {};
	private cacheTtlMs: number;
	private telemetryEnabled: boolean;
	private storageKey = "vreko.posthog.cache";
	private context: vscode.ExtensionContext | undefined;
	private isShutdown = false;

	// LRU cache tracking
	private maxCacheEntries = 100;
	private lruQueue: LRUEntry[] = [];

	// Metrics tracking
	private metrics: FlagMetrics = {
		evaluations: 0,
		cacheHits: 0,
		cacheMisses: 0,
		apiCalls: 0,
		errors: 0,
		totalLatencyMs: 0,
	};

	/**
	 * Initialize PostHog client
	 *
	 * @param context - VS Code extension context for storage
	 * @param options - Configuration options
	 */
	constructor(
		context?: vscode.ExtensionContext,
		options?: {
			cacheTtlMs?: number;
			apiBaseUrl?: string;
			apiKey?: string;
		},
	) {
		this.context = context;

		// Get configuration from VS Code settings
		const config = vscode.workspace.getConfiguration("vreko");
		this.apiBaseUrl = options?.apiBaseUrl || config.get<string>("apiBaseUrl", "https://api.vreko.dev");
		this.postHogApiKey = options?.apiKey || process.env.POSTHOG_API_KEY;
		this.cacheTtlMs = options?.cacheTtlMs || 5 * 60 * 1000; // 5 minutes default
		this.telemetryEnabled = config.get<boolean>("telemetry.enabled", true);

		// Load persisted cache from storage if available
		this.loadCacheFromStorage();

		logger.debug("PostHog client initialized", {
			apiBaseUrl: this.apiBaseUrl,
			hasApiKey: !!this.postHogApiKey,
			cacheTtlMs: this.cacheTtlMs,
			telemetryEnabled: this.telemetryEnabled,
		});
	}

	/**
	 * Check if a feature flag is enabled
	 *
	 * @param flag - Feature flag name
	 * @param userId - User ID for flag evaluation
	 * @param context - Optional context for flag evaluation
	 * @returns boolean or null if undetermined
	 */
	async isFeatureEnabled(flag: string, userId: string, context?: Record<string, unknown>): Promise<boolean | null> {
		try {
			if (!this.telemetryEnabled) {
				logger.debug("Telemetry disabled, returning null for flag check", { flag, userId });
				return null;
			}

			const value = await this.getFeatureFlag(flag, userId, context);

			// Convert to boolean
			if (value === null || value === undefined) {
				return null;
			}

			if (typeof value === "boolean") {
				return value;
			}

			if (typeof value === "number") {
				return value !== 0;
			}

			if (typeof value === "string") {
				return value !== "" && value.toLowerCase() !== "false";
			}

			return false;
		} catch (error) {
			logger.warn("Failed to check feature flag", toError(error), { flag, userId });
			return null;
		}
	}

	/**
	 * Get feature flag value with metrics tracking
	 *
	 * @param flag - Feature flag name
	 * @param userId - User ID for flag evaluation
	 * @param context - Optional context for flag evaluation
	 * @returns Feature flag value or null if not found
	 */
	async getFeatureFlag(
		flag: string,
		userId: string,
		context?: Record<string, unknown>,
	): Promise<string | boolean | number | null> {
		const startTime = Date.now();

		if (this.isShutdown) {
			logger.debug("PostHog client is shut down, returning null");
			return null;
		}

		try {
			// Increment evaluations counter
			this.metrics.evaluations++;

			if (!this.telemetryEnabled) {
				logger.debug("Telemetry disabled, returning null for flag", { flag, userId });
				return null;
			}

			// Check cache first
			const cachedValue = this.getCachedFlag(flag, userId);
			if (cachedValue !== undefined) {
				// Track cache hit
				this.metrics.cacheHits++;
				const latency = Date.now() - startTime;
				this.metrics.totalLatencyMs += latency;

				logger.debug("Returning cached feature flag", { flag, userId, cached: true, latencyMs: latency });
				return cachedValue;
			}

			// Track cache miss
			this.metrics.cacheMisses++;

			// Fetch from API if not cached
			this.metrics.apiCalls++;
			const value = await this.fetchFeatureFlagFromAPI(flag, userId, context);

			// Cache the result
			this.setCachedFlag(flag, userId, value);

			const latency = Date.now() - startTime;
			this.metrics.totalLatencyMs += latency;

			return value;
		} catch (error) {
			// Track error
			this.metrics.errors++;
			const latency = Date.now() - startTime;
			this.metrics.totalLatencyMs += latency;

			logger.warn("Failed to fetch feature flag, returning cached or null", toError(error), {
				flag,
				userId,
				latencyMs: latency,
			});

			// Try to return cached value on error
			const cachedValue = this.getCachedFlag(flag, userId);
			if (cachedValue !== undefined) {
				logger.debug("Returning stale cached value after API error", { flag, userId });
				return cachedValue;
			}

			return null;
		}
	}

	capture(_event: string, _properties: Record<string, unknown>): void {
		// This client is feature-flag-only (fetch-based); event capture is not supported.
	}

	/**
	 * Shutdown the client and clean up resources
	 */
	async shutdown(): Promise<void> {
		if (this.isShutdown) {
			return;
		}

		this.isShutdown = true;

		try {
			// Report metrics before shutdown
			this.reportMetrics();

			// Persist cache to storage
			await this.persistCacheToStorage();
			logger.debug("PostHog client shut down successfully");
		} catch (error) {
			logger.warn("Error persisting cache during shutdown", toError(error));
		}
	}

	/**
	 * Get cached flag value if not expired
	 * Updates LRU order on successful retrieval
	 */
	private getCachedFlag(flag: string, userId: string): string | boolean | number | null | undefined {
		const userCache = this.cache[userId];
		if (!userCache) {
			return undefined;
		}

		const entry = userCache[flag];
		if (!entry) {
			return undefined;
		}

		// Check if cache entry is expired
		if (Date.now() > entry.expiresAt) {
			delete userCache[flag];
			logger.debug("Cache entry expired, removing", { flag, userId });
			// Remove from LRU queue when expired
			this.removeFromLruQueue(flag, userId);
			return undefined;
		}

		// Update LRU order on access
		this.updateLruOrder(flag, userId);

		return entry.value;
	}

	/**
	 * Set cached flag value
	 * Handles LRU eviction when cache reaches capacity
	 */
	private setCachedFlag(flag: string, userId: string, value: string | boolean | number | null): void {
		if (!this.cache[userId]) {
			this.cache[userId] = {};
		}

		// Update LRU order before setting
		this.updateLruOrder(flag, userId);

		// Evict oldest entry if at capacity
		if (this.lruQueue.length > this.maxCacheEntries) {
			const oldest = this.lruQueue.pop();
			if (oldest) {
				const oldUserCache = this.cache[oldest.userId];
				if (oldUserCache) {
					delete oldUserCache[oldest.flag];
					logger.debug("Evicted oldest cache entry due to LRU limit", {
						flag: oldest.flag,
						userId: oldest.userId,
					});
					// Clean up empty user cache entries
					if (Object.keys(oldUserCache).length === 0) {
						delete this.cache[oldest.userId];
					}
				}
			}
		}

		const now = Date.now();
		this.cache[userId][flag] = {
			value,
			timestamp: now,
			expiresAt: now + this.cacheTtlMs,
		};

		logger.debug("Cached feature flag", {
			flag,
			userId,
			ttlMs: this.cacheTtlMs,
			queueSize: this.lruQueue.length,
		});
	}

	/**
	 * Update LRU order for a cache entry
	 * Moves the entry to the front of the queue
	 */
	private updateLruOrder(flag: string, userId: string): void {
		// Find and remove existing entry if present
		const existingIndex = this.lruQueue.findIndex((item) => item.userId === userId && item.flag === flag);

		if (existingIndex > -1) {
			this.lruQueue.splice(existingIndex, 1);
		}

		// Add to front of queue (most recently used)
		this.lruQueue.unshift({ userId, flag });
	}

	/**
	 * Remove an entry from the LRU queue
	 */
	private removeFromLruQueue(flag: string, userId: string): void {
		const index = this.lruQueue.findIndex((item) => item.userId === userId && item.flag === flag);
		if (index > -1) {
			this.lruQueue.splice(index, 1);
		}
	}

	/**
	 * Fetch feature flag from PostHog API via Vreko proxy
	 *
	 * Uses the Vreko API as a proxy to PostHog for:
	 * - Centralized API key management
	 * - Privacy enforcement
	 * - Request logging and analytics
	 */
	private async fetchFeatureFlagFromAPI(
		flag: string,
		userId: string,
		context?: Record<string, unknown>,
	): Promise<string | boolean | number | null> {
		// Use PostHog Node SDK endpoint or fall back to API proxy
		const endpoint = `${this.apiBaseUrl}/api/rpc/featureFlags.getFlag`;

		const payload = {
			flag,
			userId,
			context: context || {},
		};

		try {
			const response = await fetch(endpoint, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					// Include API key if available for direct PostHog calls
					...(this.postHogApiKey && { Authorization: `Bearer ${this.postHogApiKey}` }),
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const result: { value: string | boolean | number | null } = (await response.json()) as {
				value: string | boolean | number | null;
			};

			logger.debug("Feature flag fetched from API", { flag, userId, value: result.value });
			return result.value;
		} catch (error) {
			logger.warn("Failed to fetch feature flag from API", toError(error), {
				endpoint,
				flag,
				userId,
			});
			throw error;
		}
	}

	/**
	 * Load cache from VS Code extension storage
	 */
	private loadCacheFromStorage(): void {
		if (!this.context) {
			return;
		}

		try {
			const stored = this.context.globalState.get<FeatureFlagCache>(this.storageKey);
			if (stored) {
				this.cache = stored;
				logger.debug("Loaded PostHog cache from storage", {
					userCount: Object.keys(stored).length,
				});
			}
		} catch (error) {
			logger.warn("Failed to load PostHog cache from storage", toError(error));
		}
	}

	/**
	 * Persist cache to VS Code extension storage
	 */
	private async persistCacheToStorage(): Promise<void> {
		if (!this.context) {
			return;
		}

		try {
			// Remove expired entries before persisting
			const now = Date.now();
			for (const userId in this.cache) {
				const userCache = this.cache[userId];
				for (const flagName in userCache) {
					if (now > userCache[flagName].expiresAt) {
						delete userCache[flagName];
					}
				}
				if (Object.keys(userCache).length === 0) {
					delete this.cache[userId];
				}
			}

			await this.context.globalState.update(this.storageKey, this.cache);
			logger.debug("Persisted PostHog cache to storage", {
				userCount: Object.keys(this.cache).length,
			});
		} catch (error) {
			logger.warn("Failed to persist PostHog cache to storage", toError(error));
		}
	}

	/**
	 * Get current metrics snapshot
	 *
	 * @returns Copy of current metrics
	 */
	public getMetrics(): FlagMetrics {
		return { ...this.metrics };
	}

	/**
	 * Reset all metrics counters to zero
	 */
	public resetMetrics(): void {
		this.metrics = {
			evaluations: 0,
			cacheHits: 0,
			cacheMisses: 0,
			apiCalls: 0,
			errors: 0,
			totalLatencyMs: 0,
		};
		logger.debug("Feature flag metrics reset");
	}

	/**
	 * Report metrics as telemetry event
	 *
	 * Calculates and emits metrics including:
	 * - Raw counters (evaluations, cache hits/misses, API calls, errors)
	 * - Average latency in milliseconds
	 * - Cache hit rate percentage
	 */
	public reportMetrics(): void {
		const avgLatency = this.metrics.evaluations > 0 ? this.metrics.totalLatencyMs / this.metrics.evaluations : 0;

		const cacheHitRate = this.metrics.evaluations > 0 ? this.metrics.cacheHits / this.metrics.evaluations : 0;

		const report = {
			...this.metrics,
			avgLatencyMs: avgLatency,
			cacheHitRate,
		};

		logger.info("Feature flag metrics report", report);
	}

	/**
	 * Clear all cached data
	 */
	public clearCache(): void {
		this.cache = {};
		this.lruQueue = [];
		logger.debug("Cleared PostHog cache");
	}

	/**
	 * Clear cache for specific user
	 */
	public clearUserCache(userId: string): void {
		delete this.cache[userId];
		// Remove all entries for this user from LRU queue
		this.lruQueue = this.lruQueue.filter((item) => item.userId !== userId);
		logger.debug("Cleared PostHog cache for user", { userId });
	}

	/**
	 * Set custom cache TTL
	 */
	public setCacheTtl(ttlMs: number): void {
		this.cacheTtlMs = ttlMs;
		logger.debug("Updated PostHog cache TTL", { ttlMs });
	}

	/**
	 * Check if telemetry is enabled
	 */
	public isTelemetryEnabled(): boolean {
		return this.telemetryEnabled;
	}

	/**
	 * Update telemetry setting
	 */
	public setTelemetryEnabled(enabled: boolean): void {
		this.telemetryEnabled = enabled;
		logger.debug("Updated telemetry setting", { enabled });
	}
}

/**
 * Lazy-loading wrapper for PostHogClient
 *
 * Defers instantiation of the real PostHogClient until first use (on first feature flag check).
 * This improves extension activation performance by avoiding unnecessary initialization overhead
 * when feature flags aren't immediately needed.
 *
 * The lazy client caches the promise to avoid multiple instantiations and properly forwards
 * all method calls to the underlying real client once initialized.
 */
export class LazyPostHogClient implements PostHogClient {
	private clientPromise: Promise<PostHogClient> | null = null;
	private readonly context: vscode.ExtensionContext;
	private readonly options?: {
		cacheTtlMs?: number;
		apiBaseUrl?: string;
		apiKey?: string;
	};

	constructor(
		context: vscode.ExtensionContext,
		options?: {
			cacheTtlMs?: number;
			apiBaseUrl?: string;
			apiKey?: string;
		},
	) {
		this.context = context;
		this.options = options;
		logger.debug("LazyPostHogClient created (initialization deferred)");
	}

	async isFeatureEnabled(flag: string, userId: string, context?: Record<string, unknown>): Promise<boolean | null> {
		const client = await this.getClient();
		return client.isFeatureEnabled(flag, userId, context);
	}

	async getFeatureFlag(
		flag: string,
		userId: string,
		context?: Record<string, unknown>,
	): Promise<string | boolean | number | null> {
		const client = await this.getClient();
		return client.getFeatureFlag(flag, userId, context);
	}

	capture(_event: string, _properties: Record<string, unknown>): void {
		// This client is feature-flag-only; event capture is not supported.
	}

	async shutdown(): Promise<void> {
		if (this.clientPromise) {
			try {
				const client = await this.clientPromise;
				await client.shutdown();
				logger.debug("LazyPostHogClient shut down successfully");
			} catch (error) {
				logger.warn("Failed to shutdown LazyPostHogClient", toError(error));
			}
		} else {
			logger.debug("LazyPostHogClient shutdown called before initialization - no action needed");
		}
	}

	/**
	 * Clear the cache in the underlying client
	 *
	 * If the client is already initialized, clears its cache directly.
	 * If not initialized, this is a no-op since there's no cache yet.
	 */
	public async clearCache(): Promise<void> {
		if (this.clientPromise) {
			try {
				const client = await this.clientPromise;
				if (client instanceof PostHogClientImpl) {
					client.clearCache();
					logger.info("Cleared PostHog cache in LazyPostHogClient");
				}
			} catch (error) {
				logger.warn("Failed to clear PostHog cache", toError(error));
			}
		} else {
			logger.debug("LazyPostHogClient.clearCache called before initialization - no action needed");
		}
	}

	/**
	 * Get metrics from the underlying client
	 *
	 * If the client is not yet initialized, returns empty metrics.
	 */
	public async getMetrics(): Promise<FlagMetrics> {
		if (this.clientPromise) {
			try {
				const client = await this.clientPromise;
				if (client instanceof PostHogClientImpl) {
					return client.getMetrics();
				}
			} catch (error) {
				logger.warn("Failed to get PostHog metrics", toError(error));
			}
		} else {
			logger.debug("LazyPostHogClient.getMetrics called before initialization - returning empty metrics");
		}

		return {
			evaluations: 0,
			cacheHits: 0,
			cacheMisses: 0,
			apiCalls: 0,
			errors: 0,
			totalLatencyMs: 0,
		};
	}

	/**
	 * Reset metrics in the underlying client
	 *
	 * If the client is not yet initialized, this is a no-op.
	 */
	public async resetMetrics(): Promise<void> {
		if (this.clientPromise) {
			try {
				const client = await this.clientPromise;
				if (client instanceof PostHogClientImpl) {
					client.resetMetrics();
					logger.info("Reset PostHog metrics in LazyPostHogClient");
				}
			} catch (error) {
				logger.warn("Failed to reset PostHog metrics", toError(error));
			}
		} else {
			logger.debug("LazyPostHogClient.resetMetrics called before initialization - no action needed");
		}
	}

	/**
	 * Report metrics from the underlying client
	 *
	 * If the client is not yet initialized, this is a no-op.
	 */
	public async reportMetrics(): Promise<void> {
		if (this.clientPromise) {
			try {
				const client = await this.clientPromise;
				if (client instanceof PostHogClientImpl) {
					client.reportMetrics();
					logger.info("Reported PostHog metrics in LazyPostHogClient");
				}
			} catch (error) {
				logger.warn("Failed to report PostHog metrics", toError(error));
			}
		} else {
			logger.debug("LazyPostHogClient.reportMetrics called before initialization - no action needed");
		}
	}

	private async getClient(): Promise<PostHogClient> {
		if (!this.clientPromise) {
			this.clientPromise = this.createClient();
		}
		return this.clientPromise;
	}

	private async createClient(): Promise<PostHogClient> {
		try {
			logger.info("LazyPostHogClient: Initializing underlying PostHogClient on first use");
			const client = new PostHogClientImpl(this.context, this.options);
			logger.info("LazyPostHogClient: Underlying PostHogClient initialized successfully");
			return client;
		} catch (error) {
			logger.error("LazyPostHogClient: Failed to initialize underlying PostHogClient", toError(error));
			throw error;
		}
	}
}

/**
 * Factory function to create PostHog client with proper context
 */
export function createPostHogClient(
	context: vscode.ExtensionContext,
	options?: {
		cacheTtlMs?: number;
		apiBaseUrl?: string;
		apiKey?: string;
	},
): PostHogClient {
	return new PostHogClientImpl(context, options);
}

/**
 * Factory function to create lazy-loading PostHog client
 */
export function createLazyPostHogClient(
	context: vscode.ExtensionContext,
	options?: {
		cacheTtlMs?: number;
		apiBaseUrl?: string;
		apiKey?: string;
	},
): PostHogClient {
	return new LazyPostHogClient(context, options);
}
