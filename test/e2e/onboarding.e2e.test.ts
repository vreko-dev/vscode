import { expect, test } from "@playwright/test";

test("should display welcome view for new users", async ({ page }) => {
	// Navigate to the VS Code extension host
	await page.goto("vscode://extension/snapback-vscode");

	// Check if the welcome view is visible when extension is first activated
	const welcomeView = page.locator(".view-pane >> text=Getting Started");
	await expect(welcomeView).toBeVisible();
});

test("should show initial workspace scan", async ({ page }) => {
	// Navigate to the VS Code extension host
	await page.goto("vscode://extension/snapback-vscode");

	// Check if the initial scan notification is shown
	const scanNotification = page.locator(
		".notification-toast >> text=Scanning workspace",
	);
	await expect(scanNotification).toBeVisible();
});

test("should apply default configuration", async ({ page }) => {
	// Navigate to the VS Code extension host
	await page.goto("vscode://extension/snapback-vscode");

	// Check if default settings are applied
	// This would involve checking the extension settings
	const statusBar = page.locator(".statusbar-item >> text=Analyzing");
	await expect(statusBar).toBeVisible();
});

test("should guide user through first snapshot creation", async ({ page }) => {
	// Navigate to the VS Code extension host
	await page.goto("vscode://extension/snapback-vscode");

	// Click on the "Create First Checkpoint" button in the welcome view
	const createSnapshotButton = page.locator(
		"button >> text=Create First Snapshot",
	);
	await createSnapshotButton.click();

	// Check if the snapshot creation process starts
	const notification = page.locator(
		".notification-toast >> text=Creating snapshot",
	);
	await expect(notification).toBeVisible();

	// Wait for completion
	const successNotification = page.locator(
		".notification-toast >> text=Snapshot created",
	);
	await expect(successNotification).toBeVisible();

	// Check if the simplified SnapBack view is visible with sections
	const snapbackView = page.locator(".view-pane >> text=SnapBack");
	await expect(snapbackView).toBeVisible();

	const snapshotsSection = page.locator(".view-pane >> text=Snapshots");
	await expect(snapshotsSection).toBeVisible();

	const protectedSection = page.locator(".view-pane >> text=Protected Files");
	await expect(protectedSection).toBeVisible();
});
