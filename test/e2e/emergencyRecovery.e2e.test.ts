import { expect, test } from "@playwright/test";

test("should enable quick restore after accidental deletion", async ({
	page,
}) => {
	// Navigate to the VS Code extension host
	await page.goto("vscode://extension/snapback-vscode");

	// Create a snapshot first
	await page.keyboard.press("Ctrl+Shift+P");
	const commandInput = page.locator(".quick-input-box input");
	await commandInput.fill("SnapBack: Create Snapshot");
	await page.keyboard.press("Enter");

	// Wait for snapshot creation
	const snapshotNotification = page.locator(
		".notification-toast >> text=Snapshot created",
	);
	await expect(snapshotNotification).toBeVisible();

	// Simulate accidental file deletion
	await page.click(".explorer-viewlet >> text=important-file.ts");
	await page.keyboard.press("Delete");

	// Confirm deletion
	const confirmDialog = page.locator(
		".modal-dialog >> button >> text=Move to Trash",
	);
	if (await confirmDialog.isVisible()) {
		await confirmDialog.click();
	}

	// Check if SnapBack detects the deletion and offers quick restore
	const restoreNotification = page.locator(
		".notification-toast >> text=File deleted",
	);
	await expect(restoreNotification).toBeVisible();

	// Click restore option
	const restoreButton = page.locator(
		".notification-toast >> button >> text=Restore",
	);
	await restoreButton.click();

	// Check if file is restored
	const restoredFile = page.locator(
		".explorer-viewlet >> text=important-file.ts",
	);
	await expect(restoredFile).toBeVisible();
});

test("should enable restore to last working snapshot after breaking change", async ({
	page,
}) => {
	// Navigate to the VS Code extension host
	await page.goto("vscode://extension/snapback-vscode");

	// Create an initial working snapshot
	await page.keyboard.press("Ctrl+Shift+P");
	const commandInput = page.locator(".quick-input-box input");
	await commandInput.fill("SnapBack: Create Snapshot");
	await page.keyboard.press("Enter");

	const initialSnapshotNotification = page.locator(
		".notification-toast >> text=Snapshot created",
	);
	await expect(initialSnapshotNotification).toBeVisible();

	// Make breaking changes
	await page.click(".explorer-viewlet >> text=app.ts");
	await page.keyboard.type("/* Breaking change that causes tests to fail */\n");
	await page.keyboard.press("Ctrl+S"); // Save file

	// Run tests (simulated)
	// In a real scenario, this would involve running the test suite
	// For this test, we'll simulate test failure detection

	// Check if SnapBack detects the issue and offers to restore
	const issueNotification = page.locator(
		".notification-toast >> text=Tests failing",
	);
	await expect(issueNotification).toBeVisible({ timeout: 10000 });

	// Click restore to last working snapshot
	const restoreButton = page.locator(
		".notification-toast >> button >> text=Restore Last Working",
	);
	await restoreButton.click();

	// Check if restoration is successful
	const restoreSuccessNotification = page.locator(
		".notification-toast >> text=Restored to snapshot",
	);
	await expect(restoreSuccessNotification).toBeVisible();

	// Verify tests pass again (simulated)
	const testsPassingNotification = page.locator(
		".notification-toast >> text=Tests passing",
	);
	await expect(testsPassingNotification).toBeVisible();
});

test("should assist with merge conflict resolution", async ({ page }) => {
	// Navigate to the VS Code extension host
	await page.goto("vscode://extension/snapback-vscode");

	// Simulate git merge conflict
	// This would involve creating a scenario where merge conflicts occur
	// For testing, we'll check if SnapBack's conflict resolution UI is available

	// Check if SnapBack detects conflicts
	const _conflictNotification = page.locator(
		".notification-toast >> text=Merge conflicts detected",
	);
	// This might be triggered by the Git extension integration

	// Open conflict resolution UI
	const conflictView = page.locator(".view-pane >> text=Conflict Resolution");
	await expect(conflictView).toBeVisible();

	// Check if SnapBack provides conflict resolution assistance
	const snapbackAssistButton = page.locator("button >> text=SnapBack Assist");
	await expect(snapbackAssistButton).toBeVisible();

	// Click SnapBack assist
	await snapbackAssistButton.click();

	// Check if suggested resolutions are provided
	const resolutionSuggestions = page.locator(".resolution-suggestion");
	expect(await resolutionSuggestions.count()).toBeGreaterThanOrEqual(1);

	// Apply a suggested resolution
	const applyButton = page.locator(
		".resolution-suggestion >> button >> text=Apply",
	);
	await applyButton.first().click();

	// Check if conflict is resolved
	const conflictResolvedNotification = page.locator(
		".notification-toast >> text=Conflict resolved",
	);
	await expect(conflictResolvedNotification).toBeVisible();
});
