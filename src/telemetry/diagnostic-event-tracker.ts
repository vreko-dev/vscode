/**
 * Diagnostic Event Tracker
 *
 * Tracks diagnostic telemetry events for auth flow and welcome panel.
 * These events enable debugging drop-offs in the activation funnel.
 *
 * Reference: feedback.md §2 Issue 2 - Missing Critical Funnel Events
 * TDD Status: GREEN (implementation for diagnostic event tracking)
 *
 * @package apps/vscode
 */

import { CORE_TELEMETRY_EVENTS } from "@snapback/contracts";
import type { TelemetryProxy } from "../services/telemetry-proxy";

/**
 * Diagnostic event tracker class
 * Handles auth flow and welcome panel event tracking
 */
export class DiagnosticEventTracker {
	constructor(private telemetryProxy: TelemetryProxy) {}

	/**
	 * Track auth provider selection (OAuth vs Device flow)
	 *
	 * @param provider - "oauth" or "device_flow"
	 * @param trigger - How the provider was selected ("user_selected" | "fallback" | "auto")
	 */
	trackAuthProviderSelected(
		provider: "oauth" | "device_flow",
		trigger: "user_selected" | "fallback" | "auto",
	): void {
		this.telemetryProxy.trackEvent(
			CORE_TELEMETRY_EVENTS.AUTH_PROVIDER_SELECTED,
			{
				provider,
				trigger,
				timestamp_utc: Date.now(),
			},
		);
	}

	/**
	 * Track browser opening for device auth flow
	 *
	 * @param success - Whether browser was successfully opened
	 * @param method - "external_command" | "clipboard" | "error"
	 * @param error - Error message if failed
	 */
	trackAuthBrowserOpened(
		success: boolean,
		method: "external_command" | "clipboard" | "error",
		error?: string,
	): void {
		this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.AUTH_BROWSER_OPENED, {
			success,
			method,
			...(error && { error }),
			timestamp_utc: Date.now(),
		});
	}

	/**
	 * Track user entering device code in browser
	 *
	 * @param codeLength - Length of the code entered (for validation)
	 */
	trackAuthCodeEntry(codeLength: number): void {
		this.telemetryProxy.trackEvent(CORE_TELEMETRY_EVENTS.AUTH_CODE_ENTRY, {
			code_length: codeLength,
			timestamp_utc: Date.now(),
		});
	}

	/**
	 * Track server-side approval of auth request
	 *
	 * @param approvalTimeMs - Time from request to approval in milliseconds
	 */
	trackAuthApprovalReceived(approvalTimeMs: number): void {
		this.telemetryProxy.trackEvent(
			CORE_TELEMETRY_EVENTS.AUTH_APPROVAL_RECEIVED,
			{
				approval_time_ms: approvalTimeMs,
				timestamp_utc: Date.now(),
			},
		);
	}

	/**
	 * Generic track method for custom events
	 * Allows SkipReasonTracker and other components to track arbitrary events
	 *
	 * @param eventData - Event object with 'event' name and 'properties'
	 */
	track(eventData: {
		event: string;
		properties: Record<string, unknown>;
	}): void {
		this.telemetryProxy.trackEvent(eventData.event, {
			...eventData.properties,
			timestamp_utc: Date.now(),
		});
	}

	/**
	 * Track feature viewed in welcome panel
	 *
	 * @param feature - Feature name (e.g., "ai_detection", "protection_levels")
	 * @param position - Position in carousel (0-indexed)
	 * @param trigger - How welcome panel was triggered ("onboarding" | "nudge" | "manual")
	 */
	trackWelcomeFeatureViewed(
		feature: string,
		position: number,
		trigger: "onboarding" | "nudge" | "manual",
	): void {
		this.telemetryProxy.trackEvent(
			CORE_TELEMETRY_EVENTS.WELCOME_FEATURE_VIEWED,
			{
				feature,
				position,
				trigger,
				timestamp_utc: Date.now(),
			},
		);
	}

	/**
	 * Track action triggered from welcome panel
	 *
	 * @param action - Action name (e.g., "try_now", "learn_more", "configure")
	 * @param feature - Associated feature
	 * @param timeViewedMs - How long feature was viewed before action
	 */
	trackWelcomeActionTriggered(
		action: string,
		feature: string,
		timeViewedMs: number,
	): void {
		this.telemetryProxy.trackEvent(
			CORE_TELEMETRY_EVENTS.WELCOME_ACTION_TRIGGERED,
			{
				action,
				feature,
				time_viewed_ms: timeViewedMs,
				timestamp_utc: Date.now(),
			},
		);
	}
}
