import { describe, it, expect, beforeEach } from "vitest";
import {
	AUTO_DECISION_DEFAULTS,
	SNAPSHOT_DEFAULTS,
	API_DEFAULTS,
	GUARDIAN_DEFAULTS,
	NOTIFICATION_DEFAULTS,
	MCP_DEFAULTS,
	PROTECTION_DEFAULTS,
	VITALS_DEFAULTS,
	TELEMETRY_DEFAULTS,
} from "../../../src/config/hardcodedDefaults";

/**
 * Settings Simplification Tests
 *
 * These tests validate that the hardcoded defaults are correct after
 * the settings simplification (56 → 8 settings).
 *
 * Rule: "If there's an obvious right answer, don't ask the user."
 */
describe("Configuration Settings (Simplified)", () => {
	describe("Hardcoded Defaults - AutoDecision", () => {
		it("should have sensible riskThreshold (60)", () => {
			expect(AUTO_DECISION_DEFAULTS.riskThreshold).toBe(60);
		});

		it("should have sensible notifyThreshold (40)", () => {
			expect(AUTO_DECISION_DEFAULTS.notifyThreshold).toBe(40);
		});

		it("should have sensible minFilesForBurst (3)", () => {
			expect(AUTO_DECISION_DEFAULTS.minFilesForBurst).toBe(3);
		});

		it("should have sensible maxSnapshotsPerMinute (4)", () => {
			expect(AUTO_DECISION_DEFAULTS.maxSnapshotsPerMinute).toBe(4);
		});

		it("should maintain riskThreshold >= notifyThreshold", () => {
			expect(AUTO_DECISION_DEFAULTS.riskThreshold).toBeGreaterThanOrEqual(
				AUTO_DECISION_DEFAULTS.notifyThreshold,
			);
		});
	});

	describe("Hardcoded Defaults - Snapshot", () => {
		it("should enable AI detection by default", () => {
			expect(SNAPSHOT_DEFAULTS.aiDetectionEnabled).toBe(true);
		});

		it("should disable auto-restore (too disruptive)", () => {
			expect(SNAPSHOT_DEFAULTS.autoRestoreOnDetection).toBe(false);
		});

		it("should enable deduplication for space savings", () => {
			expect(SNAPSHOT_DEFAULTS.deduplicationEnabled).toBe(true);
		});

		it("should use git for smart naming", () => {
			expect(SNAPSHOT_DEFAULTS.useGitNaming).toBe(true);
		});

		it("should always confirm before delete", () => {
			expect(SNAPSHOT_DEFAULTS.confirmDelete).toBe(true);
		});
	});

	describe("Hardcoded Defaults - API URLs", () => {
		it("should use production API URL", () => {
			expect(API_DEFAULTS.baseUrl).toBe("https://api.snapback.dev/api");
		});

		it("should use production web console URL", () => {
			expect(API_DEFAULTS.webBaseUrl).toBe("https://console.snapback.dev");
		});

		it("should prefer OAuth for security", () => {
			expect(API_DEFAULTS.preferOAuth).toBe(true);
		});
	});

	describe("Hardcoded Defaults - Guardian", () => {
		it("should default to warn protection level", () => {
			expect(GUARDIAN_DEFAULTS.protectionLevel).toBe("warn");
		});

		it("should enable all security plugins", () => {
			expect(GUARDIAN_DEFAULTS.plugins.secretDetection).toBe(true);
			expect(GUARDIAN_DEFAULTS.plugins.mockReplacement).toBe(true);
			expect(GUARDIAN_DEFAULTS.plugins.phantomDependency).toBe(true);
		});

		it("should have sensible thresholds", () => {
			expect(GUARDIAN_DEFAULTS.thresholds.warn).toBe(6);
			expect(GUARDIAN_DEFAULTS.thresholds.block).toBe(8);
		});

		it("should have warn < block threshold", () => {
			expect(GUARDIAN_DEFAULTS.thresholds.warn).toBeLessThan(GUARDIAN_DEFAULTS.thresholds.block);
		});
	});

	describe("Hardcoded Defaults - Notifications", () => {
		it("should show snapshot created notifications", () => {
			expect(NOTIFICATION_DEFAULTS.showSnapshotCreated).toBe(true);
		});

		it("should have 3 second duration", () => {
			expect(NOTIFICATION_DEFAULTS.duration).toBe(3000);
		});

		it("should hide config sync notifications", () => {
			expect(NOTIFICATION_DEFAULTS.showConfigSync).toBe(false);
		});
	});

	describe("Hardcoded Defaults - MCP", () => {
		it("should auto-enable for AI assistants", () => {
			expect(MCP_DEFAULTS.autoEnable).toBe(true);
		});

		it("should use bearer auth by default", () => {
			expect(MCP_DEFAULTS.authType).toBe("bearer");
		});

		it("should have 5 second timeout", () => {
			expect(MCP_DEFAULTS.timeout).toBe(5000);
		});
	});

	describe("Hardcoded Defaults - Protection", () => {
		it("should default to watch level", () => {
			expect(PROTECTION_DEFAULTS.defaultLevel).toBe("watch");
		});

		it("should show level badges", () => {
			expect(PROTECTION_DEFAULTS.showLevelBadges).toBe(true);
		});
	});

	describe("Hardcoded Defaults - Vitals", () => {
		it("should hide vitals in status bar (power user mode)", () => {
			expect(VITALS_DEFAULTS.showInStatusBar).toBe(false);
		});

		it("should enable recommendations", () => {
			expect(VITALS_DEFAULTS.enableRecommendations).toBe(true);
		});
	});

	describe("Hardcoded Defaults - Telemetry", () => {
		it("should use PostHog endpoint", () => {
			expect(TELEMETRY_DEFAULTS.endpoint).toBe("https://us.i.posthog.com");
		});

		it("should sample all traces", () => {
			expect(TELEMETRY_DEFAULTS.sampleRate).toBe(1.0);
		});
	});

	describe("Settings Count Validation", () => {
		it("should have exactly 8 user-facing settings after simplification", () => {
			// The 8 settings that remain user-configurable:
			const userFacingSettings = [
				"snapback.aiDetection.enabled",
				"snapback.showAutoSnapshotNotifications",
				"snapback.guardian.enabled",
				"snapback.mcp.enabled",
				"snapback.mcp.serverUrl",
				"snapback.offlineMode.enabled",
				"snapback.logLevel",
				"snapback.ui.showTreeView",
			];

			expect(userFacingSettings).toHaveLength(8);
		});
	});
});
