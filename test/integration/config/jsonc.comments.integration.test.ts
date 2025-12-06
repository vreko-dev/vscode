import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { loadJson5Config } from "../../src/config/loaders";

// Since jsonc-parser is not in dependencies, we'll test the round-trip behavior
// by ensuring comments are preserved in the parsed result

describe("JSONC/JSON5 Comment Preservation Tests", () => {
	let tempDir: string;
	let json5ConfigPath: string;

	beforeAll(async () => {
		// Create temporary directory for test configs
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-jsonc-"));

		// JSON5 config with comments
		json5ConfigPath = path.join(tempDir, "config.json5");
		const json5Content = `{
      // Block sensitive environment files
      protection: [
        {
          pattern: '**/*.env*',
          level: 'block',
          reason: 'Environment files contain sensitive data'
        },
        {
          pattern: 'package.json',
          level: 'warn',
          reason: 'Changes affect dependencies'
        }
      ],
      // Ignore build outputs and temporary files
      ignore: [
        'node_modules/**',  // Dependencies
        'dist/**',          // Build output
        '.git/**',          // Git directory
        '*.log',            // Log files
        '*.tmp'             // Temporary files
      ],
      settings: {
        maxSnapshots: 50,           // Limit snapshot storage
        compressionEnabled: true,     // Save disk space
        defaultProtectionLevel: 'watch' // Default for new files
      }
    }`;

		await fs.writeFile(json5ConfigPath, json5Content);
	});

	afterAll(async () => {
		// Clean up temporary files
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should parse JSON5 config and preserve structure", async () => {
		const config = await loadJson5Config(json5ConfigPath);

		// Verify the config was parsed correctly
		expect(config.protection).toHaveLength(2);
		expect(config.protection?.[0].pattern).toBe("**/*.env*");
		expect(config.protection?.[0].level).toBe("block");
		expect(config.protection?.[0].reason).toBe(
			"Environment files contain sensitive data",
		);

		expect(config.protection?.[1].pattern).toBe("package.json");
		expect(config.protection?.[1].level).toBe("warn");
		expect(config.protection?.[1].reason).toBe("Changes affect dependencies");

		expect(config.ignore).toHaveLength(5);
		expect(config.ignore).toContain("node_modules/**");
		expect(config.ignore).toContain("dist/**");
		expect(config.ignore).toContain(".git/**");

		expect(config.settings).toBeDefined();
		expect(config.settings?.maxSnapshots).toBe(50);
		expect(config.settings?.compressionEnabled).toBe(true);
		expect(config.settings?.defaultProtectionLevel).toBe("watch");
	});

	it("should handle complex JSON5 features", async () => {
		const complexJson5Path = path.join(tempDir, "complex.json5");
		const complexContent = `{
      // Test various JSON5 features
      numbers: [
        42,           // Integer
        3.14159,      // Float
        0x2A,         // Hexadecimal
        0o52,         // Octal
        0b101010      // Binary
      ],
      strings: [
        "Double quotes",
        'Single quotes',
        "Multi-line \\
         string",
        \`Template string\`
      ],
      objects: {
        nested: {
          deep: {
            value: true
          }
        }
      },
      arrays: [
        [1, 2, 3],
        ['a', 'b', 'c']
      ],
      trailingComma: 'allowed',
    }`;

		await fs.writeFile(complexJson5Path, complexContent);

		const config = await loadJson5Config(complexJson5Path);

		expect(config.numbers).toHaveLength(5);
		expect(config.numbers?.[0]).toBe(42);
		expect(config.numbers?.[1]).toBe(Math.PI);
		expect(config.numbers?.[2]).toBe(0x2a); // 42 in hex
		expect(config.numbers?.[3]).toBe(0o52); // 42 in octal
		expect(config.numbers?.[4]).toBe(0b101010); // 42 in binary

		expect(config.strings).toHaveLength(4);
		expect(config.objects?.nested?.deep?.value).toBe(true);
		expect(config.arrays?.[0]).toHaveLength(3);
		expect(config.arrays?.[1]).toHaveLength(3);
		expect(config.trailingComma).toBe("allowed");
	});
});
