/**
 * @fileoverview Command Fix Verification Tests - Validates that command registration fix is in place
 *
 * This test suite validates that the fix for missing command registrations is properly implemented.
 * This prevents regression of the "command not found" errors.
 *
 * TEST COVERAGE:
 * - setProtectionLevelQuick helper function exists
 * - Protection level commands are registered with proper handlers
 * - Command registration follows the expected pattern
 *
 * @author SnapBack QA Team
 * @version 1.0.0
 * @since 2025-10-11
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Command Fix Verification", () => {
	it("should have setProtectionLevelQuick function in extension.ts", async () => {
		// Read the extension file
		const extensionPath = path.join(__dirname, "../../../src/extension.ts");
		const extensionContent = await fs.readFile(extensionPath, "utf-8");

		// Check that the helper function exists
		expect(extensionContent).toContain("setProtectionLevelQuick");
		expect(extensionContent).toContain(
			"async function setProtectionLevelQuick",
		);
	});

	it("should register protection level commands in extension.ts", async () => {
		// Read the extension file
		const extensionPath = path.join(__dirname, "../../../src/extension.ts");
		const extensionContent = await fs.readFile(extensionPath, "utf-8");

		// Check that commands are registered
		expect(extensionContent).toContain("snapback.setWatchLevel");
		expect(extensionContent).toContain("snapback.setWarnLevel");
		expect(extensionContent).toContain("snapback.setBlockLevel");

		// Check that registration pattern is correct
		expect(extensionContent).toContain("vscode.commands.registerCommand");
		expect(extensionContent).toContain("setProtectionLevelQuick");
	});

	it("should have command registrations in context subscriptions", async () => {
		// Read the extension file
		const extensionPath = path.join(__dirname, "../../../src/extension.ts");
		const extensionContent = await fs.readFile(extensionPath, "utf-8");

		// Check that commands are added to context subscriptions
		expect(extensionContent).toContain("setWatchLevelCommand");
		expect(extensionContent).toContain("setWarnLevelCommand");
		expect(extensionContent).toContain("setBlockLevelCommand");
		expect(extensionContent).toContain("context.subscriptions.push");
	});
});
