import * as assert from "node:assert";
import * as vscode from "vscode";

suite("Vreko Simple Test Suite", () => {
	test("Extension should be present and active", async function () {
		this.timeout(10000);

		const extension = vscode.extensions.getExtension(
			"MarcelleLabs.vreko-vscode",
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
			"vreko.initialize",
			"vreko.showStatus",
			"vreko.createSnapshot",
			"vreko.vreko",
			"vreko.protectFile",
			"vreko.protectCurrentFile",
			"vreko.unprotectFile",
			"vreko.changeProtectionLevel",
			"vreko.setWatchLevel",
			"vreko.setWarnLevel",
			"vreko.setBlockLevel",
		];

		for (const command of coreCommands) {
			assert.ok(
				commands.includes(command),
				`Should register command: ${command}`,
			);
		}
	});
});
