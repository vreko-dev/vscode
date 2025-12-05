import type {
	LegacyCommandExecutionEvent,
	LegacyErrorEvent,
	LegacyExtensionActivatedEvent,
	LegacyExtensionDeactivatedEvent,
	LegacyFeatureUsedEvent,
	LegacyNotificationShownEvent,
	LegacyOnboardingContextualPromptShownEvent,
	LegacyOnboardingPhaseProgressedEvent,
	LegacyOnboardingProtectionAssignedEvent,
	LegacyRiskDetectedEvent,
	LegacySnapBackUsedEvent,
	LegacySnapshotCreatedEvent,
	LegacyViewActivatedEvent,
	LegacyWalkthroughStepCompletedEvent,
} from "@snapback/contracts";
import { LEGACY_TELEMETRY_EVENTS } from "@snapback/contracts";
import { SnapBackEventBus } from "@snapback/events";
import { TelemetryClient } from "@snapback/infrastructure/tracing";
import * as vscode from "vscode";
import { FeatureFlagService } from "./services/feature-flag-service.js"; // 🆕 Import FeatureFlagService
import { TelemetryProxy } from "./services/telemetry-proxy";

/**
 * VS Code Telemetry Integration
 *
 * This module provides a wrapper around the core TelemetryClient that's
 * specifically tailored for VS Code extension usage. It handles VS Code-specific
 * configuration and provides convenient methods for tracking common extension events.
 */

export class VSCodeTelemetry {
	private telemetryClient: TelemetryClient | null = null;
	private telemetryProxy: TelemetryProxy | null = null;
	private eventBus: InstanceType<typeof SnapBackEventBus> | null = null;
	private context: vscode.ExtensionContext;
	// 🆕 Add feature flag service
	private featureFlagService: FeatureFlagService | null = null;

	constructor(context: vscode.ExtensionContext) {
		this.context = context;
	}

	/**
	 * Initialize the telemetry client with VS Code-specific configuration
	 */
	async initialize() {
		try {
			// Initialize telemetry proxy
			this.telemetryProxy = new TelemetryProxy(this.context);

			// 🆕 Initialize feature flag service
			this.featureFlagService = new FeatureFlagService();

			// Get configuration from VS Code settings
			const config = vscode.workspace.getConfiguration("snapback");
			const posthogKey =
				config.get<string>("posthogKey") || process.env.POSTHOG_PROJECT_KEY;
			// const _posthogHost =
			//	config.get<string>("posthogHost") ||
			//	process.env.POSTHOG_API_HOST ||
			//	"https://app.posthog.com";

			// Get proxy URL from configuration
			const proxyUrl =
				config.get<string>("telemetryProxy") ||
				process.env.SNAPBACK_TELEMETRY_PROXY ||
				"https://telemetry.snapback.dev";

			// Initialize event bus with EventEmitter2
			this.eventBus = new SnapBackEventBus();
			try {
				await this.eventBus.initialize();
				console.log("EventEmitter2 event bus initialized for telemetry");
			} catch (err) {
				console.warn(
					"Failed to initialize EventEmitter2 event bus for telemetry:",
					err,
				);
			}

			// Only initialize if we have a PostHog key
			if (posthogKey) {
				this.telemetryClient = new TelemetryClient(
					posthogKey,
					proxyUrl,
					"vscode",
				);
				await this.telemetryClient.initialize();

				// Track extension activation with typed event
				const activationEvent: LegacyExtensionActivatedEvent = {
					event: LEGACY_TELEMETRY_EVENTS.EXTENSION_ACTIVATED,
					properties: {
						version: this.context.extension.packageJSON.version,
						vscodeVersion: vscode.version,
					},
					timestamp: Date.now(),
				};
				this.trackEvent(activationEvent);
			} else {
				console.log("PostHog key not found, telemetry disabled");
			}
		} catch (error) {
			console.warn("Failed to initialize telemetry:", error);
		}
	}

	/**
	 * Track a telemetry event through both the telemetry client and event bus
	 * @param event The telemetry event to track
	 */
	private async trackEvent(
		event:
			| LegacyExtensionActivatedEvent
			| LegacyCommandExecutionEvent
			| LegacySnapshotCreatedEvent
			| LegacySnapBackUsedEvent
			| LegacyRiskDetectedEvent
			| LegacyViewActivatedEvent
			| LegacyNotificationShownEvent
			| LegacyFeatureUsedEvent
			| LegacyErrorEvent
			| LegacyWalkthroughStepCompletedEvent
			| LegacyOnboardingProtectionAssignedEvent
			| LegacyOnboardingPhaseProgressedEvent
			| LegacyOnboardingContextualPromptShownEvent
			| LegacyExtensionDeactivatedEvent,
	): Promise<void> {
		// 🆕 Check if detailed telemetry is enabled via feature flags
		let isDetailedTelemetryEnabled = true;
		if (this.featureFlagService) {
			try {
				// Get user ID from context or generate anonymous ID
				const userId =
					this.context.globalState.get<string>("userId") || "anonymous";
				isDetailedTelemetryEnabled =
					await this.featureFlagService.isFeatureEnabled(
						userId,
						"telemetry.detailed_events",
					);
			} catch (error) {
				console.warn(
					"Failed to check feature flag for detailed telemetry, defaulting to enabled",
					error,
				);
			}
		}

		// 🆕 Only send detailed events if feature flag is enabled
		if (
			!isDetailedTelemetryEnabled &&
			!["snapshot.created", "risk.high", "error"].includes(event.event)
		) {
			return;
		}

		// Send to telemetry client
		if (this.telemetryClient) {
			this.telemetryClient.trackEvent(event);
		}

		//     // Send to event bus
		//     if (this.eventBus) {
		//       const payload: TelemetryEventPayload = {
		//         event: event.event,
		//         properties: event.properties,
		//         timestamp: event.timestamp,
		//         version: "1.0.0"
		//       };
		//       this.eventBus.publishTelemetryEvent(payload);
		//     }

		// Send to telemetry proxy
		if (this.telemetryProxy) {
			this.telemetryProxy.trackEvent(event.event, event.properties);
		}
	}

	/**
	 * Track command execution
	 */
	trackCommandExecution(
		command: string,
		duration: number,
		success: boolean,
		properties?: Record<string, unknown>,
	) {
		const event: LegacyCommandExecutionEvent = {
			event: LEGACY_TELEMETRY_EVENTS.COMMAND_EXECUTION,
			properties: {
				command,
				duration,
				success,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track snapshot creation
	 */
	trackSnapshotCreated(
		method: string,
		filesCount: number,
		properties?: Record<string, unknown>,
	) {
		const event: LegacySnapshotCreatedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.SNAPSHOT_CREATED,
			properties: {
				method,
				filesCount,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track SnapBack usage
	 */
	trackSnapBackUsed(
		filesRestored: number,
		duration: number,
		success: boolean,
		properties?: Record<string, unknown>,
	) {
		const event: LegacySnapBackUsedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.SNAPBACK_USED,
			properties: {
				filesRestored,
				duration,
				success,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track risk detection
	 */
	trackRiskDetected(
		riskLevel: string,
		patterns: string[],
		confidence: number,
		properties?: Record<string, unknown>,
	) {
		const event: LegacyRiskDetectedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.RISK_DETECTED,
			properties: {
				riskLevel,
				patterns,
				confidence,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track view activation
	 */
	trackViewActivated(viewId: string, properties?: Record<string, unknown>) {
		const event: LegacyViewActivatedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.VIEW_ACTIVATED,
			properties: {
				viewId,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track notification shown
	 */
	trackNotificationShown(
		notificationType: string,
		actionTaken: string | null,
		properties?: Record<string, unknown>,
	) {
		const event: LegacyNotificationShownEvent = {
			event: LEGACY_TELEMETRY_EVENTS.NOTIFICATION_SHOWN,
			properties: {
				notificationType,
				actionTaken,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track feature usage
	 */
	trackFeatureUsed(feature: string, properties?: Record<string, unknown>) {
		const event: LegacyFeatureUsedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.FEATURE_USED,
			properties: {
				feature,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track error
	 */
	trackError(
		errorType: string,
		errorMessage: string,
		properties?: Record<string, unknown>,
	) {
		const event: LegacyErrorEvent = {
			event: LEGACY_TELEMETRY_EVENTS.ERROR,
			properties: {
				errorType,
				errorMessage,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track walkthrough step completion
	 */
	trackWalkthroughStepCompleted(
		stepId: string,
		stepTitle: string,
		properties?: Record<string, unknown>,
	) {
		const event: LegacyWalkthroughStepCompletedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.WALKTHROUGH_STEP_COMPLETED,
			properties: {
				stepId,
				stepTitle,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track protection assignment during onboarding
	 */
	trackOnboardingProtectionAssigned(
		level: string,
		trigger: string,
		fileType: string,
		isFirst: boolean,
		properties?: Record<string, unknown>,
	) {
		const event: LegacyOnboardingProtectionAssignedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.ONBOARDING_PROTECTION_ASSIGNED,
			properties: {
				level,
				trigger,
				fileType,
				isFirstProtection: isFirst,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track onboarding phase progression
	 */
	trackOnboardingPhaseProgression(
		phase: number,
		trigger: string,
		unlockedFeatures: string[],
		properties?: Record<string, unknown>,
	) {
		const event: LegacyOnboardingPhaseProgressedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.ONBOARDING_PHASE_PROGRESSED,
			properties: {
				phase,
				trigger,
				unlockedFeatures,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Track contextual prompt shown
	 */
	trackContextualPromptShown(
		promptType: string,
		actionTaken: string | null,
		properties?: Record<string, unknown>,
	) {
		const event: LegacyOnboardingContextualPromptShownEvent = {
			event: LEGACY_TELEMETRY_EVENTS.ONBOARDING_CONTEXTUAL_PROMPT_SHOWN,
			properties: {
				promptType,
				actionTaken,
				...properties,
			},
			timestamp: Date.now(),
		};
		this.trackEvent(event);
	}

	/**
	 * Flush any pending events and shutdown the telemetry client
	 */
	async shutdown() {
		// Track extension deactivation with typed event
		const deactivationEvent: LegacyExtensionDeactivatedEvent = {
			event: LEGACY_TELEMETRY_EVENTS.EXTENSION_DEACTIVATED,
			properties: {},
			timestamp: Date.now(),
		};
		this.trackEvent(deactivationEvent);

		// Close event bus connection
		if (this.eventBus) {
			if (this.eventBus) {
				this.eventBus.close();
			}
		}

		// The TelemetryClient doesn't have a shutdown method, but we can flush manually
		// This is a simplified version - in a real implementation you might want to
		// add a flush method to the TelemetryClient class
	}
}
