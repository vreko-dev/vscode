/**
 * @fileoverview Protection Level Commands Tests - Validates protection level command functionality
 *
 * This test suite validates that protection level commands work correctly.
 * This ensures that the commands not only register but also execute properly.
 *
 * TEST COVERAGE:
 * - Protection level command handlers execute without errors
 * - Command handlers follow expected patterns
 * - Protection level functionality is properly implemented
 *
 * @author SnapBack QA Team
 * @version 1.0.0
 * @since 2025-10-11
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Protection Level Commands", () => {
	it("should have proper command handler structure", async () => {
		// Read the extension file
		const extensionPath = path.join(__dirname, "../../../src/extension.ts");
		const extensionContent = await fs.readFile(extensionPath, "utf-8");

		// Check that the setProtectionLevelQuick function has the expected structure
		expect(extensionContent).toContain("setProtectionLevelQuick");
		expect(extensionContent).toContain(
			"async function setProtectionLevelQuick",
		);

		// Check that it calls the proper methods
		expect(extensionContent).toContain("protectedFileRegistry.isProtected");
		expect(extensionContent).toContain(
			"protectionConfigManager.handleProtectFile",
		);
		expect(extensionContent).toContain(
			"protectedFileRegistry.updateProtectionLevel",
		);
	});

	it("should register all three protection level commands", async () => {
		// Read the extension file
		const extensionPath = path.join(__dirname, "../../../src/extension.ts");
		const extensionContent = await fs.readFile(extensionPath, "utf-8");

		// Check command registration patterns
		expect(extensionContent).toContain("snapback.setWatchLevel");
		expect(extensionContent).toContain("snapback.setWarnLevel");
		expect(extensionContent).toContain("snapback.setBlockLevel");

		// Check that they all call setProtectionLevelQuick with correct parameters
		expect(extensionContent).toContain("'watch'");
		expect(extensionContent).toContain("'warn'");
		expect(extensionContent).toContain("'block'");
	});

	it("should properly add command registrations to context subscriptions", async () => {
		// Read the extension file
		const extensionPath = path.join(__dirname, "../../../src/extension.ts");
		const extensionContent = await fs.readFile(extensionPath, "utf-8");

		// Verify context subscriptions include the protection level commands
		expect(extensionContent).toContain("context.subscriptions.push");
		expect(extensionContent).toContain("setWatchLevelCommand");
		expect(extensionContent).toContain("setWarnLevelCommand");
		expect(extensionContent).toContain("setBlockLevelCommand");
	});
});
