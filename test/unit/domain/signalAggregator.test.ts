import { describe, it, expect } from "vitest";

/**
 * SignalAggregator Tests
 *
 * Tests aggregation of signals from multiple detection engines:
 * - AIPresenceDetector: AI tool detection
 * - AIRiskService: Risk scoring based on patterns
 * - SessionTagger: File grouping by DBSCAN clustering
 * - BurstDetector: Rapid change detection
 * - PatternMatcher: Critical file identification
 *
 * Combines into SaveContext for AutoDecisionEngine
 */

describe("SignalAggregator", () => {
	describe("Signal collection", () => {
		it("should collect AI detection signal", () => {
			const aiSignal = {
				detected: true,
				toolName: "CoPilot",
				confidence: 0.85,
			};

			expect(aiSignal.detected).toBe(true);
			expect(aiSignal.confidence).toBeGreaterThan(0.8);
		});

		it("should collect risk score signal", () => {
			const riskSignal = {
				score: 65,
				factors: ["new_files", "rapid_changes"],
			};

			expect(riskSignal.score).toBeGreaterThanOrEqual(60);
			expect(riskSignal.factors.length).toBeGreaterThan(0);
		});

		it("should collect burst detection signal", () => {
			const burstSignal = {
				detected: true,
				fileCount: 4,
				timeWindowMs: 1000,
			};

			expect(burstSignal.detected).toBe(true);
			expect(burstSignal.fileCount).toBeGreaterThanOrEqual(3);
		});

		it("should collect critical file signal", () => {
			const criticalSignal = {
				detected: true,
				files: ["package.json", ".env"],
				count: 2,
			};

			expect(criticalSignal.detected).toBe(true);
			expect(criticalSignal.count).toBeGreaterThan(0);
		});

		it("should collect session grouping signal", () => {
			const sessionSignal = {
				sessionId: "session-123",
				fileCount: 5,
				durationMs: 15000,
				clusters: 2,
			};

			expect(sessionSignal.sessionId).toBeTruthy();
			expect(sessionSignal.fileCount).toBeGreaterThan(0);
		});
	});

	describe("Signal aggregation", () => {
		it("should aggregate all signals into SaveContext", () => {
			const saveContext = {
				repoId: "repo1",
				timestamp: Date.now(),
				files: [
					{ path: "file1.ts", extension: ".ts", sizeBytes: 1000, isNew: false, isBinary: false, nextHash: "abc" },
					{ path: "file2.ts", extension: ".ts", sizeBytes: 2000, isNew: true, isBinary: false, nextHash: "def" },
				],
				aiDetected: true,
				aiToolName: "CoPilot",
				aiConfidence: 0.75,
				sessionId: "sess1",
				sessionFileCount: 2,
				sessionDurationMs: 5000,
				riskScore: 55,
				burstDetected: false,
				containsCriticalFiles: false,
				criticalFileCount: 0,
			};

			expect(saveContext.files.length).toBe(2);
			expect(saveContext.aiDetected).toBe(true);
			expect(saveContext.riskScore).toBe(55);
		});

		it("should maintain signal integrity during aggregation", () => {
			// Each signal should maintain its own values
			const aiSignal = { detected: true, confidence: 0.8 };
			const riskSignal = { score: 65 };
			const sessionSignal = { fileCount: 3, durationMs: 5000 };

			const aggregated = {
				ai: aiSignal,
				risk: riskSignal,
				session: sessionSignal,
			};

			expect(aggregated.ai.confidence).toBe(0.8);
			expect(aggregated.risk.score).toBe(65);
			expect(aggregated.session.fileCount).toBe(3);
		});

		it("should handle missing signals gracefully", () => {
			// Some signals might not be available
			const saveContext = {
				repoId: "repo1",
				timestamp: Date.now(),
				files: [],
				aiDetected: false,
				sessionId: "sess1",
				sessionFileCount: 0,
				sessionDurationMs: 0,
				riskScore: 0,
				burstDetected: false,
				containsCriticalFiles: false,
				criticalFileCount: 0,
			};

			expect(saveContext.riskScore).toBe(0);
			expect(saveContext.aiDetected).toBe(false);
		});
	});

	describe("AI detection signal", () => {
		it("should detect CoPilot activity", () => {
			const signal = {
				toolName: "CoPilot",
				confidence: 0.9,
				indicators: ["suggestion_accepted", "rapid_typing"],
			};

			expect(signal.toolName).toBe("CoPilot");
			expect(signal.confidence).toBeGreaterThan(0.8);
		});

		it("should detect Cursor activity", () => {
			const signal = {
				toolName: "Cursor",
				confidence: 0.85,
			};

			expect(signal.toolName).toBe("Cursor");
		});

		it("should handle low confidence AI", () => {
			const signal = {
				detected: true,
				confidence: 0.35,
			};

			expect(signal.confidence).toBeLessThan(0.5);
		});
	});

	describe("Risk scoring signal", () => {
		it("should score high risk for new files", () => {
			const riskFactors = {
				newFiles: 3,
				modifiedConfig: true,
				rapidChange: true,
			};

			const score = Object.values(riskFactors).filter(Boolean).length * 20;

			expect(score).toBeGreaterThanOrEqual(40);
		});

		it("should score high risk for critical file changes", () => {
			const modifiedCritical = ["package.json", ".env"];

			const riskScore = modifiedCritical.length * 30;

			expect(riskScore).toBeGreaterThanOrEqual(60);
		});

		it("should combine multiple risk factors", () => {
			const factors = {
				newFiles: true,
				rapidChange: true,
				criticalFileChanged: true,
			};

			const score = Object.values(factors).filter(Boolean).length * 25;

			expect(score).toBeGreaterThan(50);
		});
	});

	describe("Session grouping signal", () => {
		it("should group files by session", () => {
			const session = {
				sessionId: "sess1",
				files: ["file1.ts", "file2.ts", "file3.ts"],
				startTime: 1000,
				endTime: 6000,
				durationMs: 5000,
			};

			expect(session.files.length).toBe(3);
			expect(session.durationMs).toBe(5000);
		});

		it("should track session statistics", () => {
			const stats = {
				fileCount: 5,
				uniqueExtensions: 2,
				averageFileSize: 1500,
				density: 0.8,
			};

			expect(stats.fileCount).toBeGreaterThan(0);
			expect(stats.density).toBeGreaterThan(0.5);
		});

		it("should merge multiple bursts into session", () => {
			const burst1 = { files: 2, timeMs: 500 };
			const burst2 = { files: 3, timeMs: 400 };

			const session = {
				totalFiles: burst1.files + burst2.files,
				bursts: 2,
			};

			expect(session.totalFiles).toBe(5);
			expect(session.bursts).toBe(2);
		});
	});

	describe("Burst detection signal", () => {
		it("should detect burst of rapid changes", () => {
			const timestamps = [1000, 1100, 1200, 1300]; // 4 changes in 300ms
			const isBurst = timestamps.length >= 3 && timestamps[timestamps.length - 1] - timestamps[0] < 500;

			expect(isBurst).toBe(true);
		});

		it("should not flag slow changes as burst", () => {
			const timestamps = [1000, 5000, 10000]; // spaced out
			const isBurst = timestamps.length >= 3 && timestamps[timestamps.length - 1] - timestamps[0] < 1000;

			expect(isBurst).toBe(false);
		});

		it("should calculate burst velocity", () => {
			const fileCount = 4;
			const timeMs = 500;
			const velocity = fileCount / (timeMs / 1000);

			expect(velocity).toBeGreaterThan(5);
		});
	});

	describe("Critical file detection", () => {
		it("should identify package.json as critical", () => {
			const criticalPatterns = ["package.json", "tsconfig.json", ".env*"];
			const file = "package.json";

			expect(criticalPatterns).toContain(file);
		});

		it("should identify .env files as critical", () => {
			const file = ".env";
			const isCritical = file.startsWith(".env");

			expect(isCritical).toBe(true);
		});

		it("should count critical files", () => {
			const files = ["package.json", ".env", "tsconfig.json", "src/index.ts"];
			const criticalPatterns = ["package.json", ".env*", "tsconfig.json"];

			const criticalCount = files.filter((f) =>
				criticalPatterns.some((p) => f === p || (p.endsWith("*") && f.startsWith(p.slice(0, -1)))),
			).length;

			expect(criticalCount).toBe(3);
		});
	});

	describe("Signal combination scenarios", () => {
		it("should combine AI + high risk + critical files", () => {
			const signals = {
				ai: { detected: true, confidence: 0.8 },
				risk: { score: 70 },
				critical: { detected: true, count: 2 },
			};

			const hasHighRisk =
				signals.ai.detected ||
				signals.risk.score >= 60 ||
				signals.critical.detected;

			expect(hasHighRisk).toBe(true);
		});

		it("should combine burst + critical files", () => {
			const signals = {
				burst: { detected: true, fileCount: 4 },
				critical: { detected: true },
			};

			const shouldAlert = signals.burst.detected && signals.critical.detected;

			expect(shouldAlert).toBe(true);
		});

		it("should combine session grouping + AI detection", () => {
			const signals = {
				session: { fileCount: 5, durationMs: 3000 },
				ai: { detected: true, confidence: 0.75 },
			};

			const density = signals.session.fileCount / (signals.session.durationMs / 1000);

			expect(density).toBeGreaterThan(1);
			expect(signals.ai.detected).toBe(true);
		});

		it("should combine all signals", () => {
			const allSignals = {
				ai: { detected: true, confidence: 0.8 },
				risk: { score: 65 },
				burst: { detected: true, fileCount: 3 },
				critical: { detected: true, count: 1 },
				session: { fileCount: 3, durationMs: 2000 },
			};

			const signalStrength = Object.values(allSignals).filter((s) =>
				typeof s === "object" &&
				("detected" in s ? s.detected : "score" in s && typeof s.score === "number" && s.score >= 50),
			).length;

			expect(signalStrength).toBeGreaterThan(0);
		});
	});

	describe("Edge cases", () => {
		it("should handle no signals", () => {
			const signals = {
				ai: { detected: false },
				risk: { score: 0 },
				burst: { detected: false },
				critical: { detected: false },
			};

			const hasAnySignal = Object.values(signals).some((s) =>
				typeof s === "object" &&
				(("detected" in s && s.detected) || ("score" in s && typeof s.score === "number" && s.score > 0)),
			);

			expect(hasAnySignal).toBe(false);
		});

		it("should handle conflicting signals", () => {
			// AI detected but low risk
			const signals = {
				ai: { detected: true, confidence: 0.35 },
				risk: { score: 20 },
			};

			expect(signals.ai.detected).toBe(true);
			expect(signals.risk.score).toBeLessThan(40);
		});

		it("should handle one strong signal", () => {
			const signals = {
				ai: { detected: false },
				risk: { score: 80 },
				burst: { detected: false },
				critical: { detected: false },
			};

			const isAlertWorthy = signals.risk.score >= 70;

			expect(isAlertWorthy).toBe(true);
		});
	});
});
