import * as fs from "node:fs";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Context Manager Structure", () => {
	it("should properly handle context conditions", () => {
		// Test the context conditions used in our menus
		const packagePath = path.join(__dirname, "../../package.json");
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

		const contextMenus = packageJson.contributes.menus["explorer/context"];

		// Check conditions for various commands in explorer context menu
		const createCheckpointMenu = contextMenus.find(
			(item: any) => item.command === "snapback.createCheckpoint",
		);
		expect(createCheckpointMenu.when).toBe(
			"snapback.isActive && !explorerResourceIsFolder",
		);

		const snapBackMenu = contextMenus.find(
			(item: any) => item.command === "snapback.snapBack",
		);
		expect(snapBackMenu.when).toBe(
			"snapback.isActive && !explorerResourceIsFolder",
		);

		const protectionLevelsMenu = contextMenus.find(
			(item: any) => item.submenu === "snapback.protectionLevels",
		);
		expect(protectionLevelsMenu.when).toBe(
			"snapback.isActive && !explorerResourceIsFolder",
		);

		const protectCurrentFileMenu = contextMenus.find(
			(item: any) => item.command === "snapback.protectCurrentFile",
		);
		expect(protectCurrentFileMenu.when).toBe(
			"snapback.isActive && !explorerResourceIsFolder",
		);

		const changeProtectionLevelMenu = contextMenus.find(
			(item: any) => item.command === "snapback.changeProtectionLevel",
		);
		expect(changeProtectionLevelMenu.when).toBe(
			"snapback.isActive && !explorerResourceIsFolder && snapback.fileProtected",
		);

		const unprotectFileMenu = contextMenus.find(
			(item: any) => item.command === "snapback.unprotectFile",
		);
		expect(unprotectFileMenu.when).toBe(
			"snapback.isActive && !explorerResourceIsFolder && snapback.fileProtected",
		);
	});

	it("should have correct protection level submenu items", () => {
		const packagePath = path.join(__dirname, "../../package.json");
		const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

		const protectionLevelItems =
			packageJson.contributes.menus["snapback.protectionLevels"];

		// Check that protection level items are properly defined
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
});
