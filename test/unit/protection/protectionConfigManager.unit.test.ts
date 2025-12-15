import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectionConfigManager } from "@vscode/protection/ProtectionConfigManager";
import type { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";
import { patchRegistryMockWithProtectionLevel } from "../../helpers/mockPatches";

// vscode mock provided by setup.ts

describe("ProtectionConfigManager Integration", () => {
	let tempDir: string;
	let registry: ProtectedFileRegistry;
	let configManager: ProtectionConfigManager;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-test-"));

		// Create a mock registry since we can't easily mock Memento
		registry = {
			add: vi.fn(),
			remove: vi.fn(),
			clearAll: vi.fn(),
			isProtected: vi.fn().mockReturnValue(false),
			getAllProtectedFiles: vi.fn().mockReturnValue([]),
		} as unknown as ProtectedFileRegistry;

		// Patch the registry with getProtectionLevel method
		patchRegistryMockWithProtectionLevel(registry);

		configManager = new ProtectionConfigManager(tempDir, registry);
	});

	afterEach(async () => {
		configManager.dispose();
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("initialize creates default config files", async () => {
		await configManager.initialize();

		const protectedExists = await fs
			.access(path.join(tempDir, ".snapbackprotected"))
			.then(() => true)
			.catch(() => false);

		const ignoreExists = await fs
			.access(path.join(tempDir, ".snapbackignore"))
			.then(() => true)
			.catch(() => false);

		expect(protectedExists).toBe(true);
		expect(ignoreExists).toBe(true);
	});

	it("handleProtectFile adds file to config and registry", async () => {
		await configManager.initialize();

		const testFile = path.join(tempDir, "test.ts");
		await fs.writeFile(testFile, 'console.log("test")');

		await configManager.handleProtectFile(testFile);

		expect(registry.add).toHaveBeenCalledWith(testFile);
	});

	it("handleUnprotectFile removes file from config and registry", async () => {
		await configManager.initialize();

		const testFile = path.join(tempDir, "test.ts");
		await fs.writeFile(testFile, 'console.log("test")');

		// First protect the file
		await configManager.handleProtectFile(testFile);

		// Then unprotect it
		await configManager.handleUnprotectFile(testFile);

		expect(registry.remove).toHaveBeenCalledWith(testFile);
	});
});
