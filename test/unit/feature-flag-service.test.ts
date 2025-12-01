import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FeatureFlagService } from "../../src/services/feature-flag-service";

// Mock the fetch function
global.fetch = vi.fn();

describe("FeatureFlagService", () => {
	let featureFlagService: FeatureFlagService;
	const mockUserId = "test-user-id";
	const mockFlags = {
		"test.flag": true,
		"another.flag": false,
		"numeric.flag": 42,
		"null.flag": null,
	};

	beforeEach(() => {
		featureFlagService = new FeatureFlagService();
		// Reset mocks
		(fetch as any).mockClear();
	});

	afterEach(() => {
		// Clear cache after each test
		featureFlagService.clearAllCache();
	});

	it("should fetch feature flags from API when not cached", async () => {
		// Mock API response
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		const flags = await featureFlagService.getUserFlags(mockUserId);

		expect(flags).toEqual(mockFlags);
		expect(fetch).toHaveBeenCalledTimes(1);
		expect(fetch).toHaveBeenCalledWith(
			expect.stringContaining("/api/rpc/featureFlags.getUserFlags"),
			expect.objectContaining({
				method: "POST",
				headers: { "Content-Type": "application/json" },
			}),
		);
	});

	it("should return cached flags when available and not expired", async () => {
		// Mock API response
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		// First call - should fetch from API
		const flags1 = await featureFlagService.getUserFlags(mockUserId);

		// Second call - should use cache
		const flags2 = await featureFlagService.getUserFlags(mockUserId);

		expect(flags1).toEqual(mockFlags);
		expect(flags2).toEqual(mockFlags);
		expect(fetch).toHaveBeenCalledTimes(1); // Should only be called once
	});

	it("should fetch fresh flags when forceRefresh is true", async () => {
		// Mock API response
		(fetch as any).mockResolvedValue({
			ok: true,
			json: async () => mockFlags,
		});

		// First call
		await featureFlagService.getUserFlags(mockUserId);

		// Second call with forceRefresh
		await featureFlagService.getUserFlags(mockUserId, true);

		expect(fetch).toHaveBeenCalledTimes(2); // Should be called twice
	});

	it("should return cached flags when API call fails but cache exists", async () => {
		// Mock successful first API call
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		// Get initial flags
		const initialFlags = await featureFlagService.getUserFlags(mockUserId);

		// Mock failed second API call
		(fetch as any).mockResolvedValueOnce({
			ok: false,
			status: 500,
			statusText: "Internal Server Error",
		});

		// Second call should return cached data
		const flags = await featureFlagService.getUserFlags(mockUserId);

		expect(flags).toEqual(initialFlags);
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("should return specific flag value", async () => {
		// Mock API response
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		const value = await featureFlagService.getFlagValue(
			mockUserId,
			"test.flag",
			false,
		);

		expect(value).toBe(true);
	});

	it("should return default value when flag doesn't exist", async () => {
		// Mock API response
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		const value = await featureFlagService.getFlagValue(
			mockUserId,
			"nonexistent.flag",
			"default",
		);

		expect(value).toBe("default");
	});

	it("should check if feature is enabled", async () => {
		// Mock API response
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		const enabled = await featureFlagService.isFeatureEnabled(
			mockUserId,
			"test.flag",
		);

		expect(enabled).toBe(true);
	});

	it("should clear cache for specific user", async () => {
		// Mock API response
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		// Get flags to populate cache
		await featureFlagService.getUserFlags(mockUserId);

		// Clear cache for user
		featureFlagService.clearUserCache(mockUserId);

		// Mock API response again
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		// Should fetch from API again
		await featureFlagService.getUserFlags(mockUserId);

		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("should clear all cache", async () => {
		// Mock API response
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		// Get flags to populate cache
		await featureFlagService.getUserFlags(mockUserId);

		// Clear all cache
		featureFlagService.clearAllCache();

		// Mock API response again
		(fetch as any).mockResolvedValueOnce({
			ok: true,
			json: async () => mockFlags,
		});

		// Should fetch from API again
		await featureFlagService.getUserFlags(mockUserId);

		expect(fetch).toHaveBeenCalledTimes(2);
	});
});
