import * as fs from "node:fs/promises";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigFileManager } from "../../src/protection/ConfigFileManager.js";

// Mock fs module
vi.mock("fs/promises", () => {
	return {
		default: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			access: vi.fn(),
		},
		readFile: vi.fn(),
		writeFile: vi.fn(),
		access: vi.fn(),
	};
});

// Mock minimatch
const minimatchMock = vi.fn(
	(filePath: string, pattern: string, _options?: Record<string, unknown>) => {
		if (pattern === "bad[") {
			throw new Error("Invalid pattern");
		}

		if (pattern === "*.ts") {
			return filePath.endsWith(".ts");
		}
		if (pattern === "package.json") {
			return filePath.endsWith("package.json");
		}
		return false;
	},
);

vi.mock("minimatch", () => ({
	minimatch: minimatchMock,
}));

describe("ConfigFileManager", () => {
	let configManager: ConfigFileManager;
	const mockWorkspaceRoot = "/test/workspace";

	beforeEach(() => {
		configManager = new ConfigFileManager(mockWorkspaceRoot);
		vi.clearAllMocks();
	});

	it("readConfig returns empty array when file does not exist", async () => {
		// Given: No config file exists
		vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });

		// When: readConfig('protected')
		const result = await configManager.readConfig("protected");

		// Then: Returns []
		expect(result).toEqual([]);

		// Verification: No error thrown
		expect(fs.readFile).toHaveBeenCalledWith(
			path.join(mockWorkspaceRoot, ".snapbackprotected"),
			"utf-8",
		);
	});

	it("writeConfig creates file with correct format", async () => {
		// Given: Patterns ['*.ts', 'package.json']
		const patterns = ["*.ts", "package.json"];
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);

		// When: writeConfig('protected', patterns)
		await configManager.writeConfig("protected", patterns);

		// Then: File contains '*.ts\npackage.json\n'
		expect(fs.writeFile).toHaveBeenCalledWith(
			path.join(mockWorkspaceRoot, ".snapbackprotected"),
			"*.ts\npackage.json\n",
			"utf-8",
		);

		// Verification: File exists and content matches
	});

	it("addPattern appends to existing file", async () => {
		// Given: Config has ['*.ts']
		vi.mocked(fs.readFile).mockResolvedValue("*.ts\n");
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);

		// When: addPattern('protected', 'package.json')
		await configManager.addPattern("protected", "package.json");

		// Then: Config has ['*.ts', 'package.json']
		expect(fs.writeFile).toHaveBeenCalledWith(
			path.join(mockWorkspaceRoot, ".snapbackprotected"),
			"*.ts\npackage.json\n",
			"utf-8",
		);

		// Verification: Both patterns present
	});

	it("addPattern does not duplicate", async () => {
		// Given: Config has ['*.ts']
		vi.mocked(fs.readFile).mockResolvedValue("*.ts\n");
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);

		// When: addPattern('protected', '*.ts')
		await configManager.addPattern("protected", "*.ts");

		// Then: Config still has ['*.ts'] only once
		// Verification: No duplicates - writeFile should not be called
		expect(fs.writeFile).not.toHaveBeenCalled();
	});

	it("removePattern removes specific pattern", async () => {
		// Given: Config has ['*.ts', 'package.json']
		vi.mocked(fs.readFile).mockResolvedValue("*.ts\npackage.json\n");
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);

		// When: removePattern('protected', '*.ts')
		await configManager.removePattern("protected", "*.ts");

		// Then: Config has ['package.json'] only
		expect(fs.writeFile).toHaveBeenCalledWith(
			path.join(mockWorkspaceRoot, ".snapbackprotected"),
			"package.json\n",
			"utf-8",
		);

		// Verification: Correct pattern removed
	});

	it("parseConfigContent ignores comments", async () => {
		// Given: File content with '# comment\n*.ts'
		const content = "# comment\n*.ts";
		vi.mocked(fs.readFile).mockResolvedValue(content);

		// When: readConfig
		const result = await configManager.readConfig("protected");

		// Then: Returns ['*.ts'] without comment
		expect(result).toEqual(["*.ts"]);

		// Verification: Comments stripped
	});

	it("parseConfigContent ignores empty lines", async () => {
		// Given: File with '*.ts\n\npackage.json'
		const content = "*.ts\n\npackage.json";
		vi.mocked(fs.readFile).mockResolvedValue(content);

		// When: readConfig
		const result = await configManager.readConfig("protected");

		// Then: Returns ['*.ts', 'package.json']
		expect(result).toEqual(["*.ts", "package.json"]);

		// Verification: Empty lines removed
	});

	it("matchesConfig returns true for matching glob", async () => {
		// Given: Config has ['*.ts']
		vi.mocked(fs.readFile).mockResolvedValue("*.ts\n");

		// When: matchesConfig('protected', 'src/index.ts')
		const result = await configManager.matchesConfig(
			"protected",
			"/test/workspace/src/index.ts",
		);

		// Then: Returns true
		expect(result).toBe(true);

		// Verification: Glob matching works
	});

	it("matchesConfig returns false for non-matching", async () => {
		// Given: Config has ['*.ts']
		vi.mocked(fs.readFile).mockResolvedValue("*.ts\n");

		// When: matchesConfig('protected', 'package.json')
		const result = await configManager.matchesConfig(
			"protected",
			"/test/workspace/package.json",
		);

		// Then: Returns false
		expect(result).toBe(false);

		// Verification: Non-matches rejected
	});

	it("filters out overly complex patterns when reading config", async () => {
		const complexPattern = "*".repeat(600);
		vi.mocked(fs.readFile).mockResolvedValue(`*.ts\n${complexPattern}\n`);

		const result = await configManager.readConfig("protected");
		expect(result).toEqual(["*.ts"]);
	});

	it("addPatternWithValidation rejects invalid patterns", async () => {
		const invalidPattern = "*".repeat(600);
		vi.mocked(fs.readFile).mockResolvedValue("");

		await expect(
			configManager.addPatternWithValidation("protected", invalidPattern),
		).rejects.toThrow(/invalid glob pattern/i);
	});

	it("matchesConfig ignores patterns that cause matcher errors", async () => {
		vi.mocked(fs.readFile).mockResolvedValue("bad[\n");

		const result = await configManager.matchesConfig(
			"protected",
			"/test/workspace/src/index.ts",
		);

		expect(result).toBe(false);
		expect(minimatchMock).toHaveBeenCalled();
	});

	it("ensureConfigExists is idempotent", async () => {
		// Given: Config file already exists
		vi.mocked(fs.access).mockResolvedValue(undefined as any);
		vi.mocked(fs.writeFile).mockResolvedValue(undefined);

		// When: ensureConfigExists called twice
		await configManager.ensureConfigExists("protected");
		await configManager.ensureConfigExists("protected");

		// Then: File content unchanged
		// Verification: No overwrite
		expect(fs.writeFile).not.toHaveBeenCalled();
	});
});
