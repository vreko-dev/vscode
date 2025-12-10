import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

/**
 * PHASE 1 (RED): TDD_CORE.md Violation Detection Tests
 *
 * Purpose: Create failing tests that detect violations of TDD_CORE.md forbidden patterns
 * These tests MUST fail until violations are fixed.
 *
 * @see /ai_dev_utils/TDD_CORE.md - Forbidden Patterns section
 */

describe("TDD_CORE.md Violation Detection", () => {
  const testDir = join(__dirname, "..");
  const testFiles = getTestFiles(testDir);

  // VIOLATION 1: Placeholder Tests (Forbidden Pattern #1)
  describe("VIOLATION 1: Placeholder Tests", () => {
    it("RED-001: Should FAIL if placeholder tests exist", () => {
      const placeholderPattern = /expect\(true\)\.toBe\(true\)/g;
      const violatingFiles: string[] = [];
      let totalViolations = 0;

      for (const file of testFiles) {
        const content = readFileSync(file, "utf-8");
        const matches = content.match(placeholderPattern);
        if (matches) {
          violatingFiles.push(file);
          totalViolations += matches.length;
        }
      }

      // RED phase - this MUST fail
      expect(totalViolations, `Found ${totalViolations} placeholders`).toBe(0);
    });
  });

  // VIOLATION 2: Vague Assertions (Forbidden Pattern #2)
  describe("VIOLATION 2: Vague Assertions", () => {
    it("RED-002: Should FAIL if vague assertions exist", () => {
      const vaguePattern = /expect\([^)]*\)\.(toBeTruthy|toBeDefined|toBeNull)\(\)/g;
      let totalViolations = 0;

      for (const file of testFiles) {
        const content = readFileSync(file, "utf-8");
        const matches = content.match(vaguePattern);
        if (matches) {
          totalViolations += matches.length;
        }
      }

      // RED phase - this MUST fail
      expect(totalViolations, `Found ${totalViolations} vague assertions`).toBe(0);
    });
  });

  // VIOLATION 3: Skipped Tests Without Issue (Forbidden Pattern #3)
  describe("VIOLATION 3: Skipped Tests Without GitHub Issue", () => {
    it("RED-003: Should FAIL if skipped tests lack issue refs", () => {
      const skippedPattern = /(?:it|describe|test|suite)\.skip\s*\(/g;
      const issuePattern = /@see\s+https:\/\/github\.com/;
      let countWithoutIssue = 0;

      for (const file of testFiles) {
        const content = readFileSync(file, "utf-8");
        if (skippedPattern.test(content)) {
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (/(?:it|describe|test|suite)\.skip\s*\(/.test(lines[i])) {
              const contextStart = Math.max(0, i - 5);
              const context = lines.slice(contextStart, i + 1).join("\n");
              if (!issuePattern.test(context)) {
                countWithoutIssue++;
              }
            }
          }
        }
      }

      // RED phase - this MUST fail
      expect(countWithoutIssue, `Found ${countWithoutIssue} skipped tests`).toBe(0);
    });
  });

  // SUMMARY
  describe("SUMMARY: Total Violations", () => {
    it("RED-007: Total violations should be 0", () => {
      const placeholderPattern = /expect\(true\)\.toBe\(true\)/g;
      const vaguePattern = /expect\([^)]*\)\.(toBeTruthy|toBeDefined|toBeNull)\(\)/g;
      const skippedPattern = /(?:it|describe|test|suite)\.skip\s*\(/g;
      const issuePattern = /@see\s+https:\/\/github\.com/;

      let placeholders = 0;
      let vague = 0;
      let skippedNoIssue = 0;

      for (const file of testFiles) {
        const content = readFileSync(file, "utf-8");

        const p = content.match(placeholderPattern);
        if (p) placeholders += p.length;

        const v = content.match(vaguePattern);
        if (v) vague += v.length;

        if (skippedPattern.test(content)) {
          const lines = content.split("\n");
          for (let i = 0; i < lines.length; i++) {
            if (/(?:it|describe|test|suite)\.skip\s*\(/.test(lines[i])) {
              const ctx = lines.slice(Math.max(0, i - 5), i + 1).join("\n");
              if (!issuePattern.test(ctx)) {
                skippedNoIssue++;
              }
            }
          }
        }
      }

      const total = placeholders + vague + skippedNoIssue;
      expect(total, `P:${placeholders} V:${vague} S:${skippedNoIssue}`).toBe(0);
    });
  });
});

function getTestFiles(dir: string): string[] {
  const files: string[] = [];

  function traverse(currentDir: string) {
    try {
      const entries = readdirSync(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = join(currentDir, entry.name);
        if (
          entry.name === "node_modules" ||
          entry.name === "coverage" ||
          entry.name === "dist"
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          traverse(fullPath);
        } else if (entry.isFile() && /\.(test|spec)\.ts$/.test(entry.name)) {
          files.push(fullPath);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  traverse(dir);
  return files;
}
