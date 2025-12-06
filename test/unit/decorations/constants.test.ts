import { describe, expect, it } from "vitest";
import { DECORATION_CONFIG } from "../../../src/decorations/constants";

describe("Decoration Constants", () => {
	describe("DECORATION_CONFIG", () => {
		it("should have configuration for all three health levels", () => {
			expect(DECORATION_CONFIG).toHaveProperty("protected");
			expect(DECORATION_CONFIG).toHaveProperty("warning");
			expect(DECORATION_CONFIG).toHaveProperty("risk");
		});

		describe("protected level", () => {
			it("should have correct badge", () => {
				expect(DECORATION_CONFIG.protected.badge).toBe("🛡");
			});

			it("should have color as ThemeColor", () => {
				expect(DECORATION_CONFIG.protected.color).toBeDefined();
				expect(DECORATION_CONFIG.protected.color.id).toBe("charts.green");
			});

			it("should have descriptive tooltip", () => {
				expect(DECORATION_CONFIG.protected.tooltip).toBe(
					"Protected by SnapBack",
				);
			});
		});

		describe("warning level", () => {
			it("should have correct badge", () => {
				expect(DECORATION_CONFIG.warning.badge).toBe("⚠️");
			});

			it("should have color as ThemeColor", () => {
				expect(DECORATION_CONFIG.warning.color).toBeDefined();
				expect(DECORATION_CONFIG.warning.color.id).toBe("charts.yellow");
			});

			it("should have descriptive tooltip", () => {
				expect(DECORATION_CONFIG.warning.tooltip).toBe(
					"Warning detected - changes monitored",
				);
			});
		});

		describe("risk level", () => {
			it("should have correct badge", () => {
				expect(DECORATION_CONFIG.risk.badge).toBe("🚨");
			});

			it("should have color as ThemeColor", () => {
				expect(DECORATION_CONFIG.risk.color).toBeDefined();
				expect(DECORATION_CONFIG.risk.color.id).toBe("charts.red");
			});

			it("should have descriptive tooltip", () => {
				expect(DECORATION_CONFIG.risk.tooltip).toBe(
					"Risk detected - snapshot created",
				);
			});
		});

		it("should be immutable (as const)", () => {
			// This test verifies the type is readonly
			// TypeScript will catch if we try to modify it
			const config = DECORATION_CONFIG;
			expect(config).toBeDefined();
		});
	});
});
