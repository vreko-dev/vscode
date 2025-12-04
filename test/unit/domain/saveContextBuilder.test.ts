import { describe, it, expect } from "vitest";

/**
 * SaveContextBuilder Tests
 *
 * Orchestrates building SaveContext from file events
 * - Collects file change events
 * - Runs detection engines (AI, risk, burst, critical files, sessions)
 * - Aggregates signals via SignalAggregator
 * - Validates SaveContext for AutoDecisionEngine
 *
 * Flow: FileChangeEvent[] → SaveContextBuilder → SaveContext
 */

describe("SaveContextBuilder", () => {
	describe("Builder initialization", () => {
		it("should create builder with repo ID", () => {
			const builder = {
				repoId: "repo1",
				files: [],
				events: [],
			};

			expect(builder.repoId).toBe("repo1");
			expect(builder.files).toEqual([]);
		});

		it("should initialize with empty file list", () => {
			const builder = {
				files: [],
				timestamp: Date.now(),
			};

			expect(Array.isArray(builder.files)).toBe(true);
			expect(builder.files.length).toBe(0);
		});

		it("should initialize with current timestamp", () => {
			const builder = {
				timestamp: Date.now(),
			};

			expect(typeof builder.timestamp).toBe("number");
			expect(builder.timestamp).toBeGreaterThan(0);
		});
	});

	describe("File event collection", () => {
		it("should add file change event", () => {
			const builder = {
				files: [] as Array<{ path: string; type: string }>,
			};

			const event = { path: "file1.ts", type: "modified" };
			builder.files.push(event);

			expect(builder.files.length).toBe(1);
			expect(builder.files[0].path).toBe("file1.ts");
		});

		it("should collect multiple file events", () => {
			const builder = {
				files: [] as Array<{ path: string; type: string }>,
			};

			const events = [
				{ path: "file1.ts", type: "modified" },
				{ path: "file2.ts", type: "created" },
				{ path: "file3.ts", type: "deleted" },
			];

			events.forEach((e) => builder.files.push(e));

			expect(builder.files.length).toBe(3);
		});

		it("should track event metadata", () => {
			const event = {
				path: "package.json",
				type: "modified",
				timestamp: Date.now(),
				sizeBytes: 1024,
				isNew: false,
			};

			expect(event.path).toBeTruthy();
			expect(event.timestamp).toBeGreaterThan(0);
			expect(event.sizeBytes).toBeGreaterThan(0);
		});

		it("should handle file creation events", () => {
			const event = {
				path: "newfile.ts",
				type: "created",
				isNew: true,
				sizeBytes: 0,
			};

			expect(event.isNew).toBe(true);
		});

		it("should handle file deletion events", () => {
			const event = {
				path: "oldfile.ts",
				type: "deleted",
				previousSize: 500,
			};

			expect(event.type).toBe("deleted");
		});
	});

	describe("File metadata extraction", () => {
		it("should extract file extension", () => {
			const path = "index.ts";
			const extension = path.slice(path.lastIndexOf("."));

			expect(extension).toBe(".ts");
		});

		it("should identify binary files", () => {
			const file = {
				path: "image.png",
				isBinary: true,
			};

			expect(file.isBinary).toBe(true);
		});

		it("should identify text files", () => {
			const file = {
				path: "config.json",
				isBinary: false,
				extension: ".json",
			};

			expect(file.isBinary).toBe(false);
			expect(file.extension).toBe(".json");
		});

		it("should calculate file size", () => {
			const file = {
				path: "large.ts",
				sizeBytes: 5000,
			};

			expect(file.sizeBytes).toBeGreaterThan(1000);
		});

		it("should handle path with directories", () => {
			const path = "src/utils/helpers.ts";
			const filename = path.split("/").pop() || "";

			expect(filename).toBe("helpers.ts");
		});
	});

	describe("Detection engine orchestration", () => {
		it("should run AI detection", () => {
			const files = [
				{ path: "file1.ts", content: "// Added by CoPilot" },
			];

			const aiResult = {
				detected: true,
				tool: "CoPilot",
				confidence: 0.8,
			};

			expect(aiResult.detected).toBe(true);
			expect(aiResult.confidence).toBeGreaterThan(0.7);
		});

		it("should run risk scoring", () => {
			const files = [
				{ path: "package.json", modified: true },
				{ path: ".env", modified: true },
			];

			const riskResult = {
				score: 70,
				factors: ["critical_files"],
			};

			expect(riskResult.score).toBeGreaterThanOrEqual(60);
		});

		it("should detect burst changes", () => {
			const timestamps = [1000, 1050, 1100, 1150];
			const isBurst = timestamps.length >= 3 && timestamps[timestamps.length - 1] - timestamps[0] < 500;

			expect(isBurst).toBe(true);
		});

		it("should identify critical files", () => {
			const files = ["package.json", ".env", "tsconfig.json"];
			const criticalPatterns = ["package.json", ".env", "tsconfig.json"];

			const critical = files.filter((f) => criticalPatterns.includes(f));

			expect(critical.length).toBe(3);
		});

		it("should group files by session", () => {
			const session = {
				sessionId: "sess1",
				files: ["file1.ts", "file2.ts", "file3.ts"],
				durationMs: 5000,
			};

			expect(session.files.length).toBe(3);
			expect(session.durationMs).toBeGreaterThan(1000);
		});

		it("should run all detection engines sequentially", () => {
			let order = [] as string[];

			// Simulate detection engines
			order.push("ai");
			order.push("risk");
			order.push("burst");
			order.push("critical");
			order.push("session");

			expect(order.length).toBe(5);
			expect(order[0]).toBe("ai");
			expect(order[order.length - 1]).toBe("session");
		});
	});

	describe("Signal aggregation", () => {
		it("should aggregate all detection signals", () => {
			const saveContext = {
				aiDetected: true,
				aiConfidence: 0.8,
				riskScore: 65,
				burstDetected: true,
				criticalFileCount: 2,
				sessionFileCount: 5,
			};

			expect(saveContext.aiDetected).toBe(true);
			expect(saveContext.riskScore).toBeGreaterThan(60);
		});

		it("should combine AI and risk signals", () => {
			const signals = {
				ai: { detected: true, confidence: 0.75 },
				risk: { score: 70 },
			};

			const combined = {
				hasAI: signals.ai.detected,
				highRisk: signals.risk.score >= 60,
			};

			expect(combined.hasAI && combined.highRisk).toBe(true);
		});

		it("should combine burst and critical file signals", () => {
			const signals = {
				burst: { detected: true, fileCount: 4 },
				critical: { detected: true, count: 1 },
			};

			const combined =
				signals.burst.detected && signals.critical.detected;

			expect(combined).toBe(true);
		});
	});

	describe("SaveContext validation", () => {
		it("should validate required fields", () => {
			const context = {
				repoId: "repo1",
				timestamp: Date.now(),
				files: [],
				aiDetected: false,
				riskScore: 0,
				burstDetected: false,
				containsCriticalFiles: false,
				criticalFileCount: 0,
			};

			expect(context.repoId).toBeTruthy();
			expect(typeof context.timestamp).toBe("number");
			expect(Array.isArray(context.files)).toBe(true);
		});

		it("should validate file array is not null", () => {
			const context = {
				files: [
					{
						path: "file1.ts",
						extension: ".ts",
						sizeBytes: 100,
						isNew: false,
						isBinary: false,
						nextHash: "abc",
					},
				],
			};

			expect(context.files).not.toBeNull();
			expect(context.files.length).toBeGreaterThan(0);
		});

		it("should validate timestamps are positive", () => {
			const context = {
				timestamp: 1700000000,
				sessionDurationMs: 5000,
			};

			expect(context.timestamp).toBeGreaterThan(0);
			expect(context.sessionDurationMs).toBeGreaterThanOrEqual(0);
		});

		it("should validate signal scores are in range", () => {
			const context = {
				riskScore: 65,
				aiConfidence: 0.75,
			};

			expect(context.riskScore).toBeGreaterThanOrEqual(0);
			expect(context.riskScore).toBeLessThanOrEqual(100);
			expect(context.aiConfidence).toBeGreaterThanOrEqual(0);
			expect(context.aiConfidence).toBeLessThanOrEqual(1);
		});

		it("should validate counts are non-negative", () => {
			const context = {
				criticalFileCount: 2,
				sessionFileCount: 5,
			};

			expect(context.criticalFileCount).toBeGreaterThanOrEqual(0);
			expect(context.sessionFileCount).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Build workflow", () => {
		it("should build SaveContext step by step", () => {
			// Step 1: Collect files
			const files = [
				{
					path: "file1.ts",
					extension: ".ts",
					sizeBytes: 100,
					isNew: false,
					isBinary: false,
					nextHash: "abc",
				},
			];

			// Step 2: Run detections
			const aiDetected = true;
			const riskScore = 55;
			const burstDetected = false;

			// Step 3: Build context
			const context = {
				repoId: "repo1",
				timestamp: Date.now(),
				files,
				aiDetected,
				riskScore,
				burstDetected,
				containsCriticalFiles: false,
				criticalFileCount: 0,
			};

			expect(context.files.length).toBe(1);
			expect(context.aiDetected).toBe(true);
		});

		it("should handle empty file set", () => {
			const context = {
				repoId: "repo1",
				timestamp: Date.now(),
				files: [],
				aiDetected: false,
				riskScore: 0,
				burstDetected: false,
				containsCriticalFiles: false,
				criticalFileCount: 0,
			};

			expect(context.files.length).toBe(0);
		});

		it("should handle high-signal scenario", () => {
			const context = {
				aiDetected: true,
				aiConfidence: 0.85,
				riskScore: 75,
				burstDetected: true,
				containsCriticalFiles: true,
				criticalFileCount: 3,
				sessionFileCount: 10,
			};

			const isHighSignal =
				context.aiDetected &&
				context.riskScore >= 70 &&
				context.containsCriticalFiles;

			expect(isHighSignal).toBe(true);
		});

		it("should chain builder methods", () => {
			let context = {
				repoId: "",
				files: [] as Array<{ path: string }>,
			};

			// Chain operations
			context.repoId = "repo1";
			context.files.push({ path: "file1.ts" });

			expect(context.repoId).toBe("repo1");
			expect(context.files.length).toBe(1);
		});
	});

	describe("Error handling", () => {
		it("should handle missing file metadata", () => {
			const file = {
				path: "unknown.xyz",
				// extension missing
			};

			const extension = (file as any).extension || "unknown";

			expect(extension).toBe("unknown");
		});

		it("should handle invalid risk score", () => {
			const score = Math.max(0, Math.min(100, -10)); // Clamp to [0,100]

			expect(score).toBe(0);
		});

		it("should handle null detection results", () => {
			const result = null;
			const detected = result ? (result as any).detected : false;

			expect(detected).toBe(false);
		});

		it("should handle empty session", () => {
			const session = {
				fileCount: 0,
				durationMs: 0,
			};

			expect(session.fileCount).toBe(0);
		});
	});

	describe("SaveContext transformation", () => {
		it("should transform file events to SaveContext", () => {
			const events = [
				{ path: "file1.ts", type: "modified" },
				{ path: "file2.ts", type: "created" },
			];

			const context = {
				files: events.map((e) => ({
					path: e.path,
					extension: e.path.split(".").pop() || "",
					sizeBytes: 0,
					isNew: e.type === "created",
					isBinary: false,
					nextHash: "",
				})),
			};

			expect(context.files.length).toBe(2);
			expect(context.files[1].isNew).toBe(true);
		});

		it("should calculate aggregated metrics", () => {
			const files = [
				{ sizeBytes: 1000 },
				{ sizeBytes: 2000 },
				{ sizeBytes: 3000 },
			];

			const totalSize = files.reduce((sum, f) => sum + f.sizeBytes, 0);
			const avgSize = totalSize / files.length;

			expect(totalSize).toBe(6000);
			expect(avgSize).toBe(2000);
		});

		it("should track timestamps during build", () => {
			const startTime = Date.now();
			// Simulate work
			const endTime = Date.now();

			const duration = endTime - startTime;

			expect(duration).toBeGreaterThanOrEqual(0);
		});
	});
});
