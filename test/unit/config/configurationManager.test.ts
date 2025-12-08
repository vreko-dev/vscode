import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationManager } from "@vscode/config/configurationManager";
import type { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";

// Mock fs module
vi.mock("fs/promises", () => {
	return {
		default: {
			readFile: vi.fn(),
			writeFile: vi.fn(),
			access: vi.fn(),
			unlink: vi.fn(),
		},
		readFile: vi.fn(),
		writeFile: vi.fn(),
		access: vi.fn(),
		unlink: vi.fn(),
	};
});

// Mock vscode
vi.mock("vscode", () => {
	return {
		default: {},
		workspace: {
			createFileSystemWatcher: vi.fn(() => ({
				onDidChange: vi.fn(),
				onDidCreate: vi.fn(),
				onDidDelete: vi.fn(),
				dispose: vi.fn(),
			})),
			findFiles: vi.fn().mockResolvedValue([]),
			getConfiguration: vi.fn().mockReturnValue({
				get: vi.fn().mockReturnValue("info"),
			}),
		},
		RelativePattern: vi.fn(),
		window: {
			showErrorMessage: vi.fn(),
			showInformationMessage: vi.fn().mockResolvedValue(undefined),
		},
		commands: {
			executeCommand: vi.fn(),
		},
		env: {
			openExternal: vi.fn(),
		},
	};
});

describe("ConfigurationManager", () => {
	let configManager: ConfigurationManager;
	const mockWorkspaceRoot = "/test/workspace";
	const mockContext: any = {
		workspaceState: {
			get: vi.fn(),
			update: vi.fn(),
		},
	};
	const mockProtectedFileRegistry: ProtectedFileRegistry = {
		add: vi.fn(),
		remove: vi.fn(),
		has: vi.fn(),
		getProtectionLevel: vi.fn(),
		getAll: vi.fn(),
		clear: vi.fn(),
		dispose: vi.fn(),
	} as any;

	beforeEach(() => {
		vi.clearAllMocks();
		configManager = new ConfigurationManager(
			mockWorkspaceRoot,
			mockContext,
			mockProtectedFileRegistry,
		);
	});

	describe("getDefaultConfiguration", () => {
		it("should return the proposed default configuration structure", () => {
			// When: Getting default configuration
			const config = (configManager as any).getDefaultConfiguration();

			// Then: Should return default configuration with proposed structure
			expect(config.protection).toBeDefined();
			expect(config.ignore).toBeDefined();
			expect(config.settings).toBeDefined();

			// Verify protection rules structure
			expect(Array.isArray(config.protection)).toBe(true);
			expect(config.protection?.length).toBeGreaterThan(0);

			// Verify ignore patterns
			expect(Array.isArray(config.ignore)).toBe(true);
			expect(config.ignore?.length).toBeGreaterThan(0);

			// Verify settings
			expect(config.settings).toBeDefined();
		});

		it("should include comprehensive protection rules in default configuration", () => {
			// When: Getting default configuration
			const config = (configManager as any).getDefaultConfiguration();

			// Then: Should include block, warn, and watch level protections
			const protectionRules = config.protection || [];

			// Check for block level protections (sensitive files)
			const blockRules = protectionRules.filter(
				(rule: any) => rule.level === "block",
			);
			expect(blockRules.length).toBeGreaterThan(0);

			// Check for warn level protections (important config files)
			const warnRules = protectionRules.filter(
				(rule: any) => rule.level === "warn",
			);
			expect(warnRules.length).toBeGreaterThan(0);

			// Check for watch level protections (auxiliary files)
			const watchRules = protectionRules.filter(
				(rule: any) => rule.level === "watch",
			);
			expect(watchRules.length).toBeGreaterThan(0);

			// Check for specific patterns
			const envRule = protectionRules.find(
				(rule: any) => rule.pattern === "**/.env*",
			);
			expect(envRule).toBeDefined();
			expect(envRule.level).toBe("block");
			expect(envRule.reason).toBe("Sensitive environment variables");
		});

		it("should include standard ignore patterns in default configuration", () => {
			// When: Getting default configuration
			const config = (configManager as any).getDefaultConfiguration();

			// Then: Should include standard ignore patterns
			const ignorePatterns = config.ignore || [];
			expect(ignorePatterns).toContain("node_modules/**");
			expect(ignorePatterns).toContain("dist/**");
			expect(ignorePatterns).toContain("build/**");
			expect(ignorePatterns).toContain("coverage/**");
			expect(ignorePatterns).toContain("*.log");
			expect(ignorePatterns).toContain(".snapback/**");
			expect(ignorePatterns).toContain(".git/**");
		});
	});

	describe("load", () => {
		it("should return default configuration when no config files exist", async () => {
			// Given: No .snapbackrc, .snapbackprotected, or .snapbackignore files exist
			vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
			vi.mocked(fs.access).mockRejectedValue({ code: "ENOENT" });

			// When: Loading configuration
			const config = await configManager.load();

			// Then: Should return default configuration with proposed structure
			expect(config.protection).toBeDefined();
			expect(config.ignore).toBeDefined();
			expect(config.settings).toBeDefined();

			// Verify protection rules structure
			expect(Array.isArray(config.protection)).toBe(true);
			expect(config.protection?.length).toBeGreaterThan(0);

			// Verify ignore patterns
			expect(Array.isArray(config.ignore)).toBe(true);
			expect(config.ignore?.length).toBeGreaterThan(0);

			// Verify settings
			expect(config.settings).toBeDefined();
		});

		it("should use legacy configuration when legacy files exist with content", async () => {
			// Given: Legacy files exist with content
			vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
				if (
					typeof filePath === "string" &&
					filePath.endsWith(".snapbackprotected")
				) {
					return "*.ts\npackage.json @warn";
				}
				if (
					typeof filePath === "string" &&
					filePath.endsWith(".snapbackignore")
				) {
					return "node_modules/**\ndist/**";
				}
				throw { code: "ENOENT" };
			});
			vi.mocked(fs.access).mockImplementation(async (filePath: any) => {
				if (
					typeof filePath === "string" &&
					(filePath.endsWith(".snapbackprotected") ||
						filePath.endsWith(".snapbackignore"))
				) {
					return undefined;
				}
				throw { code: "ENOENT" };
			});

			// When: Loading configuration
			const config = await configManager.load();

			// Then: Should use legacy configuration (which has protection rules)
			expect(config.protection).toBeDefined();
			expect(config.protection?.length).toBe(2); // Should have 2 rules from legacy file

			// Should have the legacy patterns
			const protectionPatterns = config.protection?.map((rule) => rule.pattern);
			expect(protectionPatterns).toContain("*.ts");
			expect(protectionPatterns).toContain("package.json");

			// Check levels
			const tsRule = config.protection?.find((rule) => rule.pattern === "*.ts");
			const packageJsonRule = config.protection?.find(
				(rule) => rule.pattern === "package.json",
			);
			expect(tsRule?.level).toBe("watch"); // Default level when not specified
			expect(packageJsonRule?.level).toBe("warn"); // Explicitly set level

			const ignorePatterns = config.ignore || [];
			expect(ignorePatterns).toContain("node_modules/**");
			expect(ignorePatterns).toContain("dist/**");
		});
	});
});
