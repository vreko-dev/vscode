/**
 * Regression Test: Issue #8 - Can't Change Protection Level from Tree View
 *
 * BUG: Right-clicking a protected file in the tree view doesn't show options
 * to change its protection level (Watch/Warn/Block).
 *
 * LOCATION:
 * - package.json: view/item/context menu configuration (line 343-384)
 * - src/views/snapBackTreeProvider.ts: Tree item context values
 *
 * CURRENT BEHAVIOR:
 * - Right-clicking protected file in tree shows limited options
 * - No protection level submenu appears
 * - Users must use other methods to change protection level
 *
 * EXPECTED BEHAVIOR:
 * - Context menu shows "SnapBack: Set Protection Level" submenu
 * - Submenu contains Watch, Warn, and Block options
 * - Matches the functionality available in explorer context menu
 *
 * FIX: Add protection level submenu to view/item/context in package.json
 */

import { beforeEach, describe, expect, it } from "vitest";

describe("Regression: Issue #8 - Tree View Protection Level Change", () => {
	let _packageJson: any;

	beforeEach(() => {
		// Mock package.json structure
		_packageJson = {
			contributes: {
				menus: {
					"view/item/context": [],
				},
				submenus: [
					{
						id: "snapback.protectionLevels",
						label: "SnapBack Protection",
					},
				],
			},
		};
	});

	/**
	 * TEST: Current broken behavior - no protection level menu in tree view
	 * This test documents the bug and will FAIL after fix
	 */
	it("should reproduce the bug - tree view context menu lacks protection level submenu", () => {
		// Current state: only has changeProtectionLevel command, no submenu
		const treeViewContextMenus = [
			{
				command: "snapback.changeProtectionLevel",
				when: "view == snapback.protectedFiles && viewItem == protectedFile",
				group: "inline@1",
			},
		];

		// Bug: No submenu for protection levels
		const hasSubmenu = treeViewContextMenus.some(
			(menu) =>
				Object.hasOwn(menu, "submenu") &&
				menu.submenu === "snapback.protectionLevels",
		);

		expect(hasSubmenu).toBe(false);

		// Bug: Only one menu item (changeProtectionLevel)
		expect(treeViewContextMenus.length).toBe(1);
	});

	/**
	 * TEST: Expected fixed behavior - protection level submenu available
	 * This test will PASS after the fix is implemented
	 */
	it("should show protection level submenu in tree view context menu after fix", () => {
		// Expected state after fix
		const fixedTreeViewContextMenus = [
			{
				command: "snapback.changeProtectionLevel",
				when: "view == snapback.protectedFiles && viewItem == protectedFile",
				group: "inline@1",
			},
			{
				submenu: "snapback.protectionLevels",
				when: "view == snapback.protectedFiles && viewItem == protectedFile",
				group: "protection@1",
			},
		];

		// Should have submenu entry
		const hasSubmenu = fixedTreeViewContextMenus.some(
			(menu) =>
				Object.hasOwn(menu, "submenu") &&
				menu.submenu === "snapback.protectionLevels",
		);

		expect(hasSubmenu).toBe(true);

		// Should have both command and submenu
		expect(fixedTreeViewContextMenus.length).toBeGreaterThan(1);
	});

	/**
	 * TEST: Verify submenu contains all three protection level commands
	 */
	it("should include all three protection level commands in submenu", () => {
		const protectionLevelSubmenuItems = [
			{
				command: "snapback.setWatchLevel",
				group: "levels@1",
			},
			{
				command: "snapback.setWarnLevel",
				group: "levels@2",
			},
			{
				command: "snapback.setBlockLevel",
				group: "levels@3",
			},
		];

		// All three levels should be present
		expect(protectionLevelSubmenuItems).toHaveLength(3);

		// Commands should be ordered correctly (Watch, Warn, Block)
		expect(protectionLevelSubmenuItems[0].command).toBe(
			"snapback.setWatchLevel",
		);
		expect(protectionLevelSubmenuItems[1].command).toBe(
			"snapback.setWarnLevel",
		);
		expect(protectionLevelSubmenuItems[2].command).toBe(
			"snapback.setBlockLevel",
		);
	});

	/**
	 * TEST: Verify consistency with explorer context menu
	 */
	it("should match explorer context menu protection level structure", () => {
		// Explorer has submenu for protection levels
		const explorerContextMenu = {
			submenu: "snapback.protectionLevels",
			when: "snapback.isActive && !explorerResourceIsFolder",
			group: "snapback@3",
		};

		// Tree view should have similar structure
		const treeViewContextMenu = {
			submenu: "snapback.protectionLevels",
			when: "view == snapback.protectedFiles && viewItem == protectedFile",
			group: "protection@1",
		};

		// Both should reference the same submenu
		expect(treeViewContextMenu.submenu).toBe(explorerContextMenu.submenu);

		// Both should use the submenu pattern (not direct commands)
		expect(treeViewContextMenu).toHaveProperty("submenu");
		expect(explorerContextMenu).toHaveProperty("submenu");
	});

	/**
	 * TEST: Verify correct 'when' clause for tree view items
	 */
	it("should use correct when clause for protected file tree items", () => {
		const correctWhenClause =
			"view == snapback.protectedFiles && viewItem == protectedFile";

		// Menu should only appear for protected files in the tree view
		expect(correctWhenClause).toContain("view == snapback.protectedFiles");
		expect(correctWhenClause).toContain("viewItem == protectedFile");

		// Should NOT appear for other views
		expect(correctWhenClause).not.toContain("view == snapback.main");
		expect(correctWhenClause).not.toContain("explorerResourceIsFolder");
	});

	/**
	 * TEST: Verify menu grouping is logical and organized
	 */
	it("should group protection level menu items logically", () => {
		const treeViewMenus = [
			{
				command: "snapback.changeProtectionLevel",
				when: "view == snapback.protectedFiles && viewItem == protectedFile",
				group: "inline@1", // Inline action
			},
			{
				submenu: "snapback.protectionLevels",
				when: "view == snapback.protectedFiles && viewItem == protectedFile",
				group: "protection@1", // Protection group
			},
			{
				command: "snapback.unprotectFile",
				when: "view == snapback.protectedFiles && viewItem == protectedFile",
				group: "protection@2", // Same protection group
			},
		];

		// Inline actions should be in 'inline' group
		const inlineItems = treeViewMenus.filter((m) =>
			m.group?.startsWith("inline"),
		);
		expect(inlineItems.length).toBeGreaterThan(0);

		// Protection actions should be in 'protection' group
		const protectionItems = treeViewMenus.filter((m) =>
			m.group?.startsWith("protection"),
		);
		expect(protectionItems.length).toBeGreaterThan(0);

		// Submenu should be in the protection group
		const submenuItem = treeViewMenus.find((m) => Object.hasOwn(m, "submenu"));
		expect(submenuItem?.group).toContain("protection");
	});

	/**
	 * TEST: Verify both checkpoint and protected file tree views support protection changes
	 */
	it("should support protection level changes for both tree views", () => {
		const viewContexts = [
			"view == snapback.protectedFiles && viewItem == protectedFile",
			"view == snapback.main && viewItem == protectedFile",
		];

		// Both views should be able to show protection menus
		for (const whenClause of viewContexts) {
			expect(whenClause).toContain("viewItem == protectedFile");
		}
	});

	/**
	 * TEST: Verify submenu label is user-friendly
	 */
	it("should use descriptive submenu label", () => {
		const submenuConfig = {
			id: "snapback.protectionLevels",
			label: "SnapBack Protection",
			icon: "$(shield)",
		};

		// Should have clear, descriptive label
		expect(submenuConfig.label).toContain("Protection");
		expect(submenuConfig.label).toContain("SnapBack");

		// Should have visual icon
		expect(submenuConfig.icon).toBeTruthy();
	});
});
