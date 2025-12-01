import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Submenu Structure Validation", () => {
	it("should have correct submenu definitions", () => {
		const packagePath = path.join(__dirname, "../../package.json");
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

		expect(packageJson.contributes.submenus).toHaveLength(1);

		const protectionLevelsSubmenu = packageJson.contributes.submenus.find(
			(s: any) => s.id === "snapback.protectionLevels",
		);
		expect(protectionLevelsSubmenu).toBeDefined();
		expect(protectionLevelsSubmenu.label).toBe(
			"SnapBack: Set Protection Level",
		);
		expect(protectionLevelsSubmenu.icon).toBe("$(shield)");
	});

	it("should have correct protection level submenu items", () => {
		const packagePath = path.join(__dirname, "../../package.json");
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

		const protectionLevelItems =
			packageJson.contributes.menus["snapback.protectionLevels"];

		expect(protectionLevelItems).toHaveLength(3);

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

	it("should have correct explorer context menu integration", () => {
		const packagePath = path.join(__dirname, "../../package.json");
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

		const contextMenus = packageJson.contributes.menus["explorer/context"];

		const protectionLevelsMenu = contextMenus.find(
			(item: any) => item.submenu === "snapback.protectionLevels",
		);
		expect(protectionLevelsMenu).toBeDefined();
		expect(protectionLevelsMenu.when).toBe(
			"snapback.isActive && !explorerResourceIsFolder",
		);
		expect(protectionLevelsMenu.group).toBe("snapback@3");
	});

	it("should have correct command definitions in protection levels", () => {
		const packagePath = path.join(__dirname, "../../package.json");
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

		const commands = packageJson.contributes.commands;

		// Check protection level commands exist
		const watchCommand = commands.find(
			(cmd: any) => cmd.command === "snapback.setWatchLevel",
		);
		expect(watchCommand).toBeDefined();
		expect(watchCommand.title).toBe("Set Protection: Watch (Silent) 🧢");
		expect(watchCommand.category).toBe("SnapBack");
		expect(watchCommand.icon).toBe("$(eye)");

		const warnCommand = commands.find(
			(cmd: any) => cmd.command === "snapback.setWarnLevel",
		);
		expect(warnCommand).toBeDefined();
		expect(warnCommand.title).toBe("Set Protection: Warn (Notify) 👷");
		expect(warnCommand.category).toBe("SnapBack");
		expect(warnCommand.icon).toBe("$(warning)");

		const blockCommand = commands.find(
			(cmd: any) => cmd.command === "snapback.setBlockLevel",
		);
		expect(blockCommand).toBeDefined();
		expect(blockCommand.title).toBe("Set Protection: Block (Required) ⛑️");
		expect(blockCommand.category).toBe("SnapBack");
		expect(blockCommand.icon).toBe("$(error)");
	});
});
