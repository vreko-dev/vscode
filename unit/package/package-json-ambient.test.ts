/**
 * Extension Package.json Ambient-Only Release Tests (Step 3)
 *
 * Spec requirement: Remove all "Cockpit" strings and TreeView registrations.
 * Status bar + notifications + command palette only  -  no sidebar tree view.
 *
 * NOTE: Uses `fs` (without `node:` prefix) to bypass the node:fs mock that
 * exists for the vscode test environment.
 */

import { readFileSync } from "fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PKG_PATH = resolve(__dirname, "../../../package.json");
const pkgRaw = readFileSync(PKG_PATH, "utf-8");
const pkg = JSON.parse(pkgRaw);

describe("Extension package.json  -  ambient-only release (Step 3)", () => {
	describe("Cockpit removal", () => {
		it("should have no 'Cockpit' string anywhere in package.json", () => {
			expect(pkgRaw).not.toMatch(/[Cc]ockpit/);
		});

		it("should have no 'vreko.cockpit' view reference", () => {
			expect(pkgRaw).not.toContain("vreko.cockpit");
		});

		it("should have empty viewsContainers", () => {
			const viewsContainers = pkg.contributes?.viewsContainers ?? {};
			expect(Object.keys(viewsContainers)).toHaveLength(0);
		});

		it("should have empty views", () => {
			const views = pkg.contributes?.views ?? {};
			expect(Object.keys(views)).toHaveLength(0);
		});
	});

	describe("showTreeView removal", () => {
		it("should NOT have vreko.ui.showTreeView in configuration", () => {
			const props = pkg.contributes?.configuration?.properties ?? {};
			expect(props).not.toHaveProperty("vreko.ui.showTreeView");
		});
	});

	describe("Dead commands removal (Step 4)", () => {
		const commandIds = (pkg.contributes?.commands ?? []).map(
			(c: { command: string }) => c.command,
		);

		it("should NOT declare vreko.changeProtectionLevel command", () => {
			expect(commandIds).not.toContain("vreko.changeProtectionLevel");
		});

		it("should NOT declare vreko.createSnapshot command (dead  -  use SnapshotManager.capture instead)", () => {
			expect(commandIds).not.toContain("vreko.createSnapshot");
		});

		it("should NOT declare vreko.showStatus command (dead  -  no registration)", () => {
			expect(commandIds).not.toContain("vreko.showStatus");
		});
	});

	describe("Menu when-conditions sanity", () => {
		it("should have no menu items with 'view == vreko.cockpit' condition", () => {
			const menus = pkg.contributes?.menus ?? {};
			for (const [, items] of Object.entries(menus)) {
				if (!Array.isArray(items)) continue;
				for (const item of items as Array<{ when?: string }>) {
					if (item.when) {
						expect(item.when).not.toMatch(/view\s*==\s*vreko\.cockpit/);
					}
				}
			}
		});
	});
});
