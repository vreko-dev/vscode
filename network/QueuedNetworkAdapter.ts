/**
 * @fileoverview Network Adapter with Offline Request Queuing using p-queue
 *
 * This network adapter extends the functionality of the base network adapter
 * by adding offline request queuing capabilities using p-queue.
 */

import PQueue from "p-queue";
import { logger } from "../utils/logger";
import { FetchNetworkAdapter } from "./FetchNetworkAdapter";
import type { NetworkAdapter, NetworkRequest, NetworkResponse } from "./NetworkAdapter";
import { NetworkError, TimeoutError } from "./NetworkAdapter";

/**
 * Maximum queue size to prevent memory exhaustion
 */
const MAX_QUEUE_SIZE = 1000;

/**
 * Network adapter with offline request queuing
 *
 * This adapter queues requests when offline and processes them when connectivity is restored.
 * It uses p-queue for managing the request queue with concurrency control.
 */
export class QueuedNetworkAdapter implements NetworkAdapter {
	protected fetchAdapter: FetchNetworkAdapter;
	private isOnlineCached = true;
	private onlineCheckPromise: Promise<boolean> | null = null;
	private queue: PQueue;
	private monitorIntervalHandle: ReturnType<typeof setInterval> | undefined;

	constructor(options?: { concurrency?: number; maxQueueSize?: number }) {
		this.fetchAdapter = new FetchNetworkAdapter();

		// Initialize p-queue with concurrency control
		this.queue = new PQueue({
			concurrency: options?.concurrency ?? 1,
			autoStart: true,
		});

		// Start monitoring online status
		this.monitorOnlineStatus();
	}

	/**
	 * Monitor online status and pause/resume queue accordingly
	 */
	private async monitorOnlineStatus(): Promise<void> {
		// Check online status periodically
		this.monitorIntervalHandle = setInterval(async () => {
			const isOnline = await this.isOnline();
			if (isOnline && !this.isOnlineCached) {
				// We're back online, resume the queue
				this.isOnlineCached = true;
				logger.info("Network is back online, resuming queue", {
					queueSize: this.queue.size,
					pendingCount: this.queue.pending,
				});
				this.queue.start();
			} else if (!isOnline && this.isOnlineCached) {
				// We went offline, pause the queue
				this.isOnlineCached = false;
				logger.info("Network is offline, pausing queue", {
					queueSize: this.queue.size,
					pendingCount: this.queue.pending,
				});
				this.queue.pause();
			}
		}, 5000); // Check every 5 seconds
	}

	/**
	 * Pause the queue (for daemon disconnection scenarios)
	 */
	public pause(): void {
		logger.info("Pausing network queue", {
			queueSize: this.queue.size,
			pendingCount: this.queue.pending,
		});
		this.queue.pause();
	}

	/**
	 * Resume the queue (for daemon reconnection scenarios)
	 */
	public resume(): void {
		logger.info("Resuming network queue", {
			queueSize: this.queue.size,
			pendingCount: this.queue.pending,
		});
		this.queue.start();
	}

	/**
	 * Execute a network request with queuing when offline
	 *
	 * @param request - Request configuration
	 * @returns Promise<NetworkResponse>
	 * @throws NetworkError if request fails
	 */
	async request<T = unknown>(request: NetworkRequest): Promise<NetworkResponse<T>> {
		// If we're online, execute the request immediately
		if (await this.isOnline()) {
			try {
				return await this.fetchAdapter.request<T>(request);
			} catch (error) {
				// If it's a network error that might be temporary, queue it
				if (error instanceof NetworkError && !(error instanceof TimeoutError)) {
					logger.warn(`Network error for ${request.url}, queuing request`, error);
					return this.queueRequest<T>(request);
				}
				throw error;
			}
		}

		// We're offline, queue the request
		return this.queueRequest<T>(request);
	}

	/**
	 * Queue a request for later execution
	 *
	 * @param request - Request configuration
	 * @returns Promise<NetworkResponse>
	 * @throws NetworkError if queue is full
	 */
	private queueRequest<T = unknown>(request: NetworkRequest): Promise<NetworkResponse<T>> {
		// Check queue size to prevent memory exhaustion
		if (this.queue.size >= MAX_QUEUE_SIZE) {
			logger.warn("Network queue is full, rejecting request", {
				queueSize: this.queue.size,
				url: request.url,
			});
			return Promise.reject(new NetworkError(`Queue capacity exceeded (${MAX_QUEUE_SIZE}). Try again later.`));
		}

		// Use async/await pattern to avoid double rejection
		return this.queue.add(async () => {
			return this.fetchAdapter.request<T>(request);
		}) as Promise<NetworkResponse<T>>;
	}

	/**
	 * Execute a GET request (convenience method)
	 *
	 * @param url - Request URL
	 * @param headers - Optional headers
	 * @returns Promise<NetworkResponse>
	 */
	async get<T = unknown>(url: string, headers?: Record<string, string>): Promise<NetworkResponse<T>> {
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
	async post<T = unknown>(url: string, body: unknown, headers?: Record<string, string>): Promise<NetworkResponse<T>> {
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
	 * @returns number of pending requests in the queue
	 */
	getQueueSize(): number {
		return this.queue.size;
	}

	/**
	 * Get the number of pending requests
	 *
	 * @returns number of currently executing requests
	 */
	getPendingCount(): number {
		return this.queue.pending;
	}

	/**
	 * Clear all queued requests
	 */
	clearQueue(): void {
		this.queue.clear();
	}

	/**
	 * Check if the queue is paused
	 */
	isPaused(): boolean {
		return this.queue.isPaused;
	}

	/**
	 * Dispose resources and stop monitoring
	 */
	dispose(): void {
		if (this.monitorIntervalHandle) {
			clearInterval(this.monitorIntervalHandle);
			this.monitorIntervalHandle = undefined;
		}
		this.queue.clear();
	}
}
