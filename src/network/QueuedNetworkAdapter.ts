/**
 * @fileoverview Network Adapter with Offline Request Queuing using p-queue
 *
 * This network adapter extends the functionality of the base network adapter
 * by adding offline request queuing capabilities using p-queue.
 */

import { logger } from "../utils/logger.js";
import { FetchNetworkAdapter } from "./FetchNetworkAdapter.js";
// import PQueue from "p-queue"; // Not currently used but kept for future implementation
import type {
	NetworkAdapter,
	NetworkRequest,
	NetworkResponse,
} from "./NetworkAdapter.js";
import { NetworkError, TimeoutError } from "./NetworkAdapter.js";

/**
 * Network adapter with offline request queuing
 *
 * This adapter queues requests when offline and processes them when connectivity is restored.
 * It uses p-queue for managing the request queue with concurrency control.
 */
export class QueuedNetworkAdapter implements NetworkAdapter {
	protected fetchAdapter: FetchNetworkAdapter;
	// private requestQueue: PQueue; // Not currently used but kept for future implementation
	private isOnlineCached: boolean = true;
	private onlineCheckPromise: Promise<boolean> | null = null;
	private offlineQueue: Array<() => Promise<unknown>> = [];
	private isProcessingOfflineQueue: boolean = false;

	constructor(_options?: { concurrency?: number }) {
		this.fetchAdapter = new FetchNetworkAdapter();
		// Create a queue with specified concurrency (default: 1)
		// this.requestQueue = new PQueue({ concurrency: options?.concurrency || 1 }); // Not currently used but kept for future implementation

		// Start monitoring online status
		this.monitorOnlineStatus();
	}

	/**
	 * Monitor online status and process queued requests when online
	 */
	private async monitorOnlineStatus(): Promise<void> {
		// Check online status periodically
		setInterval(async () => {
			const isOnline = await this.isOnline();
			if (isOnline && !this.isOnlineCached) {
				// We're back online, process queued requests
				this.isOnlineCached = true;
				logger.info("Network is back online, processing queued requests");
				this.processOfflineQueue();
			} else if (!isOnline && this.isOnlineCached) {
				// We went offline
				this.isOnlineCached = false;
				logger.info("Network is offline, queuing requests");
			}
		}, 5000); // Check every 5 seconds
	}

	/**
	 * Process the offline queue when we come back online
	 */
	private async processOfflineQueue(): Promise<void> {
		if (this.isProcessingOfflineQueue || this.offlineQueue.length === 0) {
			return;
		}

		this.isProcessingOfflineQueue = true;

		try {
			// Process all queued requests
			while (this.offlineQueue.length > 0) {
				const requestFn = this.offlineQueue.shift();
				if (requestFn) {
					try {
						await requestFn();
					} catch (error) {
						logger.error("Failed to process queued request", error as Error);
					}
				}
			}
		} finally {
			this.isProcessingOfflineQueue = false;
		}
	}

	/**
	 * Execute a network request with queuing when offline
	 *
	 * @param request - Request configuration
	 * @returns Promise<NetworkResponse>
	 * @throws NetworkError if request fails
	 */
	async request<T = unknown>(
		request: NetworkRequest,
	): Promise<NetworkResponse<T>> {
		// If we're online, execute the request immediately
		if (await this.isOnline()) {
			try {
				return await this.fetchAdapter.request<T>(request);
			} catch (error) {
				// If it's a network error that might be temporary, queue it
				if (error instanceof NetworkError && !(error instanceof TimeoutError)) {
					logger.warn(
						`Network error for ${request.url}, queuing request`,
						error,
					);
					return this.queueOfflineRequest<T>(request);
				}
				throw error;
			}
		}

		// We're offline, queue the request
		return this.queueOfflineRequest<T>(request);
	}

	/**
	 * Queue a request for later execution when offline
	 *
	 * @param request - Request configuration
	 * @returns Promise<NetworkResponse>
	 */
	private queueOfflineRequest<T = unknown>(
		request: NetworkRequest,
	): Promise<NetworkResponse<T>> {
		return new Promise((resolve, reject) => {
			// Add the request to our offline queue
			this.offlineQueue.push(async () => {
				try {
					const result = await this.fetchAdapter.request<T>(request);
					resolve(result);
				} catch (error) {
					reject(error);
				}
			});
		});
	}

	/**
	 * Execute a GET request (convenience method)
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
	 * Execute a POST request (convenience method)
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
	 * @returns Promise<boolean> - true if online, false if offline
	 */
	async isOnline(): Promise<boolean> {
		// If we have a pending online check, return that promise
		if (this.onlineCheckPromise) {
			return this.onlineCheckPromise;
		}

		// Create a new online check promise
		this.onlineCheckPromise = this.fetchAdapter.isOnline();

		// Cache the result and clear the promise
		const result = await this.onlineCheckPromise;
		this.onlineCheckPromise = null;
		this.isOnlineCached = result;

		return result;
	}

	/**
	 * Get the current queue size
	 *
	 * @returns number of pending requests in the offline queue
	 */
	getQueueSize(): number {
		return this.offlineQueue.length;
	}

	/**
	 * Get the number of pending requests
	 *
	 * @returns number of currently executing requests
	 */
	getPendingCount(): number {
		return this.isProcessingOfflineQueue ? 1 : 0;
	}

	/**
	 * Clear all queued requests
	 */
	clearQueue(): void {
		this.offlineQueue = [];
	}
}
