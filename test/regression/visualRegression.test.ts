import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Visual Regression Tests", () => {
	describe("Menu Structure", () => {
		it("should maintain correct submenu definitions", () => {
			// Test that our submenu definitions are correctly structured
			const packagePath = path.join(__dirname, "../../package.json");
			const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

			// Should have exactly 1 submenu (protectionLevels)
			expect(packageJson.contributes.submenus).toHaveLength(1);

			// Check protectionLevels submenu
			const protectionLevelsSubmenu = packageJson.contributes.submenus.find(
				(s: any) => s.id === "snapback.protectionLevels",
			);
			expect(protectionLevelsSubmenu).toBeDefined();
			expect(protectionLevelsSubmenu.label).toBe(
				"SnapBack: Set Protection Level",
			);
			expect(protectionLevelsSubmenu.icon).toBe("$(shield)");
		});

		it("should maintain correct protection level submenu items", () => {
			// Test that our protection level submenu items are correctly structured
			const packagePath = path.join(__dirname, "../../package.json");
			const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

			// Check protectionLevels submenu items
			const protectionLevelItems =
				packageJson.contributes.menus["snapback.protectionLevels"];
			expect(protectionLevelItems).toHaveLength(3);

			// Should have Watch, Warn, and Block options
			const watchItem = protectionLevelItems.find(
				(item: any) => item.command === "snapback.setWatchLevel",
			);
			expect(watchItem).toBeDefined();
			expect(watchItem.group).toBe("levels@1");

			const warnItem = protectionLevelItems.find(
				(item: any) => item.command === "snapback.setWarnLevel",
			);
			expect(warnItem).toBeDefined();
			expect(warnItem.group).toBe("levels@2");

			const blockItem = protectionLevelItems.find(
				(item: any) => item.command === "snapback.setBlockLevel",
			);
			expect(blockItem).toBeDefined();
			expect(blockItem.group).toBe("levels@3");
		});

		it("should maintain correct explorer context menu integration", () => {
			// Test that explorer context menus properly reference our submenus
			const packagePath = path.join(__dirname, "../../package.json");
			const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

			const contextMenus = packageJson.contributes.menus["explorer/context"];
			expect(contextMenus).toBeDefined();

			// Should have protectionLevels submenu
			const protectionLevelsMenu = contextMenus.find(
				(item: any) => item.submenu === "snapback.protectionLevels",
			);
			expect(protectionLevelsMenu).toBeDefined();
			expect(protectionLevelsMenu.when).toBe(
				"snapback.isActive && !explorerResourceIsFolder",
			);
			expect(protectionLevelsMenu.group).toBe("snapback@3");
		});

		it("should maintain correct editor context menu integration", () => {
			// Test that editor context menus properly reference our submenus
			const packagePath = path.join(__dirname, "../../package.json");
			const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

			const contextMenus = packageJson.contributes.menus["editor/context"];
			expect(contextMenus).toBeDefined();

			// Should have protectionLevels submenu
			const protectionLevelsMenu = contextMenus.find(
				(item: any) => item.submenu === "snapback.protectionLevels",
			);
			expect(protectionLevelsMenu).toBeDefined();
			expect(protectionLevelsMenu.when).toBe("snapback.isActive");
			expect(protectionLevelsMenu.group).toBe("snapback@1");
		});

		it("should maintain correct command definitions", () => {
			// Test that our protection level commands are properly defined
			const packagePath = path.join(__dirname, "../../package.json");
			const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

			// Should have individual protection level commands
			const watchCommand = packageJson.contributes.commands.find(
				(cmd: any) => cmd.command === "snapback.setWatchLevel",
			);
			expect(watchCommand).toBeDefined();
			expect(watchCommand.title).toBe("Set Protection: Watch (Silent) 🧢");
			expect(watchCommand.category).toBe("SnapBack");
			expect(watchCommand.icon).toBe("$(eye)");

			const warnCommand = packageJson.contributes.commands.find(
				(cmd: any) => cmd.command === "snapback.setWarnLevel",
			);
			expect(warnCommand).toBeDefined();
			expect(warnCommand.title).toBe("Set Protection: Warn (Notify) 👷");
			expect(warnCommand.category).toBe("SnapBack");
			expect(warnCommand.icon).toBe("$(warning)");

			const blockCommand = packageJson.contributes.commands.find(
				(cmd: any) => cmd.command === "snapback.setBlockLevel",
			);
			expect(blockCommand).toBeDefined();
			expect(blockCommand.title).toBe("Set Protection: Block (Required) ⛑️");
			expect(blockCommand.category).toBe("SnapBack");
			expect(blockCommand.icon).toBe("$(error)");
		});
	});

	describe("UI Component Structure", () => {
		it("should maintain correct context manager API", () => {
			// Test that ContextManager has the expected public methods
			const contextManagerPath = path.join(
				__dirname,
				"../../src/contextManager.ts",
			);
			const contextManagerContent = fs.readFileSync(contextManagerPath, "utf8");

			// Should have constructor
			expect(contextManagerContent).toContain("constructor");

			// Should have updateContextForActiveFile method
			expect(contextManagerContent).toContain("updateContextForActiveFile");

			// Should have updateContextForFile method
			expect(contextManagerContent).toContain("updateContextForFile");

			// Should have onProtectionStateChanged method
			expect(contextManagerContent).toContain("onProtectionStateChanged");
		});

		it("should maintain correct status bar API", () => {
			// Test that SnapBackStatusBar has the expected public methods
			const statusBarPath = path.join(
				__dirname,
				"../../src/protectionStatusBar.ts",
			);
			const statusBarContent = fs.readFileSync(statusBarPath, "utf8");

			// Should have constructor
			expect(statusBarContent).toContain("constructor");

			// Should have initialize method
			expect(statusBarContent).toContain("initialize");

			// Should have update method
			expect(statusBarContent).toContain("update");

			// Should have proper command registration
			expect(statusBarContent).toContain("snapback.showAllProtectedFiles");
		});
	});
});
