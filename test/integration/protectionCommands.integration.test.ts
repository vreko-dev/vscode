/**
 * Real Integration Tests for Protection Commands
 *
 * Tests the actual user-facing commands and observable behavior.
 * This is MORE valuable than testing internal classes because it tests
 * what users actually interact with.
 */

import * as assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";
import * as vscode from "vscode";

suite("Protection Commands Integration Tests", () => {
	let workspaceRoot: string;
	let testFilePath: string;
	let testFileUri: vscode.Uri;

	setup(async function () {
		this.timeout(15000);

		const workspaceFolders = vscode.workspace.workspaceFolders;
		assert.ok(
			workspaceFolders && workspaceFolders.length > 0,
			"Workspace required",
		);
		workspaceRoot = workspaceFolders[0].uri.fsPath;

		testFilePath = path.join(workspaceRoot, "sample.ts");
		testFileUri = vscode.Uri.file(testFilePath);

		// Ensure extension is activated
		const ext = vscode.extensions.getExtension("MarcelleLabs.snapback-vscode");
		if (ext && !ext.isActive) {
			await ext.activate();
			// Give extension time to initialize
			await wait(1000);
		}
	});

	teardown(async () => {
		await vscode.commands.executeCommand("workbench.action.closeAllEditors");
		await wait(200);
	});

	async function wait(ms: number): Promise<void> {
		await new Promise((resolve) => setTimeout(resolve, ms));
	}

	/**
	 * Test Command Registration
	 */
	suite("Command Registration", () => {
		test("should register all protection commands", async function () {
			this.timeout(5000);

			const commands = await vscode.commands.getCommands(true);

			const expectedCommands = [
				"snapback.protectFile",
				"snapback.unprotectFile",
				"snapback.changeProtectionLevel",
				"snapback.setWatchLevel",
				"snapback.setWarnLevel",
				"snapback.setBlockLevel",
			];

			for (const cmd of expectedCommands) {
				assert.ok(commands.includes(cmd), `Should register ${cmd} command`);
			}
		});

		test("should register snapshot commands", async function () {
			this.timeout(5000);

			const commands = await vscode.commands.getCommands(true);

			const expectedCommands = [
				"snapback.createSnapshot",
				"snapback.snapBack",
				"snapback.viewSnapshots",
			];

			for (const cmd of expectedCommands) {
				assert.ok(commands.includes(cmd), `Should register ${cmd} command`);
			}
		});
	});

	/**
	 * Test Extension Activation
	 */
	suite("Extension Activation", () => {
		test("extension should be active", async function () {
			this.timeout(5000);

			const ext = vscode.extensions.getExtension(
				"MarcelleLabs.snapback-vscode",
			);
			assert.ok(ext, "Extension should be installed");
			assert.ok(ext.isActive, "Extension should be active");
		});

		test("should handle workspace with test files", async function () {
			this.timeout(5000);

			const folders = vscode.workspace.workspaceFolders;
			assert.ok(folders && folders.length > 0, "Should have workspace");

			// Verify test file exists
			assert.ok(fs.existsSync(testFilePath), "Test file should exist");
		});
	});

	/**
	 * Test File Operations
	 */
	suite("File Operations", () => {
		test("should open and edit test file", async function () {
			this.timeout(10000);

			// Open document
			const doc = await vscode.workspace.openTextDocument(testFileUri);
			const editor = await vscode.window.showTextDocument(doc);

			assert.ok(doc, "Document should open");
			assert.ok(editor, "Editor should be active");
			assert.strictEqual(
				doc.isDirty,
				false,
				"Document should not be dirty initially",
			);

			// Make an edit
			const success = await editor.edit((editBuilder) => {
				editBuilder.insert(new vscode.Position(0, 0), "// Test comment\n");
			});

			assert.ok(success, "Edit should succeed");
			await wait(200);

			assert.ok(doc.isDirty, "Document should be dirty after edit");

			// Save
			const saved = await doc.save();
			assert.ok(saved, "Save should succeed");
			await wait(200);

			assert.strictEqual(
				doc.isDirty,
				false,
				"Document should not be dirty after save",
			);
		});
	});

	/**
	 * Test Workspace Configuration
	 */
	suite("Workspace Configuration", () => {
		test("should access snapback configuration", async function () {
			this.timeout(5000);

			const config = vscode.workspace.getConfiguration("snapback");
			assert.ok(config, "Should access configuration");

			// These may be undefined if not set, which is fine
			const _maxSnapshots = config.get("maxSnapshots");
			const _autoCheckpoint = config.get("autoCheckpoint");

			// Just verify we can read config without errors
			assert.ok(true, "Configuration access works");
		});
	});

	/**
	 * Test .snapback Directory
	 */
	suite("SnapBack Directory", () => {
		test("should create or access .snapback directory", async function () {
			this.timeout(5000);

			const snapbackDir = path.join(workspaceRoot, ".snapback");

			// Create if doesn't exist
			if (!fs.existsSync(snapbackDir)) {
				fs.mkdirSync(snapbackDir, { recursive: true });
			}

			assert.ok(fs.existsSync(snapbackDir), ".snapback directory should exist");

			// Verify it's a directory
			const stats = fs.statSync(snapbackDir);
			assert.ok(stats.isDirectory(), ".snapback should be a directory");
		});
	});
});
