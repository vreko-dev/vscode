import * as assert from "node:assert";
import * as path from "node:path";
import * as vscode from "vscode";
import { ConfigFileScanner } from "../../src/services/configFileScanner.js";

suite("ConfigFileScanner Integration Tests", () => {
	let scanner: ConfigFileScanner;

	setup(() => {
		scanner = new ConfigFileScanner();
	});

	test("Should detect config files in workspace", async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		assert.ok(
			workspaceFolders && workspaceFolders.length > 0,
			"Workspace should be open",
		);

		const workspacePath = workspaceFolders[0].uri.fsPath;
		const files = await scanner.scanWorkspace(workspacePath);

		assert.ok(files.length > 0, "Should find at least one config file");

		const packageJson = files.find((f) => f.path.endsWith("package.json"));
		assert.ok(packageJson, "Should find package.json");
		assert.strictEqual(packageJson?.type, "package");
		assert.strictEqual(packageJson?.language, "javascript");
	});

	test("Should create baseline for package.json", async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		assert.ok(workspaceFolders, "Workspace should be open");

		const packagePath = path.join(
			workspaceFolders[0].uri.fsPath,
			"package.json",
		);

		const baseline = await scanner.createBaseline(packagePath);

		assert.ok(baseline.hash, "Should have hash");
		assert.strictEqual(baseline.hash.length, 64, "Should be SHA-256");
		assert.ok(baseline.size > 0, "Should have size");
	});

	test("Should categorize various config files correctly", async () => {
		// Test categorization of different file types
		const testCases = [
			{
				file: "/test/package.json",
				type: "package",
				language: "javascript",
				critical: true,
			},
			{
				file: "/test/.env",
				type: "environment",
				language: "universal",
				critical: true,
			},
			{
				file: "/test/tsconfig.json",
				type: "typescript",
				language: "javascript",
				critical: false,
			},
			{
				file: "/test/pyproject.toml",
				type: "package",
				language: "python",
				critical: true,
			},
			{
				file: "/test/vite.config.ts",
				type: "build",
				language: "javascript",
				critical: false,
			},
			{
				file: "/test/.eslintrc.js",
				type: "linting",
				language: "javascript",
				critical: false,
			},
			{
				file: "/test/unknown.config",
				type: "framework",
				language: "universal",
				critical: false,
			},
		];

		for (const testCase of testCases) {
			const result = scanner.categorizeFile(testCase.file);
			assert.strictEqual(
				result.type,
				testCase.type,
				`File ${testCase.file} should have type ${testCase.type}`,
			);
			assert.strictEqual(
				result.language,
				testCase.language,
				`File ${testCase.file} should have language ${testCase.language}`,
			);
			assert.strictEqual(
				result.critical,
				testCase.critical,
				`File ${testCase.file} should have critical ${testCase.critical}`,
			);
		}
	});

	test("Should validate package.json files", async () => {
		const workspaceFolders = vscode.workspace.workspaceFolders;
		assert.ok(workspaceFolders, "Workspace should be open");

		const packagePath = path.join(
			workspaceFolders[0].uri.fsPath,
			"package.json",
		);

		const result = await scanner.validateConfigFile(packagePath);

		// Should be valid since it's the actual package.json file
		assert.strictEqual(result.valid, true, "package.json should be valid");
	});
});
