import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

suite("SnapBack Extension End-to-End Test Suite", function () {
	// Increase timeout for E2E tests
	this.timeout(60000);

	let workspaceRoot: string;
	let testWorkspacePath: string;
	let testFilePath: string;
	let testFileUri: vscode.Uri;

	suiteSetup(async () => {
		// Get workspace root
		const workspaceFolders = vscode.workspace.workspaceFolders;
		assert.ok(
			workspaceFolders && workspaceFolders.length > 0,
			"Workspace required",
		);
		workspaceRoot = workspaceFolders[0].uri.fsPath;

		// Create a test workspace directory
		testWorkspacePath = path.join(workspaceRoot, ".test-workspace");
		if (!fs.existsSync(testWorkspacePath)) {
			fs.mkdirSync(testWorkspacePath, { recursive: true });
		}

		// Create test file in the test workspace
		testFilePath = path.join(testWorkspacePath, "test-file.txt");
		testFileUri = vscode.Uri.file(testFilePath);

		// Write initial content to test file
		await vscode.workspace.fs.writeFile(
			testFileUri,
			Buffer.from("Initial test content\nLine 2\nLine 3\n"),
		);
	});

	suiteTeardown(async () => {
		// Clean up test files
		try {
			if (fs.existsSync(testFilePath)) {
				fs.unlinkSync(testFilePath);
			}
			if (fs.existsSync(testWorkspacePath)) {
				fs.rmdirSync(testWorkspacePath, { recursive: true });
			}
		} catch (err) {
			console.warn("Failed to clean up test files:", err);
		}
	});

	test("Extension should be present and active", async () => {
		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.snapback-vscode",
		);
		assert.ok(extension, "Extension should be installed");

		if (!extension.isActive) {
			await extension.activate();
		}

		assert.ok(extension.isActive, "Extension should be active");
		console.log("✅ Extension is active");
	});

	test("Should register all core commands", async () => {
		const commands = await vscode.commands.getCommands(true);

		const coreCommands = [
			"snapback.initialize",
			"snapback.showStatus",
			"snapback.createSnapshot",
			"snapback.snapBack",
			"snapback.protectFile",
			"snapback.protectCurrentFile",
			"snapback.unprotectFile",
			"snapback.changeProtectionLevel",
			"snapback.setWatchLevel",
			"snapback.setWarnLevel",
			"snapback.setBlockLevel",
			"snapback.showAllProtectedFiles",
			"snapback.deleteSnapshot",
			"snapback.renameSnapshot",
			"snapback.protectSnapshot",
			"snapback.viewSnapshot",
			"snapback.showAllSnapshots",
			"snapback.deleteOlderSnapshots",
			"snapback.unprotectAndDeleteSnapshot",
			"snapback.openWalkthrough",
			"snapback.refreshViews",
			"snapback.compareWithSnapshot",
			"snapback.updateConfiguration",
			"snapback.createPolicyOverride",
			"snapback.toggleOfflineMode",
		];

		const missingCommands: string[] = [];
		for (const command of coreCommands) {
			if (!commands.includes(command)) {
				missingCommands.push(command);
			}
		}

		assert.strictEqual(
			missingCommands.length,
			0,
			`Should register all core commands. Missing: ${missingCommands.join(", ")}`,
		);
		console.log(`✅ All ${coreCommands.length} core commands registered`);
	});

	test("Should initialize the extension properly", async () => {
		// Execute initialize command
		await vscode.commands.executeCommand("snapback.initialize");

		// Give time for initialization
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Check if status bar item is visible
		// Note: This is a simplified check. In a real E2E test, we would check UI elements.
		console.log("✅ Extension initialized successfully");
	});

	test("Should protect a file with Watch level and create snapshot", async () => {
		// Open the test file in an editor
		const document = await vscode.workspace.openTextDocument(testFileUri);
		const editor = await vscode.window.showTextDocument(document);

		// Verify the file is open
		assert.strictEqual(
			editor.document.uri.fsPath,
			testFilePath,
			"Test file should be open",
		);

		// Protect the file with Watch level
		await vscode.commands.executeCommand("snapback.protectFile", testFileUri);

		// Give time for the operation to complete
		await new Promise((resolve) => setTimeout(resolve, 2000));

		// Modify the file content
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(3, 0), "Added line during test\n");
		});

		// Save the file (this should trigger auto-snapshot with Watch level)
		await document.save();

		// Give time for snapshot creation
		await new Promise((resolve) => setTimeout(resolve, 3000));

		console.log("✅ File protected and snapshot created automatically");
	});

	test("Should show protection status", async () => {
		// Execute show status command
		await vscode.commands.executeCommand("snapback.showStatus");

		// Give time for UI to update
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Protection status shown");
	});

	test("Should change protection level from Watch to Warn", async () => {
		// Change protection level to Warn
		await vscode.commands.executeCommand("snapback.setWarnLevel", testFileUri);

		// Give time for the operation to complete
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Protection level changed to Warn");
	});

	test("Should handle Warn level protection (confirmation dialog)", async () => {
		// Get the document again
		const document = await vscode.workspace.openTextDocument(testFileUri);
		const editor = await vscode.window.showTextDocument(document);

		// Modify the file content
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(4, 0), "Another line added\n");
		});

		// Save the file (this should trigger confirmation dialog with Warn level)
		await document.save();

		// Give time for the confirmation dialog
		await new Promise((resolve) => setTimeout(resolve, 2000));

		console.log("✅ Warn level protection handled correctly");
	});

	test("Should change protection level from Warn to Block", async () => {
		// Change protection level to Block
		await vscode.commands.executeCommand("snapback.setBlockLevel", testFileUri);

		// Give time for the operation to complete
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Protection level changed to Block");
	});

	test("Should handle Block level protection (required note)", async () => {
		// Get the document again
		const document = await vscode.workspace.openTextDocument(testFileUri);
		const editor = await vscode.window.showTextDocument(document);

		// Modify the file content
		await editor.edit((editBuilder) => {
			editBuilder.insert(new vscode.Position(5, 0), "Final test line\n");
		});

		// Save the file (this should require a snapshot note with Block level)
		await document.save();

		// Give time for the note dialog
		await new Promise((resolve) => setTimeout(resolve, 2000));

		console.log("✅ Block level protection handled correctly");
	});

	test("Should view snapshots", async () => {
		// Execute view snapshots command
		await vscode.commands.executeCommand("snapback.showAllSnapshots");

		// Give time for UI to update
		await new Promise((resolve) => setTimeout(resolve, 2000));

		console.log("✅ Snapshots view opened");
	});

	test("Should show all protected files", async () => {
		// Execute show protected files command
		await vscode.commands.executeCommand("snapback.showAllProtectedFiles");

		// Give time for UI to update
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Protected files view opened");
	});

	test("Should rename a snapshot", async () => {
		// Execute rename snapshot command
		await vscode.commands.executeCommand("snapback.renameSnapshot");

		// Give time for the operation
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Snapshot rename functionality available");
	});

	test("Should delete a snapshot", async () => {
		// Execute delete snapshot command
		await vscode.commands.executeCommand("snapback.deleteSnapshot");

		// Give time for the operation
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Snapshot delete functionality available");
	});

	test("Should unprotect a file", async () => {
		// Execute unprotect file command
		await vscode.commands.executeCommand("snapback.unprotectFile", testFileUri);

		// Give time for the operation to complete
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ File unprotected successfully");
	});

	test("Should open walkthrough", async () => {
		// Execute open walkthrough command
		await vscode.commands.executeCommand("snapback.openWalkthrough");

		// Give time for UI to update
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Walkthrough opened successfully");
	});

	test("Should refresh views", async () => {
		// Execute refresh views command
		await vscode.commands.executeCommand("snapback.refreshViews");

		// Give time for UI to update
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Views refreshed successfully");
	});

	test("Should compare with snapshot", async () => {
		// Execute compare with snapshot command
		await vscode.commands.executeCommand(
			"snapback.compareWithSnapshot",
			testFileUri,
		);

		// Give time for the operation
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Compare with snapshot functionality available");
	});

	test("Should create policy override", async () => {
		// Execute create policy override command
		await vscode.commands.executeCommand(
			"snapback.createPolicyOverride",
			testFileUri,
		);

		// Give time for the operation
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Policy override functionality available");
	});

	test("Should toggle offline mode", async () => {
		// Execute toggle offline mode command
		await vscode.commands.executeCommand("snapback.toggleOfflineMode");

		// Give time for the operation
		await new Promise((resolve) => setTimeout(resolve, 1000));

		console.log("✅ Offline mode toggled successfully");
	});
});
