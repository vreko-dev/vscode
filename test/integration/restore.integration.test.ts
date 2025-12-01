import * as assert from "node:assert";
import * as vscode from "vscode";

describe("SnapBack Restore Integration", () => {
	before(async () => {
		// Activate extension
		const ext = vscode.extensions.getExtension("snapback.vscode");
		if (ext && !ext.isActive) {
			await ext.activate();
		}
	});

	it("should register snapback.snapBack command", async () => {
		const commands = await vscode.commands.getCommands(true);
		assert.strictEqual(commands.includes("snapback.snapBack"), true);
	});

	it("should execute restore command without errors", async () => {
		// This test verifies the command exists and can be triggered
		// Full integration testing requires a test workspace
		try {
			await vscode.commands.executeCommand("snapback.snapBack");
			// Command should not throw even if no snapshots exist
		} catch (error) {
			assert.fail(`Command threw error: ${error}`);
		}
	});
});
