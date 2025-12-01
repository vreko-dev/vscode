import { expect, test } from "@playwright/test";

test("shows simplified SnapBack tree view", async ({ page }) => {
	await page.goto("vscode://extension/snapback-vscode");

	const snapbackView = page.locator(".view-pane >> text=SnapBack");
	await expect(snapbackView).toBeVisible();

	const snapshotsSection = page.locator(".view-pane >> text=Snapshots");
	await expect(snapshotsSection).toBeVisible();

	const protectedSection = page.locator(".view-pane >> text=Protected Files");
	await expect(protectedSection).toBeVisible();
});

test("lists core SnapBack commands", async ({ page }) => {
	await page.keyboard.press("Ctrl+Shift+P");

	const commandInput = page.locator(".quick-input-box input");
	await commandInput.fill("SnapBack:");

	const commands = page.locator(".quick-input-list .monaco-list-row");
	expect(await commands.count()).toBeGreaterThan(3);

	await expect(commands.filter({ hasText: "Create Snapshot" })).toHaveCount(1);
	await expect(commands.filter({ hasText: "Snap Back" })).toHaveCount(1);
	await expect(
		commands.filter({ hasText: "Protect Current File" }),
	).toHaveCount(1);
});

test("executes create snapshot command", async ({ page }) => {
	await page.keyboard.press("Ctrl+Shift+P");

	const commandInput = page.locator(".quick-input-box input");
	await commandInput.fill("SnapBack: Create Snapshot");
	await page.keyboard.press("Enter");

	const notification = page.locator(
		".notification-toast >> text=Creating snapshot",
	);
	await expect(notification).toBeVisible();
});

test("executes snap back command", async ({ page }) => {
	await page.keyboard.press("Ctrl+Shift+P");

	const commandInput = page.locator(".quick-input-box input");
	await commandInput.fill("SnapBack: Snap Back");
	await page.keyboard.press("Enter");

	const notification = page.locator(
		".notification-toast >> text=Restoring workspace",
	);
	await expect(notification).toBeVisible();
});
