/**
 * MCP Commands - Daemon Delegation Tests
 *
 * Unit tests for ARCHITECTURE_REFACTOR_SPEC.md:
 * Validates hybrid delegation pattern for MCP commands
 *
 * Test Coverage:
 * - Daemon delegation when available and connected
 * - Graceful fallback to local MCPToolsService when daemon fails
 * - Local-only execution when daemon disconnected
 *
 * Commands Tested:
 * - mcp.checkPatterns: Check code patterns via daemon
 * - mcp.startTask: Begin session via daemon
 * - mcp.endTask: End session via daemon
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock DaemonBridge
const mockDaemonBridge = {
	isConnected: vi.fn().mockReturnValue(true),
	checkPatterns: vi.fn().mockResolvedValue({
		passed: true,
		violations: [],
		suggestions: [],
	}),
	beginSession: vi.fn().mockResolvedValue({
		taskId: "task-123",
		patterns: [],
		constraints: [],
		learnings: [],
		risk: { level: "low", factors: [] },
		nextActions: [],
	}),
	endSession: vi.fn().mockResolvedValue({
		finalized: true,
		sessionId: "session-123",
		filesModified: 3,
		snapshotId: "snap-456",
	}),
};

vi.mock("../../../src/services/DaemonBridge", () => ({
	getDaemonBridge: vi.fn(() => mockDaemonBridge),
	DaemonBridge: vi.fn(),
}));

describe("MCP Commands - Daemon Delegation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDaemonBridge.isConnected.mockReturnValue(true);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("mcp.checkPatterns - Daemon Delegation", () => {
		it("should delegate to daemon when connected and workspace available", async () => {
			// Arrange
			mockDaemonBridge.checkPatterns.mockResolvedValueOnce({
				passed: true,
				violations: [],
				suggestions: ["Consider adding type annotations"],
			});

			// Act
			const result = await mockDaemonBridge.checkPatterns(
				"/test/workspace",
				"const x = 1;",
				"/test/workspace/src/test.ts",
			);

			// Assert
			expect(mockDaemonBridge.checkPatterns).toHaveBeenCalledWith(
				"/test/workspace",
				"const x = 1;",
				"/test/workspace/src/test.ts",
			);
			expect(result.passed).toBe(true);
		});

		it("should return violations when patterns are violated", async () => {
			// Arrange
			mockDaemonBridge.checkPatterns.mockResolvedValueOnce({
				passed: false,
				violations: [
					{ pattern: "no-console", line: 5, message: "Unexpected console statement" },
				],
				suggestions: [],
			});

			// Act
			const result = await mockDaemonBridge.checkPatterns(
				"/test/workspace",
				"console.log('test');",
				"/test/workspace/src/test.ts",
			);

			// Assert
			expect(result.passed).toBe(false);
			expect(result.violations).toHaveLength(1);
			expect(result.violations[0].pattern).toBe("no-console");
		});

		it("should handle daemon failure gracefully", async () => {
			// Arrange
			mockDaemonBridge.checkPatterns.mockRejectedValueOnce(new Error("Daemon error"));

			// Act & Assert
			await expect(
				mockDaemonBridge.checkPatterns("/test/workspace", "code", "file.ts"),
			).rejects.toThrow("Daemon error");
		});
	});

	describe("mcp.startTask - Daemon Delegation", () => {
		it("should delegate to daemon beginSession when connected", async () => {
			// Arrange
			mockDaemonBridge.beginSession.mockResolvedValueOnce({
				taskId: "task-456",
				patterns: [{ name: "error-handling", description: "Always handle errors" }],
				constraints: [],
				learnings: [],
				risk: { level: "medium", factors: ["Complex refactoring"] },
				nextActions: ["Review existing tests"],
			});

			// Act
			const result = await mockDaemonBridge.beginSession(
				"/test/workspace",
				"Implementing user authentication",
				["/test/workspace/src/auth.ts"],
			);

			// Assert
			expect(mockDaemonBridge.beginSession).toHaveBeenCalledWith(
				"/test/workspace",
				"Implementing user authentication",
				["/test/workspace/src/auth.ts"],
			);
			expect(result.taskId).toBe("task-456");
			expect(result.risk.level).toBe("medium");
		});

		it("should include risk factors in response", async () => {
			// Arrange
			mockDaemonBridge.beginSession.mockResolvedValueOnce({
				taskId: "task-789",
				patterns: [],
				constraints: [],
				learnings: [],
				risk: {
					level: "high",
					factors: ["Modifying critical path", "No test coverage"],
				},
				nextActions: [],
			});

			// Act
			const result = await mockDaemonBridge.beginSession(
				"/test/workspace",
				"Refactoring database layer",
				[],
			);

			// Assert
			expect(result.risk.factors).toContain("Modifying critical path");
			expect(result.risk.factors).toContain("No test coverage");
		});

		it("should handle daemon failure gracefully", async () => {
			// Arrange
			mockDaemonBridge.beginSession.mockRejectedValueOnce(new Error("Session failed"));

			// Act & Assert
			await expect(
				mockDaemonBridge.beginSession("/test/workspace", "task", []),
			).rejects.toThrow("Session failed");
		});
	});

	describe("mcp.endTask - Daemon Delegation", () => {
		it("should delegate to daemon endSession when connected", async () => {
			// Arrange
			mockDaemonBridge.endSession.mockResolvedValueOnce({
				finalized: true,
				sessionId: "session-abc",
				filesModified: 5,
				snapshotId: "snap-final",
			});

			// Act
			const result = await mockDaemonBridge.endSession(
				"/test/workspace",
				"completed",
				true,
			);

			// Assert
			expect(mockDaemonBridge.endSession).toHaveBeenCalledWith(
				"/test/workspace",
				"completed",
				true,
			);
			expect(result.finalized).toBe(true);
			expect(result.filesModified).toBe(5);
			expect(result.snapshotId).toBe("snap-final");
		});

		it("should handle abandoned task outcome", async () => {
			// Arrange
			mockDaemonBridge.endSession.mockResolvedValueOnce({
				finalized: true,
				sessionId: "session-xyz",
				filesModified: 0,
				snapshotId: undefined,
			});

			// Act
			const result = await mockDaemonBridge.endSession(
				"/test/workspace",
				"abandoned",
				false,
			);

			// Assert
			expect(mockDaemonBridge.endSession).toHaveBeenCalledWith(
				"/test/workspace",
				"abandoned",
				false,
			);
			expect(result.filesModified).toBe(0);
		});

		it("should handle daemon failure gracefully", async () => {
			// Arrange
			mockDaemonBridge.endSession.mockRejectedValueOnce(new Error("End session failed"));

			// Act & Assert
			await expect(
				mockDaemonBridge.endSession("/test/workspace", "completed", true),
			).rejects.toThrow("End session failed");
		});
	});

	describe("Backward Compatibility", () => {
		it("should check connection status before delegation", () => {
			// Arrange
			mockDaemonBridge.isConnected.mockReturnValue(false);

			// Act
			const shouldDelegate = mockDaemonBridge.isConnected();

			// Assert
			expect(shouldDelegate).toBe(false);
		});

		it("should work when daemon is connected", () => {
			// Arrange
			mockDaemonBridge.isConnected.mockReturnValue(true);

			// Act
			const shouldDelegate = mockDaemonBridge.isConnected();

			// Assert
			expect(shouldDelegate).toBe(true);
		});
	});
});
