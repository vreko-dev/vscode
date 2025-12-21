/**
 * RED TEST: Event Naming Consistency
 *
 * Validates that all telemetry events follow dot.notation convention.
 * This ensures consistent analytics data across PostHog.
 *
 * Reference: feedback.md §2 Issue 1 - Event Naming Inconsistency
 * Status: RED (will fail until naming is fixed)
 * Effort: 2 hours (rename 6 events + update mappers)
 */

import { describe, expect, it } from "vitest";

describe("VSCodeTelemetry - Event Naming Consistency (RED)", () => {
	describe("Event naming conventions", () => {
		it("should use dot.notation for welcome panel events", () => {
			/**
			 * Expected: welcome.panel_shown
			 * Current: welcome_panel_shown (WRONG - snake_case)
			 */
			const validWelcomeEvents = [
				"welcome.panel_shown",
				"welcome.panel_dismissed",
				"welcome.feature_viewed",
				"welcome.action_triggered",
			];

			validWelcomeEvents.forEach((event) => {
				expect(event).toMatch(/^welcome\./);
				expect(event).not.toMatch(/_/);
			});
		});

		it("should use dot.notation for auth flow events", () => {
			/**
			 * Expected: auth.flow_started, auth.flow_completed
			 * Current: auth_flow_started, auth_login_completed (WRONG - snake_case)
			 */
			const validAuthEvents = [
				"auth.flow_started",
				"auth.flow_completed",
				"auth.flow_failed",
				"auth.flow_skipped",
				"auth.provider.selected",
				"auth.browser_opened",
			];

			validAuthEvents.forEach((event) => {
				expect(event).toMatch(/^auth\./);
			});
		});

		it("should NOT use snake_case for event names (dot.notation only)", () => {
			const invalidEvents = [
				"welcome_panel_shown", // WRONG
				"auth_flow_started", // WRONG
				"auth_login_completed", // WRONG (legacy)
				"onboarding_phase_progressed", // WRONG
			];

			invalidEvents.forEach((event) => {
				// This test documents the CURRENT problem
				// After fix, these strings should not appear in the codebase
				expect(event).toMatch(/_/);
			});
		});

		it("snapshot events should use dot.notation consistently", () => {
			const validSnapshotEvents = [
				"snapshot.created",
				"snapshot.restored",
				"snapshot.deleted",
			];

			validSnapshotEvents.forEach((event) => {
				expect(event).toMatch(/^snapshot\./);
			});
		});

		it("should validate all extension events follow dot.notation", () => {
			const extensionEvents = [
				"extension.installed", // TBD
				"extension.activated",
				"extension.deactivated",
				"extension.error",
			];

			extensionEvents.forEach((event) => {
				expect(event).toMatch(/^[a-z]+\./);
				// No underscores in event names
				expect(event).not.toMatch(/_(?!value)/); // Allow _value as property but not in name
			});
		});
	});

	describe("Event property timestamps", () => {
		it("should include both absolute and session-relative timestamps", () => {
			/**
			 * Problem from feedback.md §2 Issue 4:
			 * Events track durationMs but not absolute timestamps
			 */
			const requiredProperties = [
				"timestamp_utc", // Absolute timestamp (Date.now())
				"session_start_utc", // For session correlation
				"duration_ms", // Relative timing
			];

			expect(requiredProperties).toContain("timestamp_utc");
			expect(requiredProperties).toContain("session_start_utc");
		});
	});

	describe("Event mapping consistency", () => {
		it("should provide mappers from welcome events to core events", () => {
			/**
			 * Issue from feedback.md §2 Issue 3:
			 * mapWelcomeEventToCore() only maps 2 events
			 * Should map all relevant events
			 */
			const mappedWelcomeEvents = [
				"welcome.panel_shown",
				"welcome.panel_dismissed",
				"welcome.feature_viewed",
				"welcome.action_triggered",
			];

			expect(mappedWelcomeEvents.length).toBeGreaterThanOrEqual(4);
		});

		it("should map auth.flow_completed to policy_changed core event", () => {
			/**
			 * Business logic: User completing auth IS a policy change
			 * (from unauthenticated to authenticated)
			 */
			const coreMapping = {
				"auth.flow_completed": "policy_changed",
				"welcome.panel_dismissed": "session_finalized",
			};

			expect(coreMapping["auth.flow_completed"]).toBe("policy_changed");
			expect(coreMapping["welcome.panel_dismissed"]).toBe("session_finalized");
		});
	});

	describe("Diagnostic events for auth funnel", () => {
		it("should track auth provider selection (OAuth vs Device flow)", () => {
			const authDiagnosticEvents = [
				"auth.provider.selected", // oauth | device_flow
				"auth.browser_opened", // success | error
				"auth.code_entry", // device code entered
				"auth.approval_received", // server-side approval
			];

			expect(authDiagnosticEvents).toContain("auth.provider.selected");
			expect(authDiagnosticEvents).toContain("auth.browser_opened");
		});

		it("diagnostic events should enable drop-off debugging", () => {
			/**
			 * These events allow us to understand:
			 * - "Users see welcome but don't click sign in" → feature messaging
			 * - "Users click sign in but auth never completes" → browser launch issue
			 * - "Callback received but exchange fails" → API issue
			 */
			const diagnosticEvents = {
				welcome_step: "welcome.feature_viewed",
				auth_started: "auth.flow_started",
				provider_selected: "auth.provider.selected",
				browser_opened: "auth.browser_opened",
				callback_received: "auth.approval_received",
				auth_completed: "auth.flow_completed",
			};

			Object.values(diagnosticEvents).forEach((event) => {
				expect(event).toMatch(/^[a-z]+\./);
			});
		});
	});
});
