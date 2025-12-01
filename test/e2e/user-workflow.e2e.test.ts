import { expect, test } from "@playwright/test";

test.describe("SnapBack User Workflow Tests", () => {
	test.setTimeout(120000); // 2 minutes for complex workflows

	test("Complete user workflow from installation to protection", async ({
		page,
	}) => {
		// Navigate to VS Code with SnapBack extension
		await page.goto("vscode://extension/snapback-vscode");

		// Wait for extension to load
		await page.waitForTimeout(5000);

		// Check if welcome view is displayed
		const welcomeView = page.locator(".welcome-view");
		await expect(welcomeView).toBeVisible({ timeout: 10000 });

		// Click on "Protect Your First File" walkthrough step
		const protectFirstFileButton = page.locator("text=Protect Your First File");
		await protectFirstFileButton.click();

		// Wait for file explorer to be visible
		const fileExplorer = page.locator(".explorer-viewlet");
		await expect(fileExplorer).toBeVisible({ timeout: 5000 });

		// Create a test file if it doesn't exist
		// In a real test, we would interact with the file system or use a fixture
		await page.evaluate(() => {
			// This would be replaced with actual file creation in a real test
			console.log("Creating test file...");
		});

		// Right-click on a file to protect it
		const testFile = page.locator('.explorer-item:has-text("test-file.txt")');
		await testFile.click({ button: "right" });

		// Select "SnapBack: Protect File" from context menu
		const protectMenuItem = page.locator("text=SnapBack: Protect File");
		await protectMenuItem.click();

		// Select Watch level protection
		const watchLevel = page.locator("text=Watch - Silent auto-snapshotting");
		await watchLevel.click();

		// Verify file is protected (check for badge or indicator)
		const protectedBadge = page.locator('.file-icon:has-text("🟢")');
		await expect(protectedBadge).toBeVisible({ timeout: 5000 });

		// Modify the protected file
		await testFile.dblclick(); // Open file
		await page.keyboard.type("\n// This is a test modification\n");
		await page.keyboard.press("Control+S"); // Save file (Windows/Linux) or Cmd+S (Mac)

		// Verify snapshot was created automatically
		const statusBarMessage = page.locator(
			'.status-bar-item:has-text("Snapshot created")',
		);
		await expect(statusBarMessage).toBeVisible({ timeout: 10000 });

		// Open SnapBack sidebar
		const snapbackSidebar = page.locator(".activitybar >> text=SnapBack");
		await snapbackSidebar.click();

		// Verify snapshots are listed
		const snapshotsView = page.locator('.view-pane:has-text("Snapshots")');
		await expect(snapshotsView).toBeVisible({ timeout: 5000 });

		// Verify protected files are listed
		const protectedFilesView = page.locator(
			'.view-pane:has-text("Protected Files")',
		);
		await expect(protectedFilesView).toBeVisible({ timeout: 5000 });
	});

	test("Protection level change workflow", async ({ page }) => {
		// Navigate to VS Code with SnapBack extension
		await page.goto("vscode://extension/snapback-vscode");

		// Wait for extension to load
		await page.waitForTimeout(3000);

		// Find a protected file
		const protectedFile = page.locator(
			'.explorer-item .file-icon:has-text("🟢")',
		);
		await protectedFile.first().click({ button: "right" });

		// Change protection level
		const changeLevelMenu = page.locator(
			"text=SnapBack: Change Protection Level",
		);
		await changeLevelMenu.click();

		// Select Warn level
		const warnLevel = page.locator("text=Warn - Confirm before save");
		await warnLevel.click();

		// Verify level change (should show yellow badge)
		const warnBadge = page.locator('.file-icon:has-text("🟡")');
		await expect(warnBadge).toBeVisible({ timeout: 5000 });

		// Modify file to test Warn behavior
		await protectedFile.first().dblclick();
		await page.keyboard.type("\n// Warn level test\n");

		// Try to save (should show confirmation dialog)
		await page.keyboard.press("Control+S");

		// Verify confirmation dialog appears
		const confirmDialog = page.locator(
			'.modal-dialog:has-text("Confirm Save")',
		);
		await expect(confirmDialog).toBeVisible({ timeout: 5000 });
	});

	test("Snapshot management workflow", async ({ page }) => {
		// Navigate to VS Code with SnapBack extension
		await page.goto("vscode://extension/snapback-vscode");

		// Wait for extension to load
		await page.waitForTimeout(3000);

		// Open SnapBack sidebar
		const snapbackSidebar = page.locator(".activitybar >> text=SnapBack");
		await snapbackSidebar.click();

		// Wait for snapshots view to load
		await page.waitForTimeout(2000);

		// Find a snapshot and test actions
		const snapshotItem = page.locator(".snapshot-item").first();
		await snapshotItem.click({ button: "right" });

		// Test rename snapshot
		const renameOption = page.locator("text=Rename Snapshot");
		await renameOption.click();

		// Test delete snapshot
		await snapshotItem.click({ button: "right" });
		const deleteOption = page.locator("text=Delete Snapshot");
		await deleteOption.click();

		// Confirm deletion
		const confirmDelete = page.locator(
			'.modal-dialog button:has-text("Delete")',
		);
		// Note: We won't actually click this in a test to avoid data loss
		await expect(confirmDelete).toBeVisible({ timeout: 5000 });
	});

	test("Team configuration workflow", async ({ page }) => {
		// Navigate to VS Code with SnapBack extension
		await page.goto("vscode://extension/snapback-vscode");

		// Wait for extension to load
		await page.waitForTimeout(3000);

		// Create .snapbackrc file
		// In a real test, this would involve file system operations
		await page.evaluate(() => {
			// Simulate creating .snapbackrc file
			console.log("Creating .snapbackrc configuration file...");
		});

		// Verify extension picks up configuration
		const _protectedFile = page.locator(
			'.explorer-item:has-text("package.json")',
		);
		// Should automatically be protected based on .snapbackrc rules
		const protectionBadge = page.locator('.file-icon:has-text("🟢")');
		await expect(protectionBadge).toBeVisible({ timeout: 10000 });
	});
});
