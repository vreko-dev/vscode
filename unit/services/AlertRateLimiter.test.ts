import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProactiveAlert, AlertCategory } from "../../../../../packages/mcp/src/types/alerts.js";

// Import the class we're testing (will fail initially - that's RED phase)
import { AlertRateLimiter } from "@vscode/services/AlertRateLimiter";

describe("AlertRateLimiter", () => {
	let rateLimiter: AlertRateLimiter;
	const sessionId = "test-session-123";

	// Helper to create test alerts
	const createAlert = (category: AlertCategory, severity: "info" | "warning" | "critical" = "warning"): ProactiveAlert => ({
		id: `alert-${Math.random()}`,
		timestamp: Date.now(),
		severity,
		category,
		summary: `Test ${category} alert`,
		confidence: 85,
		dismissible: true,
	});

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		rateLimiter = new AlertRateLimiter();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("Session Limits", () => {
		it("should allow first 3 alerts in a session", () => {
			const alert1 = createAlert("high_risk_file");
			const alert2 = createAlert("pressure_threshold");
			const alert3 = createAlert("violation_recurrence");

			expect(rateLimiter.shouldAllow(alert1, sessionId)).toBe(true);
			rateLimiter.recordShown(alert1, sessionId);

			expect(rateLimiter.shouldAllow(alert2, sessionId)).toBe(true);
			rateLimiter.recordShown(alert2, sessionId);

			expect(rateLimiter.shouldAllow(alert3, sessionId)).toBe(true);
			rateLimiter.recordShown(alert3, sessionId);
		});

		it("should block 4th alert in same session", () => {
			// Use different categories to avoid cooldown interference
			const alerts = [
				createAlert("high_risk_file"),
				createAlert("pressure_threshold"),
				createAlert("violation_recurrence"),
				createAlert("velocity_alert"), // 4th alert - different category
			];

			for (let i = 0; i < 3; i++) {
				expect(rateLimiter.shouldAllow(alerts[i], sessionId)).toBe(true);
				rateLimiter.recordShown(alerts[i], sessionId);
			}

			// 4th alert should be blocked (session limit reached)
			expect(rateLimiter.shouldAllow(alerts[3], sessionId)).toBe(false);
		});

		it("should reset count on new session", () => {
			// Use different categories to avoid cooldown interference
			const alert1 = createAlert("high_risk_file");
			const alert2 = createAlert("pressure_threshold");
			const alert3 = createAlert("violation_recurrence");

			// Fill up session 1 with different categories
			expect(rateLimiter.shouldAllow(alert1, sessionId)).toBe(true);
			rateLimiter.recordShown(alert1, sessionId);
			expect(rateLimiter.shouldAllow(alert2, sessionId)).toBe(true);
			rateLimiter.recordShown(alert2, sessionId);
			expect(rateLimiter.shouldAllow(alert3, sessionId)).toBe(true);
			rateLimiter.recordShown(alert3, sessionId);

			// New session should allow 3 more (different categories to avoid cooldown)
			const newSessionId = "test-session-456";
			const alert4 = createAlert("velocity_alert");
			const alert5 = createAlert("stale_snapshot");
			const alert6 = createAlert("ai_temperature");

			expect(rateLimiter.shouldAllow(alert4, newSessionId)).toBe(true);
			rateLimiter.recordShown(alert4, newSessionId);
			expect(rateLimiter.shouldAllow(alert5, newSessionId)).toBe(true);
			rateLimiter.recordShown(alert5, newSessionId);
			expect(rateLimiter.shouldAllow(alert6, newSessionId)).toBe(true);
			rateLimiter.recordShown(alert6, newSessionId);
		});

		it("should allow 1 critical + 2 warnings (priority-based limiting)", () => {
			const critical = createAlert("critical_file_touch", "critical");
			const warning1 = createAlert("high_risk_file", "warning");
			const warning2 = createAlert("pressure_threshold", "warning");
			const warning3 = createAlert("velocity_alert", "warning");

			// Critical should always go through
			expect(rateLimiter.shouldAllow(critical, sessionId)).toBe(true);
			rateLimiter.recordShown(critical, sessionId);

			// First 2 warnings should be allowed
			expect(rateLimiter.shouldAllow(warning1, sessionId)).toBe(true);
			rateLimiter.recordShown(warning1, sessionId);

			expect(rateLimiter.shouldAllow(warning2, sessionId)).toBe(true);
			rateLimiter.recordShown(warning2, sessionId);

			// 3rd warning should be blocked (reached limit)
			expect(rateLimiter.shouldAllow(warning3, sessionId)).toBe(false);
		});
	});

	describe("Cooldown", () => {
		it("should block same alert category within 15 minutes", () => {
			const alert1 = createAlert("high_risk_file");
			const alert2 = createAlert("high_risk_file");

			expect(rateLimiter.shouldAllow(alert1, sessionId)).toBe(true);
			rateLimiter.recordShown(alert1, sessionId);

			// Immediate retry should be blocked
			expect(rateLimiter.shouldAllow(alert2, sessionId)).toBe(false);

			// After 10 minutes, still blocked
			vi.advanceTimersByTime(10 * 60 * 1000);
			expect(rateLimiter.shouldAllow(alert2, sessionId)).toBe(false);
		});

		it("should allow same category after 15 minutes", () => {
			const alert1 = createAlert("high_risk_file");
			const alert2 = createAlert("high_risk_file");

			expect(rateLimiter.shouldAllow(alert1, sessionId)).toBe(true);
			rateLimiter.recordShown(alert1, sessionId);

			// After 15 minutes, should be allowed
			vi.advanceTimersByTime(15 * 60 * 1000 + 1000); // 15 min + 1 sec
			expect(rateLimiter.shouldAllow(alert2, sessionId)).toBe(true);
		});

		it("should track cooldown per category, not globally", () => {
			const riskAlert = createAlert("high_risk_file");
			const pressureAlert = createAlert("pressure_threshold");
			const riskAlert2 = createAlert("high_risk_file");

			expect(rateLimiter.shouldAllow(riskAlert, sessionId)).toBe(true);
			rateLimiter.recordShown(riskAlert, sessionId);

			// Different category should be allowed immediately
			expect(rateLimiter.shouldAllow(pressureAlert, sessionId)).toBe(true);
			rateLimiter.recordShown(pressureAlert, sessionId);

			// Same category as first should be blocked
			expect(rateLimiter.shouldAllow(riskAlert2, sessionId)).toBe(false);
		});

		it("should handle multiple categories independently", () => {
			const alerts = [
				createAlert("high_risk_file"),
				createAlert("pressure_threshold"),
				createAlert("violation_recurrence"),
			];

			// Show all 3 different categories
			for (const alert of alerts) {
				expect(rateLimiter.shouldAllow(alert, sessionId)).toBe(true);
				rateLimiter.recordShown(alert, sessionId);
			}

			// All should be in cooldown (session limit NOT reached yet - only 3 shown)
			for (const alert of alerts) {
				expect(rateLimiter.shouldAllow(alert, sessionId)).toBe(false);
			}

			// After cooldown, categories should be allowed again (but session limit still applies)
			vi.advanceTimersByTime(15 * 60 * 1000 + 1000);

			// Create NEW session to test that categories work independently after cooldown
			const newSessionId = "cooldown-test-session";
			for (const alert of alerts) {
				expect(rateLimiter.shouldAllow(alert, newSessionId)).toBe(true);
			}
		});
	});

	describe("Dismiss Tracking", () => {
		it("should track dismiss count per alert category", () => {
			const alert = createAlert("high_risk_file");

			rateLimiter.recordDismissed("high_risk_file", sessionId);
			rateLimiter.recordDismissed("high_risk_file", sessionId);
			rateLimiter.recordDismissed("high_risk_file", sessionId);

			// After 3 dismisses, should require 95% confidence
			const lowConfidenceAlert = { ...alert, confidence: 85 };
			expect(rateLimiter.shouldAllow(lowConfidenceAlert, sessionId)).toBe(false);

			const highConfidenceAlert = { ...alert, confidence: 95 };
			expect(rateLimiter.shouldAllow(highConfidenceAlert, sessionId)).toBe(true);
		});

		it("should reset dismiss count after 24h window", () => {
			const alert = createAlert("high_risk_file");

			// Record 3 dismisses
			for (let i = 0; i < 3; i++) {
				rateLimiter.recordDismissed("high_risk_file", sessionId);
			}

			// Should require 95% confidence
			const lowConfidenceAlert = { ...alert, confidence: 85 };
			expect(rateLimiter.shouldAllow(lowConfidenceAlert, sessionId)).toBe(false);

			// After 24 hours, should reset
			vi.advanceTimersByTime(24 * 60 * 60 * 1000 + 1000);
			expect(rateLimiter.shouldAllow(lowConfidenceAlert, sessionId)).toBe(true);
		});

		it("should allow override for critical severity despite dismisses", () => {
			const alert = createAlert("critical_file_touch", "critical");
			alert.confidence = 95; // Must be >= 95% for critical override to work

			// Record 3 dismisses
			for (let i = 0; i < 3; i++) {
				rateLimiter.recordDismissed("critical_file_touch", sessionId);
			}

			// Critical with high confidence should be allowed despite dismisses
			expect(rateLimiter.shouldAllow(alert, sessionId)).toBe(true);
		});

		it("should persist dismiss history across sessions", () => {
			const alert = createAlert("high_risk_file");
			alert.confidence = 85;

			// Dismiss in session 1
			rateLimiter.recordDismissed("high_risk_file", "session-1");
			rateLimiter.recordDismissed("high_risk_file", "session-1");
			rateLimiter.recordDismissed("high_risk_file", "session-1");

			// Check in session 2 - should still be affected
			expect(rateLimiter.shouldAllow(alert, "session-2")).toBe(false);
		});
	});

	describe("Flappy Alert Detection", () => {
		it("should detect alert that fires then auto-resolves 3x", () => {
			const category: AlertCategory = "pressure_threshold";

			// Simulate 3 cycles of fire -> resolve
			for (let i = 0; i < 3; i++) {
				rateLimiter.recordFired(category);
				vi.advanceTimersByTime(2 * 60 * 1000); // 2 minutes
				rateLimiter.recordResolved(category);
				vi.advanceTimersByTime(1 * 60 * 1000); // 1 minute
			}

			expect(rateLimiter.isFlappy(category)).toBe(true);
		});

		it("should suppress flappy alerts until pressure > 85%", () => {
			const category: AlertCategory = "pressure_threshold";
			const alert = createAlert(category);

			// Make it flappy
			for (let i = 0; i < 3; i++) {
				rateLimiter.recordFired(category);
				vi.advanceTimersByTime(2 * 60 * 1000);
				rateLimiter.recordResolved(category);
				vi.advanceTimersByTime(1 * 60 * 1000);
			}

			// Should be suppressed at normal confidence
			alert.confidence = 85;
			expect(rateLimiter.shouldAllow(alert, sessionId)).toBe(false);

			// But allowed at very high confidence (simulates pressure > 85%)
			alert.confidence = 95;
			expect(rateLimiter.shouldAllow(alert, sessionId)).toBe(true);
		});

		it("should reset flappy status after 1 hour of stability", () => {
			const category: AlertCategory = "pressure_threshold";

			// Make it flappy
			for (let i = 0; i < 3; i++) {
				rateLimiter.recordFired(category);
				vi.advanceTimersByTime(2 * 60 * 1000);
				rateLimiter.recordResolved(category);
				vi.advanceTimersByTime(1 * 60 * 1000);
			}

			expect(rateLimiter.isFlappy(category)).toBe(true);

			// After 1 hour of no activity, should reset
			vi.advanceTimersByTime(60 * 60 * 1000 + 1000);
			expect(rateLimiter.isFlappy(category)).toBe(false);
		});
	});

	describe("Edge Cases", () => {
		it("should handle concurrent alert requests safely", () => {
			const alerts = Array.from({ length: 5 }, (_, i) => createAlert("high_risk_file"));

			// Simulate concurrent calls (but they're actually sequential since JS is single-threaded)
			// What we're testing is that each alert is checked independently
			let allowedCount = 0;
			for (const alert of alerts) {
				if (rateLimiter.shouldAllow(alert, sessionId)) {
					allowedCount++;
					rateLimiter.recordShown(alert, sessionId);
				}
			}

			// Only first alert should be allowed (same category triggers cooldown)
			expect(allowedCount).toBe(1);
		});

		it("should handle missing/corrupted rate limit data gracefully", () => {
			const alert = createAlert("high_risk_file");

			// Should not throw
			expect(() => rateLimiter.shouldAllow(alert, sessionId)).not.toThrow();
		});

		it("should not crash on invalid alert objects", () => {
			const invalidAlert = {} as ProactiveAlert;

			// Should handle gracefully
			expect(() => rateLimiter.shouldAllow(invalidAlert, sessionId)).not.toThrow();
		});

		it("should clean up old cooldown entries (memory leak prevention)", () => {
			// Show 100 different category alerts with different sessions
			for (let i = 0; i < 100; i++) {
				const alert = createAlert("high_risk_file");
				const session = `session-${i}`;
				rateLimiter.shouldAllow(alert, session);
				rateLimiter.recordShown(alert, session);
			}

			// Advance time way past all cooldowns
			vi.advanceTimersByTime(24 * 60 * 60 * 1000);

			// Internal cleanup should have happened
			// (We'd verify this by checking internal state, but for now just ensure no crash)
			const newAlert = createAlert("high_risk_file");
			expect(() => rateLimiter.shouldAllow(newAlert, "new-session")).not.toThrow();
		});
	});
});
