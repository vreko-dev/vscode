/**
 * @fileoverview Tests for SessionTagger
 */

import type { BurstDetectionResult } from "@snapback/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionManifest } from "@vscode/snapshot/sessionTypes";
import {
	tagSession,
	updateSessionWithTags,
} from "@vscode/utils/SessionTagger";

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

// Mock AI presence detection
vi.mock("../../../src/utils/AIPresenceDetector.js", () => ({
	detectAIPresence: vi.fn().mockReturnValue({
		hasAI: true,
		detectedAssistants: ["GITHUB_COPILOT"],
		assistantDetails: {
			GITHUB_COPILOT: "GitHub Copilot",
		},
	}),
}));

// Mock logger
vi.mock("../../../src/utils/logger.js", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("SessionTagger", () => {
	let baseManifest: SessionManifest;

	beforeEach(() => {
		baseManifest = {
			id: "test-session-123",
			startedAt: Date.now() - 60000, // 1 minute ago
			endedAt: Date.now(),
			reason: "manual",
			files: [
				{
					uri: "/test/file1.ts",
					snapshotId: "snapshot-1",
					changeStats: {
						added: 50,
						deleted: 10,
					},
				},
				{
					uri: "/test/file2.ts",
					snapshotId: "snapshot-2",
					changeStats: {
						added: 30,
						deleted: 5,
					},
				},
			],
			tags: [],
		};
	});

	describe("tagSession", () => {
		it("should tag sessions with reason-based tags", () => {
			const result = tagSession(baseManifest);

			expect(result.tags).toContain("manual");
			expect(result.confidence.manual).toBe(1.0);
			expect(result.reasons.manual).toBe("Session was manually finalized");
		});

		it("should tag sessions with multi-file tag when appropriate", () => {
			// Create a manifest with many files
			const multiFileManifest = {
				...baseManifest,
				files: Array(10)
					.fill(0)
					.map((_, i) => ({
						uri: `/test/file${i}.ts`,
						snapshotId: `snapshot-${i}`,
						changeStats: {
							added: 10,
							deleted: 5,
						},
					})),
			};

			const result = tagSession(multiFileManifest);

			expect(result.tags).toContain("multi-file");
			expect(result.confidence["multi-file"]).toBe(1.0); // 10 files / 10 = 1.0
		});

		it("should tag sessions with long-session tag for long sessions", () => {
			// Create a manifest with a long duration (2 hours)
			const longSessionManifest = {
				...baseManifest,
				startedAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
				endedAt: Date.now(),
			};

			const result = tagSession(longSessionManifest);

			expect(result.tags).toContain("long-session");
			expect(result.confidence["long-session"]).toBe(1.0); // 2 hours / 2 hours = 1.0
		});

		it("should tag sessions with short-session tag for short sessions", () => {
			// Create a manifest with a short duration (10 seconds)
			const shortSessionManifest = {
				...baseManifest,
				startedAt: Date.now() - 10 * 1000, // 10 seconds ago
				endedAt: Date.now(),
			};

			const result = tagSession(shortSessionManifest);

			expect(result.tags).toContain("short-session");
			expect(result.confidence["short-session"]).toBe(1.0); // Capped at 1.0
		});

		it("should tag sessions with large-edits tag for significant changes", () => {
			// Create a manifest with large changes
			const largeEditsManifest = {
				...baseManifest,
				files: [
					{
						uri: "/test/file1.ts",
						snapshotId: "snapshot-1",
						changeStats: {
							added: 2000,
							deleted: 100,
						},
					},
				],
			};

			const result = tagSession(largeEditsManifest);

			expect(result.tags).toContain("large-edits");
			expect(result.confidence["large-edits"]).toBe(0.4); // 2000 / 5000 = 0.4
		});

		it("should tag sessions with AI-related tags when AI assistants are detected", () => {
			const result = tagSession(baseManifest);

			expect(result.tags).toContain("ai-assisted");
			expect(result.confidence["ai-assisted"]).toBe(0.9);
			expect(result.reasons["ai-assisted"]).toContain("AI assistants detected");
			expect(result.tags).toContain("copilot-like");
		});

		it("should tag sessions with burst tag when burst pattern is detected", () => {
			const burstResult: BurstDetectionResult = {
				isBurst: true,
				confidence: 0.8,
				details: {
					totalInserted: 500,
					totalDeleted: 50,
					ratio: 10,
					changeCount: 5,
					duration: 2000,
				},
			};

			const result = tagSession(baseManifest, burstResult);

			expect(result.tags).toContain("burst");
			expect(result.confidence.burst).toBe(0.8);
			expect(result.reasons.burst).toBe(
				"Session contained rapid, large insertions characteristic of AI assistance",
			);
		});

		it("should tag sessions with copilot-like tag for high-confidence AI bursts", () => {
			const burstResult: BurstDetectionResult = {
				isBurst: true,
				confidence: 0.9,
				details: {
					totalInserted: 1000,
					totalDeleted: 50,
					ratio: 20,
					changeCount: 10,
					duration: 1000,
				},
			};

			const result = tagSession(baseManifest, burstResult);

			expect(result.tags).toContain("burst");
			expect(result.tags).toContain("copilot-like");
			expect(result.confidence["copilot-like"]).toBeCloseTo(0.8); // AI presence confidence, not burst confidence
		});

		it("should preserve existing tags", () => {
			const manifestWithTags = {
				...baseManifest,
				tags: ["existing-tag"],
			};

			const result = tagSession(manifestWithTags);

			expect(result.tags).toContain("existing-tag");
			expect(result.tags).toContain("manual");
		});
	});

	describe("updateSessionWithTags", () => {
		it("should update session manifest with new tags", () => {
			const updatedManifest = updateSessionWithTags(baseManifest);

			expect(updatedManifest.tags).toContain("manual");
			expect(updatedManifest.tags).toContain("ai-assisted");
			expect(updatedManifest.tags).toContain("copilot-like");
		});

		it("should replace existing tags with updated ones", () => {
			const manifestWithTags = {
				...baseManifest,
				tags: ["existing-tag"],
			};

			const updatedManifest = updateSessionWithTags(manifestWithTags);

			expect(updatedManifest.tags).toContain("existing-tag");
			expect(updatedManifest.tags).toContain("manual");
			expect(updatedManifest.tags).toContain("ai-assisted");
			expect(updatedManifest.tags).toContain("copilot-like");
		});
	});
});
