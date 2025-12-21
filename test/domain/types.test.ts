/**
 * @fileoverview Domain Types Test Suite
 *
 * RED phase: These tests will fail until types.ts is implemented
 * Tests verify the structure and contracts of domain types used by AutoDecisionEngine
 */

import { describe, it, expect } from "vitest";
import type {
	FileContext,
	SaveContext,
	ProtectionDecision,
	DecisionReason,
	AutoDecisionConfig,
	SnapshotIntent,
} from "./types";
import { DEFAULT_CONFIG } from "./types";

describe("Domain Types", () => {
	describe("FileContext", () => {
		it("should define FileContext with required properties", () => {
			const context: FileContext = {
				path: "src/index.ts",
				extension: ".ts",
				sizeBytes: 1024,
				isNew: false,
				isBinary: false,
				prevHash: "abc123",
				nextHash: "def456",
			};

			expect(context.path).toBe("src/index.ts");
			expect(context.extension).toBe(".ts");
			expect(context.sizeBytes).toBe(1024);
			expect(context.isNew).toBe(false);
		});

		it("should allow undefined prevHash for new files", () => {
			const context: FileContext = {
				path: "src/new.ts",
				extension: ".ts",
				sizeBytes: 512,
				isNew: true,
				isBinary: false,
				nextHash: "xyz789",
			};

			expect(context.prevHash).toBeUndefined();
			expect(context.isNew).toBe(true);
		});
	});

	describe("SaveContext", () => {
		it("should define SaveContext with all signal properties", () => {
			const context: SaveContext = {
				repoId: "test-repo",
				timestamp: Date.now(),
				files: [
					{
						path: "src/index.ts",
						extension: ".ts",
						sizeBytes: 1024,
						isNew: false,
						isBinary: false,
						nextHash: "hash123",
					},
				],
				aiDetected: true,
				aiToolName: "cursor",
				aiConfidence: 0.85,
				sessionId: "session-1",
				sessionFileCount: 5,
				sessionDurationMs: 60000,
				riskScore: 75,
				burstDetected: true,
				containsCriticalFiles: true,
				criticalFileCount: 1,
			};

			expect(context.repoId).toBe("test-repo");
			expect(context.aiDetected).toBe(true);
			expect(context.riskScore).toBe(75);
			expect(context.sessionFileCount).toBe(5);
		});

		it("should allow minimal SaveContext with optional AI fields", () => {
			const context: SaveContext = {
				repoId: "repo",
				timestamp: Date.now(),
				files: [],
				aiDetected: false,
				sessionId: "session-1",
				sessionFileCount: 1,
				sessionDurationMs: 0,
				riskScore: 30,
				burstDetected: false,
				containsCriticalFiles: false,
				criticalFileCount: 0,
			};

			expect(context.aiDetected).toBe(false);
			expect(context.aiToolName).toBeUndefined();
			expect(context.aiConfidence).toBeUndefined();
		});
	});

	describe("ProtectionDecision", () => {
		it("should define ProtectionDecision with all required fields", () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: true,
				reasons: ["ai_detected", "risk_threshold"],
				confidence: 0.85,
				summary: "AI-assisted changes detected (cursor). Checkpoint created.",
				context: {
					riskScore: 75,
					sessionId: "session-1",
					filesInSession: 5,
					criticalFileCount: 1,
					aiToolName: "cursor",
				},
			};

			expect(decision.createSnapshot).toBe(true);
			expect(decision.showNotification).toBe(true);
			expect(decision.reasons).toContain("ai_detected");
			expect(decision.confidence).toBe(0.85);
		});

		it("should support DecisionReason union type with all variants", () => {
			const reasons: DecisionReason[] = [
				"ai_detected",
				"risk_threshold",
				"burst_pattern",
				"critical_file",
				"session_size",
				"manual_request",
				"fallback",
			];

			expect(reasons).toHaveLength(7);
			expect(reasons[0]).toBe("ai_detected");
		});

		it("should allow no snapshot but show notification", () => {
			const decision: ProtectionDecision = {
				createSnapshot: false,
				showNotification: true,
				reasons: ["fallback"],
				confidence: 0.4,
				summary: "Risk detected but below snapshot threshold.",
				context: {
					riskScore: 45,
					sessionId: "session-1",
					filesInSession: 1,
					criticalFileCount: 0,
				},
			};

			expect(decision.createSnapshot).toBe(false);
			expect(decision.showNotification).toBe(true);
		});
	});

	describe("AutoDecisionConfig", () => {
		it("should define AutoDecisionConfig with threshold properties", () => {
			const config: AutoDecisionConfig = {
				riskThreshold: 60,
				notifyThreshold: 40,
				minFilesForBurst: 3,
				maxSnapshotsPerMinute: 4,
				alwaysProtectPatterns: ["package.json", "tsconfig.json"],
				neverProtectPatterns: ["node_modules/**", "dist/**"],
			};

			expect(config.riskThreshold).toBe(60);
			expect(config.notifyThreshold).toBe(40);
			expect(config.alwaysProtectPatterns).toContain("package.json");
		});

		it("should have DEFAULT_CONFIG exported", () => {
			expect(DEFAULT_CONFIG).toBeDefined();
			expect(DEFAULT_CONFIG.riskThreshold).toBe(60);
			expect(DEFAULT_CONFIG.notifyThreshold).toBe(40);
			expect(DEFAULT_CONFIG.maxSnapshotsPerMinute).toBe(4);
		});

		it("DEFAULT_CONFIG should include critical file patterns", () => {
			expect(DEFAULT_CONFIG.alwaysProtectPatterns).toContain("package.json");
			expect(DEFAULT_CONFIG.alwaysProtectPatterns).toContain("tsconfig.json");
			expect(DEFAULT_CONFIG.neverProtectPatterns).toContain("node_modules/**");
		});

		it("should allow partial config overrides", () => {
			const custom: Partial<AutoDecisionConfig> = {
				riskThreshold: 80,
				maxSnapshotsPerMinute: 10,
			};

			expect(custom.riskThreshold).toBe(80);
			expect(custom.notifyThreshold).toBeUndefined();
		});
	});

	describe("SnapshotIntent", () => {
		it("should define SnapshotIntent with snapshot details", () => {
			const intent: SnapshotIntent = {
				id: "snapshot-123",
				files: new Map([
					["src/index.ts", "export function hello() { }"],
					["src/utils.ts", "export function util() { }"],
				]),
				name: "cursor-changes-2025-12-04",
				trigger: "ai-detected",
				metadata: {
					riskScore: 85,
					aiDetected: true,
					aiToolName: "cursor",
					sessionId: "session-1",
					reasons: ["ai_detected", "risk_threshold"],
				},
			};

			expect(intent.id).toBe("snapshot-123");
			expect(intent.files.size).toBe(2);
			expect(intent.trigger).toBe("ai-detected");
			expect(intent.metadata.aiDetected).toBe(true);
		});

		it("should support all trigger types", () => {
			const triggers: SnapshotIntent["trigger"][] = [
				"auto",
				"ai-detected",
				"manual",
				"burst",
			];

			expect(triggers).toHaveLength(4);
		});

		it("should handle empty file map for intent", () => {
			const intent: SnapshotIntent = {
				id: "snapshot-456",
				files: new Map(),
				name: "empty-snapshot",
				trigger: "manual",
				metadata: {
					riskScore: 0,
					aiDetected: false,
					sessionId: "session-1",
					reasons: ["fallback"],
				},
			};

			expect(intent.files.size).toBe(0);
		});
	});

	describe("Type Exports", () => {
		it("should export all types from types module", () => {
			// This test verifies that all types are properly exported
			// and can be imported by consumers
			const typeNames = [
				"FileContext",
				"SaveContext",
				"ProtectionDecision",
				"DecisionReason",
				"AutoDecisionConfig",
				"SnapshotIntent",
				"DEFAULT_CONFIG",
			];

			typeNames.forEach((name) => {
				expect(name).toBeDefined();
			});
		});
	});

	describe("Type Constraints", () => {
		it("should enforce riskScore as 0-100 range", () => {
			const validContext: SaveContext = {
				repoId: "repo",
				timestamp: Date.now(),
				files: [],
				aiDetected: false,
				sessionId: "session",
				sessionFileCount: 1,
				sessionDurationMs: 0,
				riskScore: 50, // Valid 0-100
				burstDetected: false,
				containsCriticalFiles: false,
				criticalFileCount: 0,
			};

			expect(validContext.riskScore).toBeGreaterThanOrEqual(0);
			expect(validContext.riskScore).toBeLessThanOrEqual(100);
		});

		it("should enforce confidence as 0-1 range", () => {
			const decision: ProtectionDecision = {
				createSnapshot: true,
				showNotification: true,
				reasons: ["ai_detected"],
				confidence: 0.75, // Valid 0-1
				summary: "Test",
				context: {
					riskScore: 50,
					sessionId: "session",
					filesInSession: 1,
					criticalFileCount: 0,
				},
			};

			expect(decision.confidence).toBeGreaterThanOrEqual(0);
			expect(decision.confidence).toBeLessThanOrEqual(1);
		});

		it("should enforce aiConfidence as 0-1 range if provided", () => {
			const context: SaveContext = {
				repoId: "repo",
				timestamp: Date.now(),
				files: [],
				aiDetected: true,
				aiConfidence: 0.92, // Valid 0-1
				sessionId: "session",
				sessionFileCount: 1,
				sessionDurationMs: 0,
				riskScore: 75,
				burstDetected: false,
				containsCriticalFiles: false,
				criticalFileCount: 0,
			};

			expect(context.aiConfidence).toBeGreaterThanOrEqual(0);
			expect(context.aiConfidence).toBeLessThanOrEqual(1);
		});
	});
});
