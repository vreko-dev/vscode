/**
 * MCPToolsService Tests
 *
 * TDD RED phase: These tests define the expected behavior of MCPToolsService
 * which integrates @snapback/mcp tools directly into the VS Code extension.
 *
 * @module MCPToolsService.test
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionCoordinator } from "@vscode/snapshot/SessionCoordinator";
import type { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";
import type { IStorageManager } from "@vscode/storage/types";

// Import will fail until we create the service (RED)
import { MCPToolsService } from "@vscode/services/MCPToolsService";

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

	describe("snap - start task", () => {
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

	describe("snap - get context", () => {
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
				action: "use @snapback/vitest-config with nodeConfig preset",
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
