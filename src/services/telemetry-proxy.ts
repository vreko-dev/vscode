import * as vscode from "vscode";
import { OfflineEventQueue } from "../telemetry/OfflineEventQueue";
import { toError } from "../utils/errorHelpers";
import { logger } from "../utils/logger";

/**
 * Telemetry Proxy Service
 *
 * Sends telemetry events through the SnapBack API proxy instead of directly to PostHog
 * Features:
 * - Automatic offline detection and queuing
 * - Exponential backoff retry with OfflineEventQueue
 * - Network resilience and background processing
 */

export class TelemetryProxy {
	private apiBaseUrl: string;
	private offlineQueue: OfflineEventQueue;
	private isProcessingQueue = false;
	private retryTimer: NodeJS.Timeout | undefined;

	constructor(context: vscode.ExtensionContext) {
		// Use the API base URL from configuration or default to production
		this.apiBaseUrl = vscode.workspace
			.getConfiguration("snapback")
			.get<string>("apiBaseUrl", "https://api.snapback.dev");

		// Initialize offline queue for network resilience
		this.offlineQueue = new OfflineEventQueue(context);

		// Start background queue processing
		this.startQueueProcessor();
	}

	/**
	 * Send a telemetry event through the proxy
	 * Automatically queues events when offline
	 */
	async trackEvent(
		event: string,
		properties: Record<string, unknown> = {},
		options: { userId?: string; orgId?: string } = {},
	): Promise<void> {
		try {
			// Prepare enriched event data
			const eventData = this.enrichEventData(event, properties, options);

			// Attempt to send immediately
			const success = await this.sendEvent(eventData);

			if (!success) {
				// Queue for later retry if send failed
				this.offlineQueue.enqueue(event, eventData);
				logger.debug(`Event queued for retry: ${event}`);
			}
		} catch (error) {
			// Queue on error
			const eventData = this.enrichEventData(event, properties, options);
			this.offlineQueue.enqueue(event, eventData);
			logger.debug(
				`Event queued due to error: ${event}`,
				toError(error).message,
			);
		}
	}

	/**
	 * Enrich event data with context
	 */
	private enrichEventData(
		event: string,
		properties: Record<string, unknown>,
		options: { userId?: string; orgId?: string },
	): Record<string, unknown> {
		const extension = vscode.extensions.getExtension("snapback.snapback");
		const extensionVersion = extension?.packageJSON.version || "unknown";
		const vscodeVersion = vscode.version;

		return {
			event,
			properties: {
				...properties,
				clientVersion: extensionVersion,
				ideVersion: vscodeVersion,
				platform: process.platform,
			},
			userId: options.userId,
			orgId: options.orgId,
			version: extensionVersion,
		};
	}

	/**
	 * Send event to telemetry endpoint
	 * Returns true if successful, false otherwise
	 */
	private async sendEvent(
		eventData: Record<string, unknown>,
	): Promise<boolean> {
		const result = await this.sendEventWithRetry(eventData);

		if (!result.success) {
			logger.warn(
				`Telemetry failed: ${result.message || "Unknown error"}`,
				result.error,
			);
			return false;
		}

		logger.debug(`Telemetry event sent: ${eventData.event}`);
		return true;
	}

	private async sendEventWithRetry(
		eventData: Record<string, unknown>,
	): Promise<{ success: boolean; message?: string; error?: Error }> {
		try {
			const response = await fetch(
				`${this.apiBaseUrl}/api/rpc/telemetry.proxyEvent`,
				{
					method: "POST",
					headers: {
						"Content-Type": "application/json",
					},
					body: JSON.stringify(eventData),
				},
			);

			if (!response.ok) {
				logger.warn(
					`Telemetry HTTP ${response.status}: ${response.statusText}`,
				);
				return { success: false, message: response.statusText };
			}

			const result: { success: boolean; message?: string } =
				(await response.json()) as { success: boolean; message?: string };
			if (!result.success) {
				logger.warn(`Telemetry failed: ${result.message || "Unknown error"}`);
				return result;
			}

			return result;
		} catch (error) {
			const result: {
				success: boolean;
				message?: string;
				error?: Error;
			} = {
				success: false,
				message: (error as Error).message || "Unknown error",
				error: error as Error,
			};

			if (!result.success) {
				logger.warn(
					`Telemetry failed: ${result.message || "Unknown error"}`,
					error as Error,
				);
			}

			return Promise.resolve(result);
		}
	}

	/**
	 * Identify a user
	 */
	async identify(
		userId: string,
		traits: Record<string, unknown> = {},
	): Promise<void> {
		await this.trackEvent("user_identified", traits, { userId });
	}

	/**
	 * Track extension activation
	 */
	async trackActivation(): Promise<void> {
		const extension = vscode.extensions.getExtension("snapback.snapback");
		const extensionVersion = extension?.packageJSON.version || "unknown";

		await this.trackEvent("extension_activated", {
			extensionVersion,
			vscodeVersion: vscode.version,
			platform: process.platform,
		});
	}

	/**
	 * Track command execution
	 */
	async trackCommand(command: string): Promise<void> {
		await this.trackEvent("command_executed", {
			command,
		});
	}

	/**
	 * Track error
	 */
	async trackError(
		error: Error,
		context?: Record<string, unknown>,
	): Promise<{
		success: boolean;
		message?: string;
		error?: Error;
	}> {
		try {
			await this.trackEvent("error_occurred", {
				errorName: error.name,
				errorMessage: error.message,
				...context,
				stack: error.stack,
			});

			return Promise.resolve({
				success: true,
			});
		} catch (err) {
			const result: {
				success: boolean;
				message?: string;
				error?: Error;
			} = {
				success: false,
				message: (err as Error).message || "Unknown error",
				error: err as Error,
			};

			return Promise.resolve(result);
		}
	}

	/**
	 * Start background queue processor
	 * Processes queued events with exponential backoff
	 */
	private startQueueProcessor(): void {
		// Process queue every 30 seconds
		this.scheduleNextProcessing(30000);
	}

	/**
	 * Schedule next queue processing attempt
	 */
	private scheduleNextProcessing(delay: number): void {
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
		}

		this.retryTimer = setTimeout(() => {
			this.processQueue();
		}, delay);
	}

	/**
	 * Process queued events
	 */
	private async processQueue(): Promise<void> {
		// Prevent concurrent processing
		if (this.isProcessingQueue || this.offlineQueue.isEmpty()) {
			// Schedule next check
			this.scheduleNextProcessing(30000);
			return;
		}

		this.isProcessingQueue = true;

		try {
			// Process events one at a time
			let processedCount = 0;
			const maxBatchSize = 5; // Limit batch size to avoid blocking

			while (!this.offlineQueue.isEmpty() && processedCount < maxBatchSize) {
				const queuedEvent = this.offlineQueue.peek();
				if (!queuedEvent) {
					break;
				}

				// Check if we should retry this event
				if (!this.offlineQueue.shouldRetry(queuedEvent)) {
					logger.warn(`Dropping event after max retries: ${queuedEvent.event}`);
					this.offlineQueue.dequeue();
					processedCount++;
					continue;
				}

				// Attempt to send
				const success = await this.sendEvent(
					queuedEvent.properties as Record<string, unknown>,
				);

				if (success) {
					// Remove from queue on success
					this.offlineQueue.dequeue();
					logger.debug(`Queued event sent: ${queuedEvent.event}`);
					processedCount++;
				} else {
					// Increment retry count and wait
					this.offlineQueue.incrementRetryCount(queuedEvent.id);
					const retryDelay = this.offlineQueue.getRetryDelay(
						queuedEvent.retryCount + 1,
					);
					logger.debug(
						`Event retry scheduled in ${retryDelay}ms: ${queuedEvent.event}`,
					);

					// Schedule retry with exponential backoff
					this.scheduleNextProcessing(retryDelay);
					break; // Stop processing, wait for retry
				}
			}

			// If we processed events successfully, continue processing soon
			if (processedCount > 0 && !this.offlineQueue.isEmpty()) {
				this.scheduleNextProcessing(1000); // Quick retry for remaining events
			} else {
				this.scheduleNextProcessing(30000); // Regular polling interval
			}
		} finally {
			this.isProcessingQueue = false;
		}
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = undefined;
		}
	}
}
