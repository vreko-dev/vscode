import { expect, test } from "@playwright/test";

test("shows protection submenus in explorer context menu", async ({ page }) => {
	// Navigate to a workspace
	await page.goto("vscode://extension/snapback-vscode");

	// Create a test file
	await page.keyboard.press("Ctrl+N");
	await page.keyboard.type('console.log("test");');
	await page.keyboard.press("Ctrl+S");
	await page.keyboard.type("test-file.js");
	await page.keyboard.press("Enter");

	// Right-click on the file in explorer
	const fileItem = page.locator(".explorer-item >> text=test-file.js");
	await fileItem.click({ button: "right" });

	// Should show "Protect File" submenu for unprotected files
	const protectFileSubmenu = page.locator(".context-view >> text=Protect File");
	await expect(protectFileSubmenu).toBeVisible();

	// Click on the submenu to expand it
	await protectFileSubmenu.click();

	// Should show protection level options
	const watchedOption = page.locator(".context-view >> text=🟢 Watched");
	const warningOption = page.locator(".context-view >> text=🟡 Warning");
	const protectedOption = page.locator(".context-view >> text=🔴 Protected");

	await expect(watchedOption).toBeVisible();
	await expect(warningOption).toBeVisible();
	await expect(protectedOption).toBeVisible();
});
