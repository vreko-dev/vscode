/**
 * @fileoverview Network Adapter Interface
 *
 * Abstraction layer for network operations to enable:
 * - Dependency injection for testing
 * - Offline mode support
 * - Fault injection testing
 * - Network condition simulation (slow, unstable, offline)
 *
 * Production code should NEVER call fetch() directly - always use NetworkAdapter.
 */

/**
 * Network request configuration
 */
export interface NetworkRequest {
	/** Request URL */
	url: string;
	/** HTTP method */
	method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
	/** Request headers */
	headers?: Record<string, string>;
	/** Request body (JSON will be stringified automatically) */
	body?: unknown;
	/** Request timeout in milliseconds */
	timeout?: number;
}

/**
 * Network response
 */
export interface NetworkResponse<T = unknown> {
	/** Response status code */
	status: number;
	/** Response status text */
	statusText: string;
	/** Response headers */
	headers: Record<string, string>;
	/** Response body (parsed as JSON if Content-Type is application/json) */
	data: T;
	/** Raw response body as text */
	text: string;
	/** Whether the request was successful (status 200-299) */
	ok: boolean;
}

/**
 * Network adapter interface
 *
 * Implementations:
 * - FetchNetworkAdapter: Production implementation using fetch()
 * - MockNetworkAdapter: Test implementation with fault injection
 */
export interface NetworkAdapter {
	/**
	 * Execute a network request
	 *
	 * @param request - Request configuration
	 * @returns Promise<NetworkResponse>
	 * @throws NetworkError if request fails
	 *
	 * @example
	 * ```typescript
	 * const response = await adapter.request({
	 *   url: 'https://api.snapback.dev/v1/analyze',
	 *   method: 'POST',
	 *   headers: { 'X-API-Key': 'key' },
	 *   body: { files: [...] }
	 * });
	 * ```
	 */
	request<T = unknown>(request: NetworkRequest): Promise<NetworkResponse<T>>;

	/**
	 * Execute a GET request (convenience method)
	 *
	 * @param url - Request URL
	 * @param headers - Optional headers
	 * @returns Promise<NetworkResponse>
	 */
	get<T = unknown>(
		url: string,
		headers?: Record<string, string>,
	): Promise<NetworkResponse<T>>;

	/**
	 * Execute a POST request (convenience method)
	 *
	 * @param url - Request URL
	 * @param body - Request body
	 * @param headers - Optional headers
	 * @returns Promise<NetworkResponse>
	 */
	post<T = unknown>(
		url: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<NetworkResponse<T>>;

	/**
	 * Check network connectivity
	 *
	 * @returns Promise<boolean> - true if online, false if offline
	 */
	isOnline(): Promise<boolean>;
}

/**
 * Network error class
 */
export class NetworkError extends Error {
	constructor(
		message: string,
		public readonly status?: number,
		public readonly statusText?: string,
		public readonly url?: string,
	) {
		super(message);
		this.name = "NetworkError";
	}
}

/**
 * Timeout error class
 */
export class TimeoutError extends NetworkError {
	constructor(url: string, timeout: number) {
		super(
			`Request timeout after ${timeout}ms: ${url}`,
			408,
			"Request Timeout",
			url,
		);
		this.name = "TimeoutError";
	}
}

/**
 * Offline error class
 */
export class OfflineError extends NetworkError {
	constructor(url: string) {
		super(`Network offline: ${url}`, 0, "Network Offline", url);
		this.name = "OfflineError";
	}
}
