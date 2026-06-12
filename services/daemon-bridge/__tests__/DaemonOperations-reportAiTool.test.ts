/**
 * DaemonOperations.reportAiTool  -  Unit Tests
 *
 * Verifies that the reportAiTool method (spec 5.4):
 *   - Issues "session/report-ai-tool" IPC call with correct payload
 *   - Returns {updated: true} on success
 *   - Propagates {updated: false, error} on failure
 *   - Can be called fire-and-forget (promise resolves or rejects cleanly)
 *
 * @module daemon-bridge/__tests__/DaemonOperations-reportAiTool.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestFunction } from "../DaemonOperations.js";
import { DaemonOperations } from "../DaemonOperations.js";

// =============================================================================
// Helpers
// =============================================================================

function makeOps(request: RequestFunction): DaemonOperations {
	const isConnected = () => true;
	return new DaemonOperations(request, isConnected);
}

// =============================================================================
// Tests
// =============================================================================

describe("DaemonOperations.reportAiTool", () => {
	const WS = "/workspace/project";
	const SESSION = "sess_abc123";

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("issues session/report-ai-tool with correct workspace, sessionId, and tool", async () => {
		const request = vi.fn().mockResolvedValue({ updated: true });
		const ops = makeOps(request as unknown as RequestFunction);

		await ops.reportAiTool(WS, SESSION, "cursor");

		expect(request).toHaveBeenCalledOnce();
		expect(request).toHaveBeenCalledWith("session/report-ai-tool", {
			workspace: WS,
			sessionId: SESSION,
			tool: "cursor",
		});
	});

	it("returns {updated: true} on success", async () => {
		const request = vi.fn().mockResolvedValue({ updated: true });
		const ops = makeOps(request as unknown as RequestFunction);

		const result = await ops.reportAiTool(WS, SESSION, "copilot");

		expect(result).toEqual({ updated: true });
	});

	it("returns {updated: false, error} when daemon returns error shape", async () => {
		const request = vi
			.fn()
			.mockResolvedValue({ updated: false, error: "session not found: sess_xyz" });
		const ops = makeOps(request as unknown as RequestFunction);

		const result = await ops.reportAiTool(WS, SESSION, "claude");

		expect(result.updated).toBe(false);
		expect(result.error).toContain("sess_xyz");
	});

	it("propagates rejected promise cleanly (fire-and-forget safe)", async () => {
		const request = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));
		const ops = makeOps(request as unknown as RequestFunction);

		await expect(ops.reportAiTool(WS, SESSION, "windsurf")).rejects.toThrow("ECONNREFUSED");
	});

	it("works with all known tool names", async () => {
		const tools = ["cursor", "copilot", "claude", "windsurf", "unknown"];
		for (const tool of tools) {
			const request = vi.fn().mockResolvedValue({ updated: true });
			const ops = makeOps(request as unknown as RequestFunction);

			const result = await ops.reportAiTool(WS, SESSION, tool);
			expect(result.updated).toBe(true);
		}
	});
});
