import * as assert from "node:assert";
import * as vscode from "vscode";

suite("SnapBack Extension Activation Test Suite", () => {
	test("Extension should be present", async function () {
		this.timeout(5000);

		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.snapback-vscode",
		);
		assert.ok(extension, "Extension should be installed");
	});

	test("Extension should activate successfully", async function () {
		this.timeout(10000);

		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.snapback-vscode",
		);
		assert.ok(extension, "Extension should be installed");

		// Try to activate the extension
		if (!extension.isActive) {
			try {
				await extension.activate();
				assert.ok(
					extension.isActive,
					"Extension should be active after activation",
				);
			} catch (error) {
				// If activation fails, check if it's already activated
				assert.ok(extension.isActive, `Extension activation failed: ${error}`);
			}
		} else {
			assert.ok(true, "Extension is already active");
		}
	});

	test("VS Code API should be available", () => {
		assert.ok(vscode, "VS Code API should be available");
		assert.ok(vscode.commands, "VS Code commands API should be available");
		assert.ok(vscode.workspace, "VS Code workspace API should be available");
		assert.ok(vscode.window, "VS Code window API should be available");
	});
});
