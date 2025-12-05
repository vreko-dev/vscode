/**
 * @fileoverview Production Network Adapter using fetch()
 *
 * This is the production implementation of NetworkAdapter that uses
 * the native fetch() API for making HTTP requests.
 */

import type {
	NetworkAdapter,
	NetworkRequest,
	NetworkResponse,
} from "./NetworkAdapter.js";
import { NetworkError, OfflineError, TimeoutError } from "./NetworkAdapter.js";

/**
 * Production network adapter using fetch()
 *
 * @example
 * ```typescript
 * const adapter = new FetchNetworkAdapter();
 * const response = await adapter.get('https://api.snapback.dev/health');
 * if (response.ok) {
 *   console.log('API is healthy');
 * }
 * ```
 */
export class FetchNetworkAdapter implements NetworkAdapter {
	/**
	 * Execute a network request
	 *
	 * @param request - Request configuration
	 * @returns Promise<NetworkResponse>
	 * @throws NetworkError if request fails
	 */
	async request<T = unknown>(
		request: NetworkRequest,
	): Promise<NetworkResponse<T>> {
		const {
			url,
			method = "GET",
			headers = {},
			body,
			timeout = 30000,
		} = request;

		// Check if offline
		if (!(await this.isOnline())) {
			throw new OfflineError(url);
		}

		// Create AbortController for timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeout);

		try {
			// Prepare fetch options
			const fetchOptions: RequestInit = {
				method,
				headers: {
					"Content-Type": "application/json",
					...headers,
				},
				signal: controller.signal,
			};

			// Add body if present (stringify if object)
			if (body !== undefined) {
				fetchOptions.body =
					typeof body === "string" ? body : JSON.stringify(body);
			}

			// Execute fetch
			const response = await fetch(url, fetchOptions);

			// Clear timeout
			clearTimeout(timeoutId);

			// Get response text
			const text = await response.text();

			// Parse JSON if content-type is application/json
			let data: T;
			const contentType = response.headers.get("content-type");
			if (contentType?.includes("application/json")) {
				try {
					data = JSON.parse(text) as T;
				} catch {
					// If JSON parse fails, use text as data
					data = text as T;
				}
			} else {
				data = text as T;
			}

			// Convert headers to plain object
			const responseHeaders: Record<string, string> = {};
			response.headers.forEach((value, key) => {
				responseHeaders[key] = value;
			});

			// Return normalized response
			return {
				status: response.status,
				statusText: response.statusText,
				headers: responseHeaders,
				data,
				text,
				ok: response.ok,
			};
		} catch (error) {
			clearTimeout(timeoutId);

			// Handle abort (timeout)
			if (error instanceof Error && error.name === "AbortError") {
				throw new TimeoutError(url, timeout);
			}

			// Handle network errors
			if (error instanceof TypeError && error.message.includes("fetch")) {
				throw new OfflineError(url);
			}

			// Re-throw as NetworkError
			if (error instanceof NetworkError) {
				throw error;
			}

			throw new NetworkError(
				`Network request failed: ${error instanceof Error ? error.message : String(error)}`,
				undefined,
				undefined,
				url,
			);
		}
	}

	/**
	 * Execute a GET request
	 *
	 * @param url - Request URL
	 * @param headers - Optional headers
	 * @returns Promise<NetworkResponse>
	 */
	async get<T = unknown>(
		url: string,
		headers?: Record<string, string>,
	): Promise<NetworkResponse<T>> {
		return this.request<T>({ url, method: "GET", headers });
	}

	/**
	 * Execute a POST request
	 *
	 * @param url - Request URL
	 * @param body - Request body
	 * @param headers - Optional headers
	 * @returns Promise<NetworkResponse>
	 */
	async post<T = unknown>(
		url: string,
		body: unknown,
		headers?: Record<string, string>,
	): Promise<NetworkResponse<T>> {
		return this.request<T>({ url, method: "POST", body, headers });
	}

	/**
	 * Check network connectivity
	 *
	 * Attempts a lightweight request to a known endpoint to check connectivity.
	 *
	 * @returns Promise<boolean>
	 */
	async isOnline(): Promise<boolean> {
		try {
			// Try to fetch a lightweight resource
			// Using a HEAD request to minimize data transfer
			const response = await fetch("https://api.snapback.dev/health", {
				method: "HEAD",
				// Use a short timeout for connectivity check
				signal: AbortSignal.timeout(3000),
			});
			return response.ok;
		} catch {
			// If fetch fails, assume offline
			return false;
		}
	}
}
