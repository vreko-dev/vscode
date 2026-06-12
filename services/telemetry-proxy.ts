import * as vscode from "vscode";
import { OfflineEventQueue } from "../telemetry/OfflineEventQueue";
import { toError } from "../utils/errorHelpers";
import { logger } from "../utils/logger";

// ============================================================================
// Event Priority Classes (P0/P1/P2)
// ============================================================================

/**
 * P0: Never sample, never drop - critical business events
 */
const P0_EVENTS = new Set([
	"snapshot_created",
	"session_restored",
	"issue_created",
	"issue_resolved",
	"policy_changed",
	"extension_activated",
	"extension_deactivated",
]);

/**
 * P1: Sample lightly, delay ok - important but high-volume
 */
const P1_EVENTS = new Set([
	"save_attempt",
	"feature_used",
	"command_executed",
	"snapshot.created",
	"walkthrough.step.completed",
]);

/**
 * P2: Sample hard, drop ok - low-signal diagnostics
 */
const P2_EVENTS = new Set(["heartbeat", "debug_event", "diagnostic_ping"]);

type EventPriority = "P0" | "P1" | "P2";

/**
 * Get event priority class
 */
function getEventPriority(event: string): EventPriority {
	if (P0_EVENTS.has(event)) {
		return "P0";
	}
	if (P1_EVENTS.has(event)) {
		return "P1";
	}
	if (P2_EVENTS.has(event)) {
		return "P2";
	}
	return "P1"; // Default to P1 for unknown events
}

// ============================================================================
// Batch Configuration
// ============================================================================

interface BatchConfig {
	/** Normal batch size */
	normalBatchSize: number;
	/** Batch size during AI burst (increased) */
	aiBurstBatchSize: number;
	/** Flush interval in ms */
	flushIntervalMs: number;
	/** Minimum events before auto-flush */
	minEventsForFlush: number;
}

const DEFAULT_BATCH_CONFIG: BatchConfig = {
	normalBatchSize: 25,
	aiBurstBatchSize: 50,
	flushIntervalMs: 10000, // 10 seconds
	minEventsForFlush: 25,
};

// ============================================================================
// Event Coalescing
// ============================================================================

interface CoalescedEvent {
	event: string;
	count: number;
	firstTimestamp: number;
	lastTimestamp: number;
	properties: Record<string, unknown>;
}

/**
 * Coalesce multiple save_attempt events into aggregate events
 */
function coalesceSaveAttempts(
	events: Array<{ event: string; properties: Record<string, unknown>; timestamp: number }>,
): Array<{ event: string; properties: Record<string, unknown>; timestamp: number }> {
	const saveAttempts = events.filter((e) => e.event === "save_attempt");
	const otherEvents = events.filter((e) => e.event !== "save_attempt");

	if (saveAttempts.length <= 1) {
		return events; // No coalescing needed
	}

	// Create aggregate event
	const aggregate: CoalescedEvent = {
		event: "save_attempt_batch",
		count: saveAttempts.length,
		firstTimestamp: Math.min(...saveAttempts.map((e) => e.timestamp)),
		lastTimestamp: Math.max(...saveAttempts.map((e) => e.timestamp)),
		properties: {
			// Merge severity info
			highSeverity: saveAttempts.some((e) => (e.properties as Record<string, unknown>)?.severity === "high"),
			mediumSeverity: saveAttempts.some((e) => (e.properties as Record<string, unknown>)?.severity === "medium"),
			aiPresent: saveAttempts.some((e) => (e.properties as Record<string, unknown>)?.aiPresent === true),
			aiBurst: saveAttempts.some((e) => (e.properties as Record<string, unknown>)?.aiBurst === true),
		},
	};

	return [
		...otherEvents,
		{
			event: aggregate.event,
			properties: { ...aggregate.properties, count: aggregate.count },
			timestamp: aggregate.lastTimestamp,
		},
	];
}

// ============================================================================
// Telemetry Proxy Service
// ============================================================================

/**
 * Telemetry Proxy Service
 *
 * Sends telemetry events through the Vreko API proxy instead of directly to PostHog
 * Features:
 * - Automatic offline detection and queuing
 * - Exponential backoff retry with OfflineEventQueue
 * - Network resilience and background processing
 * - Adaptive batching (N=25 normal, N=50 during AI burst)
 * - Event coalescing for high-volume events
 * - Per-event class budgets (P0/P1/P2)
 */

export class TelemetryProxy {
	private apiBaseUrl: string;
	private offlineQueue: OfflineEventQueue;
	private isProcessingQueue = false;
	private retryTimer: NodeJS.Timeout | undefined;
	private flushTimer: NodeJS.Timeout | undefined;
	private identityProvider: (() => Promise<string>) | null = null;

	// Batch buffer
	private batchBuffer: Array<{
		event: string;
		properties: Record<string, unknown>;
		timestamp: number;
	}> = [];

	// AI burst detection
	private saveCount = 0;
	private lastSaveReset = Date.now();
	private isAiBurst = false;
	private static readonly BURST_THRESHOLD = 10; // saves in 2 seconds
	private static readonly BURST_WINDOW_MS = 2000;

	private readonly batchConfig: BatchConfig;

	public setIdentityProvider(provider: () => Promise<string>) {
		this.identityProvider = provider;
	}

	constructor(context: vscode.ExtensionContext, batchConfig: Partial<BatchConfig> = {}) {
		// Use the API base URL from configuration or default to production
		this.apiBaseUrl = vscode.workspace.getConfiguration("vreko").get<string>("apiBaseUrl", "https://api.vreko.dev");

		this.batchConfig = { ...DEFAULT_BATCH_CONFIG, ...batchConfig };

		// Initialize offline queue for network resilience
		this.offlineQueue = new OfflineEventQueue(context);

		// Setup network monitoring for offline queue processing
		this.setupNetworkMonitoring();

		// Start background queue processing
		this.startQueueProcessor();

		// Start batch flush timer
		this.startFlushTimer();
	}

	/**
	 * Start the batch flush timer
	 */
	private startFlushTimer(): void {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
		}

		this.flushTimer = setInterval(() => {
			this.flushBatch().catch((err) => {
				logger.error("Failed to flush telemetry batch", toError(err));
			});
		}, this.batchConfig.flushIntervalMs);
	}

	/**
	 * Detect AI burst based on save frequency
	 */
	private detectAiBurst(): void {
		const now = Date.now();

		// Reset counter if outside burst window
		if (now - this.lastSaveReset > TelemetryProxy.BURST_WINDOW_MS) {
			this.saveCount = 0;
			this.lastSaveReset = now;
		}

		this.saveCount++;

		// Detect burst
		this.isAiBurst = this.saveCount >= TelemetryProxy.BURST_THRESHOLD;
	}

	/**
	 * Should sample this event based on priority and burst state?
	 */
	private shouldSample(event: string, properties: Record<string, unknown>): boolean {
		const priority = getEventPriority(event);

		// P0 events are never sampled
		if (priority === "P0") {
			return true;
		}

		// During AI burst, sample P1 events more aggressively
		if (this.isAiBurst && priority === "P1") {
			// Only emit save_attempt if severity >= medium
			if (event === "save_attempt") {
				const severity = properties.severity as string | undefined;
				return severity === "high" || severity === "medium";
			}
		}

		// P2 events are always sampled at 10% rate
		if (priority === "P2") {
			return Math.random() < 0.1;
		}

		return true;
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
			// Detect AI burst on save_attempt
			if (event === "save_attempt") {
				this.detectAiBurst();
				properties.aiBurst = this.isAiBurst;
			}

			// Apply sampling
			if (!this.shouldSample(event, properties)) {
				logger.debug(`Event sampled out: ${event}`);
				return;
			}

			// Resolve User ID if not provided
			let effectiveUserId = options.userId;
			if (!effectiveUserId && this.identityProvider) {
				try {
					effectiveUserId = await this.identityProvider();
				} catch (_err) {
					// Fallback
				}
			}

			// Prepare enriched event data
			const eventData = this.enrichEventData(event, properties, {
				...options,
				userId: effectiveUserId,
			});

			// Add to batch buffer
			this.batchBuffer.push({
				event,
				properties: eventData,
				timestamp: Date.now(),
			});

			// Auto-flush if buffer is full
			const batchSize = this.isAiBurst ? this.batchConfig.aiBurstBatchSize : this.batchConfig.normalBatchSize;

			if (this.batchBuffer.length >= batchSize) {
				await this.flushBatch();
			}
		} catch (error) {
			// Queue on error
			const eventData = this.enrichEventData(event, properties, options);
			this.offlineQueue.enqueue(event, eventData);
			logger.debug(`Event queued due to error: ${event}`, toError(error).message);
		}
	}

	/**
	 * Flush the batch buffer to the API
	 */
	async flushBatch(): Promise<void> {
		if (this.batchBuffer.length === 0) {
			return;
		}

		// Take all events from buffer
		const eventsToSend = [...this.batchBuffer];
		this.batchBuffer = [];

		// Coalesce save_attempt events if multiple
		const coalescedEvents = coalesceSaveAttempts(eventsToSend);

		// Prepare batch payload
		const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
		const payload = {
			events: coalescedEvents.map((e) => ({
				event: e.event,
				properties: e.properties,
				timestamp: e.timestamp,
			})),
			batchId,
			sentAt: Date.now(),
		};

		try {
			const success = await this.sendBatch(payload);

			if (!success) {
				// Queue each event individually for retry
				for (const event of eventsToSend) {
					this.offlineQueue.enqueue(event.event, event.properties);
				}
				logger.debug(`Batch queued for retry: ${eventsToSend.length} events`);
			} else {
				logger.debug(`Batch sent: ${eventsToSend.length} events`);
			}
		} catch (error) {
			// Queue all events on error
			for (const event of eventsToSend) {
				this.offlineQueue.enqueue(event.event, event.properties);
			}
			logger.error("Failed to send batch", toError(error));
		}
	}

	/**
	 * Send batch to telemetry endpoint
	 */
	private async sendBatch(payload: {
		events: Array<{ event: string; properties: Record<string, unknown>; timestamp: number }>;
		batchId: string;
		sentAt: number;
	}): Promise<boolean> {
		try {
			const response = await fetch(`${this.apiBaseUrl}/api/rpc/telemetry.ingest`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});

			if (!response.ok) {
				logger.debug(`Telemetry batch endpoint unavailable (${response.status})`);
				return false;
			}

			const result = (await response.json()) as { success: boolean; message?: string };
			return result.success;
		} catch (error) {
			logger.debug(`Telemetry batch send failed: ${(error as Error).message}`);
			return false;
		}
	}

	/**
	 * Setup network event monitoring
	 *
	 * Establishes listeners for 'online' and 'offline' events on the global scope.
	 * When network is restored, immediately triggers queue processing to send any
	 * queued events. Uses globalThis for cross-environment compatibility (browser,
	 * Node.js, VS Code extension).
	 *
	 * Error handling:
	 * - Uses canonical toError() from @vreko-oss/sdk for error normalization
	 * - Uses canonical logger from @vreko/infrastructure for structured logging
	 * - Failed queue processing is caught and logged, not re-thrown
	 *
	 * @see toError - For cross-environment error handling
	 * @see logger - For canonical structured logging
	 * @see processQueue - Processes offline queue with exponential backoff
	 */
	private setupNetworkMonitoring(): void {
		// Setup event listeners on the global scope
		// Uses globalThis for compatibility across browser/Node.js/extension contexts
		const globalWindow = globalThis as unknown as Record<string, unknown>;

		if (typeof globalWindow.addEventListener === "function") {
			const addListener = globalWindow.addEventListener as (event: string, handler: () => void) => void;
			addListener("online", () => {
				logger.info("Network restored, processing offline queue");
				this.processQueue().catch((err: unknown) => {
					logger.error("Failed to process offline queue on network restoration", toError(err));
				});
			});

			addListener("offline", () => {
				logger.info("Network disconnected, switching to offline mode");
			});
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
		const extension = vscode.extensions.getExtension("MarcelleLabs.vreko-vscode");
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
			userId: options.userId, // Provider logic moved to trackEvent for async support
			orgId: options.orgId,
			version: extensionVersion,
		};
	}

	/**
	 * Send event to telemetry endpoint
	 * Returns true if successful, false otherwise
	 */
	private async sendEvent(eventData: Record<string, unknown>): Promise<boolean> {
		const result = await this.sendEventWithRetry(eventData);

		if (!result.success) {
			logger.debug(`Telemetry event queued: ${result.message || "Service unavailable"}`, result.error);
			return false;
		}

		logger.debug(`Telemetry event sent: ${eventData.event}`);
		return true;
	}

	private async sendEventWithRetry(
		eventData: Record<string, unknown>,
	): Promise<{ success: boolean; message?: string; error?: Error }> {
		try {
			const response = await fetch(`${this.apiBaseUrl}/api/rpc/telemetry.proxyEvent`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(eventData),
			});

			if (!response.ok) {
				logger.debug(
					`Telemetry endpoint unavailable (${response.status}): ${response.statusText} - Telemetry will be queued`,
				);
				return { success: false, message: response.statusText };
			}

			const result: { success: boolean; message?: string } = (await response.json()) as {
				success: boolean;
				message?: string;
			};
			if (!result.success) {
				logger.debug(`Telemetry event queued: ${result.message || "Service unavailable"}`);
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
				logger.debug(`Telemetry event queued: ${result.message || "Service unavailable"}`, error as Error);
			}

			return Promise.resolve(result);
		}
	}

	/**
	 * Identify a user
	 * Links the authenticated ID with any previous anonymous ID
	 */
	async identify(distinctId: string, anonymousId?: string, properties: Record<string, unknown> = {}): Promise<void> {
		const payload = {
			distinctId,
			anonymousId,
			properties,
		};

		try {
			await fetch(`${this.apiBaseUrl}/api/rpc/telemetry.identify`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify(payload),
			});
			logger.debug(`User identified: ${distinctId} (alias: ${anonymousId})`);
		} catch (error) {
			logger.warn("Failed to identify user", error as Error);
		}
	}

	/**
	 * Track extension activation
	 */
	async trackActivation(): Promise<void> {
		const extension = vscode.extensions.getExtension("MarcelleLabs.vreko-vscode");
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
					// Use debug level since this is expected when offline/network unavailable
					logger.debug(`Dropping event after max retries: ${queuedEvent.event}`);
					this.offlineQueue.dequeue();
					processedCount++;
					continue;
				}

				// Attempt to send
				const success = await this.sendEvent(queuedEvent.properties as Record<string, unknown>);

				if (success) {
					// Remove from queue on success
					this.offlineQueue.dequeue();
					logger.debug(`Queued event sent: ${queuedEvent.event}`);
					processedCount++;
				} else {
					// Increment retry count and wait
					this.offlineQueue.incrementRetryCount(queuedEvent.id);
					const retryDelay = this.offlineQueue.getRetryDelay(queuedEvent.retryCount + 1);
					logger.debug(`Event retry scheduled in ${retryDelay}ms: ${queuedEvent.event}`);

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
	 * Flushes remaining batch before disposing
	 */
	async dispose(): Promise<void> {
		// Flush any remaining events in batch buffer
		if (this.batchBuffer.length > 0) {
			try {
				await this.flushBatch();
			} catch (error) {
				logger.error("Failed to flush batch on dispose", toError(error));
			}
		}

		if (this.retryTimer) {
			clearTimeout(this.retryTimer);
			this.retryTimer = undefined;
		}

		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = undefined;
		}
	}
}
