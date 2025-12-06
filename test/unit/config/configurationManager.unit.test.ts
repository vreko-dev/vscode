import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ConfigurationManager } from "../../../src/config/configurationManager";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import type { SnapBackRC } from "../../../src/types/snapbackrc.types";

// Mock fs module
vi.mock("fs/promises", () => {
	return {
		default: {
			readFile: vi.fn(),
			access: vi.fn(),
			unlink: vi.fn(),
		},
		readFile: vi.fn(),
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
		RelativePattern: vi.fn(),
	};
});

describe("ConfigurationManager", () => {
	const mockWorkspaceRoot = "/test/workspace";

	// Mock context object
	const mockContext: any = {
		workspaceState: {
			get: vi.fn(),
			update: vi.fn(),
		},
	};

	// Mock protected file registry
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
	});

	it("should load default configuration when no config files exist", async () => {
		// Mock all config files as non-existent
		vi.mocked(fs.access).mockRejectedValue({ code: "ENOENT" });
		vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
		// Mock findFiles to return no files
		vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

		const manager = new ConfigurationManager(
			mockWorkspaceRoot,
			mockContext,
			mockProtectedFileRegistry,
		);
		const config = await manager.load();

		expect(config.protection).toBeDefined();
		expect(config.ignore).toBeDefined();
		expect(config.settings).toBeDefined();

		// Should have default protection rules
		expect(config.protection?.length).toBeGreaterThan(0);

		// Should have default ignore patterns
		expect(config.ignore?.length).toBeGreaterThan(0);
	});

	it("should load configuration from .snapbackrc file", async () => {
		const mockConfig: SnapBackRC = {
			protection: [{ pattern: "**/*.secret", level: "block" }],
			ignore: ["temp/**"],
		};

		// Mock the config file as existing
		vi.mocked(fs.access).mockImplementation(async (filePath: any) => {
			if (typeof filePath === "string" && filePath.endsWith(".snapbackrc")) {
				return Promise.resolve();
			}
			throw { code: "ENOENT" };
		});

		vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
			if (typeof filePath === "string" && filePath.endsWith(".snapbackrc")) {
				return Promise.resolve(JSON.stringify(mockConfig));
			}
			throw { code: "ENOENT" };
		});
		// Mock findFiles to return no files
		vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

		const manager = new ConfigurationManager(
			mockWorkspaceRoot,
			mockContext,
			mockProtectedFileRegistry,
		);
		const config = await manager.load();

		// Should have the custom rule from the config file
		expect(config.protection?.[0].pattern).toBe("**/*.secret");
		expect(config.protection?.[0].level).toBe("block");

		// Should still have default ignore patterns plus custom ones
		expect(config.ignore).toContain("temp/**");
	});

	it("should handle nested configurations with root boundaries", async () => {
		// This test will be expanded when we implement the full directory walking
		const manager = new ConfigurationManager(
			mockWorkspaceRoot,
			mockContext,
			mockProtectedFileRegistry,
		);
		expect(manager).toBeDefined();
	});

	it("should apply protection rules to the registry", async () => {
		const mockConfig: SnapBackRC = {
			protection: [{ pattern: "**/*.secret", level: "block" }],
		};

		// Mock the config file as existing
		vi.mocked(fs.access).mockImplementation(async (filePath: any) => {
			if (typeof filePath === "string" && filePath.endsWith(".snapbackrc")) {
				return Promise.resolve();
			}
			throw { code: "ENOENT" };
		});

		vi.mocked(fs.readFile).mockImplementation(async (filePath: any) => {
			if (typeof filePath === "string" && filePath.endsWith(".snapbackrc")) {
				return Promise.resolve(JSON.stringify(mockConfig));
			}
			throw { code: "ENOENT" };
		});

		// Mock findFiles to return some files
		vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
			{ fsPath: "/test/workspace/file1.secret" },
			{ fsPath: "/test/workspace/file2.secret" },
		] as any);

		const manager = new ConfigurationManager(
			mockWorkspaceRoot,
			mockContext,
			mockProtectedFileRegistry,
		);
		await manager.load();

		// Should have called add on the protected file registry for each file
		expect(mockProtectedFileRegistry.add).toHaveBeenCalledTimes(2);
	});
});
