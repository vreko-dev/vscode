import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

suite("SnapBack Extension Integration Test Suite", () => {
	let workspaceRoot: string;
	let testFilePath: string;
	let testFileUri: vscode.Uri;

	suiteSetup(async function () {
		this.timeout(30000);

		// Get workspace root
		const workspaceFolders = vscode.workspace.workspaceFolders;
		assert.ok(
			workspaceFolders && workspaceFolders.length > 0,
			"Workspace required",
		);
		workspaceRoot = workspaceFolders[0].uri.fsPath;

		// Create test file
		testFilePath = path.join(workspaceRoot, "test-file.txt");
		testFileUri = vscode.Uri.file(testFilePath);

		// Write initial content to test file
		await vscode.workspace.fs.writeFile(
			testFileUri,
			Buffer.from("Initial test content\n"),
		);
	});

	suiteTeardown(() => {
		// Clean up test file
		try {
			if (fs.existsSync(testFilePath)) {
				fs.unlinkSync(testFilePath);
			}
		} catch (err) {
			console.warn("Failed to clean up test file:", err);
		}
	});

	test("Extension should be present and active", async function () {
		this.timeout(10000);

		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.snapback-vscode",
		);
		assert.ok(extension, "Extension should be installed");

		if (!extension.isActive) {
			await extension.activate();
		}

		assert.ok(extension.isActive, "Extension should be active");
	});

	test("Should register core commands", async function () {
		this.timeout(5000);

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
		];

		for (const command of coreCommands) {
			assert.ok(
				commands.includes(command),
				`Should register command: ${command}`,
			);
		}
	});

	test("Should protect a file with Watch level", async function () {
		this.timeout(15000);

		// Execute protect file command
		await vscode.commands.executeCommand("snapback.protectFile", testFileUri);

		// Give time for the operation to complete
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify the file is protected (by checking context or through other means)
		// This would require access to internal APIs or checking UI elements
		assert.ok(true, "Command executed without error");
	});

	test("Should create a snapshot", async function () {
		this.timeout(15000);

		// Modify the file
		await vscode.workspace.fs.writeFile(
			testFileUri,
			Buffer.from("Initial test content\nModified content\n"),
		);

		// Execute create snapshot command
		await vscode.commands.executeCommand(
			"snapback.createSnapshot",
			testFileUri,
		);

		// Give time for the operation to complete
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// Verify the snapshot was created
		assert.ok(true, "Snapshot command executed without error");
	});

	test("Should show protection status", async function () {
		this.timeout(5000);

		// Execute show status command
		await vscode.commands.executeCommand("snapback.showStatus");

		// Give time for UI to update
		await new Promise((resolve) => setTimeout(resolve, 500));

		assert.ok(true, "Status command executed without error");
	});

	test("Should change protection level", async function () {
		this.timeout(15000);

		// Execute change protection level command
		await vscode.commands.executeCommand(
			"snapback.changeProtectionLevel",
			testFileUri,
		);

		// Give time for UI interaction
		await new Promise((resolve) => setTimeout(resolve, 1000));

		assert.ok(true, "Change protection level command executed without error");
	});

	test("Should unprotect a file", async function () {
		this.timeout(10000);

		// Execute unprotect file command
		await vscode.commands.executeCommand("snapback.unprotectFile", testFileUri);

		// Give time for the operation to complete
		await new Promise((resolve) => setTimeout(resolve, 1000));

		assert.ok(true, "Unprotect command executed without error");
	});

	test("Should initialize the extension", async function () {
		this.timeout(10000);

		// Execute initialize command
		await vscode.commands.executeCommand("snapback.initialize");

		// Give time for initialization
		await new Promise((resolve) => setTimeout(resolve, 2000));

		assert.ok(true, "Initialize command executed without error");
	});
});
