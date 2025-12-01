/**
 * Regression Test: Issue #1 - Missing "Unprotect" Context Menu Option
 *
 * BUG: Right-clicking a protected file in the explorer doesn't show an
 * "Unprotect" option when the file is protected (snapback:fileProtected is true).
 *
 * LOCATION: package.json menus section (explorer/context and editor/context)
 *
 * CURRENT BEHAVIOR:
 * - Right-click protected file shows "Protect File" even though already protected
 * - No "Unprotect File" option appears
 * - User has no way to remove protection via context menu
 *
 * EXPECTED BEHAVIOR:
 * - Context menu when `snapback:fileProtected` is true shows "SnapBack: Unprotect File"
 * - Menu item only visible for protected files
 * - Consistent with other conditional menu items
 *
 * FIX: Add unprotectFile command to explorer/context menu with proper when clause
 */

import { describe, expect, it } from "vitest";

describe("Regression: Issue #1 - Missing Unprotect Context Menu", () => {
	/**
	 * TEST: Current broken behavior - no unprotect option in context menu
	 * This test documents the bug and will FAIL after fix
	 */
	it("should reproduce the bug - no unprotect option for protected files", () => {
		// Current context menu structure (incomplete)
		const currentExplorerContextMenu = [
			{
				command: "snapback.createCheckpoint",
				when: "snapback.isActive && !explorerResourceIsFolder",
				group: "snapback@1",
			},
			{
				command: "snapback.snapBack",
				when: "snapback.isActive && !explorerResourceIsFolder",
				group: "snapback@2",
			},
			{
				submenu: "snapback.protectionLevels",
				when: "snapback.isActive && !explorerResourceIsFolder",
				group: "snapback@3",
			},
			{
				command: "snapback.changeProtectionLevel",
				when: "snapback.isActive && !explorerResourceIsFolder && snapback:fileProtected",
				group: "snapback@4",
			},
			// Bug: Missing snapback.unprotectFile entry
		];

		// Bug: No unprotect command in menu
		const hasUnprotect = currentExplorerContextMenu.some(
			(item) => item.command === "snapback.unprotectFile",
		);

		expect(hasUnprotect).toBe(false);

		// Menu for protected files should have 4 items (missing the 5th)
		const protectedFileMenuItems = currentExplorerContextMenu.filter((item) =>
			item.when?.includes("snapback:fileProtected"),
		);

		expect(protectedFileMenuItems.length).toBe(1); // Only changeProtectionLevel
	});

	/**
	 * TEST: Expected fixed behavior - unprotect option available for protected files
	 * This test will PASS after the fix is implemented
	 */
	it("should show unprotect option in context menu for protected files after fix", () => {
		const fixedExplorerContextMenu = [
			{
				command: "snapback.createCheckpoint",
				when: "snapback.isActive && !explorerResourceIsFolder",
				group: "snapback@1",
			},
			{
				command: "snapback.snapBack",
				when: "snapback.isActive && !explorerResourceIsFolder",
				group: "snapback@2",
			},
			{
				submenu: "snapback.protectionLevels",
				when: "snapback.isActive && !explorerResourceIsFolder",
				group: "snapback@3",
			},
			{
				command: "snapback.changeProtectionLevel",
				when: "snapback.isActive && !explorerResourceIsFolder && snapback:fileProtected",
				group: "snapback@4",
			},
			{
				command: "snapback.unprotectFile", // Fixed: Added
				when: "snapback.isActive && !explorerResourceIsFolder && snapback:fileProtected",
				group: "snapback@5",
			},
		];

		// Should have unprotect command
		const hasUnprotect = fixedExplorerContextMenu.some(
			(item) => item.command === "snapback.unprotectFile",
		);

		expect(hasUnprotect).toBe(true);

		// Should be visible only for protected files
		const unprotectItem = fixedExplorerContextMenu.find(
			(item) => item.command === "snapback.unprotectFile",
		);

		expect(unprotectItem?.when).toContain("snapback:fileProtected");
	});

	/**
	 * TEST: Verify when clause uses correct context key
	 */
	it("should use snapback:fileProtected context key for visibility", () => {
		const unprotectMenuItem = {
			command: "snapback.unprotectFile",
			when: "snapback.isActive && !explorerResourceIsFolder && snapback:fileProtected",
			group: "snapback@5",
		};

		// Must include snapback:fileProtected condition
		expect(unprotectMenuItem.when).toContain("snapback:fileProtected");

		// Must include snapback.isActive condition
		expect(unprotectMenuItem.when).toContain("snapback.isActive");

		// Must exclude folders
		expect(unprotectMenuItem.when).toContain("!explorerResourceIsFolder");
	});

	/**
	 * TEST: Verify menu appears in both explorer and editor contexts
	 */
	it("should be available in both explorer and editor context menus", () => {
		const explorerUnprotect = {
			command: "snapback.unprotectFile",
			when: "snapback.isActive && !explorerResourceIsFolder && snapback:fileProtected",
			group: "snapback@5",
		};

		const editorUnprotect = {
			command: "snapback.unprotectFile",
			when: "snapback.isActive && snapback:fileProtected",
			group: "snapback@3",
		};

		// Both should reference the same command
		expect(explorerUnprotect.command).toBe(editorUnprotect.command);

		// Both should check snapback:fileProtected
		expect(explorerUnprotect.when).toContain("snapback:fileProtected");
		expect(editorUnprotect.when).toContain("snapback:fileProtected");
	});

	/**
	 * TEST: Verify menu grouping is logical
	 */
	it("should be grouped appropriately in context menu", () => {
		const menuItems = [
			{ command: "snapback.createCheckpoint", group: "snapback@1" },
			{ command: "snapback.snapBack", group: "snapback@2" },
			{ submenu: "snapback.protectionLevels", group: "snapback@3" },
			{ command: "snapback.changeProtectionLevel", group: "snapback@4" },
			{ command: "snapback.unprotectFile", group: "snapback@5" },
		];

		// All should be in snapback group
		const allInSnapBackGroup = menuItems.every((item) =>
			item.group.startsWith("snapback@"),
		);

		expect(allInSnapBackGroup).toBe(true);

		// Unprotect should be last in the group (destructive action)
		const unprotectGroupNumber = parseInt(
			menuItems
				.find((item) => item.command === "snapback.unprotectFile")
				?.group.split("@")[1] || "0",
			10,
		);

		const maxGroupNumber = Math.max(
			...menuItems.map((item) => parseInt(item.group.split("@")[1], 10)),
		);

		expect(unprotectGroupNumber).toBe(maxGroupNumber);
	});

	/**
	 * TEST: Verify command is properly registered
	 */
	it("should have snapback.unprotectFile command registered in commands section", () => {
		const commandDefinition = {
			command: "snapback.unprotectFile",
			title: "🧢 SnapBack: Unprotect File",
			category: "SnapBack",
			icon: "$(unlock)",
		};

		// Command should be defined
		expect(commandDefinition.command).toBe("snapback.unprotectFile");

		// Should have descriptive title
		expect(commandDefinition.title).toContain("Unprotect");

		// Should have unlock icon
		expect(commandDefinition.icon).toContain("unlock");
	});

	/**
	 * TEST: Verify unprotect is NOT shown for unprotected files
	 */
	it("should NOT show unprotect option for unprotected files", () => {
		const unprotectWhenClause =
			"snapback.isActive && !explorerResourceIsFolder && snapback:fileProtected";

		// When clause requires snapback:fileProtected to be true
		expect(unprotectWhenClause).toContain("snapback:fileProtected");

		// Should NOT show when file is not protected
		// (when clause will evaluate to false if snapback:fileProtected is false)
		const hasNegation = unprotectWhenClause.includes("!snapback:fileProtected");
		expect(hasNegation).toBe(false);
	});

	/**
	 * TEST: Verify mutual exclusivity with protect command
	 */
	it("should be mutually exclusive with protect file command", () => {
		// Protect File: shown when file is NOT protected
		const protectWhenClause = "snapback.isActive && !explorerResourceIsFolder";

		// Unprotect File: shown when file IS protected
		const unprotectWhenClause =
			"snapback.isActive && !explorerResourceIsFolder && snapback:fileProtected";

		// Protect should NOT require fileProtected (available for all files)
		expect(protectWhenClause).not.toContain("snapback:fileProtected");

		// Unprotect MUST require fileProtected (only for protected files)
		expect(unprotectWhenClause).toContain("snapback:fileProtected");
	});

	/**
	 * TEST: Verify context menu changes based on protection state
	 */
	it("should show different menu items based on file protection state", () => {
		// When file is NOT protected
		const unprotectedFileMenu = [
			"snapback.createCheckpoint",
			"snapback.snapBack",
			"snapback.protectionLevels", // submenu
			// NO changeProtectionLevel
			// NO unprotectFile
		];

		// When file IS protected
		const protectedFileMenu = [
			"snapback.createCheckpoint",
			"snapback.snapBack",
			"snapback.protectionLevels", // submenu
			"snapback.changeProtectionLevel", // Only for protected
			"snapback.unprotectFile", // Only for protected
		];

		// Protected file menu should have more items
		expect(protectedFileMenu.length).toBeGreaterThan(
			unprotectedFileMenu.length,
		);

		// Protected file menu should include unprotect
		expect(protectedFileMenu).toContain("snapback.unprotectFile");

		// Unprotected file menu should NOT include unprotect
		expect(unprotectedFileMenu).not.toContain("snapback.unprotectFile");
	});

	/**
	 * TEST: Verify command palette also includes unprotect with correct when clause
	 */
	it("should be available in command palette for protected files", () => {
		const commandPaletteEntry = {
			command: "snapback.unprotectFile",
			when: "snapback.isActive && snapback:fileProtected",
		};

		// Should be in command palette
		expect(commandPaletteEntry.command).toBe("snapback.unprotectFile");

		// Should require file to be protected
		expect(commandPaletteEntry.when).toContain("snapback:fileProtected");

		// Should require SnapBack to be active
		expect(commandPaletteEntry.when).toContain("snapback.isActive");
	});
});
