import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ConfigFileScanner } from "../../../src/services/configFileScanner";

// Mock VS Code API
vi.mock("vscode", () => {
	return {
		default: {},
		Uri: {
			file: vi.fn().mockImplementation((filePath: string) => ({
				fsPath: filePath,
			})),
		},
		workspace: {
			fs: {
				readFile: vi.fn(),
				stat: vi.fn(),
			},
		},
	};
});

// Mock fast-glob
vi.mock("fast-glob", () => ({
	default: vi.fn(),
}));

// Mock minimatch
vi.mock("minimatch", () => ({
	minimatch: vi.fn(),
}));

describe("ConfigFileScanner", () => {
	let scanner: ConfigFileScanner;

	beforeEach(() => {
		vi.clearAllMocks();
		scanner = new ConfigFileScanner();
	});

	describe("scanWorkspace", () => {
		it("should scan workspace and return config files", async () => {
			const mockFiles = [
				"/test/workspace/package.json",
				"/test/workspace/tsconfig.json",
				"/test/workspace/.env",
			];

			const mockedFg = await import("fast-glob");
			(mockedFg.default as any).mockResolvedValue(mockFiles);
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					if (pattern.includes("*")) {
						const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
						const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
						return regex.test(fileName);
					}
					return fileName === pattern;
				},
			);

			const result = await scanner.scanWorkspace("/test/workspace");

			expect(result).toHaveLength(3);
			expect(result[0]).toEqual({
				path: "/test/workspace/package.json",
				type: "package",
				language: "javascript",
				critical: true,
			});
			expect(result[1]).toEqual({
				path: "/test/workspace/tsconfig.json",
				type: "typescript",
				language: "javascript",
				critical: false,
			});
			expect(result[2]).toEqual({
				path: "/test/workspace/.env",
				type: "environment",
				language: "universal",
				critical: true,
			});
		});

		it("should handle empty workspace", async () => {
			const mockedFg = await import("fast-glob");
			(mockedFg.default as any).mockResolvedValue([]);

			const result = await scanner.scanWorkspace("/test/workspace");

			expect(result).toEqual([]);
		});

		it("should exclude specified patterns", async () => {
			const mockedFg = await import("fast-glob");
			(mockedFg.default as any).mockResolvedValue([
				"/test/workspace/package.json",
			]);
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => fileName === pattern,
			);

			const result = await scanner.scanWorkspace("/test/workspace");

			// Should only return the file not in excluded directories
			expect(result).toHaveLength(1);
			expect(result[0].path).toBe("/test/workspace/package.json");
		});
	});

	describe("categorizeFile", () => {
		it("should categorize JavaScript package files", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return pattern === "package.json" && fileName === "package.json";
				},
			);

			const result = scanner.categorizeFile("/test/workspace/package.json");

			expect(result).toEqual({
				type: "package",
				language: "javascript",
				critical: true,
			});
		});

		it("should categorize TypeScript config files", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return pattern === "tsconfig.json" && fileName === "tsconfig.json";
				},
			);

			const result = scanner.categorizeFile("/test/workspace/tsconfig.json");

			expect(result).toEqual({
				type: "typescript",
				language: "javascript",
				critical: false,
			});
		});

		it("should categorize linting config files", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return pattern === ".eslintrc.*" && fileName === ".eslintrc.js";
				},
			);

			const result = scanner.categorizeFile("/test/workspace/.eslintrc.js");

			expect(result).toEqual({
				type: "linting",
				language: "javascript",
				critical: false,
			});
		});

		it("should categorize build config files", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return (
						pattern === "webpack.config.*" && fileName === "webpack.config.js"
					);
				},
			);

			const result = scanner.categorizeFile(
				"/test/workspace/webpack.config.js",
			);

			expect(result).toEqual({
				type: "build",
				language: "javascript",
				critical: false,
			});
		});

		it("should categorize testing config files", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return pattern === "jest.config.*" && fileName === "jest.config.ts";
				},
			);

			const result = scanner.categorizeFile("/test/workspace/jest.config.ts");

			expect(result).toEqual({
				type: "testing",
				language: "javascript",
				critical: false,
			});
		});

		it("should categorize Python package files", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return (
						pattern === "requirements.txt" && fileName === "requirements.txt"
					);
				},
			);

			const result = scanner.categorizeFile("/test/workspace/requirements.txt");

			expect(result).toEqual({
				type: "package",
				language: "python",
				critical: true,
			});
		});

		it("should categorize environment files", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return pattern === ".env.*" && fileName === ".env.local";
				},
			);

			const result = scanner.categorizeFile("/test/workspace/.env.local");

			expect(result).toEqual({
				type: "environment",
				language: "universal",
				critical: true,
			});
		});

		it("should categorize unknown files as framework type", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(() => false);

			const result = scanner.categorizeFile("/test/workspace/custom.config");

			expect(result).toEqual({
				type: "framework",
				language: "universal",
				critical: false,
			});
		});

		it("should handle files with complex patterns", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return (
						pattern === "tsconfig.*.json" && fileName === "tsconfig.app.json"
					);
				},
			);

			const result = scanner.categorizeFile(
				"/test/workspace/tsconfig.app.json",
			);

			expect(result).toEqual({
				type: "typescript",
				language: "javascript",
				critical: false,
			});
		});
	});

	describe("createBaseline", () => {
		it("should create baseline for a file", async () => {
			const mockContent = Buffer.from("test content");
			const mockStats = { size: 12, type: 1, ctime: 1000, mtime: 2000 };

			(vscode.workspace.fs.readFile as any).mockResolvedValue(mockContent);
			(vscode.workspace.fs.stat as any).mockResolvedValue(mockStats);

			const result = await scanner.createBaseline("/test/workspace/file.txt");

			expect(result).toEqual({
				path: "/test/workspace/file.txt",
				hash: expect.any(String),
				timestamp: expect.any(Number),
				size: 12,
			});

			expect(result.hash).toHaveLength(64); // SHA-256 hash length
		});

		it("should handle empty file", async () => {
			const mockContent = Buffer.from("");
			const mockStats = { size: 0, type: 1, ctime: 1000, mtime: 2000 };

			(vscode.workspace.fs.readFile as any).mockResolvedValue(mockContent);
			(vscode.workspace.fs.stat as any).mockResolvedValue(mockStats);

			const result = await scanner.createBaseline("/test/workspace/empty.txt");

			expect(result).toEqual({
				path: "/test/workspace/empty.txt",
				hash: expect.any(String),
				timestamp: expect.any(Number),
				size: 0,
			});
		});

		it("should handle file read errors", async () => {
			(vscode.workspace.fs.readFile as any).mockRejectedValue(
				new Error("File not found"),
			);

			await expect(
				scanner.createBaseline("/test/workspace/nonexistent.txt"),
			).rejects.toThrow("File not found");
		});
	});

	describe("validateConfigFile", () => {
		it("should validate valid package.json", async () => {
			const validPackageJson = JSON.stringify({
				name: "test-package",
				version: "1.0.0",
				description: "Test package",
			});

			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from(validPackageJson),
			);

			const result = await scanner.validateConfigFile(
				"/test/workspace/package.json",
			);

			expect(result).toEqual({
				valid: true,
				errors: [],
			});
		});

		it("should validate invalid package.json with missing fields", async () => {
			const invalidPackageJson = JSON.stringify({
				description: "Test package",
				// Missing name and version
			});

			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from(invalidPackageJson),
			);

			const result = await scanner.validateConfigFile(
				"/test/workspace/package.json",
			);

			expect(result).toEqual({
				valid: false,
				errors: [
					"Missing required field: name",
					"Missing required field: version",
				],
			});
		});

		it("should validate invalid JSON", async () => {
			const invalidJson = "{ invalid json }";

			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from(invalidJson),
			);

			const result = await scanner.validateConfigFile(
				"/test/workspace/package.json",
			);

			expect(result).toEqual({
				valid: false,
				errors: [expect.stringContaining("Invalid JSON:")],
			});
		});

		it("should validate non-package.json files as valid", async () => {
			const content = "some content";

			(vscode.workspace.fs.readFile as any).mockResolvedValue(
				Buffer.from(content),
			);

			const result = await scanner.validateConfigFile(
				"/test/workspace/tsconfig.json",
			);

			expect(result).toEqual({
				valid: true,
				errors: [],
			});
		});

		it("should handle file read errors", async () => {
			(vscode.workspace.fs.readFile as any).mockRejectedValue(
				new Error("File not found"),
			);

			const result = await scanner.validateConfigFile(
				"/test/workspace/nonexistent.json",
			);

			expect(result).toEqual({
				valid: false,
				errors: [expect.stringContaining("Invalid JSON:")],
			});
		});
	});

	describe("validatePackageJson", () => {
		it("should validate complete package.json", () => {
			const validPackageJson = JSON.stringify({
				name: "test-package",
				version: "1.0.0",
			});

			const result = (scanner as any).validatePackageJson(validPackageJson);

			expect(result).toEqual({
				valid: true,
				errors: [],
			});
		});

		it("should detect missing name field", () => {
			const packageJson = JSON.stringify({
				version: "1.0.0",
			});

			const result = (scanner as any).validatePackageJson(packageJson);

			expect(result).toEqual({
				valid: false,
				errors: ["Missing required field: name"],
			});
		});

		it("should detect missing version field", () => {
			const packageJson = JSON.stringify({
				name: "test-package",
			});

			const result = (scanner as any).validatePackageJson(packageJson);

			expect(result).toEqual({
				valid: false,
				errors: ["Missing required field: version"],
			});
		});

		it("should detect both missing fields", () => {
			const packageJson = JSON.stringify({
				description: "Test package",
			});

			const result = (scanner as any).validatePackageJson(packageJson);

			expect(result).toEqual({
				valid: false,
				errors: [
					"Missing required field: name",
					"Missing required field: version",
				],
			});
		});

		it("should handle invalid JSON", () => {
			const invalidJson = "{ invalid json }";

			const result = (scanner as any).validatePackageJson(invalidJson);

			expect(result).toEqual({
				valid: false,
				errors: [expect.stringContaining("Invalid JSON:")],
			});
		});
	});

	describe("getAllPatterns", () => {
		it("should return all config patterns", () => {
			const patterns = (scanner as any).getAllPatterns();

			expect(patterns).toContain("package.json");
			expect(patterns).toContain("tsconfig.json");
			expect(patterns).toContain(".env");
			expect(patterns).toContain("requirements.txt");
			expect(patterns.length).toBeGreaterThan(20); // Should have many patterns
		});
	});

	describe("edge cases", () => {
		it("should handle files with special characters", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return pattern === ".env.*" && fileName === ".env.测试";
				},
			);

			const result = scanner.categorizeFile("/test/workspace/.env.测试");

			expect(result.type).toBe("environment");
		});

		it("should handle deeply nested config files", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return pattern === "package.json" && fileName === "package.json";
				},
			);

			const result = scanner.categorizeFile(
				"/test/workspace/sub/dir/package.json",
			);

			expect(result.type).toBe("package");
		});

		it("should handle case sensitive patterns", async () => {
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(() => false);

			const result = scanner.categorizeFile("/test/workspace/Package.Json");

			// Should not match due to case sensitivity
			expect(result.type).toBe("framework");
		});

		it("should handle very long file paths", async () => {
			const longPath = `/test/workspace/${"a/".repeat(100)}package.json`;
			const mockedMinimatch = await import("minimatch");
			(mockedMinimatch.minimatch as any).mockImplementation(
				(fileName: string, pattern: string) => {
					return pattern === "package.json" && fileName === "package.json";
				},
			);

			const result = scanner.categorizeFile(longPath);

			expect(result.type).toBe("package");
		});
	});
});
