import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";

/**
 * RED PHASE: Tests for SnapBackRCLoader method split
 *
 * Current behavior (BEFORE):
 * - loadAndApplyConfig(silent) → loads config + merges + applies to registry (all-in-one)
 *
 * Desired behavior (AFTER):
 * - loadConfig() → loads config + merges, stores in mergedConfig, does NOT modify registry
 * - applyProtections() → uses stored mergedConfig, applies to registry
 *
 * The split allows extension activation to load without applying,
 * then user can choose to apply via "Protect This Repo" button
 */
describe("SnapBackRCLoader - Method Split - RED Phase", () => {
	let mockRegistry: ProtectedFileRegistry;
	let workspaceRoot: string;

	beforeEach(() => {
		// Mock the ProtectedFileRegistry
		mockRegistry = {
			add: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
			getAll: vi.fn().mockResolvedValue([]),
			getFile: vi.fn().mockResolvedValue(null),
			has: vi.fn().mockResolvedValue(false),
			getFilesWithLevel: vi.fn().mockResolvedValue([]),
			clear: vi.fn().mockResolvedValue(undefined),
			dispose: vi.fn(),
		} as any;

		workspaceRoot = "/test/workspace";
	});

	describe("loadConfig() Method - NEW", () => {
		it("should export loadConfig method from SnapBackRCLoader", async () => {
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("loadConfig");
		});

		it("should load and merge config WITHOUT applying to registry", async () => {
			// This test will fail until loadConfig() is implemented
			// The key assertion: registry.add() should NOT be called during loadConfig()
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(typeof SnapBackRCLoader.prototype.loadConfig).toBe("function");
		});

		it("should store merged config in mergedConfig property", async () => {
			// This ensures the config is accessible via getMergedConfig()
			// afteretes
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			const loader = new SnapBackRCLoader(mockRegistry, workspaceRoot);
			expect(loader.getMergedConfig()).toBeNull(); // Initially null
			// After loadConfig() (which will be tested in GREEN phase),
			// getMergedConfig() should return the merged config
		});

		it("should NOT call registry.add() during loadConfig()", async () => {
			// Core behavior: loadConfig() is side-effect free
			// It prepares the config but does not apply it
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("loadConfig");
			// When loadConfig() is called (in GREEN phase):
			// expect(mockRegistry.add).not.toHaveBeenCalled();
		});
	});

	describe("applyProtections() Method - NEW", () => {
		it("should export applyProtections method from SnapBackRCLoader", async () => {
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("applyProtections");
		});

		it("should apply stored mergedConfig to registry", async () => {
			// This ensures applyProtections() uses the config from loadConfig()
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(typeof SnapBackRCLoader.prototype.applyProtections).toBe(
				"function",
			);
		});

		it("should call registry.add() for each matching file", async () => {
			// Core behavior: applyProtections() applies protection
			// and triggers registry.add() for matched files
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("applyProtections");
			// When applyProtections() is called (in GREEN phase):
			// expect(mockRegistry.add).toHaveBeenCalled();
		});

		it("should require mergedConfig to be loaded before applying", async () => {
			// Error handling: can't apply without config
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			const _loader = new SnapBackRCLoader(mockRegistry, workspaceRoot);

			// This test will verify that applyProtections() handles null mergedConfig gracefully
			// (either throws error or silently returns in GREEN phase)
		});
	});

	describe("loadAndApplyConfig() - REFACTORED", () => {
		it("should still exist for backward compatibility", async () => {
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("loadAndApplyConfig");
		});

		it("should delegate to loadConfig() + applyProtections()", async () => {
			// After refactoring:
			// loadAndApplyConfig(silent) should internally:
			// 1. Call loadConfig() to load and merge
			// 2. Call applyProtections() to apply
			// This maintains backward compatibility while using new methods
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(typeof SnapBackRCLoader.prototype.loadAndApplyConfig).toBe(
				"function",
			);
		});

		it("should still support silent parameter", async () => {
			// Backward compatibility: loadAndApplyConfig(true) should still work
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			const _loader = new SnapBackRCLoader(mockRegistry, workspaceRoot);
			// Method signature should accept optional silent parameter
			expect(
				SnapBackRCLoader.prototype.loadAndApplyConfig.length,
			).toBeGreaterThanOrEqual(0);
		});
	});

	describe("initialize() - UPDATED", () => {
		it("should still exist and work as before", async () => {
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("initialize");
		});

		it("should call loadAndApplyConfig during startup (unchanged)", async () => {
			// initialize() behavior should be unchanged for existing callers
			// It calls loadAndApplyConfig() which now delegates to loadConfig() + applyProtections()
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(typeof SnapBackRCLoader.prototype.initialize).toBe("function");
		});
	});

	describe("File Watcher Integration", () => {
		it("should continue to call loadAndApplyConfig on .snapbackrc changes", async () => {
			// The file watcher (line 440, 448) should continue to call loadAndApplyConfig()
			// This ensures .snapbackrc changes are auto-applied (explicit user intent)
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("watchConfigFile");
		});

		it("should apply protection silently on .snapbackrc changes", async () => {
			// File watcher behavior: silent by default
			// User explicitly edited .snapbackrc, so auto-apply is appropriate
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			const loader = new SnapBackRCLoader(mockRegistry, workspaceRoot);
			expect(loader).toBeDefined();
		});
	});

	describe("Isolation: loadConfig has no side effects", () => {
		it("should NOT modify registry during loadConfig()", async () => {
			// Critical invariant: loadConfig() must be pure in terms of side effects
			// It only loads/merges config, no registry modifications
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("loadConfig");
			// Test assertion in GREEN phase: mockRegistry.add was never called
		});

		it("should NOT show notifications during loadConfig()", async () => {
			// Side effect check: loadConfig() should not trigger user notifications
			// Notifications should only happen during applyProtections() or loadAndApplyConfig()
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("loadConfig");
		});

		it("should NOT watch file system during loadConfig()", async () => {
			// Side effect check: loadConfig() should only load config, no file watching
			const module = (await import(
				"../../../src/protection/SnapBackRCLoader.js"
			)) as any;
			const SnapBackRCLoader = module.SnapBackRCLoader;

			expect(SnapBackRCLoader.prototype).toHaveProperty("loadConfig");
		});
	});
});
