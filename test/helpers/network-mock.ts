/**
 * @fileoverview Network Mocking Helper
 *
 * Provides utilities for mocking network requests with fault injection capabilities.
 * This enables testing of error handling, retry logic, offline mode, and slow networks.
 *
 * Usage:
 * ```typescript
 * import { createMockNetwork, NetworkCondition } from '@test/helpers/network-mock';
 *
 * const network = createMockNetwork();
 *
 * // Configure success response
 * network.mockResponse('/api/auth', { token: 'abc123' });
 *
 * // Configure slow network
 * network.mockResponse('/api/data', { data: [...] }, { delay: 2000 });
 *
 * // Configure failure
 * network.mockFailure('/api/endpoint', new Error('Network timeout'));
 *
 * // Test offline mode
 * network.mockOffline();
 * ```
 */

import { withRetry, RetryPresets } from "@snapback-oss/sdk";

export interface NetworkResponse<T = unknown> {
	data: T;
	status: number;
	statusText: string;
	headers: Record<string, string>;
}

export interface NetworkRequestOptions {
	method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	headers?: Record<string, string>;
	body?: unknown;
	timeout?: number;
}

export interface MockResponseOptions {
	/** Delay in milliseconds before responding */
	delay?: number;
	/** HTTP status code */
	status?: number;
	/** Response headers */
	headers?: Record<string, string>;
	/** Whether to retry on failure */
	retryable?: boolean;
}

export enum NetworkCondition {
	ONLINE = "online",
	OFFLINE = "offline",
	SLOW = "slow",
	UNSTABLE = "unstable",
}

export interface NetworkAdapter {
	get<T>(
		url: string,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>>;
	post<T>(
		url: string,
		data: unknown,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>>;
	put<T>(
		url: string,
		data: unknown,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>>;
	delete<T>(
		url: string,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>>;
}

interface MockConfig {
	response?: unknown;
	error?: Error;
	options?: MockResponseOptions;
	callCount?: number;
}

/**
 * Mock network adapter for testing
 */
export class MockNetworkAdapter implements NetworkAdapter {
	private mocks = new Map<string, MockConfig>();
	private condition: NetworkCondition = NetworkCondition.ONLINE;
	private requestLog: Array<{
		url: string;
		method: string;
		timestamp: number;
		data?: unknown;
	}> = [];

	/**
	 * Mock a successful response for a URL
	 */
	mockResponse<T>(
		url: string,
		response: T,
		options: MockResponseOptions = {},
	): void {
		this.mocks.set(url, {
			response,
			options,
			callCount: 0,
		});
	}

	/**
	 * Mock a failure for a URL
	 */
	mockFailure(url: string, error: Error): void {
		this.mocks.set(url, {
			error,
			callCount: 0,
		});
	}

	/**
	 * Simulate offline mode (all requests fail)
	 */
	mockOffline(): void {
		this.condition = NetworkCondition.OFFLINE;
	}

	/**
	 * Simulate slow network (adds 2-5 second delay to all requests)
	 */
	mockSlowNetwork(): void {
		this.condition = NetworkCondition.SLOW;
	}

	/**
	 * Simulate unstable network (random failures)
	 */
	mockUnstableNetwork(): void {
		this.condition = NetworkCondition.UNSTABLE;
	}

	/**
	 * Restore normal network conditions
	 */
	mockOnline(): void {
		this.condition = NetworkCondition.ONLINE;
	}

	/**
	 * Clear all mocks
	 */
	clear(): void {
		this.mocks.clear();
		this.requestLog = [];
		this.condition = NetworkCondition.ONLINE;
	}

	/**
	 * Get request log (for assertions)
	 */
	getRequestLog() {
		return [...this.requestLog];
	}

	/**
	 * Get number of calls to a URL
	 */
	getCallCount(url: string): number {
		const mock = this.mocks.get(url);
		return mock?.callCount || 0;
	}

	/**
	 * Reset call counts
	 */
	resetCallCounts(): void {
		for (const mock of this.mocks.values()) {
			mock.callCount = 0;
		}
	}

	async get<T>(
		url: string,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>> {
		return this.makeRequest<T>("GET", url, undefined, options);
	}

	async post<T>(
		url: string,
		data: unknown,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>> {
		return this.makeRequest<T>("POST", url, data, options);
	}

	async put<T>(
		url: string,
		data: unknown,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>> {
		return this.makeRequest<T>("PUT", url, data, options);
	}

	async delete<T>(
		url: string,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>> {
		return this.makeRequest<T>("DELETE", url, undefined, options);
	}

	private async makeRequest<T>(
		method: string,
		url: string,
		data?: unknown,
		_options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>> {
		// Log request
		this.requestLog.push({
			url,
			method,
			timestamp: Date.now(),
			data,
		});

		// Check network condition
		await this.applyNetworkCondition();

		// Get mock configuration
		const mock = this.mocks.get(url) || this.mocks.get("*");

		if (!mock) {
			throw new Error(`No mock configured for ${method} ${url}`);
		}

		// Increment call count
		mock.callCount = (mock.callCount || 0) + 1;

		// Apply delay if specified
		if (mock.options?.delay) {
			await this.delay(mock.options.delay);
		}

		// Return error if configured
		if (mock.error) {
			throw mock.error;
		}

		// Return success response
		return {
			data: mock.response as T,
			status: mock.options?.status || 200,
			statusText: "OK",
			headers: mock.options?.headers || {},
		};
	}

	private async applyNetworkCondition(): Promise<void> {
		switch (this.condition) {
			case NetworkCondition.OFFLINE:
				throw new Error("ENETUNREACH: Network is unreachable");

			case NetworkCondition.SLOW: {
				// Random delay between 2-5 seconds
				const slowDelay = 2000 + Math.random() * 3000;
				await this.delay(slowDelay);
				break;
			}

			case NetworkCondition.UNSTABLE:
				// 30% chance of failure
				if (Math.random() < 0.3) {
					throw new Error("ETIMEDOUT: Connection timed out");
				}
				break;
			default:
				// No delay or error
				break;
		}
	}

	private delay(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}
}

/**
 * Create a new mock network adapter
 */
export function createMockNetwork(): MockNetworkAdapter {
	return new MockNetworkAdapter();
}

/**
 * Create a network adapter that simulates retries
 */
export class RetryableNetworkAdapter extends MockNetworkAdapter {
	private maxRetries = 3;
	private retryDelay = 1000;

	constructor(maxRetries = 3, retryDelay = 1000) {
		super();
		this.maxRetries = maxRetries;
		this.retryDelay = retryDelay;
	}

	async get<T>(
		url: string,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>> {
		return this.withRetry(() => super.get<T>(url, options));
	}

	async post<T>(
		url: string,
		data: any,
		options?: NetworkRequestOptions,
	): Promise<NetworkResponse<T>> {
		return this.withRetry(() => super.post<T>(url, data, options));
	}

	private async withRetry<T>(
		fn: () => Promise<NetworkResponse<T>>,
	): Promise<NetworkResponse<T>> {
		return withRetry(fn, {
			...RetryPresets.network,
			maxAttempts: this.maxRetries + 1, // Convert to attempts (retries + initial)
			baseDelayMs: this.retryDelay,
		});
	}
}

/**
 * Create a network adapter with retry logic
 */
export function createRetryableNetwork(
	maxRetries = 3,
	retryDelay = 1000,
): RetryableNetworkAdapter {
	return new RetryableNetworkAdapter(maxRetries, retryDelay);
}

/**
 * Network error types for testing
 */
export class NetworkError extends Error {
	constructor(
		message: string,
		public code: string,
		public status?: number,
	) {
		super(message);
		this.name = "NetworkError";
	}
}

/**
 * Common network errors for testing
 */
export const NetworkErrors = {
	OFFLINE: new NetworkError("Network is offline", "ENETUNREACH"),
	TIMEOUT: new NetworkError("Request timeout", "ETIMEDOUT"),
	SERVER_ERROR: new NetworkError("Internal server error", "SERVER_ERROR", 500),
	UNAUTHORIZED: new NetworkError("Unauthorized", "UNAUTHORIZED", 401),
	NOT_FOUND: new NetworkError("Not found", "NOT_FOUND", 404),
	RATE_LIMITED: new NetworkError("Rate limited", "RATE_LIMITED", 429),
};
