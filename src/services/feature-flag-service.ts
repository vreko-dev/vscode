import * as vscode from "vscode";

import { logger } from "../utils/logger.js";

/**
 * Feature Flag Service with Caching
 *
 * This service provides client-side caching for feature flags to reduce API calls
 * and improve performance. It fetches feature flags from the backend API and
 * caches them with a configurable TTL.
 */

interface FeatureFlags {
	[key: string]: string | number | boolean | null;
}

export class FeatureFlagService {
	private apiBaseUrl: string;
	private cache: Map<string, { flags: FeatureFlags; timestamp: number }> =
		new Map();
	private defaultTtl: number = 5 * 60 * 1000; // 5 minutes default TTL

	constructor() {
		// Use the API base URL from configuration or default to production
		this.apiBaseUrl = vscode.workspace
			.getConfiguration("snapback")
			.get<string>("apiBaseUrl", "https://api.snapback.dev");
	}

	/**
	 * Get feature flags for a user with caching
	 */
	async getUserFlags(
		userId: string,
		forceRefresh: boolean = false,
	): Promise<FeatureFlags> {
		const cached = this.cache.get(userId);
		const now = Date.now();

		// Return cached flags if they exist and haven't expired
		if (cached && !forceRefresh && now - cached.timestamp < this.defaultTtl) {
			logger.debug(`Returning cached feature flags for user ${userId}`);
			return cached.flags;
		}

		// Fetch fresh flags from API
		try {
			logger.debug(`Fetching feature flags for user ${userId}`);
			const flags = await this.fetchUserFlagsFromApi(userId);

			// Cache the results
			this.cache.set(userId, {
				flags,
				timestamp: now,
			});

			logger.debug(`Cached feature flags for user ${userId}`);
			return flags;
		} catch (error) {
			logger.warn("Failed to fetch feature flags", error as Error);
			// Return default flags on error
			const defaultFlags: FeatureFlags = {
				enableAIAssistedWorkflows: false,
				enableAdvancedAnalytics: false,
				enableTeamPolicies: false,
				enableOfflineMode: false,
			};
			return Promise.resolve(defaultFlags); // Return a Promise
		}
	}

	/**
	 * Fetch feature flags from the backend API
	 */
	private async fetchUserFlagsFromApi(userId: string): Promise<FeatureFlags> {
		const response = await fetch(
			`${this.apiBaseUrl}/api/rpc/featureFlags.getUserFlags`,
			{
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					userId,
				}),
			},
		);

		if (!response.ok) {
			throw new Error(`HTTP ${response.status}: ${response.statusText}`);
		}

		const result: FeatureFlags = (await response.json()) as FeatureFlags;
		return result;
	}

	/**
	 * Get a specific feature flag value for a user
	 */
	async getFlagValue<T extends string | number | boolean | null>(
		userId: string,
		flagName: string,
		defaultValue: T,
	): Promise<T> {
		const flags = await this.getUserFlags(userId);
		return (flags[flagName] as T) ?? defaultValue;
	}

	/**
	 * Check if a feature flag is enabled for a user
	 */
	async isFeatureEnabled(userId: string, flagName: string): Promise<boolean> {
		const value = await this.getFlagValue(userId, flagName, false);
		return Boolean(value);
	}

	/**
	 * Clear cache for a specific user
	 */
	clearUserCache(userId: string): void {
		this.cache.delete(userId);
		logger.debug(`Cleared feature flag cache for user ${userId}`);
	}

	/**
	 * Clear all cached data
	 */
	clearAllCache(): void {
		this.cache.clear();
		logger.debug("Cleared all feature flag cache");
	}

	/**
	 * Set custom TTL for cache expiration
	 */
	setCacheTtl(ttlMs: number): void {
		this.defaultTtl = ttlMs;
		logger.debug(`Set feature flag cache TTL to ${ttlMs}ms`);
	}
}
