import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentWatcher } from "../../src/ai/fs/agentWatcher";

/**
 * FS Guard Integration Tests
 *
 * Tests the AgentWatcher class that monitors AI agent file changes.
 * Complex scenarios (chokidar mocking, VS Code UI) are out of scope for unit tests
 * and should be covered by E2E tests.
 */
describe("FS Guard", () => {
	let agentWatcher: AgentWatcher | null = null;

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		if (agentWatcher) {
			agentWatcher.dispose();
			agentWatcher = null;
		}
	});

	it("fs-001: should create agent watcher instance", () => {
		agentWatcher = new AgentWatcher();
		expect(agentWatcher).toBeInstanceOf(AgentWatcher);
	});
});
