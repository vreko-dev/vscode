import * as assert from "node:assert";
import * as vscode from "vscode";

/**
 * Minimal extension load test - verifies the extension loads in VS Code
 * This is used for quick validation and CI/CD pipelines
 */
suite("SnapBack Extension Load Test", () => {
	test("Extension should be present", async function () {
		this.timeout(10000);

		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.snapback-vscode",
		);
		assert.ok(extension, "Extension should be installed");
		assert.strictEqual(
			typeof extension,
			"object",
			"Extension object should exist",
		);
	});

	test("VS Code API should be available", function () {
		assert.ok(vscode, "VS Code API should be available");
		assert.ok(vscode.commands, "VS Code commands API should be available");
		assert.ok(vscode.workspace, "VS Code workspace API should be available");
		assert.ok(vscode.window, "VS Code window API should be available");
	});
});
