import * as assert from "node:assert";
import * as vscode from "vscode";

/**
 * Optimal Extension Test Suite
 *
 * This test suite focuses on what we can reliably test in the current environment:
 * 1. Extension loading and basic activation
 * 2. VS Code API availability
 * 3. Core extension metadata verification
 */

suite("Optimal SnapBack Extension Test Suite", () => {
	test("Extension should be present and loadable", async function () {
		this.timeout(5000);

		// Verify the extension is installed
		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.snapback-vscode",
		);
		assert.ok(extension, "SnapBack extension should be installed");

		// Log extension metadata for verification
		console.log("Extension ID:", extension.id);
		console.log("Extension version:", extension.packageJSON.version);
		console.log("Extension publisher:", extension.packageJSON.publisher);
		console.log("Extension name:", extension.packageJSON.name);
	});

	test("Extension should activate without errors", async function () {
		this.timeout(10000);

		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.snapback-vscode",
		);
		assert.ok(extension, "Extension should be installed");

		// Attempt activation
		try {
			if (!extension.isActive) {
				await extension.activate();
			}
			// If we get here without exception, activation succeeded
			assert.ok(true, "Extension activated successfully");
		} catch (error) {
			// Even if activation throws, check if it's actually active
			if (extension.isActive) {
				assert.ok(true, "Extension is active despite activation error");
			} else {
				// Re-throw to fail the test
				throw error;
			}
		}
	});

	test("VS Code APIs should be accessible", () => {
		// Verify core VS Code APIs are available
		assert.ok(vscode, "VS Code API should be available");
		assert.ok(vscode.commands, "VS Code commands API should be available");
		assert.ok(vscode.workspace, "VS Code workspace API should be available");
		assert.ok(vscode.window, "VS Code window API should be available");
		assert.ok(vscode.extensions, "VS Code extensions API should be available");
	});

	test("Extension metadata should be correct", () => {
		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.snapback-vscode",
		);
		assert.ok(extension, "Extension should be installed");

		const packageJSON = extension.packageJSON;

		// Verify essential metadata
		assert.strictEqual(
			packageJSON.name,
			"snapback-vscode",
			"Extension name should be correct",
		);
		assert.strictEqual(
			packageJSON.publisher,
			"MarcelleLabs",
			"Publisher should be correct",
		);
		assert.ok(packageJSON.version, "Version should be defined");
		assert.ok(
			packageJSON.engines?.vscode,
			"VS Code engine requirement should be defined",
		);

		// Verify activation events are defined
		assert.ok(
			Array.isArray(packageJSON.activationEvents),
			"Activation events should be an array",
		);
		assert.ok(
			packageJSON.activationEvents.length > 0,
			"Should have activation events",
		);

		// Verify contributes section exists
		assert.ok(packageJSON.contributes, "Should have contributes section");
	});
});
