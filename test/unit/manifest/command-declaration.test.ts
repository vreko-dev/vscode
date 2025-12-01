/**
 * @fileoverview Command Declaration Tests - Validates all extension commands are properly declared
 *
 * This test suite validates that all commands used in the extension are properly
 * declared in package.json. This prevents the "command not found" errors that
 * occur when commands are used but not declared.
 *
 * TEST COVERAGE:
 * - All implemented commands are declared in package.json
 * - Protection level commands are properly declared
 * - Command declarations include proper titles and categories
 *
 * @author SnapBack QA Team
 * @version 1.0.0
 * @since 2025-10-11
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Command Declaration", () => {
	it("should declare all protection level commands in package.json", async () => {
		// Read package.json
		const packageJsonPath = path.join(__dirname, "../../../package.json");
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(packageJsonContent);

		const declaredCommands = packageJson.contributes?.commands || [];
		const declaredCommandIds = declaredCommands.map((cmd: any) => cmd.command);

		// Check that protection level commands are declared
		expect(declaredCommandIds).toContain("snapback.setWatchLevel");
		expect(declaredCommandIds).toContain("snapback.setWarnLevel");
		expect(declaredCommandIds).toContain("snapback.setBlockLevel");

		// Check that protection management commands are declared
		expect(declaredCommandIds).toContain("snapback.protectFile");
		expect(declaredCommandIds).toContain("snapback.changeProtectionLevel");
		expect(declaredCommandIds).toContain("snapback.unprotectFile");

		// Check that core commands are declared
		expect(declaredCommandIds).toContain("snapback.createSnapshot");
		expect(declaredCommandIds).toContain("snapback.refreshViews");

		// Check that decoration commands are declared
		expect(declaredCommandIds).toContain("snapback.clearFileHealthDecorations");
		expect(declaredCommandIds).toContain(
			"snapback.refreshFileHealthDecorations",
		);
		expect(declaredCommandIds).toContain("snapback.showFileHealthStatus");
	});

	it("should have proper titles for protection level commands", async () => {
		// Read package.json
		const packageJsonPath = path.join(__dirname, "../../../package.json");
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(packageJsonContent);

		const declaredCommands = packageJson.contributes?.commands || [];

		// Find protection level commands
		const watchCommand = declaredCommands.find(
			(cmd: any) => cmd.command === "snapback.setWatchLevel",
		);
		const warnCommand = declaredCommands.find(
			(cmd: any) => cmd.command === "snapback.setWarnLevel",
		);
		const blockCommand = declaredCommands.find(
			(cmd: any) => cmd.command === "snapback.setBlockLevel",
		);

		// Check that commands have proper titles
		expect(watchCommand).toBeDefined();
		expect(watchCommand?.title).toContain("Watch");
		expect(watchCommand?.title).toContain("Silent");

		expect(warnCommand).toBeDefined();
		expect(warnCommand?.title).toContain("Warn");
		expect(warnCommand?.title).toContain("Notify");

		expect(blockCommand).toBeDefined();
		expect(blockCommand?.title).toContain("Block");
		expect(blockCommand?.title).toContain("Required");
	});

	it("should have all commands in proper categories", async () => {
		// Read package.json
		const packageJsonPath = path.join(__dirname, "../../../package.json");
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(packageJsonContent);

		const declaredCommands = packageJson.contributes?.commands || [];

		// Check that all commands have the SnapBack category
		for (const command of declaredCommands) {
			expect(command.category).toBe("SnapBack");
		}
	});
});
