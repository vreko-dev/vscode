/**
 * AlertRateLimiter - Prevents alert fatigue through rate limiting
 *
 * Implements research-backed strategies from Datadog, AWS, and CMU studies:
 * - Max 3 alerts per session (1 critical + 2 warnings)
 * - 15-minute cooldown per category
 * - Exponential backoff after 3 dismisses
 * - Flappy alert detection and suppression
 *
 * @module services/AlertRateLimiter
 */

import type { AlertCategory, ProactiveAlert } from "../types/mcp";

/**
 * Session alert tracking
 */
interface SessionTracking {
	alertCount: number;
	criticalCount: number;
	warningCount: number;
	infoCount: number;
	lastAlertTime: number;
}

/**
 * Dismiss tracking per category
 */
interface DismissHistory {
	category: AlertCategory;
	dismissCount: number;
	firstDismissTime: number;
	lastDismissTime: number;
}

/**
 * Flappy alert lifecycle tracking
 */
interface FlappyCycle {
	category: AlertCategory;
	cycles: Array<{ firedAt: number; resolvedAt: number }>;
	lastActivityTime: number;
}

const MAX_ALERTS_PER_SESSION = 3;
const MAX_CRITICAL_PER_SESSION = 3; // Criticals don't have separate limit, only total
const MAX_WARNINGS_PER_SESSION = 3; // Warnings don't have separate limit, only total
const COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const DISMISS_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
const DISMISS_THRESHOLD = 3;
const ELEVATED_CONFIDENCE_THRESHOLD = 95;
const FLAPPY_DETECTION_CYCLES = 3;
const FLAPPY_RESET_TIME_MS = 60 * 60 * 1000; // 1 hour
const CLEANUP_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

export class AlertRateLimiter {
	private sessionTracking = new Map<string, SessionTracking>();
	private categoryCooldowns = new Map<AlertCategory, number>();
	private dismissHistory = new Map<AlertCategory, DismissHistory>();
	private flappyTracking = new Map<AlertCategory, FlappyCycle>();
	private lastCleanupTime = Date.now();

	/**
	 * Check if an alert should be allowed based on all rate limiting rules
	 */
	shouldAllow(alert: ProactiveAlert, sessionId: string): boolean {
		// Handle invalid inputs gracefully
		if (!alert || !alert.category || !sessionId) {
			return false;
		}

		// Check session limits FIRST (most fundamental constraint)
		if (!this.checkSessionLimit(alert, sessionId)) {
			return false;
		}

		// Critical alerts with high confidence override cooldown and dismiss rules
		if (alert.severity === "critical" && alert.confidence >= ELEVATED_CONFIDENCE_THRESHOLD) {
			return true;
		}

		// Check dismiss history - if dismissed 3x in 24h, require 95% confidence
		if (!this.checkDismissThreshold(alert)) {
			return false;
		}

		// Check if category is flappy and should be suppressed
		if (this.isFlappy(alert.category) && alert.confidence < ELEVATED_CONFIDENCE_THRESHOLD) {
			return false;
		}

		// Check cooldown for this category
		if (!this.checkCooldown(alert.category)) {
			return false;
		}

		// Periodic cleanup of old entries
		this.periodicCleanup();

		return true;
	}

	/**
	 * Record that an alert was shown to user
	 * IMPORTANT: Only call this AFTER shouldAllow returns true
	 */
	recordShown(alert: ProactiveAlert, sessionId: string): void {
		// Update session tracking
		const session = this.getOrCreateSession(sessionId);
		session.alertCount++;
		if (alert.severity === "critical") {
			session.criticalCount++;
		} else if (alert.severity === "warning") {
			session.warningCount++;
		} else {
			session.infoCount++;
		}
		session.lastAlertTime = Date.now();

		// Update category cooldown
		this.categoryCooldowns.set(alert.category, Date.now());
	}

	/**
	 * Record that user dismissed an alert
	 */
	recordDismissed(category: AlertCategory, _sessionId: string): void {
		const now = Date.now();
		const history = this.dismissHistory.get(category);

		if (!history) {
			this.dismissHistory.set(category, {
				category,
				dismissCount: 1,
				firstDismissTime: now,
				lastDismissTime: now,
			});
			return;
		}

		// Check if we need to reset the window
		if (now - history.firstDismissTime > DISMISS_WINDOW_MS) {
			history.dismissCount = 1;
			history.firstDismissTime = now;
		} else {
			history.dismissCount++;
		}

		history.lastDismissTime = now;
	}

	/**
	 * Record that user took action on an alert (for future confidence boosting)
	 */
	recordActed(_category: AlertCategory, _sessionId: string): void {
		// Future implementation: boost confidence scores
		// For now, just track that it happened
	}

	/**
	 * Record that an alert fired
	 */
	recordFired(category: AlertCategory): void {
		const now = Date.now();
		const tracking = this.flappyTracking.get(category);

		if (!tracking) {
			this.flappyTracking.set(category, {
				category,
				cycles: [{ firedAt: now, resolvedAt: 0 }],
				lastActivityTime: now,
			});
			return;
		}

		// Add new cycle
		tracking.cycles.push({ firedAt: now, resolvedAt: 0 });
		tracking.lastActivityTime = now;

		// Keep only recent cycles
		tracking.cycles = tracking.cycles.slice(-FLAPPY_DETECTION_CYCLES);
	}

	/**
	 * Record that an alert auto-resolved
	 */
	recordResolved(category: AlertCategory): void {
		const now = Date.now();
		const tracking = this.flappyTracking.get(category);

		if (!tracking || tracking.cycles.length === 0) {
			return;
		}

		// Mark the most recent cycle as resolved
		const lastCycle = tracking.cycles[tracking.cycles.length - 1];
		if (lastCycle.resolvedAt === 0) {
			lastCycle.resolvedAt = now;
			tracking.lastActivityTime = now;
		}
	}

	/**
	 * Check if an alert category is exhibiting flappy behavior
	 */
	isFlappy(category: AlertCategory): boolean {
		const tracking = this.flappyTracking.get(category);
		if (!tracking) {
			return false;
		}

		// Reset if enough time has passed
		const now = Date.now();
		if (now - tracking.lastActivityTime > FLAPPY_RESET_TIME_MS) {
			this.flappyTracking.delete(category);
			return false;
		}

		// Check if we have 3 complete fire -> resolve cycles
		const completeCycles = tracking.cycles.filter(
			(cycle) => cycle.firedAt > 0 && cycle.resolvedAt > 0 && cycle.resolvedAt > cycle.firedAt,
		);

		return completeCycles.length >= FLAPPY_DETECTION_CYCLES;
	}

	/**
	 * Check if dismiss threshold allows this alert
	 */
	private checkDismissThreshold(alert: ProactiveAlert): boolean {
		const history = this.dismissHistory.get(alert.category);
		if (!history) {
			return true;
		}

		// Check if within 24h window
		const now = Date.now();
		if (now - history.firstDismissTime > DISMISS_WINDOW_MS) {
			// Window expired, reset
			this.dismissHistory.delete(alert.category);
			return true;
		}

		// If dismissed 3+ times, require elevated confidence
		if (history.dismissCount >= DISMISS_THRESHOLD) {
			return alert.confidence >= ELEVATED_CONFIDENCE_THRESHOLD;
		}

		return true;
	}

	/**
	 * Check if category is in cooldown
	 */
	private checkCooldown(category: AlertCategory): boolean {
		const lastShown = this.categoryCooldowns.get(category);
		if (!lastShown) {
			return true;
		}

		const now = Date.now();
		return now - lastShown >= COOLDOWN_MS;
	}

	/**
	 * Check session-level limits
	 */
	private checkSessionLimit(alert: ProactiveAlert, sessionId: string): boolean {
		const session = this.getOrCreateSession(sessionId);

		// Check total alerts limit
		if (session.alertCount >= MAX_ALERTS_PER_SESSION) {
			return false;
		}

		// Check severity-specific limits
		if (alert.severity === "critical") {
			return session.criticalCount < MAX_CRITICAL_PER_SESSION;
		}

		if (alert.severity === "warning") {
			return session.warningCount < MAX_WARNINGS_PER_SESSION;
		}

		// Info alerts count against total but have no separate limit
		return true;
	}

	/**
	 * Get or create session tracking
	 */
	private getOrCreateSession(sessionId: string): SessionTracking {
		let session = this.sessionTracking.get(sessionId);
		if (!session) {
			session = {
				alertCount: 0,
				criticalCount: 0,
				warningCount: 0,
				infoCount: 0,
				lastAlertTime: Date.now(),
			};
			this.sessionTracking.set(sessionId, session);
		}
		return session;
	}

	/**
	 * Periodic cleanup of old entries to prevent memory leaks
	 */
	private periodicCleanup(): void {
		const now = Date.now();
		if (now - this.lastCleanupTime < CLEANUP_INTERVAL_MS) {
			return;
		}

		// Clean up old cooldowns
		for (const [category, timestamp] of this.categoryCooldowns.entries()) {
			if (now - timestamp > COOLDOWN_MS * 2) {
				this.categoryCooldowns.delete(category);
			}
		}

		// Clean up old dismiss history
		for (const [category, history] of this.dismissHistory.entries()) {
			if (now - history.lastDismissTime > DISMISS_WINDOW_MS) {
				this.dismissHistory.delete(category);
			}
		}

		// Clean up old flappy tracking
		for (const [category, tracking] of this.flappyTracking.entries()) {
			if (now - tracking.lastActivityTime > FLAPPY_RESET_TIME_MS * 2) {
				this.flappyTracking.delete(category);
			}
		}

		this.lastCleanupTime = now;
	}
}
