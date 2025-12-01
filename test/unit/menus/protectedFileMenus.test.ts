import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Protected file menus", () => {
	it("should expose unprotect command in both SnapBack and Explorer contexts", async () => {
		const pkgPath = path.join(__dirname, "../../../package.json");
		const pkg = JSON.parse(await fs.readFile(pkgPath, "utf-8"));

		const viewMenus = pkg.contributes.menus["view/item/context"] ?? [];
		const explorerMenus = pkg.contributes.menus["explorer/context"] ?? [];

		const hasSnapBackTreeUnprotect = viewMenus.some(
			(item: any) =>
				item.command === "snapback.unprotectFile" &&
				item.when ===
					"view == snapback.main && viewItem == snapback.item.protectedFile",
		);
		const hasExplorerUnprotect = explorerMenus.some(
			(item: any) =>
				item.command === "snapback.unprotectFile" &&
				item.when ===
					"snapback.isActive && !explorerResourceIsFolder && snapback:fileProtected",
		);

		expect(hasSnapBackTreeUnprotect).toBe(true);
		expect(hasExplorerUnprotect).toBe(true);
	});
});
