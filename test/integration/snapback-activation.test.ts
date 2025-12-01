/**
 * Simple Activation Test for SnapBack VS Code Extension
 *
 * This test verifies that the extension can be activated without errors.
 */

import * as assert from "node:assert";
import * as vscode from "vscode";

suite("SnapBack Extension Activation Test", () => {
	test("extension should be present and active", async function () {
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

	test("should register core commands", async function () {
		this.timeout(5000);

		const commands = await vscode.commands.getCommands(true);

		const coreCommands = ["snapback.initialize", "snapback.showStatus"];

		for (const command of coreCommands) {
			assert.ok(
				commands.includes(command),
				`Should register command: ${command}`,
			);
		}
	});
});
