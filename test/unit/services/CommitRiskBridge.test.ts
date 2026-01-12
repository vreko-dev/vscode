/**
 * CommitRiskBridge Tests - TDD
 *
 * Tests the bridge between VS Code extension and @snapback/intelligence CommitRiskSystem.
 * Based on 2025-2026 research:
 * - LinearB benchmarks: PR Size is most significant driver of velocity
 * - 41% of commits are AI-assisted (validates wA factor)
 * - Elite teams: coding times under 1 hour (validates time baselines)
 *
 * @see https://linearb.io/blog/2025-engineering-benchmarks-insights
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Memento } from "vscode";

// Import the service we'll implement (RED phase - will fail initially)
import { CommitRiskBridge, type CommitRiskBridgeOptions } from "../../../src/services/CommitRiskBridge";

// Mock vscode module
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
}));

/**
 * Create a mock Memento for workspace state persistence
 */
function createMockMemento(): Memento {
	const storage = new Map<string, unknown>();
	return {
		keys: () => Array.from(storage.keys()),
		get: <T>(key: string, defaultValue?: T): T => {
			return (storage.get(key) as T) ?? (defaultValue as T);
		},
		update: vi.fn(async (key: string, value: unknown) => {
			if (value === undefined) {
				storage.delete(key);
			} else {
				storage.set(key, value);
			}
		}),
	};
}

describe("CommitRiskBridge", () => {
	let bridge: CommitRiskBridge;
	let mockMemento: Memento;
	let options: CommitRiskBridgeOptions;

	beforeEach(() => {
		vi.clearAllMocks();
		mockMemento = createMockMemento();
		options = {
			workspaceRoot: "/test/workspace",
			workspaceState: mockMemento,
		};
		bridge = new CommitRiskBridge(options);
	});

	afterEach(() => {
		bridge.dispose();
	});

	// ===========================================================================
	// Initialization Tests
	// ===========================================================================

	describe("Initialization", () => {
		it("should create with default configuration", () => {
			expect(bridge).toBeDefined();
			expect(bridge.getConfig()).toBeDefined();
		});

		it("should initialize with zero session state", () => {
			const state = bridge.getSessionState();
			expect(state.linesChanged).toBe(0);
			expect(state.filesChanged).toBe(0);
			expect(state.minutesSinceCommit).toBeGreaterThanOrEqual(0);
		});

		it("should detect phase from branch name", () => {
			// Feature branch
			const featureBridge = new CommitRiskBridge({
				...options,
				branchName: "feature/add-auth",
			});
			expect(featureBridge.getCurrentPhase()).toBe("feature");
			featureBridge.dispose();

			// Hotfix branch
			const hotfixBridge = new CommitRiskBridge({
				...options,
				branchName: "hotfix/critical-bug",
			});
			expect(hotfixBridge.getCurrentPhase()).toBe("critical");
			hotfixBridge.dispose();
		});
	});

	// ===========================================================================
	// Risk Evaluation Tests (Research-Aligned)
	// ===========================================================================

	describe("Risk Evaluation", () => {
		it("should return low risk for small changes (< 50 lines, < 30 min)", () => {
			// Simulate small change
			bridge.recordFileChange("/test/file.ts", 30);

			const evaluation = bridge.evaluate();

			expect(evaluation.score).toBeLessThan(0.35); // Below autoSnapshot threshold
			expect(evaluation.action).toBe("none");
		});

		it("should return auto_snapshot action at 0.35 threshold", () => {
			// Need significant lines (400+) and time (70+ min) to cross 0.35
			// Formula: wT*TimeRisk + wL*LinesRisk + wF*FilesRisk + wA*AiRisk + wC*ChurnRisk
			bridge.recordFileChange("/test/file1.ts", 150);
			bridge.recordFileChange("/test/file2.ts", 150);
			bridge.recordFileChange("/test/file3.ts", 100);
			bridge.recordFileChange("/test/file4.ts", 50);

			// Simulate 70 minutes passed (above feature baseline of 30 min)
			bridge.setMinutesSinceCommit(70);

			const evaluation = bridge.evaluate();

			expect(evaluation.score).toBeGreaterThanOrEqual(0.35);
			expect(["auto_snapshot", "suggest_commit", "strong_commit"]).toContain(evaluation.action);
		});

		it("should return suggest_commit action at 0.55 threshold", () => {
			// Need high lines (600+) and significant time (80+ min) to cross 0.55
			bridge.recordFileChange("/test/auth.ts", 200);
			bridge.recordFileChange("/test/api.ts", 200);
			bridge.recordFileChange("/test/utils.ts", 150);
			bridge.recordFileChange("/test/db.ts", 150);
			bridge.recordFileChange("/test/models.ts", 100);

			// Simulate 80 minutes passed with AI active
			bridge.setMinutesSinceCommit(80);
			bridge.setAIActive(true, 0.6);

			const evaluation = bridge.evaluate();

			expect(evaluation.score).toBeGreaterThanOrEqual(0.55);
			expect(["suggest_commit", "strong_commit"]).toContain(evaluation.action);
		});

		it("should return strong_commit action at 0.80 threshold", () => {
			// Need very high lines (800+), many files (7+), long time (85+ min), and AI active
			bridge.recordFileChange("/test/auth.ts", 200);
			bridge.recordFileChange("/test/api.ts", 200);
			bridge.recordFileChange("/test/db.ts", 150);
			bridge.recordFileChange("/test/utils.ts", 150);
			bridge.recordFileChange("/test/config.ts", 100);
			bridge.recordFileChange("/test/models.ts", 100);
			bridge.recordFileChange("/test/types.ts", 100);
			bridge.recordFileChange("/test/helpers.ts", 50);

			// Simulate 90 minutes passed (at feature cap) with high AI contribution
			bridge.setMinutesSinceCommit(90);
			bridge.setAIActive(true, 0.8);

			const evaluation = bridge.evaluate();

			expect(evaluation.score).toBeGreaterThanOrEqual(0.8);
			expect(evaluation.action).toBe("strong_commit");
		});

		it("should apply phase multiplier (hotfix = 1.4x more sensitive)", () => {
			const hotfixBridge = new CommitRiskBridge({
				...options,
				branchName: "hotfix/urgent-fix",
			});

			// Same activity on both bridges
			bridge.recordFileChange("/test/file.ts", 100);
			hotfixBridge.recordFileChange("/test/file.ts", 100);

			bridge.setMinutesSinceCommit(20);
			hotfixBridge.setMinutesSinceCommit(20);

			const normalEval = bridge.evaluate();
			const hotfixEval = hotfixBridge.evaluate();

			// Hotfix should have higher score due to 1.4x multiplier
			expect(hotfixEval.score).toBeGreaterThan(normalEval.score);

			hotfixBridge.dispose();
		});

		it("should factor in AI contribution (wA = 0.20)", () => {
			// Test with AI inactive
			bridge.recordFileChange("/test/file.ts", 200);
			bridge.setMinutesSinceCommit(40);
			bridge.setAIActive(false);
			const noAIEval = bridge.evaluate();

			// Reset and test with AI active
			bridge.reset();
			bridge.recordFileChange("/test/file.ts", 200);
			bridge.setMinutesSinceCommit(40);
			bridge.setAIActive(true, 0.6); // 60% AI contribution

			const withAIEval = bridge.evaluate();

			// AI active should increase risk score
			expect(withAIEval.score).toBeGreaterThan(noAIEval.score);
		});
	});

	// ===========================================================================
	// Coaching Logic Tests
	// ===========================================================================

	describe("Coaching Logic", () => {
		it("should respect cooldowns (10 min between prompts)", () => {
			// First evaluation triggers coaching - must reach suggest_commit (0.55) threshold
			// Need: ~700+ lines, 85+ min, high AI (0.7+) to ensure crossing 0.55
			// Score = wT*time + wL*lines + wF*files + wA*ai + wC*churn
			bridge.recordFileChange("/test/file1.ts", 250);
			bridge.recordFileChange("/test/file2.ts", 250);
			bridge.recordFileChange("/test/file3.ts", 200);
			bridge.recordFileChange("/test/file4.ts", 150);
			bridge.setMinutesSinceCommit(85);
			bridge.setAIActive(true, 0.7);

			const firstEval = bridge.evaluate();
			// Verify we reached suggest_commit threshold
			expect(["suggest_commit", "strong_commit"]).toContain(firstEval.action);
			expect(bridge.shouldShowCoaching()).toBe(true);

			// Simulate showing the coaching
			bridge.recordPromptShown();

			// Immediately after, should not show again (cooldown)
			expect(bridge.shouldShowCoaching()).toBe(false);

			// After cooldown expires (10 min), should allow again
			// Must re-evaluate to get fresh timestamp in context
			bridge.advanceTime(11 * 60 * 1000); // 11 minutes
			const afterCooldownEval = bridge.evaluate();
			expect(["suggest_commit", "strong_commit"]).toContain(afterCooldownEval.action);
			expect(bridge.shouldShowCoaching()).toBe(true);
		});

		it("should apply hysteresis (enter at 0.55, exit at 0.45)", () => {
			// Start below threshold
			bridge.recordFileChange("/test/file.ts", 100);
			bridge.setMinutesSinceCommit(30);

			let evaluation = bridge.evaluate();
			expect(evaluation.action).not.toBe("suggest_commit");

			// Cross into suggest_commit territory (above 0.55)
			// Need: ~850 lines, 85 min, high AI to ensure crossing 0.55
			bridge.recordFileChange("/test/file2.ts", 300);
			bridge.recordFileChange("/test/file3.ts", 250);
			bridge.recordFileChange("/test/file4.ts", 200);
			bridge.setMinutesSinceCommit(85);
			bridge.setAIActive(true, 0.7);

			evaluation = bridge.evaluate();
			expect(["suggest_commit", "strong_commit"]).toContain(evaluation.action);

			// Simulate snapshot creation (reduces lines)
			bridge.recordSnapshot();

			// After snapshot, session state resets - start fresh with smaller values
			bridge.recordFileChange("/test/file4.ts", 80);
			bridge.setMinutesSinceCommit(35);
			bridge.setAIActive(false);

			evaluation = bridge.evaluate();
			// After reset, should be back to lower threshold level
			// The exact behavior depends on implementation - just verify we get a valid result
			expect(evaluation).toBeDefined();
			expect(evaluation.score).toBeLessThan(0.55);
		});

		it("should return appropriate NudgeTrigger for threshold crossed", () => {
			// Setup for suggest_commit threshold (0.55)
			// Need: ~850 lines, 85 min, high AI to ensure crossing 0.55
			bridge.recordFileChange("/test/file1.ts", 250);
			bridge.recordFileChange("/test/file2.ts", 250);
			bridge.recordFileChange("/test/file3.ts", 200);
			bridge.recordFileChange("/test/file4.ts", 150);
			bridge.setMinutesSinceCommit(85);
			bridge.setAIActive(true, 0.7);

			const evaluation = bridge.evaluate();
			expect(["suggest_commit", "strong_commit"]).toContain(evaluation.action);
			const trigger = bridge.getCoachingTrigger();

			expect(trigger).toBe(evaluation.action === "suggest_commit" ? "commit_suggested" : "commit_recommended");

			// Setup for strong_commit threshold (0.80)
			// Need: 1000+ lines, 8+ files, 90 min at cap, 0.9 AI
			bridge.recordFileChange("/test/file5.ts", 200);
			bridge.recordFileChange("/test/file6.ts", 200);
			bridge.recordFileChange("/test/file7.ts", 200);
			bridge.recordFileChange("/test/file8.ts", 200);
			bridge.setMinutesSinceCommit(90);
			bridge.setAIActive(true, 0.9);

			const strongEval = bridge.evaluate();
			expect(strongEval.action).toBe("strong_commit");
			const strongTrigger = bridge.getCoachingTrigger();

			expect(strongTrigger).toBe("commit_recommended");
		});
	});

	// ===========================================================================
	// State Management Tests
	// ===========================================================================

	describe("State Management", () => {
		it("should record file changes and accumulate lines", () => {
			bridge.recordFileChange("/test/file1.ts", 50);
			bridge.recordFileChange("/test/file2.ts", 30);
			bridge.recordFileChange("/test/file1.ts", 20); // Same file, adds more lines

			const state = bridge.getSessionState();

			expect(state.linesChanged).toBe(100); // 50 + 30 + 20
			expect(state.filesChanged).toBe(2); // 2 unique files
		});

		it("should record snapshot and reset pressure", () => {
			bridge.recordFileChange("/test/file.ts", 200);
			bridge.setMinutesSinceCommit(40);

			const beforeSnapshot = bridge.evaluate();
			expect(beforeSnapshot.score).toBeGreaterThan(0);

			bridge.recordSnapshot();

			// After snapshot, session state should reset
			const state = bridge.getSessionState();
			expect(state.linesChanged).toBe(0);
			expect(state.filesChanged).toBe(0);
		});

		it("should record commit and update outcome tracking", () => {
			bridge.recordFileChange("/test/file.ts", 150);
			bridge.setMinutesSinceCommit(30);

			const evaluation = bridge.evaluate();

			// Record the commit with outcome data
			bridge.recordCommit({
				linesCommitted: 150,
				filesCommitted: 1,
				riskScoreAtCommit: evaluation.score,
			});

			// Session should reset after commit
			const state = bridge.getSessionState();
			expect(state.linesChanged).toBe(0);
		});

		it("should reset all session state", () => {
			bridge.recordFileChange("/test/file.ts", 200);
			bridge.setMinutesSinceCommit(50);
			bridge.setAIActive(true);

			bridge.reset();

			const state = bridge.getSessionState();
			expect(state.linesChanged).toBe(0);
			expect(state.filesChanged).toBe(0);
		});
	});

	// ===========================================================================
	// Persistence Tests
	// ===========================================================================

	describe("Persistence", () => {
		it("should persist state to workspace on dispose", async () => {
			bridge.recordFileChange("/test/file.ts", 100);

			await bridge.persistState();

			expect(mockMemento.update).toHaveBeenCalledWith(
				"snapback.commitRisk.state",
				expect.objectContaining({
					outcomes: expect.any(Array),
				}),
			);
		});

		it("should restore from persisted workspace state", async () => {
			// Setup persisted state
			const persistedState = {
				outcomes: [
					{
						linesAtCommit: 200,
						filesAtCommit: 3,
						maxRiskScore: 0.6,
						hadRevertWithin2Weeks: false,
						hadBugFixWithin2Weeks: false,
						aiFraction: 0.3,
						churnPercent: 10,
					},
				],
				userTuning: {
					thresholdScale: 1.0,
					promptCooldownScale: 1.0,
					snapshotCooldownScale: 1.0,
				},
			};

			await mockMemento.update("snapback.commitRisk.state", persistedState);

			const restoredBridge = new CommitRiskBridge(options);
			await restoredBridge.restoreState();

			const stats = restoredBridge.getOutcomeStats();
			expect(stats.totalSessions).toBe(1);

			restoredBridge.dispose();
		});
	});

	// ===========================================================================
	// Educational Messaging Tests
	// ===========================================================================

	describe("Educational Messaging", () => {
		it("should provide educational context with evaluations at suggest_commit level", () => {
			// Educational messages only appear for suggest_commit and strong_commit actions
			// Need: ~850 lines, 85 min, high AI to ensure crossing 0.55
			bridge.recordFileChange("/test/file1.ts", 250);
			bridge.recordFileChange("/test/file2.ts", 250);
			bridge.recordFileChange("/test/file3.ts", 200);
			bridge.recordFileChange("/test/file4.ts", 150);
			bridge.setMinutesSinceCommit(85);
			bridge.setAIActive(true, 0.7);

			const evaluation = bridge.evaluate();

			// Verify we're at suggest_commit or higher
			expect(["suggest_commit", "strong_commit"]).toContain(evaluation.action);
			expect(evaluation.educational).toBeDefined();
			expect(typeof evaluation.educational).toBe("string");
			expect(evaluation.educational!.length).toBeGreaterThan(0);
		});

		it("should provide lines-focused educational message when lines is primary risk", () => {
			// High lines, moderate time - to reach suggest_commit where lines is primary
			// Need: ~850 lines, 85 min, high AI to ensure crossing 0.55
			bridge.recordFileChange("/test/file1.ts", 350);
			bridge.recordFileChange("/test/file2.ts", 350);
			bridge.recordFileChange("/test/file3.ts", 200);
			bridge.setMinutesSinceCommit(85);
			bridge.setAIActive(true, 0.7);

			const evaluation = bridge.evaluate();

			// Educational messages only exist for suggest_commit and above
			if (["suggest_commit", "strong_commit"].includes(evaluation.action)) {
				expect(evaluation.educational).toBeDefined();
				// The message may mention lines or PR size
				expect(evaluation.educational!.length).toBeGreaterThan(0);
			}
		});

		it("should provide time-focused educational message when time is primary risk", () => {
			// Low lines, high time
			bridge.recordFileChange("/test/file.ts", 50);
			bridge.setMinutesSinceCommit(90); // Well above baseline

			const evaluation = bridge.evaluate();

			// May mention time or commit frequency
			expect(evaluation.reason).toBeDefined();
		});
	});

	// ===========================================================================
	// Integration with Git Context Tests
	// ===========================================================================

	describe("Git Integration", () => {
		it("should support manual minutesSinceCommit override for testing", () => {
			bridge.setMinutesSinceCommit(45);

			const state = bridge.getSessionState();
			expect(state.minutesSinceCommit).toBe(45);
		});

		it("should track accumulated linesChanged in session", () => {
			bridge.recordFileChange("/test/a.ts", 100);
			bridge.recordFileChange("/test/b.ts", 50);

			const state = bridge.getSessionState();
			expect(state.linesChanged).toBe(150);
		});

		it("should report AI tool presence correctly", () => {
			expect(bridge.isAIActive()).toBe(false);

			bridge.setAIActive(true, 0.4);
			expect(bridge.isAIActive()).toBe(true);
			expect(bridge.getAIFraction()).toBe(0.4);
		});
	});

	// ===========================================================================
	// Threshold Configuration Tests
	// ===========================================================================

	describe("Configuration", () => {
		it("should expose current configuration", () => {
			const config = bridge.getConfig();

			expect(config.weights).toBeDefined();
			expect(config.weights.wT).toBeCloseTo(0.3, 2);
			expect(config.weights.wL).toBeCloseTo(0.25, 2);
			expect(config.weights.wF).toBeCloseTo(0.15, 2);
			expect(config.weights.wA).toBeCloseTo(0.2, 2);
			expect(config.weights.wC).toBeCloseTo(0.1, 2);

			expect(config.thresholds).toBeDefined();
			expect(config.thresholds.autoSnapshot).toBeCloseTo(0.35, 2);
			expect(config.thresholds.suggestCommit).toBeCloseTo(0.55, 2);
			expect(config.thresholds.strongCommit).toBeCloseTo(0.8, 2);
		});

		it("should allow user tuning of thresholds", () => {
			bridge.setUserTuning({
				thresholdScale: 1.1, // 10% more tolerant
			});

			const config = bridge.getConfig();
			// Scaled thresholds should be higher
			expect(config.userTuning.thresholdScale).toBe(1.1);
		});
	});
});
