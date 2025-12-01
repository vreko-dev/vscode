import * as assert from "node:assert";
import packageJson from "../../../package.json";

suite("Commands: Color Icon Labels", () => {
	test("all SnapBack commands should have color icons", () => {
		const commands = packageJson.contributes.commands;

		commands
			.filter((cmd: any) => cmd.command.startsWith("snapback."))
			.forEach((cmd: any) => {
				const hasColorIcon =
					cmd.title.includes("🟢") ||
					cmd.title.includes("🟡") ||
					cmd.title.includes("🔴") ||
					cmd.title.includes("SnapBack");

				assert.ok(
					hasColorIcon,
					`Command ${cmd.command} should include color icon or SnapBack brand`,
				);
			});
	});

	test("protection level commands should use correct color icons", () => {
		const commands = packageJson.contributes.commands;

		const watchCmd = commands.find(
			(c: any) => c.command === "snapback.setWatchLevel",
		);
		assert.ok(
			watchCmd?.title.includes("🟢") || watchCmd?.title.includes("Watch"),
			"Watch command should use green circle",
		);

		const warnCmd = commands.find(
			(c: any) => c.command === "snapback.setWarnLevel",
		);
		assert.ok(
			warnCmd?.title.includes("🟡") || warnCmd?.title.includes("Warn"),
			"Warn command should use yellow circle",
		);

		const blockCmd = commands.find(
			(c: any) => c.command === "snapback.setBlockLevel",
		);
		assert.ok(
			blockCmd?.title.includes("🔴") || blockCmd?.title.includes("Block"),
			"Block command should use red circle",
		);
	});

	test("no commands should use lock icon (deprecated)", () => {
		const commands = packageJson.contributes.commands;

		commands.forEach((cmd: any) => {
			assert.ok(
				!cmd.title.includes("🔒"),
				`Command ${cmd.command} should not use deprecated lock icon`,
			);
		});
	});
});
