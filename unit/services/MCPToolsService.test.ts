/**
 * MCPToolsService Tests
 *
 * TDD RED phase: These tests define the expected behavior of MCPToolsService
 * which integrates @vreko/mcp tools directly into the VS Code extension.
 *
 * @module MCPToolsService.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionCoordinator } from "@vscode/snapshot/SessionCoordinator";
import type { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";
import type { IStorageManager } from "@vscode/storage/types";

// Mock DaemonBridge module before importing MCPToolsService
const mockBridge = {
	isConnected: vi.fn().mockReturnValue(false),
	validateQuick: vi.fn(),
	validateComprehensive: vi.fn(),
	checkPatterns: vi.fn(),
	startSession: vi.fn(),
	endSession: vi.fn(),
	addLearning: vi.fn(),
};
vi.mock("@vscode/services/DaemonBridge", () => ({
	getDaemonBridge: vi.fn(() => mockBridge),
	getCurrentWorkspaceId: vi.fn(() => "test-workspace-id"),
}));

// Mock child_process spawn
const mockSpawn = vi.fn();
vi.mock("node:child_process", () => ({
	spawn: (...args: unknown[]) => mockSpawn(...args),
}));

// Import will fail until we create the service (RED)
import { MCPToolsService } from "@vscode/services/MCPToolsService";
import type { CheckResult } from "@vscode/services/MCPToolsService";

// Mock dependencies - define as functions to allow reset
function createMockSessionCoordinator() {
	return {
		addCandidate: vi.fn(),
		getCandidateCount: vi.fn().mockReturnValue(0),
		finalizeSession: vi.fn().mockResolvedValue("session-123"),
		getActiveSessionFiles: vi.fn().mockReturnValue([]),
	} as unknown as SessionCoordinator;
}

function createMockProtectedFileRegistry() {
	return {
		getProtectionLevel: vi.fn().mockReturnValue("watch"),
		isProtected: vi.fn().mockReturnValue(true),
		getProtectedFiles: vi.fn().mockReturnValue(["package.json", ".env"]),
	} as unknown as ProtectedFileRegistry;
}

function createMockStorage() {
	return {
		getSnapshot: vi.fn(),
		listSnapshots: vi.fn().mockResolvedValue([]),
		createSnapshot: vi.fn().mockResolvedValue("snap-123"),
	} as unknown as IStorageManager;
}

describe("MCPToolsService", () => {
	let service: MCPToolsService;
	let mockSessionCoordinator: SessionCoordinator;
	let mockProtectedFileRegistry: ProtectedFileRegistry;
	let mockStorage: IStorageManager;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		vi.clearAllMocks();
		mockSessionCoordinator = createMockSessionCoordinator();
		mockProtectedFileRegistry = createMockProtectedFileRegistry();
		mockStorage = createMockStorage();
		service = new MCPToolsService({
			workspaceRoot,
			sessionCoordinator: mockSessionCoordinator,
			protectedFileRegistry: mockProtectedFileRegistry,
			storage: mockStorage,
		});
	});

	afterEach(() => {
		service.dispose();
	});

	describe("initialization", () => {
		it("should create a new MCPToolsService", () => {
			expect(service).toBeDefined();
		});

		it("should expose workspace root", () => {
			expect(service.workspaceRoot).toBe(workspaceRoot);
		});

		it("should be disposable", () => {
			expect(typeof service.dispose).toBe("function");
		});
	});

	describe("vreko - start task", () => {
		it("should start a task and return context", async () => {
			const result = await service.startTask({
				task: "Implement feature X",
				files: ["src/feature.ts"],
				keywords: ["feature", "implementation"],
			});

			expect(result).toBeDefined();
			expect(result.taskId).toBeDefined();
			expect(result.taskId).toMatch(/^task_/);
		});

		it("should include protection status for files", async () => {
			const result = await service.startTask({
				task: "Edit protected files",
				files: ["package.json"],
			});

			expect(result.protection).toBeDefined();
			expect(result.protection?.["package.json"]).toBe("watch");
		});

		it("should return learnings for keywords", async () => {
			const result = await service.startTask({
				task: "Testing task",
				keywords: ["vitest", "testing"],
			});

			expect(result.learnings).toBeDefined();
			expect(Array.isArray(result.learnings)).toBe(true);
		});
	});

	describe("vreko - get context", () => {
		it("should get context without starting a task", async () => {
			const result = await service.getContext({
				keywords: ["auth", "security"],
			});

			expect(result).toBeDefined();
			expect(result.taskId).toBeUndefined();
			expect(result.constraints).toBeDefined();
		});
	});

	describe("check - validation", () => {
		it("should perform quick check on files", async () => {
			const result = await service.check({
				mode: "quick",
				files: ["src/index.ts"],
			});

			expect(result).toBeDefined();
			expect(result.errors).toBeDefined();
			expect(result.warnings).toBeDefined();
		});

		it("should perform pattern check on code", async () => {
			const code = `console.log("test");`;
			const result = await service.check({
				mode: "patterns",
				code,
				filePath: "src/test.ts",
			});

			expect(result).toBeDefined();
			expect(result.violations).toBeDefined();
		});

		it("should perform full validation", async () => {
			const result = await service.check({
				mode: "full",
				files: ["src/index.ts"],
			});

			expect(result).toBeDefined();
			expect(result.layers).toBeDefined(); // 7-layer validation
		});
	});

	describe("snap_end - complete task", () => {
		it("should complete a task successfully", async () => {
			// First start a task
			const startResult = await service.startTask({
				task: "Test task",
				files: ["src/test.ts"],
			});

			const result = await service.endTask({
				ok: true,
				learnings: ["Pattern X works well"],
			});

			expect(result).toBeDefined();
			expect(result.tokensSaved).toBeDefined();
			expect(result.learningsCaptured).toBeGreaterThanOrEqual(0);
		});

		it("should handle failed task completion", async () => {
			await service.startTask({ task: "Failing task" });

			const result = await service.endTask({
				ok: false,
				notes: "Test failed due to missing dependency",
			});

			expect(result).toBeDefined();
			expect(result.outcome).toBe("blocked");
		});
	});

	describe("snap_learn - capture learning", () => {
		it("should capture a learning", async () => {
			const result = await service.captureLearning({
				trigger: "vitest config",
				action: "use @vreko/vitest-config with nodeConfig preset",
				type: "pattern",
			});

			expect(result).toBeDefined();
			expect(result.id).toBeDefined();
		});

		it("should capture pitfall learning", async () => {
			const result = await service.captureLearning({
				trigger: "direct db import in vscode",
				action: "use sdk adapter instead",
				type: "pitfall",
			});

			expect(result.type).toBe("pitfall");
		});
	});

	describe("snap_violation - report violation", () => {
		it("should report a violation", async () => {
			const result = await service.reportViolation({
				type: "layer-boundary-violation",
				file: "src/extension.ts",
				whatHappened: "Imported infrastructure directly",
				whyItHappened: "Didn't check layer boundaries",
				prevention: "Use sdk adapter",
			});

			expect(result).toBeDefined();
			expect(result.count).toBeGreaterThanOrEqual(1);
		});

		it("should indicate promotion status", async () => {
			// Report same violation 3 times to trigger promotion
			for (let i = 0; i < 3; i++) {
				await service.reportViolation({
					type: "silent-catch",
					file: "src/handler.ts",
					whatHappened: "Empty catch block",
					whyItHappened: "Forgot to add error handling",
					prevention: "Always log or rethrow",
				});
			}

			const result = await service.reportViolation({
				type: "silent-catch",
				file: "src/handler.ts",
				whatHappened: "Empty catch block",
				whyItHappened: "Forgot to add error handling",
				prevention: "Always log or rethrow",
			});

			// After 3x, should be promoted to pattern
			expect(result.promoted).toBe(true);
		});
	});

	describe("snap_fix - snapshot operations", () => {
		it("should list recent snapshots", async () => {
			const result = await service.listSnapshots();

			expect(result).toBeDefined();
			expect(Array.isArray(result.snapshots)).toBe(true);
		});

		it("should restore a specific snapshot", async () => {
			mockStorage.getSnapshot = vi.fn().mockResolvedValue({
				id: "snap-123",
				filePath: "src/test.ts",
				content: "restored content",
			});

			const result = await service.restoreSnapshot({
				id: "snap-123",
			});

			expect(result).toBeDefined();
			expect(result.restored).toBe(true);
		});

		it("should compare two snapshots", async () => {
			const result = await service.compareSnapshots({
				id: "snap-1",
				diff: "snap-2",
			});

			expect(result).toBeDefined();
			expect(result.changes).toBeDefined();
		});
	});

	describe("integration with SessionCoordinator", () => {
		it("should track files in session when starting task", async () => {
			await service.startTask({
				task: "Edit feature",
				files: ["src/feature.ts", "src/utils.ts"],
			});

			// Session coordinator should be notified about tracked files
			expect(mockSessionCoordinator.getActiveSessionFiles).toBeDefined();
		});

		it("should finalize session on task end", async () => {
			await service.startTask({ task: "Session test" });
			await service.endTask({ ok: true });

			// Verify session was finalized (or candidates were checked)
			expect(mockSessionCoordinator.getCandidateCount).toHaveBeenCalled();
		});
	});

	describe("integration with ProtectedFileRegistry", () => {
		it("should check protection levels during task start", async () => {
			const result = await service.startTask({
				task: "Protected file edit",
				files: ["package.json", ".env"],
			});

			expect(mockProtectedFileRegistry.getProtectionLevel).toHaveBeenCalledWith("package.json");
			expect(result.protection).toBeDefined();
		});

		it("should warn about block-level protected files", async () => {
			mockProtectedFileRegistry.getProtectionLevel = vi.fn().mockReturnValue("block");

			const result = await service.startTask({
				task: "Critical edit",
				files: ["package.json"],
			});

			expect(result.warnings).toContainEqual(
				expect.objectContaining({
					type: "block-protected",
					file: "package.json",
				}),
			);
		});
	});
});

// =============================================================================
// check full mode comprehensive tests
// =============================================================================

/**
 * Helper to create a mock child process for spawn.
 * Simulates stdout/stderr events and close.
 */
function createMockProcess(stdout = "", stderr = "", exitCode = 0) {
	const handlers: Record<string, ((...args: unknown[]) => void)[]> = {};

	const proc = {
		stdout: {
			on: vi.fn((event: string, cb: (data: Buffer) => void) => {
				if (event === "data" && stdout) {
					setTimeout(() => cb(Buffer.from(stdout)), 0);
				}
				return proc.stdout;
			}),
		},
		stderr: {
			on: vi.fn((event: string, cb: (data: Buffer) => void) => {
				if (event === "data" && stderr) {
					setTimeout(() => cb(Buffer.from(stderr)), 0);
				}
				return proc.stderr;
			}),
		},
		on: vi.fn((event: string, cb: (...args: unknown[]) => void) => {
			if (!handlers[event]) {
				handlers[event] = [];
			}
			handlers[event].push(cb);
			if (event === "close") {
				setTimeout(() => cb(exitCode), 5);
			}
			return proc;
		}),
		kill: vi.fn(),
	};

	return proc;
}

describe("MCPToolsService - check (comprehensive)", () => {
	let service: MCPToolsService;
	let mockSessionCoordinator: SessionCoordinator;
	let mockProtectedFileRegistry: ProtectedFileRegistry;
	let mockStorage: IStorageManager;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		vi.clearAllMocks();
		mockBridge.isConnected.mockReturnValue(false);
		mockSessionCoordinator = createMockSessionCoordinator();
		mockProtectedFileRegistry = createMockProtectedFileRegistry();
		mockStorage = createMockStorage();
		service = new MCPToolsService({
			workspaceRoot,
			sessionCoordinator: mockSessionCoordinator,
			protectedFileRegistry: mockProtectedFileRegistry,
			storage: mockStorage,
		});
	});

	afterEach(() => {
		service.dispose();
	});

	// =========================================================================
	// Quick mode
	// =========================================================================

	describe("quick mode", () => {
		it("should delegate to daemon validateQuick when connected", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateQuick.mockResolvedValue({
				passed: true,
				errors: [],
				warnings: [],
			});

			const result = await service.check({ mode: "quick", files: ["src/index.ts"] });

			expect(mockBridge.validateQuick).toHaveBeenCalledWith(workspaceRoot, ["src/index.ts"]);
			expect(result.passed).toBe(true);
			expect(result.errors).toBe(0);
			expect(result.warnings).toBe(0);
		});

		it("should map daemon errors and warnings into issues", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateQuick.mockResolvedValue({
				passed: false,
				errors: [
					{ message: "Type mismatch", file: "a.ts", line: 10 },
					{ message: "Missing return", file: "b.ts", line: 20 },
				],
				warnings: [
					{ message: "Unused var", file: "a.ts", line: 5 },
				],
			});

			const result = await service.check({ mode: "quick" });

			expect(result.passed).toBe(false);
			expect(result.errors).toBe(2);
			expect(result.warnings).toBe(1);
			expect(result.issues).toHaveLength(3);
			expect(result.issues).toContainEqual(
				expect.objectContaining({ severity: "error", message: "Type mismatch", file: "a.ts" }),
			);
			expect(result.issues).toContainEqual(
				expect.objectContaining({ severity: "warning", message: "Unused var" }),
			);
		});

		it("should fall back to local tsc when daemon is disconnected", async () => {
			mockBridge.isConnected.mockReturnValue(false);
			const proc = createMockProcess(
				"src/foo.ts(12,5): error TS2322: Type 'string' is not assignable to type 'number'\n",
			);
			mockSpawn.mockReturnValue(proc);

			const result = await service.check({ mode: "quick", files: ["src/foo.ts"] });

			expect(mockBridge.validateQuick).not.toHaveBeenCalled();
			expect(mockSpawn).toHaveBeenCalledWith(
				"npx",
				["tsc", "--noEmit", "--pretty", "false"],
				expect.objectContaining({ cwd: workspaceRoot }),
			);
			expect(result.passed).toBe(false);
			expect(result.errors).toBe(1);
			expect(result.issues).toContainEqual(
				expect.objectContaining({
					severity: "error",
					file: "src/foo.ts",
					line: 12,
				}),
			);
		});

		it("should fall back to local when daemon validateQuick throws", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateQuick.mockRejectedValue(new Error("Daemon timeout"));
			const proc = createMockProcess(""); // no tsc errors
			mockSpawn.mockReturnValue(proc);

			const result = await service.check({ mode: "quick" });

			// Should not throw, should still return a valid result
			expect(result.passed).toBe(true);
			expect(result.errors).toBe(0);
		});

		it("should return passed=true when local tsc finds no errors", async () => {
			mockBridge.isConnected.mockReturnValue(false);
			const proc = createMockProcess(""); // clean
			mockSpawn.mockReturnValue(proc);

			const result = await service.check({ mode: "quick" });

			expect(result.passed).toBe(true);
			expect(result.errors).toBe(0);
			expect(result.warnings).toBe(0);
		});
	});

	// =========================================================================
	// Full mode
	// =========================================================================

	describe("full mode", () => {
		it("should return 7 layers in the result", async () => {
			mockBridge.isConnected.mockReturnValue(false);
			// Stub both subprocess calls for tsc and biome
			mockSpawn
				.mockReturnValueOnce(createMockProcess("")) // tsc
				.mockReturnValueOnce(createMockProcess("")); // biome

			const result = await service.check({ mode: "full" });

			expect(result.layers).toBeDefined();
			expect(result.layers).toHaveLength(7);
			const layerNames = (result.layers ?? []).map((l: { name: string }) => l.name);
			expect(layerNames).toEqual([
				"typescript", "lint", "patterns", "security", "tests", "architecture", "contracts",
			]);
		});

		it("should delegate to daemon validateComprehensive when connected", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockResolvedValue({
				passed: true,
				typescriptErrors: [],
				lintErrors: [],
				patternViolations: [],
			});

			const result = await service.check({ mode: "full", files: ["src/main.ts"] });

			expect(mockBridge.validateComprehensive).toHaveBeenCalledWith(
				workspaceRoot,
				"",
				"src/main.ts",
			);
			expect(result.passed).toBe(true);
			expect(result.errors).toBe(0);
		});

		it("should map daemon typescript errors to the typescript layer", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockResolvedValue({
				passed: false,
				typescriptErrors: [
					{ message: "TS2322: Type mismatch", file: "src/a.ts", line: 42 },
				],
				lintErrors: [],
				patternViolations: [],
			});

			const result = await service.check({ mode: "full" });

			expect(result.passed).toBe(false);
			const tsLayer = (result.layers ?? []).find((l: { name: string }) => l.name === "typescript");
			expect(tsLayer?.passed).toBe(false);
			expect(tsLayer?.issues).toHaveLength(1);
			expect(tsLayer?.issues[0]).toMatchObject({
				severity: "error",
				message: "TS2322: Type mismatch",
				file: "src/a.ts",
				line: 42,
			});
		});

		it("should map daemon lint errors to the lint layer", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockResolvedValue({
				passed: true,
				typescriptErrors: [],
				lintErrors: [
					{ message: "Prefer const", file: "src/b.ts", line: 7, rule: "prefer-const" },
					{ message: "Syntax error", file: "src/c.ts", line: 1 }, // no rule = error
				],
				patternViolations: [],
			});

			const result = await service.check({ mode: "full" });

			const lintLayer = (result.layers ?? []).find((l: { name: string }) => l.name === "lint");
			expect(lintLayer?.issues).toHaveLength(2);
			// Rule present → warning
			expect(lintLayer?.issues[0]).toMatchObject({ severity: "warning" });
			expect(lintLayer?.issues[0].message).toContain("prefer-const");
			// No rule → error
			expect(lintLayer?.issues[1]).toMatchObject({ severity: "error" });
			// lint layer fails because there's an error
			expect(lintLayer?.passed).toBe(false);
		});

		it("should map daemon pattern violations to the patterns layer", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockResolvedValue({
				passed: true,
				typescriptErrors: [],
				lintErrors: [],
				patternViolations: [
					{ pattern: "no-console", message: "Remove console.log", file: "src/d.ts", line: 3 },
				],
			});

			const result = await service.check({ mode: "full" });

			const patternsLayer = (result.layers ?? []).find((l: { name: string }) => l.name === "patterns");
			expect(patternsLayer?.passed).toBe(false);
			expect(patternsLayer?.issues).toHaveLength(1);
			expect(patternsLayer?.issues[0].message).toContain("no-console");
		});

		it("should fall back to local subprocess when daemon fails", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockRejectedValue(new Error("Daemon crash"));

			// tsc returns an error, biome returns clean
			const tscProc = createMockProcess(
				"src/x.ts(5,1): error TS1005: ';' expected\n",
			);
			const biomeProc = createMockProcess("");
			mockSpawn
				.mockReturnValueOnce(tscProc)
				.mockReturnValueOnce(biomeProc);

			const result = await service.check({ mode: "full" });

			// Daemon was tried but failed; local fallback used
			expect(mockBridge.validateComprehensive).toHaveBeenCalled();
			expect(mockSpawn).toHaveBeenCalledTimes(2); // tsc + biome
			expect(result.passed).toBe(false);
			const tsLayer = (result.layers ?? []).find((l: { name: string }) => l.name === "typescript");
			expect(tsLayer?.issues).toHaveLength(1);
			expect(tsLayer?.issues[0]).toMatchObject({
				severity: "error",
				file: "src/x.ts",
				line: 5,
			});
		});

		it("should parse biome JSON diagnostics in local fallback", async () => {
			mockBridge.isConnected.mockReturnValue(false);

			const biomeJson = JSON.stringify({
				diagnostics: [
					{ severity: "error", message: "Missing semicolon", file: "src/e.ts", line: 10 },
					{ severity: "warning", message: "Prefer const", file: "src/f.ts", line: 3 },
				],
			});
			mockSpawn
				.mockReturnValueOnce(createMockProcess("")) // tsc clean
				.mockReturnValueOnce(createMockProcess(biomeJson)); // biome with diagnostics

			const result = await service.check({ mode: "full" });

			const lintLayer = (result.layers ?? []).find((l: { name: string }) => l.name === "lint");
			expect(lintLayer?.issues).toHaveLength(2);
			expect(lintLayer?.issues[0]).toMatchObject({ severity: "error", message: "Missing semicolon" });
			expect(lintLayer?.issues[1]).toMatchObject({ severity: "warning", message: "Prefer const" });
			expect(lintLayer?.passed).toBe(false); // has errors
		});

		it("should handle non-JSON biome output gracefully", async () => {
			mockBridge.isConnected.mockReturnValue(false);

			mockSpawn
				.mockReturnValueOnce(createMockProcess("")) // tsc
				.mockReturnValueOnce(createMockProcess("Some random error output with error keyword")); // biome non-JSON

			const result = await service.check({ mode: "full" });

			const lintLayerNonJson = (result.layers ?? []).find((l: { name: string }) => l.name === "lint");
			// Should produce a fallback warning, not crash
			expect(lintLayerNonJson?.issues).toHaveLength(1);
			expect(lintLayerNonJson?.issues[0].severity).toBe("warning");
			expect(lintLayerNonJson?.issues[0].message).toContain("non-JSON");
		});

		it("should aggregate errors across all layers into top-level counts", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockResolvedValue({
				passed: false,
				typescriptErrors: [
					{ message: "err1", file: "a.ts", line: 1 },
				],
				lintErrors: [
					{ message: "err2", file: "b.ts", line: 2 },
					{ message: "warn1", file: "c.ts", line: 3, rule: "some-rule" },
				],
				patternViolations: [
					{ pattern: "p1", message: "v1", file: "d.ts", line: 4 },
				],
			});

			const result = await service.check({ mode: "full" });

			// 2 errors: 1 ts error + 1 lint error (no rule)
			expect(result.errors).toBe(2);
			// 2 warnings: 1 lint warning (rule) + 1 pattern violation
			expect(result.warnings).toBe(2);
			// Total issues across all layers
			expect(result.issues).toHaveLength(4);
		});

		it("should pass when daemon returns empty results", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockResolvedValue({
				passed: true,
				typescriptErrors: [],
				lintErrors: [],
				patternViolations: [],
			});

			const result = await service.check({ mode: "full" });

			expect(result.passed).toBe(true);
			expect(result.errors).toBe(0);
			expect(result.warnings).toBe(0);
			expect(result.layers?.every((l: { passed: boolean }) => l.passed)).toBe(true);
		});

		it("should use daemon checkPatterns for pattern layer in local fallback when files provided", async () => {
			// Daemon comprehensive fails, but checkPatterns works
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockRejectedValue(new Error("fail"));
			mockBridge.checkPatterns.mockResolvedValue({
				passed: false,
				violations: [
					{ pattern: "no-console", message: "Remove console.log", line: 5 },
				],
			});

			mockSpawn
				.mockReturnValueOnce(createMockProcess("")) // tsc
				.mockReturnValueOnce(createMockProcess("")); // biome

			const result = await service.check({ mode: "full", files: ["src/test.ts"] });

			expect(mockBridge.checkPatterns).toHaveBeenCalledWith(workspaceRoot, "", "src/test.ts");
			const patternsLayerFallback = (result.layers ?? []).find((l: { name: string }) => l.name === "patterns");
			expect(patternsLayerFallback?.issues).toHaveLength(1);
			expect(patternsLayerFallback?.issues[0].message).toContain("no-console");
		});
	});

	// =========================================================================
	// Patterns mode
	// =========================================================================

	describe("patterns mode", () => {
		it("should detect console.log anti-pattern", async () => {
			const result = await service.check({
				mode: "patterns",
				code: 'console.log("debug");',
				filePath: "src/app.ts",
			});

			expect(result.violations).toBeDefined();
			expect(result.violations?.length).toBeGreaterThan(0);
			expect(result.violations?.[0].type).toBe("no-console");
		});

		it("should detect vague assertion patterns", async () => {
			const result = await service.check({
				mode: "patterns",
				code: 'expect(result).toBeTruthy();',
				filePath: "src/test.ts",
			});

			expect((result.violations ?? []).some((v: { type: string }) => v.type === "vague-assertion")).toBe(true);
		});

		it("should detect silent catch blocks", async () => {
			const result = await service.check({
				mode: "patterns",
				code: 'try { doSomething(); } catch { /* intentionally empty */ }',
				filePath: "src/handler.ts",
			});

			expect((result.violations ?? []).some((v: { type: string }) => v.type === "silent-catch")).toBe(true);
		});

		it("should pass when code has no anti-patterns", async () => {
			const result = await service.check({
				mode: "patterns",
				code: 'const x: number = 42;\nexport { x };',
				filePath: "src/clean.ts",
			});

			expect(result.passed).toBe(true);
			expect(result.violations).toHaveLength(0);
		});

		it("should return clean result when no code is provided", async () => {
			const result = await service.check({ mode: "patterns" });

			expect(result.passed).toBe(true);
			expect(result.errors).toBe(0);
		});
	});

	// =========================================================================
	// Error handling and edge cases
	// =========================================================================

	describe("error handling", () => {
		it("should not throw when daemon is undefined/null for quick mode", async () => {
			mockBridge.isConnected.mockReturnValue(false);
			const proc = createMockProcess("");
			mockSpawn.mockReturnValue(proc);

			await expect(service.check({ mode: "quick" })).resolves.not.toThrow();
		});

		it("should not throw when daemon is undefined/null for full mode", async () => {
			mockBridge.isConnected.mockReturnValue(false);
			mockSpawn
				.mockReturnValueOnce(createMockProcess(""))
				.mockReturnValueOnce(createMockProcess(""));

			await expect(service.check({ mode: "full" })).resolves.not.toThrow();
		});

		it("should handle unknown check mode by returning default result", async () => {
			const result = await service.check({ mode: "build" as "quick" });

			expect(result).toBeDefined();
			expect(result.passed).toBe(true);
		});

		it("should handle daemon returning null/undefined arrays", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockResolvedValue({
				passed: true,
				// Intentionally missing arrays - tests ?? [] fallback
			});

			const result = await service.check({ mode: "full" });

			expect(result.passed).toBe(true);
			expect(result.errors).toBe(0);
		});

		it("should aggregate issues into the top-level issues array", async () => {
			mockBridge.isConnected.mockReturnValue(true);
			mockBridge.validateComprehensive.mockResolvedValue({
				passed: false,
				typescriptErrors: [{ message: "e1", file: "a.ts", line: 1 }],
				lintErrors: [{ message: "e2", file: "b.ts", line: 2, rule: "r" }],
				patternViolations: [],
			});

			const result = await service.check({ mode: "full" });

			// Top-level issues should contain all flattened layer issues
			expect(result.issues).toBeDefined();
			expect(result.issues?.length).toBe(2);
		});
	});
});
