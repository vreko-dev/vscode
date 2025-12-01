import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ConfigurationManager } from "../../src/config/configurationManager.js";
import type { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry.js";

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
		},
		window: {
			showErrorMessage: vi.fn(),
			showInformationMessage: vi.fn().mockResolvedValue(undefined),
		},
		commands: {
			executeCommand: vi.fn(),
		},
		RelativePattern: vi.fn(),
	};
});

// Mock fs
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

describe("Multi-Root Workspace Integration Tests", () => {
	const mockContext: unknown = {};

	const mockProtectedFileRegistry: ProtectedFileRegistry = {
		add: vi.fn(),
		remove: vi.fn(),
		has: vi.fn(),
		isProtected: vi.fn(),
		getProtectionLevel: vi.fn(),
		getAll: vi.fn(),
		clear: vi.fn(),
		dispose: vi.fn(),
	} as unknown;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("should isolate configurations between workspace folders", async () => {
		const workspaceRoot1 = "/workspace/folder1";
		const workspaceRoot2 = "/workspace/folder2";

		// Mock different config files for each workspace
		const mockFs = await import("node:fs/promises");

		// Setup folder1 config
		vi.mocked(mockFs.access).mockImplementation(async (filePath: unknown) => {
			if (typeof filePath === "string") {
				if (filePath === path.join(workspaceRoot1, ".snapbackrc")) {
					return Promise.resolve();
				}
				if (filePath === path.join(workspaceRoot2, ".snapbackrc")) {
					throw { code: "ENOENT" };
				}
			}
			throw { code: "ENOENT" };
		});

		vi.mocked(mockFs.readFile).mockImplementation(async (filePath: unknown) => {
			if (typeof filePath === "string") {
				if (filePath === path.join(workspaceRoot1, ".snapbackrc")) {
					return Promise.resolve(
						JSON.stringify({
							protection: [{ pattern: "**/*.secret", level: "block" }],
						}),
					);
				}
			}
			throw { code: "ENOENT" };
		});

		// Create configuration managers for each workspace
		const manager1 = new ConfigurationManager(
			workspaceRoot1,
			mockContext,
			mockProtectedFileRegistry,
		);
		const config1 = await manager1.load();

		// Reset mocks and setup folder2 config
		vi.mocked(mockFs.access).mockImplementation(async (filePath: unknown) => {
			if (typeof filePath === "string") {
				if (filePath === path.join(workspaceRoot2, ".snapbackrc")) {
					return Promise.resolve();
				}
				if (filePath === path.join(workspaceRoot1, ".snapbackrc")) {
					throw { code: "ENOENT" };
				}
			}
			throw { code: "ENOENT" };
		});

		vi.mocked(mockFs.readFile).mockImplementation(async (filePath: unknown) => {
			if (typeof filePath === "string") {
				if (filePath === path.join(workspaceRoot2, ".snapbackrc")) {
					return Promise.resolve(
						JSON.stringify({
							protection: [{ pattern: "**/*.private", level: "warn" }],
						}),
					);
				}
			}
			throw { code: "ENOENT" };
		});

		const manager2 = new ConfigurationManager(
			workspaceRoot2,
			mockContext,
			mockProtectedFileRegistry,
		);
		const config2 = await manager2.load();

		// Verify configurations are isolated
		expect(config1.protection).toHaveLength(1);
		expect(config1.protection?.[0].pattern).toBe("**/*.secret");
		expect(config1.protection?.[0].level).toBe("block");

		expect(config2.protection).toHaveLength(1);
		expect(config2.protection?.[0].pattern).toBe("**/*.private");
		expect(config2.protection?.[0].level).toBe("warn");

		// Configurations should be different
		expect(config1).not.toEqual(config2);
	});

	it("should handle remote environment gracefully", async () => {
		// Mock remote environment
		const mockVscode = await import("vscode");
		vi.mocked(mockVscode as any).env = {
			remoteName: "ssh-remote",
		};

		const workspaceRoot = "/workspace/remote-project";
		const manager = new ConfigurationManager(
			workspaceRoot,
			mockContext,
			mockProtectedFileRegistry,
		);

		// Mock config file access
		const mockFs = await import("node:fs/promises");
		vi.mocked(mockFs.access).mockRejectedValue({ code: "ENOENT" });
		vi.mocked(mockFs.readFile).mockRejectedValue({ code: "ENOENT" });

		// Should not crash in remote environment
		const config = await manager.load();

		// Should load default configuration
		expect(config).toBeDefined();
		expect(config.protection).toBeDefined();
		expect(config.ignore).toBeDefined();

		// Cleanup mock
		vi.mocked(mockVscode as any).env = undefined;
	});
});
