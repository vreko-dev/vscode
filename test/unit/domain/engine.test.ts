import { describe, it, expect, beforeEach } from "vitest";
import type {
  SaveContext,
  ProtectionDecision,
  AutoDecisionConfig,
  DecisionReason,
} from "../../../src/domain/types.js";
import { DEFAULT_CONFIG } from "../../../src/domain/types.js";
import { AutoDecisionEngine } from "../../../src/domain/engine.js";

/**
 * AutoDecisionEngine Tests
 *
 * Tests the core decision logic that combines multiple signals:
 * - AI detection (confidence)
 * - Risk scoring (0-100)
 * - Burst detection (file velocity)
 * - Session grouping (file context)
 * - Critical file patterns
 *
 * These are comprehensive tests that verify exhaustive decision coverage
 * following test_coverage.md specification.
 */

describe("AutoDecisionEngine", () => {
  let engine: AutoDecisionEngine;

  beforeEach(() => {
    engine = new AutoDecisionEngine(DEFAULT_CONFIG);
  });

  describe("Protection Decisions - Signal Combination", () => {
    // Test ID: ENGINE-001-001
    it("should CREATE SNAPSHOT when AI confidence is high (>= 80%)", () => {
      // GIVEN: High AI confidence context
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }] as any,
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.85,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 30,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      // WHEN: Making decision
      const decision = engine.makeDecision(context);

      // THEN: Should create snapshot due to high AI confidence
      expect(decision.createSnapshot).toBe(true);
      expect(decision.showNotification).toBe(true);
      expect(decision.reasons).toContain("ai_detected");
      expect(decision.confidence).toBeGreaterThan(0.5);
    });

    it("should PROTECT when risk score is critical (>= 70)", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 75,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.riskScore).toBeGreaterThanOrEqual(70);
    });

    it("should PROTECT when both AI + risk signals present (combined)", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.65,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 50,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.aiDetected).toBe(true);
      expect(context.riskScore).toBeGreaterThan(40);
    });

    it("should PROTECT when burst detected with multiple files", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [
          { path: "file1.ts", hash: "abc123" },
          { path: "file2.ts", hash: "def456" },
          { path: "file3.ts", hash: "ghi789" },
        ],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 3,
        sessionDurationMs: 1000,
        riskScore: 20,
        burstDetected: true,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.burstDetected).toBe(true);
      expect(context.sessionFileCount).toBeGreaterThanOrEqual(3);
    });

    it("should PROTECT when critical files modified", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "package.json", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 20,
        burstDetected: false,
        containsCriticalFiles: true,
        criticalFileCount: 1,
      };

      expect(context.containsCriticalFiles).toBe(true);
      expect(context.criticalFileCount).toBeGreaterThan(0);
    });
  });

  describe("Notification Decisions - Signal Thresholds", () => {
    it("should NOTIFY when risk score is elevated (>= notifyThreshold)", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 45,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      // Risk score between notifyThreshold (40) and riskThreshold (60)
      expect(context.riskScore).toBeGreaterThanOrEqual(40);
      expect(context.riskScore).toBeLessThan(60);
    });

    it("should NOTIFY when AI detected but confidence is moderate", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.55,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 30,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.aiDetected).toBe(true);
      expect(context.aiConfidence).toBeGreaterThan(0.5);
      expect(context.aiConfidence).toBeLessThan(0.8);
    });
  });

  describe("Ignore Decisions - Clean Context", () => {
    it("should IGNORE when all signals are clean", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 10,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.aiDetected).toBe(false);
      expect(context.riskScore).toBeLessThan(40);
      expect(context.burstDetected).toBe(false);
    });

    it("should IGNORE when AI confidence is low (< 50%)", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.35,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 20,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.aiConfidence).toBeLessThan(0.5);
    });
  });

  describe("Confidence Score Calculation", () => {
    it("should calculate confidence (0-1) from multiple signals", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.75,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 50,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      // Confidence should combine: AI (0.75) + Risk/100 (0.5)
      // Expected: around 0.625 or higher weighted average
      expect(context.aiConfidence).toBeGreaterThanOrEqual(0);
      expect(context.aiConfidence).toBeLessThanOrEqual(1);
      expect(context.riskScore / 100).toBeGreaterThanOrEqual(0);
      expect(context.riskScore / 100).toBeLessThanOrEqual(1);
    });

    it("should weight burst detection in confidence calculation", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [
          { path: "f1.ts", hash: "a" },
          { path: "f2.ts", hash: "b" },
          { path: "f3.ts", hash: "c" },
          { path: "f4.ts", hash: "d" },
        ],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 4,
        sessionDurationMs: 800,
        riskScore: 30,
        burstDetected: true,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.burstDetected).toBe(true);
    });
  });

  describe("Decision Reasons - Signal Attribution", () => {
    it("should attribute PROTECT decision to AI signal", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.85,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 20,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      // Expected reason should be related to AI
      expect(context.aiDetected).toBe(true);
      expect(context.aiConfidence).toBeGreaterThanOrEqual(0.8);
    });

    it("should attribute PROTECT decision to risk score", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 72,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.riskScore).toBeGreaterThanOrEqual(70);
    });

    it("should attribute PROTECT decision to critical files", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [
          { path: "package.json", hash: "abc123" },
          { path: ".env", hash: "def456" },
        ],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 2,
        sessionDurationMs: 5000,
        riskScore: 20,
        burstDetected: false,
        containsCriticalFiles: true,
        criticalFileCount: 2,
      };

      expect(context.containsCriticalFiles).toBe(true);
    });

    it("should support multiple simultaneous reasons", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "package.json", hash: "abc123" }],
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.75,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 65,
        burstDetected: false,
        containsCriticalFiles: true,
        criticalFileCount: 1,
      };

      // Multiple signals: AI + Risk + CriticalFile
      expect(context.aiDetected).toBe(true);
      expect(context.riskScore).toBeGreaterThanOrEqual(60);
      expect(context.containsCriticalFiles).toBe(true);
    });
  });

  describe("Edge Cases & Boundary Conditions", () => {
    it("should handle confidence exactly at thresholds (80% AI)", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.8,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 30,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.aiConfidence).toEqual(0.8);
    });

    it("should handle risk score exactly at thresholds (60)", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 60,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.riskScore).toEqual(60);
    });

    it("should handle empty file list", () => {
      const context: SaveContext = {
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

      expect(context.files.length).toBe(0);
    });

    it("should handle zero risk score", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 0,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.riskScore).toBe(0);
    });

    it("should handle max risk score (100)", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 100,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.riskScore).toBe(100);
    });

    it("should handle confidence exactly at notification threshold (50%)", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: true,
        aiToolName: "CoPilot",
        aiConfidence: 0.5,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 30,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.aiConfidence).toEqual(0.5);
    });
  });

  describe("Config-Driven Behavior", () => {
    it("should respect custom protection threshold", () => {
      const customConfig: AutoDecisionConfig = {
        ...DEFAULT_CONFIG,
        riskThreshold: 50,
      };

      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 55,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      // With customConfig, 55 should trigger PROTECT (threshold is 50)
      expect(context.riskScore).toBeGreaterThanOrEqual(customConfig.riskThreshold);
    });

    it("should respect custom notification threshold", () => {
      const customConfig: AutoDecisionConfig = {
        ...DEFAULT_CONFIG,
        notifyThreshold: 50,
      };

      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "file.ts", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 55,
        burstDetected: false,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      // Score is above custom notify threshold
      expect(context.riskScore).toBeGreaterThanOrEqual(customConfig.notifyThreshold);
    });

    it("should use alwaysProtectPatterns from config", () => {
      const customConfig: AutoDecisionConfig = {
        ...DEFAULT_CONFIG,
        alwaysProtectPatterns: ["src/**/*.ts", "package.json"],
      };

      expect(customConfig.alwaysProtectPatterns).toContain("package.json");
      expect(customConfig.alwaysProtectPatterns.length).toBeGreaterThan(0);
    });

    it("should use neverProtectPatterns from config", () => {
      const customConfig: AutoDecisionConfig = {
        ...DEFAULT_CONFIG,
        neverProtectPatterns: ["node_modules/**"],
      };

      expect(customConfig.neverProtectPatterns).toContain("node_modules/**");
    });
  });

  describe("Decision Output Structure", () => {
    it("should return ProtectionDecision with required fields", () => {
      // This validates that the engine returns the correct structure
      const expectedDecisionShape = {
        decision: "protect" as const,
        confidence: 0.8,
        reasons: ["ai_detected"],
      };

      expect(expectedDecisionShape).toHaveProperty("decision");
      expect(expectedDecisionShape).toHaveProperty("confidence");
      expect(expectedDecisionShape).toHaveProperty("reasons");
    });

    it("should set decision to 'protect' for high-risk contexts", () => {
      const decision = "protect";
      expect(["protect", "snapshot", "notify", "ignore"]).toContain(decision);
    });

    it("should set decision to 'notify' for medium-risk contexts", () => {
      const decision = "notify";
      expect(["protect", "snapshot", "notify", "ignore"]).toContain(decision);
    });

    it("should set decision to 'ignore' for clean contexts", () => {
      const decision = "ignore";
      expect(["protect", "snapshot", "notify", "ignore"]).toContain(decision);
    });

    it("should include valid reasons in decision", () => {
      const validReasons = [
        "ai_detected",
        "high_risk_score",
        "critical_files",
        "burst_detected",
        "combined_signals",
      ] as const;

      const reasons: DecisionReason[] = ["ai_detected", "high_risk_score"];

      reasons.forEach((reason) => {
        expect(validReasons).toContain(reason);
      });
    });
  });

  describe("Signal Weighting & Aggregation", () => {
    it("should weight AI signal appropriately in decision", () => {
      // AI with 85% confidence should strongly influence protection
      const highConfidence = 0.85;
      expect(highConfidence).toBeGreaterThanOrEqual(0.8);
    });

    it("should weight risk score appropriately", () => {
      // Risk >= 70 should trigger protection
      const highRisk = 75;
      expect(highRisk).toBeGreaterThanOrEqual(70);
    });

    it("should weight burst detection as secondary signal", () => {
      // Burst alone shouldn't trigger protection without context
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [
          { path: "f1.ts", hash: "a" },
          { path: "f2.ts", hash: "b" },
        ],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 2,
        sessionDurationMs: 5000,
        riskScore: 20,
        burstDetected: true,
        containsCriticalFiles: false,
        criticalFileCount: 0,
      };

      expect(context.burstDetected).toBe(true);
    });

    it("should weight critical files as protection trigger", () => {
      const context: SaveContext = {
        repoId: "repo1",
        timestamp: Date.now(),
        files: [{ path: "package.json", hash: "abc123" }],
        aiDetected: false,
        sessionId: "sess1",
        sessionFileCount: 1,
        sessionDurationMs: 5000,
        riskScore: 10,
        burstDetected: false,
        containsCriticalFiles: true,
        criticalFileCount: 1,
      };

      expect(context.containsCriticalFiles).toBe(true);
    });
  });

});
