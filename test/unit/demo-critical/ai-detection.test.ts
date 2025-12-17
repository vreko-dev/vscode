/**
 * @fileoverview Demo-Critical AI Detection Tests
 *
 * These tests validate AI assistant detection and burst pattern recognition
 * that is demonstrated in the YC demo.
 *
 * Coverage:
 * - AI tool detection (Copilot, Claude, Cursor, etc.)
 * - Burst pattern detection (rapid insertions)
 * - Confidence scoring
 * - Session tagging based on AI presence
 */

import { BurstHeuristicsDetector } from "@snapback/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	detectAIPresence,
	isAIAssistantInstalled,
} from "@vscode/utils/AIPresenceDetector";

// Mock vscode.extensions.all
const mockExtensions: any[] = [];

// IMPORTANT: DO NOT re-mock vscode here!
// The global setup.ts provides a complete vscode mock.
// Use vi.mocked() to override specific methods if needed.

describe("[DEMO-CRITICAL] AI Detection", () => {
	beforeEach(() => {
		// Clear mock extensions before each test
		mockExtensions.length = 0;
	});

	describe("AI Tool Detection", () => {
		it("[DEMO] detects GitHub Copilot", () => {
			mockExtensions.push({
				id: "github.copilot",
				packageJSON: { displayName: "GitHub Copilot" },
			});

			const result = detectAIPresence();

			expect(result.hasAI).toBe(true);
			expect(result.detectedAssistants).toContain("GITHUB_COPILOT");
		});

		it("[DEMO] detects Cursor (via Copilot extension)", () => {
			// Cursor uses GitHub Copilot extension
			mockExtensions.push({
				id: "github.copilot",
				packageJSON: { displayName: "GitHub Copilot" },
			});

			const isInstalled = isAIAssistantInstalled("GITHUB_COPILOT");

			expect(isInstalled).toBe(true);
		});

		it("[DEMO] detects Claude extension", () => {
			mockExtensions.push({
				id: "claude.claude",
				packageJSON: { displayName: "Claude" },
			});

			const result = detectAIPresence();

			expect(result.hasAI).toBe(true);
			expect(result.detectedAssistants).toContain("CLAUDE");
		});

		it("[DEMO] detects Tabnine", () => {
			mockExtensions.push({
				id: "tabnine.tabnine-vscode",
				packageJSON: { displayName: "Tabnine" },
			});

			const result = detectAIPresence();

			expect(result.hasAI).toBe(true);
			expect(result.detectedAssistants).toContain("TABNINE");
		});

		it("[DEMO] detects Codeium", () => {
			mockExtensions.push({
				id: "codeium.codeium",
				packageJSON: { displayName: "Codeium" },
			});

			const result = detectAIPresence();

			expect(result.hasAI).toBe(true);
			expect(result.detectedAssistants).toContain("CODEIUM");
		});

		it("[DEMO] detects multiple AI tools simultaneously", () => {
			mockExtensions.push(
				{
					id: "github.copilot",
					packageJSON: { displayName: "GitHub Copilot" },
				},
				{
					id: "tabnine.tabnine-vscode",
					packageJSON: { displayName: "Tabnine" },
				},
			);

			const result = detectAIPresence();

			expect(result.hasAI).toBe(true);
			expect(result.detectedAssistants).toHaveLength(2);
			expect(result.detectedAssistants).toContain("GITHUB_COPILOT");
			expect(result.detectedAssistants).toContain("TABNINE");
		});

		it("[DEMO] returns false when no AI tools detected", () => {
			// No AI extensions installed
			mockExtensions.push({
				id: "ms-vscode.vscode-typescript-next",
				packageJSON: { displayName: "TypeScript" },
			});

			const result = detectAIPresence();

			expect(result.hasAI).toBe(false);
			expect(result.detectedAssistants).toHaveLength(0);
		});

		it("[DEMO] provides human-readable names for AI tools", () => {
			mockExtensions.push({
				id: "github.copilot",
				packageJSON: { displayName: "GitHub Copilot" },
			});

			const result = detectAIPresence();

			expect(result.assistantDetails.GITHUB_COPILOT).toBe("GitHub Copilot");
			expect(result.assistantDetails.TABNINE).toBe("Tabnine");
			expect(result.assistantDetails.CODEIUM).toBe("Codeium");
		});
	});

	describe("Burst Pattern Detection", () => {
		let detector: BurstHeuristicsDetector;

		beforeEach(() => {
			detector = new BurstHeuristicsDetector();
			// Use fake timers for deterministic tests
			vi.useFakeTimers();
		});

		afterEach(() => {
			vi.useRealTimers();
		});

		it("[DEMO] detects AI burst pattern (rapid large insertions)", () => {
			vi.setSystemTime(0);

			// Simulate rapid insertions characteristic of AI
			detector.recordChange(50, 0, 5); // 50 chars inserted
			vi.advanceTimersByTime(50); // 50ms later

			detector.recordChange(45, 0, 4); // Another 45 chars
			vi.advanceTimersByTime(50);

			detector.recordChange(48, 0, 5); // Another 48 chars
			vi.advanceTimersByTime(50);

			detector.recordChange(52, 0, 6); // Another 52 chars

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(true);
			expect(result.confidence).toBeGreaterThan(0.7);
		});

		it("[DEMO] does not detect normal typing as burst", () => {
			vi.setSystemTime(0);

			// Simulate normal human typing (slower, smaller insertions)
			detector.recordChange(5, 0, 1); // 5 chars
			vi.advanceTimersByTime(500); // 500ms between keystrokes

			detector.recordChange(4, 0, 1);
			vi.advanceTimersByTime(500);

			detector.recordChange(6, 0, 1);

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
			expect(result.confidence).toBeLessThan(0.5);
		});

		it("[DEMO] considers insertion/deletion ratio", () => {
			vi.setSystemTime(0);

			// Heavy insertion with minimal deletion (AI pattern)
			detector.recordChange(100, 5, 10);
			vi.advanceTimersByTime(50);
			detector.recordChange(95, 3, 9);

			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(true);
			if (result.details) {
				expect(result.details.ratio).toBeGreaterThan(10); // Very high ratio
			}
		});

		it("[DEMO] provides confidence score based on pattern strength", () => {
			vi.setSystemTime(0);

			// Moderate burst pattern
			detector.recordChange(30, 0, 3);
			vi.advanceTimersByTime(100);
			detector.recordChange(35, 0, 3);
			vi.advanceTimersByTime(100);
			detector.recordChange(32, 0, 3);

			const result = detector.analyzeBurst();

			// Should have some confidence but not maximum
			expect(result.confidence).toBeGreaterThan(0.3);
			expect(result.confidence).toBeLessThan(0.9);
		});

		it("[DEMO] includes detailed burst metrics", () => {
			vi.setSystemTime(0);

			detector.recordChange(60, 5, 6);
			vi.advanceTimersByTime(50);
			detector.recordChange(55, 3, 5);
			vi.advanceTimersByTime(50);
			detector.recordChange(58, 2, 6);

			const result = detector.analyzeBurst();

			expect(result.details).toBeDefined();
			if (result.details) {
				expect(result.details.totalInserted).toBe(173); // 60+55+58
				expect(result.details.totalDeleted).toBe(10); // 5+3+2
				expect(result.details.changeCount).toBe(3);
				expect(result.details.duration).toBeGreaterThan(0);
			}
		});

		it("[DEMO] handles edge case of no recent changes", () => {
			const result = detector.analyzeBurst();

			expect(result.isBurst).toBe(false);
			expect(result.confidence).toBe(0);
		});

		it("[DEMO] resets detection after time window expires", () => {
			vi.setSystemTime(0);

			// Record old burst
			detector.recordChange(50, 0, 5);
			vi.advanceTimersByTime(50);
			detector.recordChange(50, 0, 5);

			// Advance beyond time window (5 seconds)
			vi.advanceTimersByTime(6000);

			// New slow changes
			detector.recordChange(5, 0, 1);

			const result = detector.analyzeBurst();

			// Should not detect burst (old changes trimmed)
			expect(result.isBurst).toBe(false);
		});
	});

	describe("Performance", () => {
		it("[DEMO] AI detection completes in <10ms", () => {
			mockExtensions.push(
				{ id: "github.copilot", packageJSON: {} },
				{ id: "tabnine.tabnine-vscode", packageJSON: {} },
				{ id: "other.extension", packageJSON: {} },
			);

			const start = performance.now();
			detectAIPresence();
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(10);
		});

		it("[DEMO] burst analysis completes in <5ms", () => {
			const detector = new BurstHeuristicsDetector();

			detector.recordChange(50, 0, 5);
			detector.recordChange(50, 0, 5);
			detector.recordChange(50, 0, 5);

			const start = performance.now();
			detector.analyzeBurst();
			const duration = performance.now() - start;

			expect(duration).toBeLessThan(5);
		});
	});
});
