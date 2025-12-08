/**
 * Protection Delegation Integration Tests
 *
 * Per arch_remediation.md Task 1.2: These tests verify that ProtectedFileRegistry
 * correctly delegates protection decisions to SDK ProtectionManager.
 *
 * Key principles tested:
 * 1. SDK is the Single Source of Truth (SSOT) for protection decisions
 * 2. ProtectedFileRegistry delegates isProtected() to SDK
 * 3. ProtectedFileRegistry does NOT cache or override SDK decisions
 * 4. Changes to SDK state are immediately reflected in registry queries
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { IProtectionManager } from "../../../src/services/protectedFileRegistry";

// Mock vscode module
vi.mock("vscode", () => ({
	EventEmitter: class {
		fire = vi.fn();
		event = vi.fn();
		dispose = vi.fn();
	},
	Uri: {
		file: (p: string) => ({ fsPath: p }),
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
}));

// Create a mock Memento for VSCode state
const createMockMemento = () => ({
	get: vi.fn().mockReturnValue([]),
	update: vi.fn().mockResolvedValue(undefined),
	keys: vi.fn().mockReturnValue([]),
});

describe("Protection Delegation - Task 1.2 Compliance", () => {
	describe("ProtectedFileRegistry delegates to SDK ProtectionManager", () => {
		it("should call SDK ProtectionManager for isProtected", async () => {
			// Import here after mocks are set up
			const { ProtectedFileRegistry } = await import("../../../src/services/protectedFileRegistry");

			const mockSdkManager: IProtectionManager = {
				isProtected: vi.fn().mockReturnValue(true),
				getLevel: vi.fn().mockReturnValue("warn"),
				protect: vi.fn(),
				unprotect: vi.fn(),
				listProtected: vi.fn().mockReturnValue([]),
			};

			const mockMemento = createMockMemento();
			const registry = new ProtectedFileRegistry(mockMemento as any);
			registry.initializeSDKProtectionManager(mockSdkManager);

			const result = registry.isProtected("/src/index.ts");

			// Should delegate to SDK
			expect(mockSdkManager.isProtected).toHaveBeenCalled();
			expect(result).toBe(true);
		});

		it("should call SDK ProtectionManager for getProtectionLevel", async () => {
			const { ProtectedFileRegistry } = await import("../../../src/services/protectedFileRegistry");

			const mockSdkManager: IProtectionManager = {
				isProtected: vi.fn().mockReturnValue(true),
				getLevel: vi.fn().mockReturnValue("block"),
				protect: vi.fn(),
				unprotect: vi.fn(),
				listProtected: vi.fn().mockReturnValue([]),
			};

			const mockMemento = createMockMemento();
			const registry = new ProtectedFileRegistry(mockMemento as any);
			registry.initializeSDKProtectionManager(mockSdkManager);

			const level = registry.getProtectionLevel("/src/critical.ts");

			expect(mockSdkManager.getLevel).toHaveBeenCalled();
			expect(level).toBe("block");
		});

		it("should NOT cache or override SDK decisions", async () => {
			const { ProtectedFileRegistry } = await import("../../../src/services/protectedFileRegistry");

			const mockSdkManager: IProtectionManager = {
				isProtected: vi
					.fn()
					.mockReturnValueOnce(true)
					.mockReturnValueOnce(false), // SDK changed its mind
				getLevel: vi.fn().mockReturnValue("watch"),
				protect: vi.fn(),
				unprotect: vi.fn(),
				listProtected: vi.fn().mockReturnValue([]),
			};

			const mockMemento = createMockMemento();
			const registry = new ProtectedFileRegistry(mockMemento as any);
			registry.initializeSDKProtectionManager(mockSdkManager);

			const result1 = registry.isProtected("/src/index.ts");
			const result2 = registry.isProtected("/src/index.ts");

			// Results should reflect SDK's changing decisions
			expect(result1).toBe(true);
			expect(result2).toBe(false);

			// Registry must call SDK each time, not cache
			expect(mockSdkManager.isProtected).toHaveBeenCalledTimes(2);
		});

		it("should sync protection to SDK when adding files", async () => {
			const { ProtectedFileRegistry } = await import("../../../src/services/protectedFileRegistry");

			const mockSdkManager: IProtectionManager = {
				isProtected: vi.fn().mockReturnValue(false),
				getLevel: vi.fn().mockReturnValue(null),
				protect: vi.fn(),
				unprotect: vi.fn(),
				listProtected: vi.fn().mockReturnValue([]),
			};

			const mockMemento = createMockMemento();
			const registry = new ProtectedFileRegistry(mockMemento as any);
			registry.initializeSDKProtectionManager(mockSdkManager);

			await registry.add("/src/new-file.ts", { protectionLevel: "warn" });

			// Should sync to SDK
			expect(mockSdkManager.protect).toHaveBeenCalledWith(
				expect.stringContaining("new-file.ts"),
				"warn",
			);
		});

		it("should sync unprotection to SDK when removing files", async () => {
			const { ProtectedFileRegistry } = await import("../../../src/services/protectedFileRegistry");

			const mockSdkManager: IProtectionManager = {
				isProtected: vi.fn().mockReturnValue(true),
				getLevel: vi.fn().mockReturnValue("watch"),
				protect: vi.fn(),
				unprotect: vi.fn(),
				listProtected: vi.fn().mockReturnValue([]),
			};

			// Pre-populate with a file
			const mockMemento = createMockMemento();
			mockMemento.get.mockReturnValue([
				{ path: "src/existing.ts", label: "existing.ts", lastProtectedAt: Date.now() },
			]);

			const registry = new ProtectedFileRegistry(mockMemento as any);
			registry.initializeSDKProtectionManager(mockSdkManager);

			await registry.remove("/test/workspace/src/existing.ts");

			// Should sync to SDK
			expect(mockSdkManager.unprotect).toHaveBeenCalled();
		});
	});

	describe("Single Source of Truth (SSOT) Verification", () => {
		it("should have NO local isProtected logic when SDK is initialized", async () => {
			/**
			 * Code structure test: Verify that isProtected delegates to SDK
			 * and doesn't use local Set/Map lookup for decisions.
			 */
			const registrySource = fs.readFileSync(
				path.join(__dirname, "../../../src/services/protectedFileRegistry.ts"),
				"utf-8",
			);

			// Should NOT contain local protection decision patterns (old code)
			// The old code used: this.protectedPathsIndex.has(normalized)
			expect(registrySource).not.toMatch(/protectedPathsIndex\.has\(/);

			// Should delegate to SDK instead
			expect(registrySource).toMatch(/sdkProtectionManager\.isProtected/);
		});

		it("should have NO local getProtectionLevel logic when SDK is initialized", async () => {
			const registrySource = fs.readFileSync(
				path.join(__dirname, "../../../src/services/protectedFileRegistry.ts"),
				"utf-8",
			);

			// getProtectionLevel should delegate to SDK's getLevel
			expect(registrySource).toMatch(/sdkProtectionManager\.getLevel/);
		});
	});

	describe("Edge Cases", () => {
		it("should handle SDK not yet initialized (fallback mode)", async () => {
			const { ProtectedFileRegistry } = await import("../../../src/services/protectedFileRegistry");

			// Pre-populate with files to test fallback
			const mockMemento = createMockMemento();
			mockMemento.get.mockReturnValue([
				{ path: "src/file.ts", label: "file.ts", lastProtectedAt: Date.now(), protectionLevel: "watch" },
			]);

			const registry = new ProtectedFileRegistry(mockMemento as any);
			// Note: NOT calling initializeSDKProtectionManager

			// Should fallback to cached files (temporary during startup)
			const result = registry.isProtected("/test/workspace/src/file.ts");

			// Fallback should work but log warning (tested via logger mock if needed)
			expect(typeof result).toBe("boolean");
		});

		it("should initialize SDK with all cached files on startup", async () => {
			const { ProtectedFileRegistry } = await import("../../../src/services/protectedFileRegistry");

			const mockSdkManager: IProtectionManager = {
				isProtected: vi.fn().mockReturnValue(false),
				getLevel: vi.fn().mockReturnValue(null),
				protect: vi.fn(),
				unprotect: vi.fn(),
				listProtected: vi.fn().mockReturnValue([]),
			};

			// Pre-populate with multiple files
			const mockMemento = createMockMemento();
			mockMemento.get.mockReturnValue([
				{ path: "src/a.ts", label: "a.ts", lastProtectedAt: Date.now(), protectionLevel: "watch" },
				{ path: "src/b.ts", label: "b.ts", lastProtectedAt: Date.now(), protectionLevel: "block" },
			]);

			const registry = new ProtectedFileRegistry(mockMemento as any);
			registry.initializeSDKProtectionManager(mockSdkManager);

			// Should have called protect for each cached file
			expect(mockSdkManager.protect).toHaveBeenCalledTimes(2);
		});
	});
});

describe("Trust Chain Compliance - Registry → SDK", () => {
	it("should trust SDK decisions completely without modification", async () => {
		const { ProtectedFileRegistry } = await import("../../../src/services/protectedFileRegistry");

		// SDK says file is protected at 'block' level
		const mockSdkManager: IProtectionManager = {
			isProtected: vi.fn().mockReturnValue(true),
			getLevel: vi.fn().mockReturnValue("block"),
			protect: vi.fn(),
			unprotect: vi.fn(),
			listProtected: vi.fn().mockReturnValue([]),
		};

		const mockMemento = createMockMemento();
		const registry = new ProtectedFileRegistry(mockMemento as any);
		registry.initializeSDKProtectionManager(mockSdkManager);

		// Registry should return SDK's decision without modification
		expect(registry.isProtected("/any/path.ts")).toBe(true);
		expect(registry.getProtectionLevel("/any/path.ts")).toBe("block");

		// No additional logic applied
		expect(mockSdkManager.isProtected).toHaveBeenCalledTimes(1);
		expect(mockSdkManager.getLevel).toHaveBeenCalledTimes(1);
	});
});
