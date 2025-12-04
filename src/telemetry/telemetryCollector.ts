import { logger } from "../utils/logger";

/**
 * Event type definitions
 */
export interface SnapshotCreatedEvent {
	fileCount: number;
	riskScore: number;
	trigger: "auto-decision" | "manual" | "ai-detected";
	timestamp: number;
	sessionId?: string;
}

export interface ThreatDetectedEvent {
	filePath: string;
	riskScore: number;
	threats: string[];
	action: "snapshot" | "notify" | "restore" | "none";
	confidence?: number;
}

export interface ProtectionLevelChangedEvent {
	previousLevel: "watch" | "warn" | "block";
	newLevel: "watch" | "warn" | "block";
	reason: string;
	timestamp: number;
}

export interface NotificationShownEvent {
	type: "threat" | "recovery" | "threshold";
	userAction?: "click" | "dismiss";
}

/**
 * PostHog SDK interface (for typing without direct dependency)
 */
export interface PostHogSDK {
	capture(eventName: string, properties?: Record<string, any>): void;
	identify(distinctId: string, properties?: Record<string, any>): void;
	optOut(): void;
	optIn(): void;
	hasOptedOutCapturing(): boolean;
	isFeatureEnabled(flag: string): boolean;
	getFeatureFlagPayload(flag: string): Record<string, any> | null;
}

/**
 * TelemetryCollector - Core analytics integration with PostHog
 * Provides privacy-first event tracking with PII filtering and opt-out support
 */
export class TelemetryCollector {
	private postHog: PostHogSDK;
	private optOutOverride: boolean | null = null;
	private eventQueue: Array<{ event: string; properties: Record<string, any> }> =
		[];

	constructor(postHog: PostHogSDK) {
		this.postHog = postHog;
		logger.info("TelemetryCollector initialized");
	}

	/**
	 * Capture generic event
	 */
	async capture(
		eventName: string,
		properties?: Record<string, any>,
	): Promise<void> {
		// Respect opt-out setting
		if (this.isOptedOut()) {
			logger.debug("Event blocked by opt-out", { eventName });
			return;
		}

		// Filter properties for privacy
		const filtered = this.scrubProperties(properties ?? {});

		// Queue event for batching
		this.eventQueue.push({
			event: eventName,
			properties: filtered,
		});

		// Send immediately (PostHog batches internally)
		try {
			this.postHog.capture(eventName, filtered);
			logger.debug("Event captured", { eventName, propertyCount: Object.keys(filtered).length });
		} catch (error) {
			logger.error(
				"Failed to capture event",
				error instanceof Error ? error : undefined,
				{ eventName, propertyCount: Object.keys(filtered).length }
			);
		}
	}

	/**
	 * Identify user (workspace)
	 */
	async identify(
		workspaceId: string,
		properties?: Record<string, any>,
	): Promise<void> {
		if (this.isOptedOut()) {
			logger.debug("Identify blocked by opt-out", { workspaceId });
			return;
		}

		const filtered = this.scrubProperties(properties ?? {});

		try {
			this.postHog.identify(workspaceId, filtered);
			logger.debug("Workspace identified", { workspaceId, propertyCount: Object.keys(filtered).length });
		} catch (error) {
			logger.error(
				"Failed to identify workspace",
				error instanceof Error ? error : undefined,
				{ workspaceId }
			);
		}
	}

	/**
	 * Capture snapshot creation event
	 */
	async captureSnapshotCreated(event: SnapshotCreatedEvent): Promise<void> {
		await this.capture("snapshot.created", {
			fileCount: event.fileCount,
			riskScore: event.riskScore,
			trigger: event.trigger,
			timestamp: event.timestamp,
			sessionId: event.sessionId,
		});
	}

	/**
	 * Capture threat detection event
	 */
	async captureThreatDetected(event: ThreatDetectedEvent): Promise<void> {
		await this.capture("threat.detected", {
			filePath: this.sanitizePath(event.filePath),
			riskScore: event.riskScore,
			threats: event.threats,
			action: event.action,
			confidence: event.confidence,
		});
	}

	/**
	 * Capture protection level change
	 */
	async captureProtectionLevelChanged(
		event: ProtectionLevelChangedEvent,
	): Promise<void> {
		await this.capture("protection.level_changed", {
			previousLevel: event.previousLevel,
			newLevel: event.newLevel,
			reason: event.reason,
			timestamp: event.timestamp,
		});
	}

	/**
	 * Capture notification shown
	 */
	async captureNotificationShown(event: NotificationShownEvent): Promise<void> {
		await this.capture("notification.shown", {
			type: event.type,
			userAction: event.userAction,
		});
	}

	/**
	 * Capture extension activation
	 */
	async captureExtensionActivated(extensionVersion: string, vscodeVersion: string): Promise<void> {
		await this.capture("extension.activated", {
			extensionVersion,
			vscodeVersion,
			timestamp: Date.now(),
		});
	}

	/**
	 * Capture extension deactivation
	 */
	async captureExtensionDeactivated(sessionDuration: number): Promise<void> {
		await this.capture("extension.deactivated", {
			sessionDuration,
			timestamp: Date.now(),
		});
	}

	/**
	 * Capture error event
	 */
	async captureError(
		errorType: string,
		errorMessage: string,
		context: string,
		stack?: string,
	): Promise<void> {
		await this.capture("error.occurred", {
			errorType,
			errorMessage,
			context,
			stack,
			timestamp: Date.now(),
		});
	}

	/**
	 * Opt user out of tracking
	 */
	async optOut(): Promise<void> {
		this.optOutOverride = true;
		try {
			this.postHog.optOut();
			logger.info("User opted out of telemetry");
		} catch (error) {
			logger.error(
				"Failed to opt out",
				error instanceof Error ? error : undefined
			);
		}
	}

	/**
	 * Opt user in (resume tracking)
	 */
	async optIn(): Promise<void> {
		this.optOutOverride = false;
		try {
			this.postHog.optIn();
			logger.info("User opted in to telemetry");
		} catch (error) {
			logger.error(
				"Failed to opt in",
				error instanceof Error ? error : undefined
			);
		}
	}

	/**
	 * Check if user has opted out
	 */
	isOptedOut(): boolean {
		if (this.optOutOverride !== null) {
			return this.optOutOverride;
		}
		try {
			return this.postHog.hasOptedOutCapturing();
		} catch (error) {
			logger.error(
				"Failed to check opt-out status",
				error instanceof Error ? error : undefined
			);
			// Default to opted-out on error (privacy-first)
			return true;
		}
	}

	/**
	 * Check if feature flag is enabled
	 */
	isFeatureEnabled(flagName: string): boolean {
		try {
			return this.postHog.isFeatureEnabled(flagName);
		} catch (error) {
			logger.error(
				"Failed to check feature flag",
				error instanceof Error ? error : undefined,
				{ flagName }
			);
			return false;
		}
	}

	/**
	 * Get feature flag payload
	 */
	getFeatureFlagPayload(flagName: string): Record<string, any> | null {
		try {
			return this.postHog.getFeatureFlagPayload(flagName);
		} catch (error) {
			logger.error(
				"Failed to get feature flag payload",
				error instanceof Error ? error : undefined,
				{ flagName }
			);
			return null;
		}
	}

	/**
	 * Get event queue for testing
	 */
	getEventQueue() {
		return [...this.eventQueue];
	}

	/**
	 * Clear event queue
	 */
	clearEventQueue() {
		this.eventQueue = [];
	}

	/**
	 * Privacy filter: Scrub sensitive properties
	 */
	private scrubProperties(props: Record<string, any>): Record<string, any> {
		const scrubbed = { ...props };

		// Remove known PII fields
		delete scrubbed.email;
		delete scrubbed.apiKey;
		delete scrubbed.password;
		delete scrubbed.token;
		delete scrubbed.credential;

		// Sanitize file paths
		if (scrubbed.filePath && typeof scrubbed.filePath === "string") {
			scrubbed.filePath = this.sanitizePath(scrubbed.filePath);
		}

		// Remove any properties that look like git commits
		for (const key in scrubbed) {
			if (typeof scrubbed[key] === "string") {
				// Redact very long strings (likely file contents)
				if (scrubbed[key].length > 500) {
					scrubbed[key] = `[redacted-${scrubbed[key].length}-chars]`;
				}
			}
		}

		return scrubbed;
	}

	/**
	 * Sanitize file paths (remove user-specific parts)
	 */
	private sanitizePath(filePath: string): string {
		// /Users/john/project/src/auth.ts → ./src/auth.ts
		// /home/alice/workspace/app/config.json → ./app/config.json
		const match = filePath.match(/\/(project|workspace|app)\/(.+)$/);
		if (match) {
			return `.${filePath.substring(filePath.indexOf(match[1]) + match[1].length)}`;
		}
		return filePath;
	}
}

/**
 * Factory function to create TelemetryCollector with PostHog SDK
 * Usage in extension activation:
 * ```typescript
 * const posthog = require('posthog-js');
 * posthog.init(API_KEY, { api_host: 'https://app.posthog.com' });
 * const telemetryCollector = createTelemetryCollector(posthog);
 * ```
 */
export function createTelemetryCollector(postHog: PostHogSDK): TelemetryCollector {
	return new TelemetryCollector(postHog);
}
