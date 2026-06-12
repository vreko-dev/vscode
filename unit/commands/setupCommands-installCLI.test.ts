/**
 * Regression tests: installCLI + MCP agent-specific configuration
 *
 * Coverage:
 * 1. buildAgentConfigResultMessage  -  toast wording and per-agent restart lines
 * 2. AGENT_RESTART_INSTRUCTIONS  -  all supported agents present, content verified
 * 3. task-tools vrekoEndTool  -  inputSchema.outcome must NOT have an enum constraint
 */

import { describe, expect, it } from "vitest";
import {
	AGENT_RESTART_INSTRUCTIONS,
	buildAgentConfigResultMessage,
} from "../../../src/mcp/auto-configure";

// ---------------------------------------------------------------------------
// 1. buildAgentConfigResultMessage
// ---------------------------------------------------------------------------

describe("buildAgentConfigResultMessage", () => {
	it("handles empty configured list gracefully", () => {
		const { toast, restartLines } = buildAgentConfigResultMessage([]);
		expect(toast).toBeTruthy();
		expect(restartLines).toHaveLength(0);
	});

	it("singular: uses agent name in toast", () => {
		const { toast } = buildAgentConfigResultMessage(["claude"]);
		expect(toast).toContain("claude");
		// Must not mention a generic count
		expect(toast).not.toMatch(/\d+ AI assistants/);
	});

	it("plural: mentions count and all agent names", () => {
		const { toast } = buildAgentConfigResultMessage(["claude", "cursor"]);
		expect(toast).toMatch(/2 AI assistants/);
		expect(toast).toContain("claude");
		expect(toast).toContain("cursor");
	});

	it("produces exactly one restart line per configured agent", () => {
		const agents = ["claude", "cursor", "windsurf"];
		const { restartLines } = buildAgentConfigResultMessage(agents);
		expect(restartLines).toHaveLength(agents.length);
	});

	it("each restart line starts with the agent name", () => {
		const { restartLines } = buildAgentConfigResultMessage(["claude", "cursor"]);
		expect(restartLines[0]).toMatch(/^claude:/i);
		expect(restartLines[1]).toMatch(/^cursor:/i);
	});

	it("unknown agent produces a generic fallback restart line", () => {
		const { restartLines } = buildAgentConfigResultMessage(["unknown-agent-xyz"]);
		expect(restartLines[0]).toContain("Restart");
	});

	it("agent key normalisation: lowercases and replaces spaces", () => {
		// 'Roo Code' should resolve to 'roo-code' key
		const { restartLines } = buildAgentConfigResultMessage(["Roo Code"]);
		expect(restartLines[0]).toContain("Roo Code:");
		// Should use the roo-code instruction, not the generic fallback
		expect(restartLines[0]).toContain("Reload");
	});
});

// ---------------------------------------------------------------------------
// 2. AGENT_RESTART_INSTRUCTIONS  -  all supported agents present
// ---------------------------------------------------------------------------

describe("AGENT_RESTART_INSTRUCTIONS", () => {
	const SUPPORTED_AGENTS = [
		"claude",
		"cursor",
		"windsurf",
		"continue",
		"vscode",
		"zed",
		"cline",
		"roo-code",
		"gemini",
		"aider",
		"qoder",
	] as const;

	it.each(SUPPORTED_AGENTS)("has instruction for agent: %s", (agent) => {
		expect(AGENT_RESTART_INSTRUCTIONS[agent]).toBeTruthy();
	});

	it("Claude Desktop instruction mentions restart (config is startup-loaded)", () => {
		expect(AGENT_RESTART_INSTRUCTIONS.claude).toMatch(/restart/i);
	});

	it("Continue/VS Code/Cline/Roo Code instructions mention Reload Window (VS Code extension pattern)", () => {
		for (const agent of ["continue", "vscode", "cline", "roo-code"] as const) {
			expect(AGENT_RESTART_INSTRUCTIONS[agent]).toMatch(/reload/i);
		}
	});

	it("Aider instruction does NOT mention restart (picks up config on next run)", () => {
		expect(AGENT_RESTART_INSTRUCTIONS.aider).not.toMatch(/restart/i);
	});
});

// ---------------------------------------------------------------------------
// 3. task-tools vrekoEndTool  -  outcome must be free-text (no enum)
//    Tested in packages/mcp/test/tools/task-tools-schema.test.ts
// ---------------------------------------------------------------------------
