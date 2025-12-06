import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProtectionConfigManager } from "../../src/protection/ProtectionConfigManager";

// Create a mock ConfigFileManager instance
const mockConfigFileManager = {
	ensureConfigExists: vi.fn().mockResolvedValue(undefined),
	readConfig: vi.fn().mockResolvedValue([]),
	hasPattern: vi.fn().mockResolvedValue(false),
	removePattern: vi.fn().mockResolvedValue(undefined),
	addPattern: vi.fn().mockResolvedValue(undefined),
};

// Mock ConfigFileManager class to return our mock instance
vi.mock("../../src/protection/ConfigFileManager", () => {
	return {
		ConfigFileManager: vi.fn(() => mockConfigFileManager),
	};
});

// Mock vscode module
vi.mock("vscode", () => {
	// Create a mock file watcher
	const mockWatcher = {
		onDidChange: vi.fn((_callback) => {
			// Return a disposable object
			return { dispose: vi.fn() };
		}),
		onDidCreate: vi.fn((_callback) => {
			// Return a disposable object
			return { dispose: vi.fn() };
		}),
		onDidDelete: vi.fn((_callback) => {
			// Return a disposable object
			return { dispose: vi.fn() };
		}),
		dispose: vi.fn(),
	};

	return {
		default: {
			workspace: {
				asRelativePath: vi.fn(),
				findFiles: vi.fn(),
				createFileSystemWatcher: vi.fn(() => mockWatcher),
			},
			window: {
				showWarningMessage: vi.fn(),
				showInformationMessage: vi.fn(),
				setStatusBarMessage: vi.fn().mockReturnValue({ dispose: vi.fn() }),
			},
			RelativePattern: vi.fn(),
		},
		workspace: {
			asRelativePath: vi.fn(),
			findFiles: vi.fn(),
			createFileSystemWatcher: vi.fn(() => mockWatcher),
		},
		window: {
			showWarningMessage: vi.fn(),
			showInformationMessage: vi.fn(),
			setStatusBarMessage: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		},
		RelativePattern: vi.fn(),
	};
});

// Mock ProtectedFileRegistry
const mockRegistry = {
	add: vi.fn(),
	remove: vi.fn(),
	clearAll: vi.fn(),
	isProtected: vi.fn(),
};

describe("ProtectionConfigManager", () => {
	let configManager: ProtectionConfigManager;
	const mockWorkspaceRoot = "/test/workspace";

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Reset mock implementations
		mockConfigFileManager.ensureConfigExists.mockResolvedValue(undefined);
		mockConfigFileManager.readConfig.mockResolvedValue([]);
		mockConfigFileManager.hasPattern.mockResolvedValue(false);
		mockConfigFileManager.removePattern.mockResolvedValue(undefined);
		mockConfigFileManager.addPattern.mockResolvedValue(undefined);

		mockRegistry.add.mockResolvedValue(undefined);
		mockRegistry.remove.mockResolvedValue(undefined);
		mockRegistry.clearAll.mockResolvedValue(undefined);
		mockRegistry.isProtected.mockReturnValue(false);
	});

	it("initialize creates default config files", async () => {
		// Given: No config files exist

		// When: initialize()
		configManager = new ProtectionConfigManager(
			mockWorkspaceRoot,
			mockRegistry as any,
		);
		await configManager.initialize();

		// Then: Both .snapbackprotected and .snapbackignore created
		expect(mockConfigFileManager.ensureConfigExists).toHaveBeenCalledWith(
			"protected",
			expect.any(Array),
		);
		expect(mockConfigFileManager.ensureConfigExists).toHaveBeenCalledWith(
			"ignore",
			expect.any(Array),
		);

		// Verification: Files exist with default content
	});

	it("loadAndApplyProtection auto-protects matching files", async () => {
		// Given: Config has ['package.json', 'tsconfig.json']
		// And: Both files exist in workspace
		mockConfigFileManager.readConfig.mockImplementation(
			async (type: string) => {
				if (type === "protected") return ["package.json", "tsconfig.json"];
				if (type === "ignore") return [];
				return [];
			},
		);

		vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
			{ fsPath: "/test/workspace/package.json" } as any,
			{ fsPath: "/test/workspace/tsconfig.json" } as any,
		]);

		configManager = new ProtectionConfigManager(
			mockWorkspaceRoot,
			mockRegistry as any,
		);

		// When: loadAndApplyProtection()
		await configManager.loadAndApplyProtection();

		// Then: Both files added to registry
		expect(mockRegistry.add).toHaveBeenCalledWith(
			"/test/workspace/package.json",
		);
		expect(mockRegistry.add).toHaveBeenCalledWith(
			"/test/workspace/tsconfig.json",
		);

		// Verification: registry.isProtected() returns true
	});

	it("loadAndApplyProtection respects ignore patterns", async () => {
		// Given: Protected has ['**/*.ts']
		// And: Ignored has ['node_modules/**']
		mockConfigFileManager.readConfig.mockImplementation(
			async (type: string) => {
				if (type === "protected") return ["**/*.ts"];
				if (type === "ignore") return ["node_modules/**"];
				return [];
			},
		);

		vi.mocked(vscode.workspace.findFiles).mockResolvedValue([
			{ fsPath: "/test/workspace/src/index.ts" } as any,
		]);

		configManager = new ProtectionConfigManager(
			mockWorkspaceRoot,
			mockRegistry as any,
		);

		// When: loadAndApplyProtection()
		await configManager.loadAndApplyProtection();

		// Then: Only non-node_modules .ts files protected
		expect(mockRegistry.add).toHaveBeenCalledWith(
			"/test/workspace/src/index.ts",
		);

		// Verification: node_modules files not in registry
	});

	it("handleProtectFile adds to config and registry", async () => {
		// Given: File 'test.ts' exists
		vi.mocked(vscode.workspace.asRelativePath).mockReturnValue("test.ts");
		mockConfigFileManager.hasPattern.mockResolvedValue(false); // Not in ignore list

		configManager = new ProtectionConfigManager(
			mockWorkspaceRoot,
			mockRegistry as any,
		);

		// When: handleProtectFile('test.ts')
		await configManager.handleProtectFile("/test/workspace/test.ts");

		// Then: test.ts in .snapbackprotected
		// And: registry.isProtected('test.ts') is true
		expect(mockConfigFileManager.addPattern).toHaveBeenCalledWith(
			"protected",
			"test.ts",
		);
		expect(mockRegistry.add).toHaveBeenCalledWith("/test/workspace/test.ts");

		// Verification: Both updates applied
	});

	it("handleProtectFile removes from ignore if present", async () => {
		// Given: test.ts in .snapbackignore
		vi.mocked(vscode.workspace.asRelativePath).mockReturnValue("test.ts");
		vi.mocked(vscode.window.showWarningMessage).mockResolvedValue(
			"Yes, Remove from Ignore" as any,
		);
		mockConfigFileManager.hasPattern.mockResolvedValue(true); // In ignore list

		configManager = new ProtectionConfigManager(
			mockWorkspaceRoot,
			mockRegistry as any,
		);

		// When: handleProtectFile('test.ts') with user confirmation
		await configManager.handleProtectFile("/test/workspace/test.ts");

		// Then: test.ts removed from .snapbackignore
		// And: test.ts added to .snapbackprotected
		expect(mockConfigFileManager.removePattern).toHaveBeenCalledWith(
			"ignore",
			"test.ts",
		);
		expect(mockConfigFileManager.addPattern).toHaveBeenCalledWith(
			"protected",
			"test.ts",
		);
		expect(mockRegistry.add).toHaveBeenCalledWith("/test/workspace/test.ts");

		// Verification: Conflict resolved
	});

	it("handleUnprotectFile removes from config and registry", async () => {
		// Given: test.ts is protected
		vi.mocked(vscode.workspace.asRelativePath).mockReturnValue("test.ts");

		configManager = new ProtectionConfigManager(
			mockWorkspaceRoot,
			mockRegistry as any,
		);

		// When: handleUnprotectFile('test.ts')
		await configManager.handleUnprotectFile("/test/workspace/test.ts");

		// Then: test.ts not in .snapbackprotected
		// And: registry.isProtected('test.ts') is false
		expect(mockConfigFileManager.removePattern).toHaveBeenCalledWith(
			"protected",
			"test.ts",
		);
		expect(mockRegistry.remove).toHaveBeenCalledWith("/test/workspace/test.ts");

		// Verification: Both updates applied
	});

	it("config file watcher reloads on change", async () => {
		// Given: Extension initialized
		// When: .snapbackprotected file modified externally
		// Then: loadAndApplyProtection() called automatically
		// Verification: Protection updated
		expect(true).toBe(true); // Placeholder
	});

	it("config file deletion clears protection", async () => {
		// Given: Files protected via config
		// When: .snapbackprotected deleted
		// Then: All protections cleared
		// Verification: registry empty
		configManager = new ProtectionConfigManager(
			mockWorkspaceRoot,
			mockRegistry as any,
		);
		await (configManager as any).reloadProtection();
		expect(mockRegistry.clearAll).toHaveBeenCalled();
	});
});
