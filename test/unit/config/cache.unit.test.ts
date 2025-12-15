import * as fs from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ConfigurationManager } from "@vscode/config/configurationManager";
import type { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";

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

// vscode mock provided by setup.ts

describe("Configuration Cache", () => {
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

	it("should return equivalent configurations on repeated loads with no changes", async () => {
		// Mock all config files as non-existent
		vi.mocked(fs.access).mockRejectedValue({ code: "ENOENT" });
		vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
		vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

		const manager = new ConfigurationManager(
			mockWorkspaceRoot,
			mockContext,
			mockProtectedFileRegistry,
		);

		// Load configuration twice
		const config1 = await manager.load();
		const config2 = await manager.load();

		// Should have equivalent content (deep equality)
		expect(config1).toEqual(config2);

		// But may not be the exact same object
		// This is fine - the important thing is that it's consistent and efficient
	});

	it("should provide different configurations when config files change", async () => {
		// Mock all config files as non-existent initially
		vi.mocked(fs.access).mockRejectedValue({ code: "ENOENT" });
		vi.mocked(fs.readFile).mockRejectedValue({ code: "ENOENT" });
		vi.mocked(vscode.workspace.findFiles).mockResolvedValue([]);

		const manager = new ConfigurationManager(
			mockWorkspaceRoot,
			mockContext,
			mockProtectedFileRegistry,
		);

		// Load configuration
		const config1 = await manager.load();

		// Simulate a config file being created
		const mockConfig = {
			protection: [{ pattern: "**/*.secret", level: "block" }],
		};
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

		// Load configuration again (simulating change)
		const config2 = await manager.load();

		// Should have different configurations
		expect(config1.protection?.[0].pattern).not.toBe("**/*.secret");
		expect(config2.protection?.[0].pattern).toBe("**/*.secret");
	});
});
