import * as fs from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigDetector } from "../../src/config-detector";

// Mock fast-glob
vi.mock("fast-glob", () => ({
	glob: vi.fn(),
}));

// Mock fs
vi.mock("fs/promises", () => ({
	default: {
		readFile: vi.fn(),
	},
	readFile: vi.fn(),
}));

describe("ConfigDetector", () => {
	let detector: ConfigDetector;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		detector = new ConfigDetector(workspaceRoot);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should initialize with default exclude patterns", () => {
			const detector = new ConfigDetector(workspaceRoot);
			expect(detector).toBeDefined();
		});

		it("should initialize with custom exclude patterns", () => {
			const customExclude = ["custom/**", "temp/**"];
			const detector = new ConfigDetector(workspaceRoot, {
				exclude: customExclude,
			});
			expect(detector).toBeDefined();
		});
	});

	describe("detectConfigFiles", () => {
		it("should detect common config files", async () => {
			const mockFiles = [
				"package.json",
				"tsconfig.json",
				".env",
				".eslintrc.js",
				".prettierrc",
				"jest.config.ts",
				"vitest.config.js",
			];

			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue(mockFiles);

			const result = await detector.detectConfigFiles();

			expect(result).toHaveLength(7);
			expect(result).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						type: "package.json",
						name: "package.json",
					}),
					expect.objectContaining({
						type: "tsconfig",
						name: "tsconfig.json",
					}),
					expect.objectContaining({
						type: "env",
						name: ".env",
					}),
				]),
			);
		});

		it("should determine correct config types", async () => {
			const mockFiles = [
				"package.json",
				"tsconfig.json",
				".env.local",
				".eslintrc.json",
				".prettierrc.yaml",
				"jest.config.ts",
				"vitest.config.js",
				"webpack.config.cjs",
				"next.config.mjs",
				"vite.config.ts",
			];

			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue(mockFiles);

			const result = await detector.detectConfigFiles();

			const types = result.map((file) => file.type);
			expect(types).toEqual([
				"package.json",
				"tsconfig",
				"env",
				"eslint",
				"prettier",
				"jest",
				"vitest",
				"webpack",
				"next",
				"vite",
			]);
		});

		it("should handle unknown config types", async () => {
			const mockFiles = ["unknown.config"];

			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue(mockFiles);

			const result = await detector.detectConfigFiles();

			expect(result[0].type).toBe("unknown");
		});

		it("should handle empty file list", async () => {
			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue([]);

			const result = await detector.detectConfigFiles();

			expect(result).toEqual([]);
		});

		it("should handle glob errors gracefully", async () => {
			const { glob } = await import("fast-glob");
			(glob as any).mockRejectedValue(new Error("Glob error"));

			const result = await detector.detectConfigFiles();

			expect(result).toEqual([]);
		});

		it("should use custom exclude patterns", async () => {
			const customExclude = ["custom/**", "temp/**"];
			const detector = new ConfigDetector(workspaceRoot, {
				exclude: customExclude,
			});

			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue(["package.json"]);

			await detector.detectConfigFiles();

			expect(glob).toHaveBeenCalledWith(
				expect.any(Array),
				expect.objectContaining({
					ignore: customExclude,
				}),
			);
		});
	});

	describe("parseConfigFile", () => {
		it("should parse valid JSON files", async () => {
			const content = JSON.stringify({ name: "test", version: "1.0.0" });
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.parseConfigFile("/test/package.json");

			expect(result.valid).toBe(true);
			expect(result.content).toEqual({ name: "test", version: "1.0.0" });
		});

		it("should parse package.json with metadata extraction", async () => {
			const content = JSON.stringify({
				name: "test",
				version: "1.0.0",
				dependencies: { "test-dep": "1.0.0" },
				devDependencies: { "test-dev-dep": "1.0.0" },
				scripts: { test: "echo test" },
			});
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.parseConfigFile("/test/package.json");

			expect(result.valid).toBe(true);
			expect(result.metadata).toEqual({
				dependencies: ["test-dep"],
				devDependencies: ["test-dev-dep"],
				scripts: ["test"],
			});
		});

		it("should handle invalid JSON files", async () => {
			const content = "{ invalid json }";
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.parseConfigFile("/test/package.json");

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Invalid JSON");
		});

		it("should handle non-JSON files as text", async () => {
			const content = "KEY=VALUE\nANOTHER=VALUE";
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.parseConfigFile("/test/.env");

			expect(result.valid).toBe(true);
			expect(result.content).toBe(content);
		});

		it("should handle file read errors", async () => {
			(fs.readFile as any).mockRejectedValue(new Error("File not found"));

			const result = await detector.parseConfigFile("/test/nonexistent.json");

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Failed to read file");
		});

		it("should handle empty files", async () => {
			(fs.readFile as any).mockResolvedValue("");

			const result = await detector.parseConfigFile("/test/empty.json");

			expect(result.valid).toBe(false);
			expect(result.error).toContain("Invalid JSON");
		});
	});

	describe("validateConfig", () => {
		it("should validate valid package.json", async () => {
			const content = JSON.stringify({ name: "test", version: "1.0.0" });
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.validateConfig("/test/package.json");

			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});

		it("should validate package.json with missing name", async () => {
			const content = JSON.stringify({ version: "1.0.0" });
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.validateConfig("/test/package.json");

			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Missing required field: name");
		});

		it("should validate package.json with missing version", async () => {
			const content = JSON.stringify({ name: "test" });
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.validateConfig("/test/package.json");

			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Missing required field: version");
		});

		it("should validate tsconfig with valid content", async () => {
			const content = JSON.stringify({
				compilerOptions: {
					target: "ES2020",
					module: "commonjs",
				},
			});
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.validateConfig("/test/tsconfig.json");

			expect(result.valid).toBe(true);
			expect(result.warnings).toEqual([]);
		});

		it("should validate tsconfig with invalid target type", async () => {
			const content = JSON.stringify({
				compilerOptions: {
					target: 2020,
					module: "commonjs",
				},
			});
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.validateConfig("/test/tsconfig.json");

			expect(result.valid).toBe(true); // Still valid overall
			expect(result.warnings).toContain(
				"compilerOptions.target should be a string",
			);
		});

		it("should validate tsconfig with invalid module type", async () => {
			const content = JSON.stringify({
				compilerOptions: {
					target: "ES2020",
					module: 123,
				},
			});
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.validateConfig("/test/tsconfig.json");

			expect(result.valid).toBe(true); // Still valid overall
			expect(result.warnings).toContain(
				"compilerOptions.module should be a string",
			);
		});

		it("should handle parse errors during validation", async () => {
			(fs.readFile as any).mockRejectedValue(new Error("File not found"));

			const result = await detector.validateConfig("/test/nonexistent.json");

			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Validation error: File not found");
		});

		it("should handle invalid JSON during validation", async () => {
			const content = "{ invalid json }";
			(fs.readFile as any).mockResolvedValue(content);

			const result = await detector.validateConfig("/test/invalid.json");

			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Invalid JSON");
		});
	});

	describe("onConfigChange", () => {
		it("should register change handlers", () => {
			const handler = vi.fn();
			detector.onConfigChange(handler);

			// @ts-expect-error - accessing private property for testing
			expect(detector.changeHandlers).toContain(handler);
		});

		it("should register multiple change handlers", () => {
			const handler1 = vi.fn();
			const handler2 = vi.fn();
			detector.onConfigChange(handler1);
			detector.onConfigChange(handler2);

			// @ts-expect-error - accessing private property for testing
			expect(detector.changeHandlers).toContain(handler1);
			// @ts-expect-error - accessing private property for testing
			expect(detector.changeHandlers).toContain(handler2);
		});
	});

	describe("scanForChanges", () => {
		it("should call change handlers when scanning", async () => {
			const handler = vi.fn();
			detector.onConfigChange(handler);

			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue(["package.json"]);

			await detector.scanForChanges();

			expect(handler).toHaveBeenCalled();
		});

		it("should handle scan errors gracefully", async () => {
			const handler = vi.fn();
			detector.onConfigChange(handler);

			const { glob } = await import("fast-glob");
			(glob as any).mockRejectedValue(new Error("Scan error"));

			await expect(detector.scanForChanges()).resolves.not.toThrow();
		});
	});

	describe("edge cases", () => {
		it("should handle very long file paths", async () => {
			const longPath = `${"a".repeat(1000)}/package.json`;
			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue([longPath]);

			const result = await detector.detectConfigFiles();

			expect(result).toHaveLength(1);
			expect(result[0].name).toBe("package.json");
		});

		it("should handle files with special characters", async () => {
			const specialFiles = ["package@1.0.0.json", "config-with-dashes.json"];
			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue(specialFiles);

			const result = await detector.detectConfigFiles();

			expect(result).toHaveLength(2);
		});

		it("should handle unicode file names", async () => {
			const unicodeFiles = ["пакет.json", "конфигурация.json"];
			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue(unicodeFiles);

			const result = await detector.detectConfigFiles();

			expect(result).toHaveLength(2);
		});

		it("should handle nested directory structures", async () => {
			const nestedFiles = [
				"config/package.json",
				"src/config/tsconfig.json",
				"tests/.env",
			];
			const { glob } = await import("fast-glob");
			(glob as any).mockResolvedValue(nestedFiles);

			const result = await detector.detectConfigFiles();

			expect(result).toHaveLength(3);
			expect(result[0].path).toBe("/test/workspace/config/package.json");
		});
	});
});
