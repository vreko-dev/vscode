/**
 * Regression tests for recordFileModification IPC call shape.
 *
 * Guards the bug where IntelligenceService sent:
 *   method: "intelligence.recordFileModification"  (dot notation, unknown method)
 *   field:  filePath (wrong key, daemon expects "path")
 *
 * These tests fail if either the method name or payload key regresses.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockRequest = vi.fn().mockResolvedValue({ recorded: true });

// Mutable so the "no workspace" test can simulate getCurrentWorkspaceId returning null.
const mocks = vi.hoisted(() => ({
	getCurrentWorkspaceId: vi.fn(() => "test-workspace-id"),
}));

vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [
			{
				uri: { fsPath: "/test/workspace" },
				name: "test-workspace",
				index: 0,
			},
		],
	},
}));

vi.mock("../../../src/services/DaemonBridge", () => ({
	getDaemonBridge: () => ({ request: mockRequest }),
	getCurrentWorkspaceId: mocks.getCurrentWorkspaceId,
}));

vi.mock("../../../src/utils/logger", () => ({
	logger: { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { recordFileModification } from "../../../src/services/IntelligenceService";

describe("recordFileModification  -  IPC contract", () => {
	beforeEach(() => {
		mockRequest.mockClear();
		mocks.getCurrentWorkspaceId.mockReturnValue("test-workspace-id");
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it("sends canonical slash-notation method name (not dot notation)", async () => {
		await recordFileModification("/test/workspace/src/foo.ts", "update");
		expect(mockRequest).toHaveBeenCalledOnce();
		const [method] = mockRequest.mock.calls[0];
		expect(method).toBe("intelligence/file-modified");
		expect(method).not.toContain(".");
	});

	it("sends 'path' key (not 'filePath') in payload", async () => {
		await recordFileModification("/test/workspace/src/bar.ts", "update");
		const [, payload] = mockRequest.mock.calls[0];
		expect(payload).toHaveProperty("path", "/test/workspace/src/bar.ts");
		expect(payload).not.toHaveProperty("filePath");
	});

	it("includes workspace in payload from getCurrentWorkspaceId fallback", async () => {
		await recordFileModification("/test/workspace/src/baz.ts", "create");
		const [, payload] = mockRequest.mock.calls[0];
		// getWorkspacePath() with no folder arg falls back to getCurrentWorkspaceId()
		expect(payload).toHaveProperty("workspace", "test-workspace-id");
	});

	it("passes optional fields from options through to payload", async () => {
		await recordFileModification("/test/workspace/src/ai.ts", "update", {
			linesChanged: 12,
			aiAttributed: true,
			aiTool: "claude",
		});
		const [, payload] = mockRequest.mock.calls[0];
		expect(payload).toMatchObject({
			path: "/test/workspace/src/ai.ts",
			workspace: "test-workspace-id",
			linesChanged: 12,
			aiAttributed: true,
			aiTool: "claude",
		});
	});

	it("returns without calling daemon when getCurrentWorkspaceId returns null", async () => {
		mocks.getCurrentWorkspaceId.mockReturnValue(null);
		await recordFileModification("/no/workspace/file.ts", "update");
		expect(mockRequest).not.toHaveBeenCalled();
	});

	it("swallows daemon errors silently (degraded state)", async () => {
		mockRequest.mockRejectedValueOnce(new Error("daemon unavailable"));
		await expect(
			recordFileModification("/test/workspace/src/err.ts", "update"),
		).resolves.toBeUndefined();
	});
});
