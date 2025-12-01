import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

describe("Comprehensive Security Tests", () => {
	let tempDir: string;

	beforeAll(async () => {
		// Create temporary directory for test configs
		tempDir = await fs.mkdtemp(
			path.join(os.tmpdir(), "snapback-security-comprehensive-"),
		);
	});

	afterAll(async () => {
		// Clean up temporary files
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("should reject CJS config loading when executable configs are disabled by default", async () => {
		// Mock vscode with disabled configs (default state)
		vi.mock("vscode", () => {
			return {
				default: {},
				env: {},
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((_key: string, defaultValue: any) => {
								// Don't set enableExecutableConfigs, should default to false
								return defaultValue;
							}),
					}),
				},
			};
		});

		// Import here to use the mock
		const { loadCjsConfig } = await import("../../../src/config/loaders");

		const configPath = path.join(tempDir, "test.cjs");
		const configContent = `
      module.exports = {
        protection: [],
        ignore: []
      };
    `;

		await fs.writeFile(configPath, configContent);

		// Should throw error when executable configs are disabled
		await expect(loadCjsConfig(configPath)).rejects.toThrow(
			/CJS configuration loading is disabled by default/,
		);
	}, 5000);

	it("should reject MJS config loading when executable configs are disabled by default", async () => {
		// Mock vscode with disabled configs (default state)
		vi.mock("vscode", () => {
			return {
				default: {},
				env: {},
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((_key: string, defaultValue: any) => {
								// Don't set enableExecutableConfigs, should default to false
								return defaultValue;
							}),
					}),
				},
			};
		});

		// Import here to use the mock
		const { loadMjsConfig } = await import("../../../src/config/loaders");

		const configPath = path.join(tempDir, "test.mjs");
		const configContent = `
      export default {
        protection: [],
        ignore: []
      };
    `;

		await fs.writeFile(configPath, configContent);

		// Should throw error when executable configs are disabled
		await expect(loadMjsConfig(configPath)).rejects.toThrow(
			/MJS configuration loading is disabled by default/,
		);
	}, 5000);

	it("should properly validate POJO results and reject forbidden types", async () => {
		// Mock vscode with enabled configs
		vi.mock("vscode", () => {
			return {
				default: {},
				env: {},
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "config.enableExecutableConfigs") {
									return true; // Enabled for this test
								}
								return defaultValue;
							}),
					}),
				},
			};
		});

		// Import here to use the mock
		const { loadCjsConfig } = await import("../../../src/config/loaders");

		// Test valid POJO
		const validConfigPath = path.join(tempDir, "valid.cjs");
		const validConfigContent = `
      module.exports = {
        protection: [
          { pattern: '**/*.secret', level: 'block' }
        ],
        ignore: [
          'node_modules/**'
        ],
        settings: {
          maxSnapshots: 100,
          defaultProtectionLevel: 'watch'
        }
      };
    `;

		await fs.writeFile(validConfigPath, validConfigContent);

		// Should successfully load valid POJO config
		const validConfig = await loadCjsConfig(validConfigPath);
		expect(validConfig.protection).toHaveLength(1);
		expect(validConfig.protection?.[0].pattern).toBe("**/*.secret");
		expect(validConfig.protection?.[0].level).toBe("block");
		expect(validConfig.ignore).toContain("node_modules/**");
		expect(validConfig.settings?.maxSnapshots).toBe(100);
	}, 5000);

	it("should reject configs with circular references", async () => {
		// Mock vscode with enabled configs
		vi.mock("vscode", () => {
			return {
				default: {},
				env: {},
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "config.enableExecutableConfigs") {
									return true; // Enabled for this test
								}
								return defaultValue;
							}),
					}),
				},
			};
		});

		// Import here to use the mock
		const { loadCjsConfig } = await import("../../../src/config/loaders");

		// Test circular reference
		const circularConfigPath = path.join(tempDir, "circular.cjs");
		const circularConfigContent = `
      const obj = { protection: [], ignore: [] };
      obj.self = obj; // Circular reference
      module.exports = obj;
    `;

		await fs.writeFile(circularConfigPath, circularConfigContent);

		// Should reject circular reference
		await expect(loadCjsConfig(circularConfigPath)).rejects.toThrow(
			/circular|INVALID_RESULT/,
		);
	}, 5000);

	it("should reject configs with symbol keys", async () => {
		// Mock vscode with enabled configs
		vi.mock("vscode", () => {
			return {
				default: {},
				env: {},
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "config.enableExecutableConfigs") {
									return true; // Enabled for this test
								}
								return defaultValue;
							}),
					}),
				},
			};
		});

		// Import here to use the mock
		const { loadCjsConfig } = await import("../../../src/config/loaders");

		// Test symbol key
		const symbolConfigPath = path.join(tempDir, "symbol.cjs");
		const symbolConfigContent = `
      const obj = { protection: [], ignore: [] };
      obj[Symbol('test')] = 'value'; // Symbol key
      module.exports = obj;
    `;

		await fs.writeFile(symbolConfigPath, symbolConfigContent);

		// Should reject symbol key
		await expect(loadCjsConfig(symbolConfigPath)).rejects.toThrow(
			/plain object|POJO|INVALID_RESULT/,
		);
	}, 5000);

	it("should reject configs with getters", async () => {
		// Mock vscode with enabled configs
		vi.mock("vscode", () => {
			return {
				default: {},
				env: {},
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "config.enableExecutableConfigs") {
									return true; // Enabled for this test
								}
								return defaultValue;
							}),
					}),
				},
			};
		});

		// Import here to use the mock
		const { loadCjsConfig } = await import("../../../src/config/loaders");

		// Test getter
		const getterConfigPath = path.join(tempDir, "getter.cjs");
		const getterConfigContent = `
      module.exports = {
        protection: [],
        ignore: [],
        get test() { return 'value'; } // Getter
      };
    `;

		await fs.writeFile(getterConfigPath, getterConfigContent);

		// Should reject getter
		await expect(loadCjsConfig(getterConfigPath)).rejects.toThrow(
			/plain object|POJO|INVALID_RESULT/,
		);
	}, 5000);

	it("should reject configs with functions", async () => {
		// Mock vscode with enabled configs
		vi.mock("vscode", () => {
			return {
				default: {},
				env: {},
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "config.enableExecutableConfigs") {
									return true; // Enabled for this test
								}
								return defaultValue;
							}),
					}),
				},
			};
		});

		// Import here to use the mock
		const { loadCjsConfig } = await import("../../../src/config/loaders");

		// Test function
		const functionConfigPath = path.join(tempDir, "function.cjs");
		const functionConfigContent = `
      module.exports = {
        protection: [],
        ignore: [],
        test: function() { return 'value'; } // Function
      };
    `;

		await fs.writeFile(functionConfigPath, functionConfigContent);

		// Should reject function
		await expect(loadCjsConfig(functionConfigPath)).rejects.toThrow(
			/plain object|POJO|INVALID_RESULT/,
		);
	}, 5000);
});
