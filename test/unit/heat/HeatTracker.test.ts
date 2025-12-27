/**
 * HeatTracker Tests
 *
 * TDD tests for the file heat tracking system.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HeatTracker } from "../../../src/heat/HeatTracker";

// Mock VS Code module
vi.mock("vscode", () => ({
	EventEmitter: class MockEventEmitter {
		private listeners: Array<(data: unknown) => void> = [];
		event = (listener: (data: unknown) => void) => {
			this.listeners.push(listener);
			return { dispose: () => {} };
		};
		fire = (data: unknown) => {
			for (const listener of this.listeners) {
				listener(data);
			}
		};
		dispose = () => {
			this.listeners = [];
		};
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("HeatTracker", () => {
	let tracker: HeatTracker;

	beforeEach(() => {
		vi.useFakeTimers();
		tracker = new HeatTracker({
			trackingWindow: 10 * 60 * 1000, // 10 min
			decayInterval: 60 * 1000, // 1 min
			thresholds: {
				warm: { saveCount: 5, diffSize: 200 },
				hot: { saveCount: 10, diffSize: 500, undoRedoCount: 5 },
				critical: { saveCount: 20, diffSize: 1000 },
			},
			aiMultiplier: 1.5,
			debounceInterval: 500,
			maxTrackedFiles: 100,
		});
	});

	afterEach(() => {
		tracker.dispose();
		vi.useRealTimers();
	});

	describe("recordSave", () => {
		it("should track saves and increase heat level", () => {
			const filePath = "/test/file.ts";

			// No heat initially
			expect(tracker.assess(filePath).level).toBe("none");

			// 5 saves = warm (15 points from saves)
			for (let i = 0; i < 5; i++) {
				tracker.recordSave(filePath);
			}
			expect(tracker.assess(filePath).level).toBe("warm");

			// 10 saves = still warm (30 points, hot requires 40)
			// Need additional factors to reach hot
			for (let i = 0; i < 5; i++) {
				tracker.recordSave(filePath);
			}
			expect(tracker.assess(filePath).level).toBe("warm");

			// 10 saves + diff size → hot (30 + 10 = 40)
			tracker.updateDiffSize(filePath, 200);
			expect(tracker.assess(filePath).level).toBe("hot");
		});

		it("should include diff size in assessment", () => {
			const filePath = "/test/file.ts";

			// 600 lines = hot.diffSize threshold (25 points), but below hot (40)
			// Adding saves to reach hot
			for (let i = 0; i < 5; i++) {
				tracker.recordSave(filePath, { diffSize: 600 });
			}

			const assessment = tracker.assess(filePath);
			expect(assessment.level).toBe("hot"); // 15 (saves) + 25 (diff) = 40
			expect(assessment.reasons).toContainEqual(expect.stringContaining("600 lines changed"));
		});

		it("should fire onHeatChanged event on save", () => {
			const listener = vi.fn();
			tracker.onHeatChanged(listener);

			tracker.recordSave("/test/file.ts");

			expect(listener).toHaveBeenCalledWith(["/test/file.ts"]);
		});
	});

	describe("recordAIEdit", () => {
		it("should amplify heat with AI multiplier", () => {
			const filePath = "/test/file.ts";

			// 4 saves without AI = not yet warm (score ~12)
			for (let i = 0; i < 4; i++) {
				tracker.recordSave(filePath);
			}
			expect(tracker.assess(filePath).level).toBe("none");

			// Add AI involvement - score gets multiplied by 1.5
			// Now even with low base score, AI flag is set
			tracker.recordAIEdit(filePath, "cursor", 0.9);

			const assessment = tracker.assess(filePath);
			expect(assessment.aiInvolved).toBe(true);
		});

		it("should include AI tool in reasons", () => {
			const filePath = "/test/file.ts";

			tracker.recordSave(filePath, { diffSize: 300 });
			tracker.recordAIEdit(filePath, "copilot", 0.85);

			const assessment = tracker.assess(filePath);
			expect(assessment.reasons.some((r) => r.includes("copilot"))).toBe(true);
		});

		it("should support multiple AI tools", () => {
			const filePath = "/test/file.ts";

			tracker.recordAIEdit(filePath, "claude", 0.9);
			expect(tracker.assess(filePath).aiInvolved).toBe(true);

			tracker.recordAIEdit(filePath, "tabnine", 0.8);
			expect(tracker.getRawHeatData(filePath)?.ai.tool).toBe("tabnine");
		});
	});

	describe("recordUndoRedo", () => {
		it("should contribute to heat score", () => {
			const filePath = "/test/file.ts";

			// Start with some saves to get base heat
			for (let i = 0; i < 5; i++) {
				tracker.recordSave(filePath);
			}

			const beforeScore = tracker.assess(filePath).score;

			// Add undo/redo activity
			for (let i = 0; i < 5; i++) {
				tracker.recordUndoRedo(filePath);
			}

			const afterScore = tracker.assess(filePath).score;
			expect(afterScore).toBeGreaterThan(beforeScore);
		});

		it("should include undo/redo in reasons when threshold met", () => {
			const filePath = "/test/file.ts";

			for (let i = 0; i < 5; i++) {
				tracker.recordUndoRedo(filePath);
			}

			const assessment = tracker.assess(filePath);
			expect(assessment.reasons.some((r) => r.includes("undo/redo"))).toBe(true);
		});
	});

	describe("decay", () => {
		it("should decay heat over time as saves age out", () => {
			const filePath = "/test/file.ts";

			// Create warm file (10 saves = 30 points = warm)
			for (let i = 0; i < 10; i++) {
				tracker.recordSave(filePath);
			}
			expect(tracker.assess(filePath).level).toBe("warm");

			// Advance time past tracking window (10 min + decay interval)
			vi.advanceTimersByTime(11 * 60 * 1000);

			// Heat should have decayed
			expect(tracker.assess(filePath).level).toBe("none");
		});

		it("should decay AI involvement after 30 min of no activity", () => {
			const filePath = "/test/file.ts";

			tracker.recordSave(filePath, { diffSize: 300 });
			tracker.recordAIEdit(filePath, "cursor", 0.9);

			expect(tracker.assess(filePath).aiInvolved).toBe(true);

			// Advance 31 minutes
			vi.advanceTimersByTime(31 * 60 * 1000);

			// Trigger decay cycle
			vi.advanceTimersByTime(60 * 1000);

			expect(tracker.assess(filePath).aiInvolved).toBe(false);
		});

		it("should decay undo/redo count after 5 min of no activity", () => {
			const filePath = "/test/file.ts";

			for (let i = 0; i < 10; i++) {
				tracker.recordUndoRedo(filePath);
			}

			const rawBefore = tracker.getRawHeatData(filePath);
			expect(rawBefore?.undoRedoCount).toBe(10);

			// Advance 6 minutes (past 5 min threshold) + trigger decay
			vi.advanceTimersByTime(6 * 60 * 1000);

			const rawAfter = tracker.getRawHeatData(filePath);
			expect(rawAfter?.undoRedoCount).toBeLessThan(10);
		});
	});

	describe("resetFile", () => {
		it("should clear all heat for a file", () => {
			const filePath = "/test/file.ts";

			for (let i = 0; i < 15; i++) {
				tracker.recordSave(filePath);
			}
			tracker.recordAIEdit(filePath, "cursor", 0.9);

			expect(tracker.assess(filePath).level).not.toBe("none");

			tracker.resetFile(filePath);

			expect(tracker.assess(filePath).level).toBe("none");
		});

		it("should fire onHeatChanged event", () => {
			const filePath = "/test/file.ts";
			tracker.recordSave(filePath);

			const listener = vi.fn();
			tracker.onHeatChanged(listener);

			tracker.resetFile(filePath);

			expect(listener).toHaveBeenCalledWith([filePath]);
		});
	});

	describe("getHotFiles", () => {
		it("should return files sorted by score descending", () => {
			tracker.recordSave("/test/a.ts", { diffSize: 100 });

			for (let i = 0; i < 15; i++) {
				tracker.recordSave("/test/b.ts");
			}

			tracker.recordSave("/test/c.ts", { diffSize: 800 });

			const hotFiles = tracker.getHotFiles();

			expect(hotFiles.length).toBeGreaterThan(0);
			expect(hotFiles[0].assessment.score).toBeGreaterThanOrEqual(hotFiles[hotFiles.length - 1].assessment.score);
		});

		it("should not include files with no heat", () => {
			tracker.recordSave("/test/a.ts"); // Just 1 save = no heat

			for (let i = 0; i < 10; i++) {
				tracker.recordSave("/test/b.ts");
			}

			const hotFiles = tracker.getHotFiles();

			expect(hotFiles.some((f) => f.filePath === "/test/a.ts")).toBe(false);
			expect(hotFiles.some((f) => f.filePath === "/test/b.ts")).toBe(true);
		});
	});

	describe("getSummary", () => {
		it("should return correct summary statistics", () => {
			// Create critical file (20 saves = 50 points + large diff = 40 = 90 points ≥ 70)
			for (let i = 0; i < 20; i++) {
				tracker.recordSave("/test/critical.ts");
			}
			tracker.updateDiffSize("/test/critical.ts", 1000);

			// Create AI-involved file (10 saves with AI = 30 * 1.5 = 45 points = hot)
			for (let i = 0; i < 10; i++) {
				tracker.recordSave("/test/ai-file.ts");
			}
			tracker.recordAIEdit("/test/ai-file.ts", "copilot", 0.9);

			const summary = tracker.getSummary();

			expect(summary.totalHotFiles).toBeGreaterThanOrEqual(2);
			expect(summary.criticalFiles).toContain("/test/critical.ts");
			expect(summary.aiInvolvedFiles).toContain("/test/ai-file.ts");
		});
	});

	describe("LRU eviction", () => {
		it("should evict oldest files when maxTrackedFiles exceeded", () => {
			// Create tracker with small limit for testing
			const smallTracker = new HeatTracker({
				maxTrackedFiles: 10,
			});

			// Add 15 files
			for (let i = 0; i < 15; i++) {
				smallTracker.recordSave(`/test/file${i}.ts`);
			}

			// First files should be evicted
			expect(smallTracker.getRawHeatData("/test/file0.ts")).toBeUndefined();
			expect(smallTracker.getRawHeatData("/test/file1.ts")).toBeUndefined();

			// Later files should exist
			expect(smallTracker.getRawHeatData("/test/file14.ts")).toBeDefined();

			smallTracker.dispose();
		});
	});

	describe("onHeatChanged event", () => {
		it("should fire when save recorded", () => {
			const listener = vi.fn();
			tracker.onHeatChanged(listener);

			tracker.recordSave("/test/file.ts");

			expect(listener).toHaveBeenCalledWith(["/test/file.ts"]);
		});

		it("should fire when AI edit recorded", () => {
			const listener = vi.fn();
			tracker.onHeatChanged(listener);

			tracker.recordAIEdit("/test/file.ts", "cursor", 0.9);

			expect(listener).toHaveBeenCalledWith(["/test/file.ts"]);
		});

		it("should fire when diff size updated", () => {
			tracker.recordSave("/test/file.ts");

			const listener = vi.fn();
			tracker.onHeatChanged(listener);

			tracker.updateDiffSize("/test/file.ts", 500);

			expect(listener).toHaveBeenCalledWith(["/test/file.ts"]);
		});
	});

	describe("heat level calculation", () => {
		it("should calculate warm level correctly", () => {
			const filePath = "/test/file.ts";

			// Exactly 5 saves = warm (15 points)
			for (let i = 0; i < 5; i++) {
				tracker.recordSave(filePath);
			}

			expect(tracker.assess(filePath).level).toBe("warm");
		});

		it("should calculate hot level correctly", () => {
			const filePath = "/test/file.ts";

			// 10 saves + diff = hot (30 + 10 = 40 points)
			for (let i = 0; i < 10; i++) {
				tracker.recordSave(filePath);
			}
			tracker.updateDiffSize(filePath, 200);

			expect(tracker.assess(filePath).level).toBe("hot");
		});

		it("should calculate critical level correctly", () => {
			const filePath = "/test/file.ts";

			// 20 saves + large diff = critical (50 + 40 = 90 points)
			for (let i = 0; i < 20; i++) {
				tracker.recordSave(filePath);
			}
			tracker.updateDiffSize(filePath, 1000);

			expect(tracker.assess(filePath).level).toBe("critical");
		});

		it("should reach hot via diff size alone", () => {
			const filePath = "/test/file.ts";

			// 1200 lines = 40 points (critical diff threshold)
			tracker.recordSave(filePath, { diffSize: 1200 });

			// 40 points from diff alone = hot
			expect(tracker.assess(filePath).level).toBe("hot");
		});

		it("should combine factors for higher score", () => {
			const filePath = "/test/file.ts";

			// 8 saves = 15 points (warm threshold)
			// 400 diff = 10 points (warm diff)
			// Total before AI = 25 points
			// With AI multiplier (1.5) = 37.5 → not quite hot
			// Need more to reach critical
			for (let i = 0; i < 10; i++) {
				tracker.recordSave(filePath);
			}
			tracker.updateDiffSize(filePath, 600); // 25 points
			tracker.recordAIEdit(filePath, "cursor", 0.9);

			// (30 + 25) * 1.5 = 82.5 points = critical
			expect(tracker.assess(filePath).level).toBe("critical");
		});
	});
});
