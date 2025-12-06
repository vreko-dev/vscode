import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigFileScanner } from "../../src/services/configFileScanner";

// Mock fast-glob
vi.mock("fast-glob", () => {
	const mockFg = vi.fn();
	return {
		default: mockFg,
		__esModule: true,
	};
});

describe("ConfigFileScanner", () => {
	let scanner: ConfigFileScanner;
	const mockWorkspacePath = "/test/workspace";

	beforeEach(() => {
		scanner = new ConfigFileScanner();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("scanWorkspace", () => {
		it("should detect JavaScript config files", async () => {
			// Mock fast-glob to return test files
			const fg = await import("fast-glob");
			(fg.default as any).mockResolvedValue([
				`${mockWorkspacePath}/package.json`,
				`${mockWorkspacePath}/tsconfig.json`,
				`${mockWorkspacePath}/.eslintrc.js`,
			]);

			const results = await scanner.scanWorkspace(mockWorkspacePath);

			expect(results).toHaveLength(3);
			expect(results[0].type).toBe("package");
			expect(results[0].language).toBe("javascript");
			expect(results[0].critical).toBe(true);
		});

		it("should detect Python config files", async () => {
			const fg = await import("fast-glob");
			(fg.default as any).mockResolvedValue([
				`${mockWorkspacePath}/pyproject.toml`,
				`${mockWorkspacePath}/requirements.txt`,
			]);

			const results = await scanner.scanWorkspace(mockWorkspacePath);

			expect(results).toHaveLength(2);
			expect(results.every((r) => r.language === "python")).toBe(true);
		});

		it("should exclude node_modules and .git", async () => {
			const fg = await import("fast-glob");
			(fg.default as any).mockResolvedValue([
				`${mockWorkspacePath}/package.json`,
			]);

			await scanner.scanWorkspace(mockWorkspacePath);

			// Verify fast-glob was called with ignore patterns
			expect(fg.default).toHaveBeenCalledWith(
				expect.any(Array),
				expect.objectContaining({
					ignore: expect.arrayContaining(["**/node_modules/**", "**/.git/**"]),
				}),
			);
		});

		it("should handle empty workspace", async () => {
			const fg = await import("fast-glob");
			(fg.default as any).mockResolvedValue([]);

			const results = await scanner.scanWorkspace(mockWorkspacePath);

			expect(results).toEqual([]);
		});

		it("should handle errors gracefully", async () => {
			const fg = await import("fast-glob");
			(fg.default as any).mockRejectedValue(new Error("Permission denied"));

			await expect(scanner.scanWorkspace(mockWorkspacePath)).rejects.toThrow(
				"Permission denied",
			);
		});

		it("should handle glob errors gracefully", async () => {
			const fg = await import("fast-glob");
			(fg.default as any).mockRejectedValue(
				new Error("ENOENT: no such file or directory"),
			);

			await expect(scanner.scanWorkspace(mockWorkspacePath)).rejects.toThrow(
				"ENOENT: no such file or directory",
			);
		});
	});

	describe("categorizeFile", () => {
		it("should categorize package.json correctly", () => {
			const result = scanner.categorizeFile("/workspace/package.json");

			expect(result).toEqual({
				type: "package",
				language: "javascript",
				critical: true,
			});
		});

		it("should categorize .env files correctly", () => {
			const result = scanner.categorizeFile("/workspace/.env");

			expect(result).toEqual({
				type: "environment",
				language: "universal",
				critical: true,
			});
		});

		it("should categorize tsconfig.json correctly", () => {
			const result = scanner.categorizeFile("/workspace/tsconfig.json");

			expect(result).toEqual({
				type: "typescript",
				language: "javascript",
				critical: false,
			});
		});

		it("should categorize pyproject.toml correctly", () => {
			const result = scanner.categorizeFile("/workspace/pyproject.toml");

			expect(result).toEqual({
				type: "package",
				language: "python",
				critical: true,
			});
		});

		it("should categorize unknown files as framework type", () => {
			const result = scanner.categorizeFile("/workspace/unknown.config");

			expect(result).toEqual({
				type: "framework",
				language: "universal",
				critical: false,
			});
		});

		it("should categorize vite config files correctly", () => {
			const result = scanner.categorizeFile("/workspace/vite.config.ts");

			expect(result).toEqual({
				type: "build",
				language: "javascript",
				critical: false,
			});
		});

		it("should categorize vitest config files correctly", () => {
			const result = scanner.categorizeFile("/workspace/vitest.config.js");

			expect(result).toEqual({
				type: "testing",
				language: "javascript",
				critical: false,
			});
		});

		it("should categorize environment files with extensions correctly", () => {
			const result = scanner.categorizeFile("/workspace/.env.local");

			expect(result).toEqual({
				type: "environment",
				language: "universal",
				critical: true,
			});
		});
	});

	describe("createBaseline", () => {
		it("should create SHA-256 hash baseline", async () => {
			const testContent = Buffer.from("test content");
			const testStats = {
				size: 12,
				mtime: 1234567890,
				ctime: 1234567890,
				type: 1,
			};

			// Mock workspace.fs.readFile and stat
			const vscode = await import("vscode");
			vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(testContent);
			vi.mocked(vscode.workspace.fs.stat).mockResolvedValue(testStats as any);

			const baseline = await scanner.createBaseline("/test/file.json");

			expect(baseline.hash).toBeDefined();
			expect(baseline.hash).toHaveLength(64); // SHA-256
			expect(baseline.timestamp).toBeGreaterThan(Date.now() - 1000);
			expect(baseline.path).toBe("/test/file.json");
			expect(baseline.size).toBe(12);
		});

		it("should handle file read errors gracefully", async () => {
			const vscode = await import("vscode");
			vi.mocked(vscode.workspace.fs.readFile).mockRejectedValue(
				new Error("Permission denied"),
			);

			await expect(scanner.createBaseline("/test/file.json")).rejects.toThrow(
				"Permission denied",
			);
		});

		it("should handle stat errors gracefully", async () => {
			const testContent = Buffer.from("test content");
			const vscode = await import("vscode");

			vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(testContent);
			vi.mocked(vscode.workspace.fs.stat).mockRejectedValue(
				new Error("File not found"),
			);

			await expect(scanner.createBaseline("/test/file.json")).rejects.toThrow(
				"File not found",
			);
		});
	});

	describe("validateConfigFile", () => {
		it("should validate valid package.json", async () => {
			const validPkg = { name: "test", version: "1.0.0" };
			const vscode = await import("vscode");

			vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
				Buffer.from(JSON.stringify(validPkg)),
			);

			const result = await scanner.validateConfigFile("/pkg/package.json");

			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});

		it("should detect missing name in package.json", async () => {
			const invalidPkg = { version: "1.0.0" };
			const vscode = await import("vscode");

			vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
				Buffer.from(JSON.stringify(invalidPkg)),
			);

			const result = await scanner.validateConfigFile("/pkg/package.json");

			expect(result.valid).toBe(false);
			expect(result.errors).toContain("Missing required field: name");
		});

		it("should handle malformed JSON", async () => {
			const vscode = await import("vscode");

			vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
				Buffer.from("{ invalid json"),
			);

			const result = await scanner.validateConfigFile("/pkg/package.json");

			expect(result.valid).toBe(false);
			expect(result.errors[0]).toContain("Invalid JSON");
		});

		it("should return valid for non-package.json files", async () => {
			const vscode = await import("vscode");

			// Mock readFile to return empty content for non-package.json files
			vi.mocked(vscode.workspace.fs.readFile).mockResolvedValue(
				Buffer.from(""),
			);

			const result = await scanner.validateConfigFile("/config/.eslintrc.js");

			expect(result.valid).toBe(true);
			expect(result.errors).toEqual([]);
		});
	});

	describe("getAllPatterns", () => {
		it("should return all configured patterns", () => {
			// Using reflection to access private method
			const getAllPatterns = (scanner as any).getAllPatterns.bind(scanner);
			const patterns = getAllPatterns();

			// Should include patterns from all categories
			expect(patterns).toContain("package.json");
			expect(patterns).toContain("tsconfig.json");
			expect(patterns).toContain(".eslintrc.*");
			expect(patterns).toContain("pyproject.toml");
			expect(patterns).toContain(".env");

			// Should have a reasonable number of patterns
			expect(patterns.length).toBeGreaterThan(20);
		});
	});
});
