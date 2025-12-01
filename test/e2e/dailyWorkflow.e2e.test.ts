import { expect, test } from "@playwright/test";

test("activates extension quickly", async ({ page }) => {
	const startTime = Date.now();
	await page.goto("vscode://extension/snapback-vscode");
	const activationTime = Date.now() - startTime;

	expect(activationTime).toBeLessThan(2000);
});

test("restores core SnapBack UI on startup", async ({ page }) => {
	await page.goto("vscode://extension/snapback-vscode");

	const snapbackView = page.locator(".view-pane >> text=SnapBack");
	await expect(snapbackView).toBeVisible();

	const snapshotsSection = page.locator(".view-pane >> text=Snapshots");
	await expect(snapshotsSection).toBeVisible();

	const statusBar = page.locator(".statusbar-item >> text=Protected");
	await expect(statusBar).toBeVisible();
});
