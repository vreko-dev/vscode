/**
 * Unit tests for unified constants (icons, colors, commands)
 * Following TDD approach: RED -> GREEN -> REFACTOR
 */

import { describe, expect, it } from "vitest";

describe("Unified Constants", () => {
	describe("SNAPBACK_ICONS", () => {
		it("should export SNAPBACK_ICONS constant", async () => {
			const { SNAPBACK_ICONS } = await import("../../src/constants/icons");
			expect(SNAPBACK_ICONS).toBeDefined();
		});

		it("should have PROTECTION category with all levels", async () => {
			const { SNAPBACK_ICONS } = await import("../../src/constants/icons");
			expect(SNAPBACK_ICONS.PROTECTION).toBeDefined();
			expect(SNAPBACK_ICONS.PROTECTION.WATCH).toBe("👁️");
			expect(SNAPBACK_ICONS.PROTECTION.WARN).toBe("⚠️");
			expect(SNAPBACK_ICONS.PROTECTION.BLOCK).toBe("🛑");
		});

		it("should have HEALTH category with all states", async () => {
			const { SNAPBACK_ICONS } = await import("../../src/constants/icons");
			expect(SNAPBACK_ICONS.HEALTH).toBeDefined();
			expect(SNAPBACK_ICONS.HEALTH.PROTECTED).toBe("🛡️");
			expect(SNAPBACK_ICONS.HEALTH.AT_RISK).toBe("⚠️");
			expect(SNAPBACK_ICONS.HEALTH.CRITICAL).toBe("🚨");
		});

		it("should have STATUS category with operation states", async () => {
			const { SNAPBACK_ICONS } = await import("../../src/constants/icons");
			expect(SNAPBACK_ICONS.STATUS).toBeDefined();
			expect(SNAPBACK_ICONS.STATUS.SUCCESS).toBe("✅");
			expect(SNAPBACK_ICONS.STATUS.IN_PROGRESS).toBe("⏳");
			expect(SNAPBACK_ICONS.STATUS.FAILED).toBe("❌");
		});

		it("should have AI category", async () => {
			const { SNAPBACK_ICONS } = await import("../../src/constants/icons");
			expect(SNAPBACK_ICONS.AI).toBeDefined();
			expect(SNAPBACK_ICONS.AI.DETECTED).toBe("🤖");
			expect(SNAPBACK_ICONS.AI.TOOL).toBe("✨");
		});

		it("should have SNAPSHOT category", async () => {
			const { SNAPBACK_ICONS } = await import("../../src/constants/icons");
			expect(SNAPBACK_ICONS.SNAPSHOT).toBeDefined();
			expect(SNAPBACK_ICONS.SNAPSHOT.CAMERA).toBe("📷");
			expect(SNAPBACK_ICONS.SNAPSHOT.RESTORE).toBe("↩️");
			expect(SNAPBACK_ICONS.SNAPSHOT.SESSION).toBe("📁");
		});

		it("should have UI category", async () => {
			const { SNAPBACK_ICONS } = await import("../../src/constants/icons");
			expect(SNAPBACK_ICONS.UI).toBeDefined();
			expect(SNAPBACK_ICONS.UI.SETTINGS).toBe("⚙️");
			expect(SNAPBACK_ICONS.UI.REFRESH).toBe("🔄");
			expect(SNAPBACK_ICONS.UI.HELP).toBe("❓");
			expect(SNAPBACK_ICONS.UI.ADD).toBe("➕");
			expect(SNAPBACK_ICONS.UI.OVERVIEW).toBe("📊");
		});

		it("should be const-asserted (TypeScript compile-time check)", async () => {
			const { SNAPBACK_ICONS } = await import("../../src/constants/icons");
			// This is a TypeScript compile-time check, verified by TypeScript compiler
			// Runtime immutability is not guaranteed by 'as const'
			expect(SNAPBACK_ICONS).toBeDefined();
			expect(Object.isFrozen(SNAPBACK_ICONS)).toBe(false); // as const doesn't freeze objects
		});
	});

	describe("SNAPBACK_COLORS", () => {
		it("should export SNAPBACK_COLORS constant", async () => {
			const { SNAPBACK_COLORS } = await import("../../src/constants/colors");
			expect(SNAPBACK_COLORS).toBeDefined();
		});

		it("should use ThemeColor for protection levels", async () => {
			const { SNAPBACK_COLORS } = await import("../../src/constants/colors");
			// ThemeColor is mocked in test environment, check for the structure
			expect(SNAPBACK_COLORS.watch).toBeDefined();
			expect(SNAPBACK_COLORS.warn).toBeDefined();
			expect(SNAPBACK_COLORS.block).toBeDefined();
		});

		it("should use ThemeColor for health status", async () => {
			const { SNAPBACK_COLORS } = await import("../../src/constants/colors");
			// ThemeColor is mocked in test environment, check for the structure
			expect(SNAPBACK_COLORS.healthy).toBeDefined();
			expect(SNAPBACK_COLORS.atRisk).toBeDefined();
			expect(SNAPBACK_COLORS.critical).toBeDefined();
		});

		it("should use ThemeColor for AI detection", async () => {
			const { SNAPBACK_COLORS } = await import("../../src/constants/colors");
			// ThemeColor is mocked in test environment, check for the structure
			expect(SNAPBACK_COLORS.aiDetected).toBeDefined();
		});

		it("should use ThemeColor for operations", async () => {
			const { SNAPBACK_COLORS } = await import("../../src/constants/colors");
			// ThemeColor is mocked in test environment, check for the structure
			expect(SNAPBACK_COLORS.success).toBeDefined();
			expect(SNAPBACK_COLORS.inProgress).toBeDefined();
			expect(SNAPBACK_COLORS.error).toBeDefined();
		});

		it("should export STATUS_BAR_COLORS with string values", async () => {
			const { STATUS_BAR_COLORS } = await import("../../src/constants/colors");
			expect(STATUS_BAR_COLORS).toBeDefined();
			expect(STATUS_BAR_COLORS.normal).toBeUndefined();
			expect(STATUS_BAR_COLORS.warning).toBe("statusBarItem.warningBackground");
			expect(STATUS_BAR_COLORS.error).toBe("statusBarItem.errorBackground");
		});
	});

	describe("COMMANDS", () => {
		it("should export COMMANDS constant", async () => {
			const { COMMANDS } = await import("../../src/constants/commands");
			expect(COMMANDS).toBeDefined();
		});

		it("should have PROTECTION category", async () => {
			const { COMMANDS } = await import("../../src/constants/commands");
			expect(COMMANDS.PROTECTION).toBeDefined();
			expect(COMMANDS.PROTECTION.SET_LEVEL).toBe(
				"snapback.protection.setLevel",
			);
			expect(COMMANDS.PROTECTION.SET_WATCH).toBe("snapback.protection.watch");
			expect(COMMANDS.PROTECTION.SET_WARN).toBe("snapback.protection.warn");
			expect(COMMANDS.PROTECTION.SET_BLOCK).toBe("snapback.protection.block");
			expect(COMMANDS.PROTECTION.REMOVE).toBe("snapback.protection.remove");
			expect(COMMANDS.PROTECTION.PROTECT_WORKSPACE).toBe(
				"snapback.protection.workspace",
			);
			expect(COMMANDS.PROTECTION.PROTECT_FOLDER).toBe(
				"snapback.protection.folder",
			);
		});

		it("should have SNAPSHOT category", async () => {
			const { COMMANDS } = await import("../../src/constants/commands");
			expect(COMMANDS.SNAPSHOT).toBeDefined();
			expect(COMMANDS.SNAPSHOT.CREATE).toBe("snapback.snapshot.create");
			expect(COMMANDS.SNAPSHOT.LIST).toBe("snapback.snapshot.list");
			expect(COMMANDS.SNAPSHOT.COMPARE).toBe("snapback.snapshot.compare");
			expect(COMMANDS.SNAPSHOT.RESTORE).toBe("snapback.snapshot.restore");
			expect(COMMANDS.SNAPSHOT.DELETE).toBe("snapback.snapshot.delete");
		});

		it("should have SESSION category", async () => {
			const { COMMANDS } = await import("../../src/constants/commands");
			expect(COMMANDS.SESSION).toBeDefined();
			expect(COMMANDS.SESSION.LIST).toBe("snapback.session.list");
			expect(COMMANDS.SESSION.RESTORE).toBe("snapback.session.restore");
			expect(COMMANDS.SESSION.EXPORT).toBe("snapback.session.export");
		});

		it("should have VIEW category", async () => {
			const { COMMANDS } = await import("../../src/constants/commands");
			expect(COMMANDS.VIEW).toBeDefined();
			expect(COMMANDS.VIEW.SHOW_SIDEBAR).toBe("snapback.view.sidebar");
			expect(COMMANDS.VIEW.SHOW_HISTORY).toBe("snapback.view.history");
			expect(COMMANDS.VIEW.SHOW_SETTINGS).toBe("snapback.view.settings");
			expect(COMMANDS.VIEW.REFRESH).toBe("snapback.view.refresh");
		});

		it("should have ACCOUNT category", async () => {
			const { COMMANDS } = await import("../../src/constants/commands");
			expect(COMMANDS.ACCOUNT).toBeDefined();
			expect(COMMANDS.ACCOUNT.SIGN_IN).toBe("snapback.account.signIn");
			expect(COMMANDS.ACCOUNT.SIGN_OUT).toBe("snapback.account.signOut");
			expect(COMMANDS.ACCOUNT.SHOW_STATUS).toBe("snapback.account.status");
		});

		it("should have UTILITY category", async () => {
			const { COMMANDS } = await import("../../src/constants/commands");
			expect(COMMANDS.UTILITY).toBeDefined();
			expect(COMMANDS.UTILITY.SHOW_OUTPUT).toBe("snapback.showOutput");
			expect(COMMANDS.UTILITY.OPEN_DOCS).toBe("snapback.openDocs");
			expect(COMMANDS.UTILITY.REPORT_ISSUE).toBe("snapback.reportIssue");
		});

		it("should export ALL_COMMANDS as flat array", async () => {
			const { ALL_COMMANDS } = await import("../../src/constants/commands");
			expect(ALL_COMMANDS).toBeInstanceOf(Array);
			expect(ALL_COMMANDS.length).toBeGreaterThan(0);
			expect(ALL_COMMANDS).toContain("snapback.snapshot.create");
			expect(ALL_COMMANDS).toContain("snapback.protection.watch");
		});

		it("should be const-asserted (TypeScript compile-time check)", async () => {
			const { COMMANDS } = await import("../../src/constants/commands");
			// This is a TypeScript compile-time check, verified by TypeScript compiler
			// Runtime immutability is not guaranteed by 'as const'
			expect(COMMANDS).toBeDefined();
			expect(Object.isFrozen(COMMANDS)).toBe(false); // as const doesn't freeze objects
		});
	});

	describe("Barrel Export", () => {
		it("should export all constants from index.ts", async () => {
			const constants = await import("../../src/constants/index");
			expect(constants.SNAPBACK_ICONS).toBeDefined();
			expect(constants.SNAPBACK_COLORS).toBeDefined();
			expect(constants.COMMANDS).toBeDefined();
		});
	});
});
