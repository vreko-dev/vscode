/**
 * SessionTagger  -  Unit Tests (spec 5.4)
 *
 * Verifies that:
 *   - tagSession detects AI presence and returns ai-assisted tags
 *   - The optional `reporter` callback is called with detected tool names
 *   - No reporter call when no AI detected
 *   - updateSessionWithTags merges tags into the manifest
 *   - Backward compatibility: 0-arg and 2-arg calls still work
 *
 * @module test/unit/utils/SessionTagger.test
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock AIPresenceDetector so tests don't need VS Code extension API
vi.mock("../../../src/utils/AIPresenceDetector", () => ({
	detectAIPresence: vi.fn(),
}));

import { detectAIPresence } from "../../../src/utils/AIPresenceDetector";
import { tagSession, updateSessionWithTags } from "../../../src/utils/SessionTagger";

// =============================================================================
// Helpers
// =============================================================================

function makeManifest(overrides: Record<string, unknown> = {}) {
	return {
		fileCount: 3,
		sessionId: "sess-001",
		...overrides,
	};
}

function mockAiPresent(tools: string[] = ["cursor"]) {
	vi.mocked(detectAIPresence).mockReturnValue({
		hasAI: true,
		detected: true,
		tool: tools[0] ?? null,
		detectedAssistants: tools,
		installed: tools,
	} as ReturnType<typeof detectAIPresence>);
}

function mockNoAi() {
	vi.mocked(detectAIPresence).mockReturnValue({
		hasAI: false,
		detected: false,
		tool: null,
		detectedAssistants: [],
		installed: [],
	} as ReturnType<typeof detectAIPresence>);
}

// =============================================================================
// Tests
// =============================================================================

describe("SessionTagger.tagSession", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns ai-assisted tag when AI is detected", () => {
		mockAiPresent(["cursor"]);
		const result = tagSession(makeManifest());
		expect(result.tags).toContainEqual({ key: "ai-assisted", value: "true" });
	});

	it("returns ai-tools tag with detected tool names", () => {
		mockAiPresent(["cursor", "copilot"]);
		const result = tagSession(makeManifest());
		const aiToolsTag = result.tags.find((t) => t.key === "ai-tools");
		expect(aiToolsTag).toBeDefined();
		expect(aiToolsTag?.value).toBe("cursor,copilot");
	});

	it("calls reporter with detected tool names (spec 5.4 wiring)", () => {
		mockAiPresent(["cursor"]);
		const reporter = vi.fn();
		tagSession(makeManifest(), undefined, reporter);
		expect(reporter).toHaveBeenCalledOnce();
		expect(reporter).toHaveBeenCalledWith(["cursor"]);
	});

	it("does NOT call reporter when no AI detected", () => {
		mockNoAi();
		const reporter = vi.fn();
		tagSession(makeManifest(), undefined, reporter);
		expect(reporter).not.toHaveBeenCalled();
	});

	it("does NOT call reporter when detectedAssistants is empty", () => {
		vi.mocked(detectAIPresence).mockReturnValue({
			hasAI: true,
			detected: true,
			tool: null,
			detectedAssistants: [],
			installed: [],
		} as ReturnType<typeof detectAIPresence>);
		const reporter = vi.fn();
		tagSession(makeManifest(), undefined, reporter);
		expect(reporter).not.toHaveBeenCalled();
	});

	it("is backward compatible when called without reporter (2 args)", () => {
		mockAiPresent(["copilot"]);
		expect(() => tagSession(makeManifest(), undefined)).not.toThrow();
	});

	it("returns confidence 0.8 when tags present, 0.5 when none", () => {
		mockAiPresent(["cursor"]);
		expect(tagSession(makeManifest()).confidence).toBe(0.8);

		mockNoAi();
		expect(tagSession(makeManifest()).confidence).toBe(0.5);
	});

	it("includes burst tag when burstResult.isBurst = true", () => {
		mockNoAi();
		const result = tagSession(makeManifest(), { isBurst: true });
		expect(result.tags).toContainEqual({ key: "burst", value: "true" });
	});

	it("includes large-session tag when fileCount > 10", () => {
		mockNoAi();
		const result = tagSession(makeManifest({ fileCount: 15 }));
		expect(result.tags).toContainEqual({ key: "large-session", value: "true" });
	});
});

describe("SessionTagger.updateSessionWithTags", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("merges tags into the manifest object", () => {
		mockAiPresent(["cursor"]);
		const manifest = makeManifest();
		const result = updateSessionWithTags(manifest, undefined);
		expect(result.tags).toBeDefined();
		expect(result.tags?.some((t) => t.key === "ai-assisted")).toBe(true);
	});

	it("forwards reporter to inner generateTags (spec 5.4)", () => {
		mockAiPresent(["cursor"]);
		const reporter = vi.fn();
		updateSessionWithTags(makeManifest(), undefined, reporter);
		expect(reporter).toHaveBeenCalledWith(["cursor"]);
	});
});
