/**
 * Local TelemetryClient for VS Code Extension
 *
 * Lightweight replacement for @snapback/infrastructure's TelemetryClient
 * to reduce bundle size. Uses simple HTTP transport to telemetry proxy.
 *
 * Features:
 * - Event queueing and batch flushing (5s interval)
 * - Rate limiting (10 events/minute per event type)
 * - Property sanitization (allowlist only)
 * - Offline mode support
 */

import { logger } from "../utils/logger";

interface TelemetryEvent {
	event: string;
	properties?: Record<string, unknown>;
	timestamp: number;
}

interface TelemetryEventInternal {
	event: string;
	properties?: Record<string, unknown>;
	timestamp: number;
}

/** Allowed properties for telemetry (privacy-first) */
const ALLOWED_PROPERTIES = [
	"version",
	"vscodeVersion",
	"platform",
	"duration",
	"success",
	"filesCount",
	"method",
	"trigger",
	"feature",
	"viewId",
	"command",
	"notificationType",
	"actionTaken",
	"stepId",
	"stepTitle",
	"level",
	"fileType",
	"isFirstProtection",
	"phase",
	"unlockedFeatures",
	"promptType",
	"errorType",
	"errorMessage",
	"riskLevel",
	"patterns",
	"confidence",
	"filesRestored",
] as const;

/** Allowed event names (whitelist) */
const ALLOWED_EVENTS = [
	"extension.activated",
	"extension.deactivated",
	"command.executed",
	"snapshot.created",
	"snapback.used",
	"risk.detected",
	"view.activated",
	"notification.shown",
	"feature.used",
	"error",
	"walkthrough.step.completed",
	"onboarding.protection.assigned",
	"onboarding.phase.progressed",
	"onboarding.contextual_prompt.shown",
] as const;

export class TelemetryClient {
	private eventQueue: TelemetryEventInternal[] = [];
	private flushInterval = 5000; // 5 seconds
	private maxQueueSize = 100;
	private rateLimitWindow = 60000; // 1 minute
	private eventCounts: Map<string, number> = new Map();
	private lastRateLimitReset: number = Date.now();
	private proxyUrl: string;
	private offlineMode = false;
	private flushTimer: ReturnType<typeof setInterval> | null = null;
	private version: string = "unknown";

	constructor(
		_apiKey: string,
		proxyHost: string,
		private environment: "vscode" | "mcp" | "cli",
	) {
		this.proxyUrl = `${proxyHost}/api/telemetry/events`;
	}

	/**
	 * Initialize the telemetry client
	 */
	async initialize(): Promise<void> {
		// Start periodic flush
		this.flushTimer = setInterval(() => this.flush(), this.flushInterval);
		logger.debug("TelemetryClient initialized", { proxyUrl: this.proxyUrl });
	}

	/**
	 * Set the extension version for telemetry
	 */
	setVersion(version: string): void {
		this.version = version;
	}

	/**
	 * Set offline mode
	 */
	setOfflineMode(enabled: boolean): void {
		this.offlineMode = enabled;
	}

	/**
	 * Check if offline mode is enabled
	 */
	isOfflineMode(): boolean {
		return this.offlineMode;
	}

	/**
	 * Track a telemetry event
	 */
	trackEvent(event: TelemetryEvent): void {
		// Validate event name
		if (!this.isValidEvent(event.event)) {
			logger.debug("Invalid telemetry event, skipping", { event: event.event });
			return;
		}

		// Skip if offline
		if (this.offlineMode) {
			return;
		}

		// Rate limiting
		if (this.isRateLimited(event.event)) {
			return;
		}

		// Add to queue
		this.eventQueue.push({
			event: event.event,
			properties: {
				...this.sanitizeProperties(event.properties || {}),
				environment: this.environment,
				timestamp: event.timestamp,
			},
			timestamp: event.timestamp,
		});

		// Flush if queue is full
		if (this.eventQueue.length >= this.maxQueueSize) {
			this.flush();
		}
	}

	/**
	 * Track event with string name (legacy compatibility)
	 */
	track(event: string, properties?: Record<string, unknown>): void {
		this.trackEvent({
			event,
			properties,
			timestamp: Date.now(),
		});
	}

	/**
	 * Flush and shutdown
	 */
	async shutdown(): Promise<void> {
		if (this.flushTimer) {
			clearInterval(this.flushTimer);
			this.flushTimer = null;
		}
		await this.flush();
	}

	private isValidEvent(event: string): boolean {
		return ALLOWED_EVENTS.includes(event as (typeof ALLOWED_EVENTS)[number]);
	}

	private isRateLimited(event: string): boolean {
		const now = Date.now();

		// Reset rate limit counters every minute
		if (now - this.lastRateLimitReset > this.rateLimitWindow) {
			this.eventCounts.clear();
			this.lastRateLimitReset = now;
		}

		// Check event count
		const count = this.eventCounts.get(event) || 0;
		const maxEventsPerWindow = 10;

		if (count >= maxEventsPerWindow) {
			return true;
		}

		this.eventCounts.set(event, count + 1);
		return false;
	}

	/**
	 * Sanitize properties to remove PII
	 */
	private sanitizeProperties(properties: Record<string, unknown>): Record<string, unknown> {
		const sanitized: Record<string, unknown> = {};

		for (const key of ALLOWED_PROPERTIES) {
			if (key in properties) {
				sanitized[key] = properties[key];
			}
		}

		return sanitized;
	}

	private async flush(): Promise<void> {
		if (this.offlineMode || this.eventQueue.length === 0) {
			return;
		}

		const eventsToFlush = [...this.eventQueue];
		this.eventQueue = [];

		try {
			const response = await fetch(this.proxyUrl, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					"X-SnapBack-Platform": this.environment,
					"X-SnapBack-Version": this.version,
				},
				body: JSON.stringify({
					events: eventsToFlush.map((event) => ({
						event: event.event,
						properties: event.properties,
						timestamp: event.timestamp,
					})),
				}),
			});

			if (!response.ok) {
				const error = await response.text();
				logger.warn("Telemetry proxy rejected events", {
					status: response.status,
					error,
				});
				// Re-add events to queue for retry (max queue size)
				const remaining = this.maxQueueSize - this.eventQueue.length;
				if (remaining > 0) {
					this.eventQueue.unshift(...eventsToFlush.slice(0, remaining));
				}
			}
		} catch (error) {
			logger.debug("Failed to send telemetry", { error });
			// Re-add events to queue for retry (max queue size)
			const remaining = this.maxQueueSize - this.eventQueue.length;
			if (remaining > 0) {
				this.eventQueue.unshift(...eventsToFlush.slice(0, remaining));
			}
		}
	}
}
