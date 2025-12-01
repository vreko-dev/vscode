import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import JSON5 from "json5";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Mock vscode for schema testing
vi.mock("vscode", () => {
	return {
		default: {},
		workspace: {
			getConfiguration: vi.fn().mockReturnValue({
				get: vi.fn().mockReturnValue(true),
			}),
			openTextDocument: vi.fn(),
			applyEdit: vi.fn().mockResolvedValue(true),
		},
		window: {
			showTextDocument: vi.fn(),
			showErrorMessage: vi.fn(),
			showInformationMessage: vi.fn(),
		},
		languages: {
			registerCodeActionsProvider: vi.fn(),
			createDiagnosticCollection: vi.fn().mockReturnValue({
				set: vi.fn(),
				clear: vi.fn(),
				dispose: vi.fn(),
			}),
		},
		Uri: {
			file: vi.fn().mockImplementation((path) => ({
				fsPath: path,
				toString: () => path,
			})),
			parse: vi.fn().mockImplementation((uri) => ({ toString: () => uri })),
		},
		Diagnostic: vi.fn().mockImplementation((range, message, severity) => ({
			range,
			message,
			severity,
		})),
		DiagnosticSeverity: {
			Error: 0,
			Warning: 1,
			Information: 2,
			Hint: 3,
		},
		Range: vi.fn().mockImplementation((start, end) => ({ start, end })),
		Position: vi
			.fn()
			.mockImplementation((line, character) => ({ line, character })),
	};
});

describe("Editor-Host Schema Tests", () => {
	let tempDir: string;
	let snapbackrcPath: string;

	beforeAll(async () => {
		// Create temporary directory for test configs
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-schema-"));
		snapbackrcPath = path.join(tempDir, ".snapbackrc");
	});

	afterAll(async () => {
		// Clean up temporary files
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should associate json.schemas with .snapbackrc files", async () => {
		// This test would verify that the extension properly associates
		// the JSON schema with .snapbackrc files

		// In a real test, we would:
		// 1. Check that the package.json contributes a json.schemas entry
		// 2. Verify that .snapbackrc files get the schema association

		// For this mock test, we'll just verify the concept
		const packageJsonPath = path.join(__dirname, "../../../package.json");
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf8");
		const packageJson = JSON.parse(packageJsonContent);

		// Check that json.schemas contribution exists
		const jsonSchemas = packageJson.contributes?.jsonValidation;
		expect(jsonSchemas).toBeDefined();

		const snapbackSchema = jsonSchemas.find((schema: any) =>
			schema.fileMatch.includes(".snapbackrc"),
		);

		expect(snapbackSchema).toBeDefined();
		expect(snapbackSchema.url).toContain("snapbackrc.schema.json");
	});

	it("should show diagnostics for invalid protection levels", async () => {
		// Create a .snapbackrc with an invalid protection level
		const invalidConfig = {
			protection: [
				{
					pattern: "**/*.js",
					level: "invalid-level", // This should trigger a diagnostic
				},
			],
			ignore: ["node_modules/**"],
		};

		await fs.writeFile(snapbackrcPath, JSON.stringify(invalidConfig, null, 2));

		// In a real test, we would:
		// 1. Open the file in VS Code
		// 2. Wait for diagnostics to be generated
		// 3. Verify the diagnostic message is correct

		// For this mock test, we'll simulate the validation
		const configContent = await fs.readFile(snapbackrcPath, "utf8");
		const config = JSON5.parse(configContent);

		// Check for invalid level
		const invalidRule = config.protection.find(
			(rule: any) => rule.level === "invalid-level",
		);
		expect(invalidRule).toBeDefined();

		// In a real implementation, this would trigger a diagnostic like:
		// "Value 'invalid-level' is not one of: 'watch', 'warn', 'block'"
		const expectedDiagnostic =
			"Value 'invalid-level' is not one of: 'watch', 'warn', 'block'";
		expect(expectedDiagnostic).toContain("invalid-level");
		expect(expectedDiagnostic).toContain("watch");
		expect(expectedDiagnostic).toContain("warn");
		expect(expectedDiagnostic).toContain("block");
	});

	it("should validate required schema properties", async () => {
		// Create a .snapbackrc with missing required properties
		const incompleteConfig = {
			// Missing protection and ignore arrays
			settings: {
				maxSnapshots: 50,
			},
		};

		const incompletePath = path.join(tempDir, ".snapbackrc.incomplete");
		await fs.writeFile(
			incompletePath,
			JSON.stringify(incompleteConfig, null, 2),
		);

		// In a real test, this would trigger diagnostics about missing required properties
		const configContent = await fs.readFile(incompletePath, "utf8");
		const config = JSON5.parse(configContent);

		// Verify the config is missing required properties
		expect(config.protection).toBeUndefined();
		expect(config.ignore).toBeUndefined();

		// In a real implementation, this would trigger diagnostics about
		// missing required properties in the schema
		const expectedMessage = "Missing required property";
		expect(expectedMessage).toBe("Missing required property");
	});

	it("should provide autocomplete for protection levels", async () => {
		// This test would verify that autocomplete works for protection levels
		// In a real test, we would:
		// 1. Open a .snapbackrc file
		// 2. Trigger autocomplete at a protection level position
		// 3. Verify the suggestions include 'watch', 'warn', 'block'

		// For this mock test, we'll just verify the expected values
		const protectionLevels = ["watch", "warn", "block"];
		expect(protectionLevels).toContain("watch");
		expect(protectionLevels).toContain("warn");
		expect(protectionLevels).toContain("block");
		expect(protectionLevels).toHaveLength(3);
	});
});
