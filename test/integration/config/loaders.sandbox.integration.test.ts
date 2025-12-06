import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { loadCjsConfig, loadMjsConfig } from "../../../src/config/loaders";

// Mock vscode to enable executable configs
vi.mock("vscode", () => {
	return {
		default: {},
		workspace: {
			getConfiguration: vi.fn().mockReturnValue({
				get: vi
					.fn()
					.mockImplementation((key: string, defaultValue: unknown) => {
						if (key === "config.enableExecutableConfigs") {
							return true; // Enable executable configs for these tests
						}
						return defaultValue;
					}),
			}),
		},
	};
});

describe("Loaders Sandbox Integration Tests", () => {
	let tempDir: string;
	let validCjsConfigPath: string;
	let validMjsConfigPath: string;

	beforeAll(async () => {
		// Create temporary directory for test configs
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "snapback-loaders-"));

		// Valid CJS config
		validCjsConfigPath = path.join(tempDir, "valid-config.cjs");
		await fs.writeFile(
			validCjsConfigPath,
			`
      module.exports = {
        protection: [
          { pattern: '**/*.env', level: 'block' }
        ],
        ignore: ['node_modules/**']
      };
    `,
		);

		// Valid MJS config
		validMjsConfigPath = path.join(tempDir, "valid-config.mjs");
		await fs.writeFile(
			validMjsConfigPath,
			`
      export default {
        protection: [
          { pattern: '**/*.secret', level: 'warn' }
        ],
        ignore: ['dist/**']
      };
    `,
		);
	});

	afterAll(async () => {
		// Clean up temporary files
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should load valid CJS configuration when sandbox is enabled", async () => {
		const result = await loadCjsConfig(validCjsConfigPath);

		expect(result).toBeDefined();
		expect(result.protection).toBeDefined();
		expect(result.protection).toHaveLength(1);
		expect(result.protection[0].pattern).toBe("**/*.env");
		expect(result.protection[0].level).toBe("block");
		expect(result.ignore).toBeDefined();
		expect(result.ignore).toContain("node_modules/**");
	});

	it("should load valid MJS configuration when sandbox is enabled", async () => {
		const result = await loadMjsConfig(validMjsConfigPath);

		expect(result).toBeDefined();
		expect(result.protection).toBeDefined();
		expect(result.protection).toHaveLength(1);
		expect(result.protection[0].pattern).toBe("**/*.secret");
		expect(result.protection[0].level).toBe("warn");
		expect(result.ignore).toBeDefined();
		expect(result.ignore).toContain("dist/**");
	});
});
