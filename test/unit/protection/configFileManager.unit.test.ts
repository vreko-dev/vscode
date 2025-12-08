import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConfigFileManager } from "@vscode/protection/ConfigFileManager";

describe("ConfigFileManager", () => {
	let tempDir: string;
	let configManager: ConfigFileManager;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-test-"));
		configManager = new ConfigFileManager(tempDir);
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("readConfig returns empty array when file does not exist", async () => {
		const patterns = await configManager.readConfig("protected");
		expect(patterns).toEqual([]);
	});

	it("writeConfig creates file with patterns", async () => {
		await configManager.writeConfig("protected", ["*.ts", "package.json"]);

		const content = await fs.readFile(
			path.join(tempDir, ".snapbackprotected"),
			"utf-8",
		);

		expect(content).toBe("*.ts\npackage.json\n");
	});

	it("addPattern appends pattern to existing file", async () => {
		await configManager.writeConfig("protected", ["*.ts"]);
		await configManager.addPattern("protected", "package.json");

		const patterns = await configManager.readConfig("protected");
		expect(patterns).toEqual(["*.ts", "package.json"]);
	});

	it("addPattern does not duplicate existing pattern", async () => {
		await configManager.writeConfig("protected", ["*.ts"]);
		await configManager.addPattern("protected", "*.ts");

		const patterns = await configManager.readConfig("protected");
		expect(patterns).toEqual(["*.ts"]);
	});

	it("removePattern removes pattern from file", async () => {
		await configManager.writeConfig("protected", ["*.ts", "package.json"]);
		await configManager.removePattern("protected", "*.ts");

		const patterns = await configManager.readConfig("protected");
		expect(patterns).toEqual(["package.json"]);
	});

	it("matchesConfig returns true for matching pattern", async () => {
		await configManager.writeConfig("protected", ["src/**/*.ts"]);

		// Create the actual file to test matching
		const testDir = path.join(tempDir, "src");
		await fs.mkdir(testDir, { recursive: true });
		const testFile = path.join(testDir, "index.ts");
		await fs.writeFile(testFile, "test");

		const matches = await configManager.matchesConfig("protected", testFile);

		expect(matches).toBe(true);
	});

	it("matchesConfig returns false for non-matching pattern", async () => {
		await configManager.writeConfig("protected", ["*.ts"]);

		const matches = await configManager.matchesConfig(
			"protected",
			path.join(tempDir, "package.json"),
		);

		expect(matches).toBe(false);
	});

	it("parseConfigContent ignores comments and empty lines", async () => {
		const content = `
# This is a comment
*.ts

# Another comment
package.json
    `.trim();

		// Let's debug what parseConfigContent actually returns
		const configManagerAny = configManager as any;
		const result = configManagerAny.parseConfigContent(content);
		console.log("Parsed content:", result);

		await fs.writeFile(
			path.join(tempDir, ".snapbackprotected"),
			content,
			"utf-8",
		);

		const patterns = await configManager.readConfig("protected");
		console.log("Read config patterns:", patterns);
		expect(patterns).toEqual(["*.ts", "package.json"]);
	});

	it("ensureConfigExists creates default config files", async () => {
		await configManager.ensureConfigExists("protected", [
			"*.ts",
			"package.json",
		]);

		const protectedExists = await fs
			.access(path.join(tempDir, ".snapbackprotected"))
			.then(() => true)
			.catch(() => false);

		expect(protectedExists).toBe(true);

		const patterns = await configManager.readConfig("protected");
		expect(patterns).toEqual(["*.ts", "package.json"]);
	});

	it("addPatternWithValidation works with valid patterns", async () => {
		// Test that valid patterns work
		await configManager.addPatternWithValidation("protected", "*.ts");
		const patterns = await configManager.readConfig("protected");
		expect(patterns).toContain("*.ts");
	});
});
