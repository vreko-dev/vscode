/**
 * Branding Consistency Tests
 *
 * These tests validate cross-module alignment and ensure
 * all UI components use the centralized signage system consistently.
 */

import { describe, expect, it } from "vitest";
import {
	ANIMATION_FRAMES,
	BRAND_SIGNAGE,
	CORE_CONCEPT_SIGNAGE,
	EVENT_TYPE_SIGNAGE,
	FILE_HEALTH_DECORATIONS,
	icon,
	PROTECTION_LEVEL_SIGNAGE,
	PULSE_LEVEL_SIGNAGE,
	QUICKPICK_ICONS,
	REPO_STATUS_SIGNAGE,
	SESSION_HEALTH_SIGNAGE,
	SNAPSHOT_ORIGIN_SIGNAGE,
	STATUS_BAR_TEXT,
	STATUS_SIGNAGE,
	TEMPERATURE_LEVEL_SIGNAGE,
	TRAJECTORY_SIGNAGE,
} from "../../../src/signage";

describe("Branding Consistency", () => {
	describe("BRAND_SIGNAGE", () => {
		it("should have logo field with cap emoji", () => {
			expect(BRAND_SIGNAGE.logo).toBe("🦎");
		});

		it("should have correct labels", () => {
			expect(BRAND_SIGNAGE.shortLabel).toBe("Vreko");
			expect(BRAND_SIGNAGE.fullLabel).toBe("Vreko Protection");
		});
	});

	describe("PROTECTION_LEVEL_SIGNAGE", () => {
		it("should have all three protection levels", () => {
			expect(PROTECTION_LEVEL_SIGNAGE.watch).toBeDefined();
			expect(PROTECTION_LEVEL_SIGNAGE.warn).toBeDefined();
			expect(PROTECTION_LEVEL_SIGNAGE.block).toBeDefined();
		});

		it("should use icon field for all levels", () => {
			expect(PROTECTION_LEVEL_SIGNAGE.watch.icon).toBe("🟢");
			expect(PROTECTION_LEVEL_SIGNAGE.warn.icon).toBe("🟡");
			expect(PROTECTION_LEVEL_SIGNAGE.block.icon).toBe("🔴");
		});

		it("should have consistent color values", () => {
			expect(PROTECTION_LEVEL_SIGNAGE.watch.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
			expect(PROTECTION_LEVEL_SIGNAGE.warn.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
			expect(PROTECTION_LEVEL_SIGNAGE.block.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
		});
	});

	describe("SNAPSHOT_ORIGIN_SIGNAGE", () => {
		it("should have all origin types", () => {
			const origins = ["aiDetected", "automated", "interactive", "preRestore"] as const;
			for (const origin of origins) {
				expect(SNAPSHOT_ORIGIN_SIGNAGE[origin]).toBeDefined();
				expect(SNAPSHOT_ORIGIN_SIGNAGE[origin].icon).toBeDefined();
				expect(SNAPSHOT_ORIGIN_SIGNAGE[origin].label).toBeDefined();
			}
		});

		it("should use correct icons", () => {
			expect(SNAPSHOT_ORIGIN_SIGNAGE.aiDetected.icon).toBe("🤖");
			expect(SNAPSHOT_ORIGIN_SIGNAGE.automated.icon).toBe("⚡");
			expect(SNAPSHOT_ORIGIN_SIGNAGE.interactive.icon).toBe("📸");
			expect(SNAPSHOT_ORIGIN_SIGNAGE.preRestore.icon).toBe("⏪");
		});
	});

	describe("EVENT_TYPE_SIGNAGE", () => {
		it("should have all event types", () => {
			const events = ["aiEdit", "manualSnapshot", "autoSnapshot", "restore", "configChange"] as const;
			for (const event of events) {
				expect(EVENT_TYPE_SIGNAGE[event]).toBeDefined();
				expect(EVENT_TYPE_SIGNAGE[event].icon).toBeDefined();
			}
		});

		it("should use correct icons", () => {
			expect(EVENT_TYPE_SIGNAGE.aiEdit.icon).toBe("✨");
			expect(EVENT_TYPE_SIGNAGE.restore.icon).toBe("↩️");
		});
	});

	describe("STATUS_SIGNAGE", () => {
		it("should have all status types", () => {
			const statuses = ["success", "warning", "error", "info", "sync", "clock"] as const;
			for (const status of statuses) {
				expect(STATUS_SIGNAGE[status]).toBeDefined();
				expect(STATUS_SIGNAGE[status].icon).toBeDefined();
			}
		});

		it("should use correct icons", () => {
			expect(STATUS_SIGNAGE.success.icon).toBe("✅");
			expect(STATUS_SIGNAGE.warning.icon).toBe("⚠️");
			expect(STATUS_SIGNAGE.error.icon).toBe("❌");
		});
	});

	describe("QUICKPICK_ICONS", () => {
		it("should have navigation icons", () => {
			expect(QUICKPICK_ICONS.folder).toBeDefined();
			expect(QUICKPICK_ICONS.file).toBeDefined();
			expect(QUICKPICK_ICONS.gear).toBeDefined();
		});

		it("should have protection icons", () => {
			expect(QUICKPICK_ICONS.shield).toBe("🛡️");
			expect(QUICKPICK_ICONS.lock).toBe("🔒");
			expect(QUICKPICK_ICONS.eye).toBe("👁️");
		});

		it("should have AI/activity icons", () => {
			expect(QUICKPICK_ICONS.sparkle).toBe("✨");
			expect(QUICKPICK_ICONS.robot).toBe("🤖");
			expect(QUICKPICK_ICONS.zap).toBe("⚡");
		});
	});

	describe("icon() helper", () => {
		it("should return correct icon for valid keys", () => {
			expect(icon("shield")).toBe("🛡️");
			expect(icon("check")).toBe("✅");
			expect(icon("error")).toBe("❌");
		});
	});

	describe("ANIMATION_FRAMES", () => {
		it("should have animation sequences", () => {
			expect(Array.isArray(ANIMATION_FRAMES.spinner)).toBe(true);
			expect(Array.isArray(ANIMATION_FRAMES.dots)).toBe(true);
			expect(Array.isArray(ANIMATION_FRAMES.pulse)).toBe(true);
		});

		it("should have at least 3 frames per animation", () => {
			expect(ANIMATION_FRAMES.spinner.length).toBeGreaterThanOrEqual(3);
			expect(ANIMATION_FRAMES.dots.length).toBeGreaterThanOrEqual(3);
		});
	});

	describe("STATUS_BAR_TEXT", () => {
		it("should generate idle text with brand logo", () => {
			expect(STATUS_BAR_TEXT.idle).toContain("🦎");
			expect(STATUS_BAR_TEXT.idle).toContain("Vreko");
		});

		it("should generate checkpoint text with success icon", () => {
			expect(STATUS_BAR_TEXT.checkpoint).toContain("✅");
		});

		it("should generate dynamic text correctly", () => {
			const stats = STATUS_BAR_TEXT.idleWithStats(5);
			expect(stats).toContain("🦎");
			expect(stats).toContain("5 snapshots today");

			const aiSession = STATUS_BAR_TEXT.aiSession("Cursor");
			expect(aiSession).toContain("✨");
			expect(aiSession).toContain("Cursor");
		});
	});

	describe("Cross-module consistency", () => {
		it("should have matching icons across related signage", () => {
			// FILE_HEALTH_DECORATIONS.warning should match STATUS_SIGNAGE.warning
			expect(FILE_HEALTH_DECORATIONS.warning.icon).toBe(STATUS_SIGNAGE.warning.icon);
		});

		it("should use icon field consistently (not emoji)", () => {
			// All signage should use 'icon' field
			expect("icon" in PROTECTION_LEVEL_SIGNAGE.watch).toBe(true);
			expect("icon" in SESSION_HEALTH_SIGNAGE.healthy).toBe(true);
			expect("icon" in PULSE_LEVEL_SIGNAGE.steady).toBe(true);
			expect("icon" in TEMPERATURE_LEVEL_SIGNAGE.cool).toBe(true);
			expect("icon" in TRAJECTORY_SIGNAGE.stable).toBe(true);
			expect("icon" in CORE_CONCEPT_SIGNAGE.snapshot).toBe(true);
			expect("icon" in REPO_STATUS_SIGNAGE.protected).toBe(true);
		});
	});
});
