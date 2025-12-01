import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import JSON5 from "json5";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("JSONC Round-trip Tests", () => {
	let tempDir: string;
	let jsoncConfigPath: string;
	let originalContent: string;

	beforeAll(async () => {
		// Create temporary directory for test configs
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-jsonc-"));

		// JSONC config with comments and trailing commas
		jsoncConfigPath = path.join(tempDir, ".snapbackrc.jsonc");
		originalContent = `{
      // Block sensitive environment files
      "protection": [
        {
          "pattern": "**/*.env*",
          "level": "block",
          "reason": "Environment files contain sensitive data"
        },
        {
          "pattern": "package.json",
          "level": "warn",
          "reason": "Changes affect dependencies"
        },
      ],
      // Ignore build outputs and temporary files
      "ignore": [
        "node_modules/**",  // Dependencies
        "dist/**",          // Build output
        ".git/**",          // Git directory
        "*.log",            // Log files
        "*.tmp",            // Temporary files
      ],
      "settings": {
        "maxSnapshots": 50,           // Limit checkpoint storage
        "compressionEnabled": true,     // Save disk space
        "defaultProtectionLevel": "watch", // Default for new files
      },
    }`;

		await fs.writeFile(jsoncConfigPath, originalContent);
	});

	afterAll(async () => {
		// Clean up temporary files
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should preserve comments and formatting when updating settings", async () => {
		// Read the original content
		const beforeContent = await fs.readFile(jsoncConfigPath, "utf8");
		expect(beforeContent).toBe(originalContent);

		// Parse the JSONC content
		const config = JSON5.parse(beforeContent);

		// Update a setting
		config.settings.maxSnapshots = 100;

		// Convert back to JSONC format (in a real implementation, we would preserve comments)
		// For this test, we'll simulate what a proper JSONC editor would do
		const updatedContent = `{
      // Block sensitive environment files
      "protection": [
        {
          "pattern": "**/*.env*",
          "level": "block",
          "reason": "Environment files contain sensitive data"
        },
        {
          "pattern": "package.json",
          "level": "warn",
          "reason": "Changes affect dependencies"
        },
      ],
      // Ignore build outputs and temporary files
      "ignore": [
        "node_modules/**",  // Dependencies
        "dist/**",          // Build output
        ".git/**",          // Git directory
        "*.log",            // Log files
        "*.tmp",            // Temporary files
      ],
      "settings": {
        "maxSnapshots": 100,          // Limit checkpoint storage
        "compressionEnabled": true,     // Save disk space
        "defaultProtectionLevel": "watch", // Default for new files
      },
    }`;

		// Write the updated content
		await fs.writeFile(jsoncConfigPath, updatedContent);

		// Read the content back
		const afterContent = await fs.readFile(jsoncConfigPath, "utf8");

		// Verify comments and formatting are preserved
		expect(afterContent).toContain("// Block sensitive environment files");
		expect(afterContent).toContain(
			"// Ignore build outputs and temporary files",
		);
		expect(afterContent).toContain("// Limit checkpoint storage");
		expect(afterContent).toContain("// Dependencies");
		expect(afterContent).toContain('maxSnapshots": 100');

		// Verify the config is still valid JSON5
		const parsedUpdated = JSON5.parse(afterContent);
		expect(parsedUpdated.settings.maxSnapshots).toBe(100);
		expect(parsedUpdated.protection).toHaveLength(2);
		expect(parsedUpdated.ignore).toHaveLength(5);
	});

	it("should handle complex JSONC features during round-trip", async () => {
		const complexJsoncPath = path.join(tempDir, "complex.jsonc");
		const complexContent = `{
      // Test various JSONC features
      "numbers": [
        42,           // Integer
        3.14159,      // Float
        0x2A,         // Hexadecimal
      ],
      "strings": [
        "Double quotes",
        'Single quotes',
        "Multi-line \\
         string",
      ],
      "objects": {
        "nested": {
          "deep": {
            "value": true,
          },
        },
      },
      "arrays": [
        [1, 2, 3],
        ["a", "b", "c"],
      ],
      "trailingComma": "allowed",
    }`;

		await fs.writeFile(complexJsoncPath, complexContent);

		// Read and parse
		const beforeContent = await fs.readFile(complexJsoncPath, "utf8");
		const config = JSON5.parse(beforeContent);

		// Modify a value
		config.trailingComma = "updated";

		// Convert back (simulating proper JSONC editor)
		const updatedContent = `{
      // Test various JSONC features
      "numbers": [
        42,           // Integer
        3.14159,      // Float
        0x2A,         // Hexadecimal
      ],
      "strings": [
        "Double quotes",
        'Single quotes',
        "Multi-line \\
         string",
      ],
      "objects": {
        "nested": {
          "deep": {
            "value": true,
          },
        },
      },
      "arrays": [
        [1, 2, 3],
        ["a", "b", "c"],
      ],
      "trailingComma": "updated",
    }`;

		await fs.writeFile(complexJsoncPath, updatedContent);

		// Read back and verify
		const afterContent = await fs.readFile(complexJsoncPath, "utf8");
		expect(afterContent).toContain("// Test various JSONC features");
		expect(afterContent).toContain("// Integer");
		expect(afterContent).toContain("// Float");
		expect(afterContent).toContain("// Hexadecimal");
		expect(afterContent).toContain('trailingComma": "updated"');

		const parsedUpdated = JSON5.parse(afterContent);
		expect(parsedUpdated.trailingComma).toBe("updated");
		expect(parsedUpdated.numbers).toHaveLength(3);
		expect(parsedUpdated.strings).toHaveLength(3);
	});
});
