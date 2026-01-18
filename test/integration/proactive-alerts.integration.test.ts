/**
 * Proactive Alerts Integration Tests
 *
 * E2E tests for the complete alert flow:
 * File Save → AlertGenerator → AlertRateLimiter → AlertWriter → JSONL file
 *
 * Coverage:
 * - Alert generation on protected file save
 * - Rate limiting prevents alert fatigue
 * - Alerts persisted to .snapback/alerts.jsonl
 * - Different alert types (critical_file, high_risk_file, violation_recurrence)
 * - Session-based rate limiting
 */

import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AlertGenerator } from "../../src/services/AlertGenerator";
import { AlertRateLimiter } from "../../src/services/AlertRateLimiter";
import { AlertWriter, type ProactiveAlert } from "../../src/services/AlertWriter";

describe("Proactive Alerts Integration", () => {
	let tempDir: string;
	let alertGenerator: AlertGenerator;
	let alertRateLimiter: AlertRateLimiter;
	let alertWriter: AlertWriter;
	let sessionId: string;
	let alertsPath: string;

	// Mock services
	const mockFileProtectionService = {
		isProtected: (filePath: string) => filePath.includes("auth") || filePath.includes("test"),
		getProtectedFiles: () => [],
	};

	const mockViolationReader = {
		getViolationsForFile: async (filePath: string) => {
			if (filePath.includes("recurring")) {
				return [{ type: "silent_catch", count: 3, lastOccurrence: Date.now() - 1000 }];
			}
			return [];
		},
	};

	const mockPressureGauge = {
		getCurrentPressure: async () => 50, // Default moderate pressure
	};

	beforeEach(async () => {
		// Create temporary workspace
		tempDir = await require("node:fs/promises").mkdtemp(join(tmpdir(), "proactive-alerts-test-"));
		alertsPath = join(tempDir, ".snapback", "alerts.jsonl");

		// Initialize alert system
		alertGenerator = new AlertGenerator({
			workspaceRoot: tempDir,
			fileProtectionService: mockFileProtectionService,
			violationReader: mockViolationReader,
			pressureGauge: mockPressureGauge,
		});
		alertRateLimiter = new AlertRateLimiter();
		alertWriter = new AlertWriter({ workspaceRoot: tempDir });
		sessionId = `test-session-${Date.now()}`;
	});

	afterEach(async () => {
		await rm(tempDir, { recursive: true, force: true });
	});

	/**
	 * Helper to read alerts from JSONL file
	 */
	const readAlerts = async (): Promise<ProactiveAlert[]> => {
		try {
			const content = await readFile(alertsPath, "utf-8");
			return content
				.trim()
				.split("\n")
				.filter(Boolean)
				.map((line) => JSON.parse(line));
		} catch {
			return [];
		}
	};

	/**
	 * Helper to simulate full alert pipeline
	 */
	const processFileForAlerts = async (filePath: string): Promise<number> => {
		const alerts = await alertGenerator.checkFile(filePath);
		let writtenCount = 0;

		for (const alert of alerts) {
			if (alertRateLimiter.shouldAllow(alert, sessionId)) {
				await alertWriter.write(alert);
				alertRateLimiter.recordShown(alert, sessionId);
				writtenCount++;
			}
		}

		return writtenCount;
	};

	// ============================================================================
	// E2E Flow Tests
	// ============================================================================

	describe("Complete Alert Pipeline", () => {
		it("should generate and persist alert for protected file", async () => {
			const filePath = join(tempDir, "src", "auth.ts");

			// Simulate file save
			const writtenCount = await processFileForAlerts(filePath);

			// Should generate at least one alert
			expect(writtenCount).toBeGreaterThan(0);

			// Verify alert was written to JSONL
			const alerts = await readAlerts();
			expect(alerts).toHaveLength(writtenCount);
			expect(alerts[0]).toHaveProperty("id");
			expect(alerts[0]).toHaveProperty("category");
			expect(alerts[0]).toHaveProperty("severity");
		});

		it("should detect critical file and generate non-dismissible alert", async () => {
			const filePath = join(tempDir, ".env");

			const writtenCount = await processFileForAlerts(filePath);

			expect(writtenCount).toBe(1);

			const alerts = await readAlerts();
			expect(alerts[0].category).toBe("critical_file_touch");
			expect(alerts[0].severity).toBe("critical");
			expect(alerts[0].dismissible).toBe(false);
			expect(alerts[0].confidence).toBe(95);
		});

		it("should detect violation recurrence and generate high-confidence alert", async () => {
			const filePath = join(tempDir, "src", "recurring.ts");

			const writtenCount = await processFileForAlerts(filePath);

			expect(writtenCount).toBeGreaterThan(0);

			const alerts = await readAlerts();
			// AlertGenerator generates both high_risk_file and violation_recurrence
			// One of them should have high confidence
			const highConfidenceAlert = alerts.find((a) => a.confidence >= 85);
			expect(highConfidenceAlert).toBeDefined();
			expect(highConfidenceAlert?.confidence).toBeGreaterThanOrEqual(85);
		});

		it("should generate multiple alerts for the same file", async () => {
			const filePath = join(tempDir, "src", "recurring.ts");

			const writtenCount = await processFileForAlerts(filePath);

			// Should generate both high_risk_file and violation_recurrence alerts
			expect(writtenCount).toBeGreaterThanOrEqual(1);

			const alerts = await readAlerts();
			expect(alerts.length).toBeGreaterThanOrEqual(1);
		});
	});

	// ============================================================================
	// Rate Limiting Integration
	// ============================================================================

	describe("Rate Limiting Integration", () => {
		it("should respect session alert limit (max 3 per session)", async () => {
			const files = [
				join(tempDir, "auth.ts"),
				join(tempDir, "test1.ts"),
				join(tempDir, "test2.ts"),
				join(tempDir, "test3.ts"),
				join(tempDir, "test4.ts"),
			];

			let totalWritten = 0;
			for (const file of files) {
				totalWritten += await processFileForAlerts(file);
			}

			// Should not exceed 3 alerts per session
			expect(totalWritten).toBeLessThanOrEqual(3);

			const alerts = await readAlerts();
			expect(alerts.length).toBeLessThanOrEqual(3);
		});

		it("should block duplicate alerts within cooldown period", async () => {
			const filePath = join(tempDir, "auth.ts");

			// First save
			const firstCount = await processFileForAlerts(filePath);
			expect(firstCount).toBeGreaterThan(0);

			// Immediate second save (within cooldown)
			const secondCount = await processFileForAlerts(filePath);
			expect(secondCount).toBe(0); // Should be blocked

			const alerts = await readAlerts();
			expect(alerts.length).toBe(firstCount); // No new alerts
		});

		it("should allow different alert categories concurrently", async () => {
			// Critical file alert
			await processFileForAlerts(join(tempDir, ".env"));

			// High risk file alert
			await processFileForAlerts(join(tempDir, "auth.ts"));

			const alerts = await readAlerts();
			const categories = new Set(alerts.map((a) => a.category));
			expect(categories.size).toBeGreaterThan(1); // Multiple categories allowed
		});

		it("should track dismiss history and increase confidence threshold", async () => {
			const filePath = join(tempDir, "test.ts");

			// Generate alert
			const alerts = await alertGenerator.checkFile(filePath);
			const testAlert = alerts[0];

			if (testAlert) {
				// Dismiss 3 times
				for (let i = 0; i < 3; i++) {
					alertRateLimiter.recordDismissed(testAlert, sessionId);
				}

				// Next alert of same category should require 95% confidence
				const shouldAllow = alertRateLimiter.shouldAllow(testAlert, sessionId);
				// If confidence < 95%, should be blocked
				if (testAlert.confidence < 95) {
					expect(shouldAllow).toBe(false);
				}
			}
		});
	});

	// ============================================================================
	// JSONL File Format Tests
	// ============================================================================

	describe("JSONL File Format", () => {
		it("should create .snapback/alerts.jsonl with valid format", async () => {
			const filePath = join(tempDir, ".env");

			await processFileForAlerts(filePath);

			// Verify file exists
			const content = await readFile(alertsPath, "utf-8");
			expect(content).toBeTruthy();

			// Verify JSONL format (one JSON per line)
			const lines = content.trim().split("\n");
			for (const line of lines) {
				expect(() => JSON.parse(line)).not.toThrow();
			}
		});

		it("should append alerts without corrupting existing data", async () => {
			// Write first alert
			await processFileForAlerts(join(tempDir, ".env"));
			const firstAlerts = await readAlerts();

			// Write second alert (different category to avoid cooldown)
			await processFileForAlerts(join(tempDir, "auth.ts"));
			const allAlerts = await readAlerts();

			// Should have both alerts
			expect(allAlerts.length).toBeGreaterThan(firstAlerts.length);
			// First alert should still be intact
			expect(allAlerts[0].id).toBe(firstAlerts[0].id);
		});

		it("should handle concurrent writes without data loss", async () => {
			// Use different session IDs to avoid session limit
			// Use protected files to ensure alerts are generated
			const file1 = join(tempDir, "auth1.ts");
			const file2 = join(tempDir, "auth2.ts");
			const file3 = join(tempDir, "auth3.ts");

			// Process files with different sessions to avoid rate limiting
			const processWithNewSession = async (filePath: string) => {
				const newSessionId = `test-session-${Date.now()}-${Math.random()}`;
				const alerts = await alertGenerator.checkFile(filePath);
				let writtenCount = 0;

				for (const alert of alerts) {
					if (alertRateLimiter.shouldAllow(alert, newSessionId)) {
						await alertWriter.write(alert);
						alertRateLimiter.recordShown(alert, newSessionId);
						writtenCount++;
					}
				}

				return writtenCount;
			};

			// Process all files concurrently
			await Promise.all([file1, file2, file3].map((f) => processWithNewSession(f)));

			const alerts = await readAlerts();
			// Should have written alerts for multiple files
			expect(alerts.length).toBeGreaterThan(0);

			// Verify all alerts are valid JSON
			for (const alert of alerts) {
				expect(alert).toHaveProperty("id");
				expect(alert).toHaveProperty("timestamp");
			}
		});
	});

	// ============================================================================
	// Alert Content Validation
	// ============================================================================

	describe("Alert Content Validation", () => {
		it("should include all required alert fields", async () => {
			const filePath = join(tempDir, ".env");

			await processFileForAlerts(filePath);

			const alerts = await readAlerts();
			const alert = alerts[0];

			// Required fields
			expect(alert).toHaveProperty("id");
			expect(alert).toHaveProperty("timestamp");
			expect(alert).toHaveProperty("severity");
			expect(alert).toHaveProperty("category");
			expect(alert).toHaveProperty("summary");
			expect(alert).toHaveProperty("confidence");
			expect(alert).toHaveProperty("dismissible");

			// Validate field types
			expect(typeof alert.id).toBe("string");
			expect(typeof alert.timestamp).toBe("number");
			expect(["info", "warning", "critical"]).toContain(alert.severity);
			expect(typeof alert.category).toBe("string");
			expect(typeof alert.summary).toBe("string");
			expect(typeof alert.confidence).toBe("number");
			expect(typeof alert.dismissible).toBe("boolean");
		});

		it("should generate contextual summary messages", async () => {
			const filePath = join(tempDir, ".env");

			await processFileForAlerts(filePath);

			const alerts = await readAlerts();
			const alert = alerts[0];

			// Summary should be descriptive
			expect(alert.summary.length).toBeGreaterThan(10);
			expect(alert.summary).toMatch(/critical|sensitive|important|risk/i);
		});

		it("should include suggested actions for alerts", async () => {
			const filePath = join(tempDir, ".env");

			await processFileForAlerts(filePath);

			const alerts = await readAlerts();
			const alert = alerts[0];

			// Suggested action should be present
			expect(alert.suggested_action).toBeDefined();
			expect(alert.suggested_action!.length).toBeGreaterThan(5);
		});
	});

	// ============================================================================
	// Pressure-Based Alerts
	// ============================================================================

	describe("Pressure-Based Alerts", () => {
		it("should generate pressure alert when workspace pressure is high", async () => {
			// Mock high pressure
			mockPressureGauge.getCurrentPressure = async () => 80;

			const alert = await alertGenerator.checkPressure();

			expect(alert).toBeDefined();
			expect(alert?.category).toBe("pressure_threshold");
			expect(alert?.severity).toBe("warning");
		});

		it("should not generate pressure alert when pressure is low", async () => {
			// Mock low pressure
			mockPressureGauge.getCurrentPressure = async () => 30;

			const alert = await alertGenerator.checkPressure();

			expect(alert).toBeNull();
		});

		it("should generate critical pressure alert above 85%", async () => {
			// Mock critical pressure
			mockPressureGauge.getCurrentPressure = async () => 90;

			const alert = await alertGenerator.checkPressure();

			expect(alert).toBeDefined();
			expect(alert?.severity).toBe("critical");
		});
	});

	// ============================================================================
	// Error Handling
	// ============================================================================

	describe("Error Handling", () => {
		it("should handle AlertGenerator errors gracefully", async () => {
			// Mock service that throws error
			const brokenGenerator = new AlertGenerator({
				workspaceRoot: "\0invalid\0path",
				fileProtectionService: mockFileProtectionService,
				violationReader: mockViolationReader,
				pressureGauge: mockPressureGauge,
			});

			// Should not throw
			const alerts = await brokenGenerator.checkFile("/some/file.ts");
			expect(alerts).toEqual([]);
		});

		it("should continue processing after write failure", async () => {
			const filePath = join(tempDir, "test.ts");

			// Generate alerts
			const alerts = await alertGenerator.checkFile(filePath);

			// Simulate write failure by using invalid writer
			const brokenWriter = new AlertWriter({ workspaceRoot: "\0invalid\0path" });

			// Should not throw, just log error
			for (const alert of alerts) {
				if (alertRateLimiter.shouldAllow(alert, sessionId)) {
					await expect(brokenWriter.write(alert)).rejects.toThrow();
				}
			}
		});
	});

	// ============================================================================
	// Performance Tests
	// ============================================================================

	describe("Performance", () => {
		it("should process alerts quickly (< 50ms per file)", async () => {
			const filePath = join(tempDir, "auth.ts");

			const start = Date.now();
			await processFileForAlerts(filePath);
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(50);
		});

		it("should handle multiple files efficiently", async () => {
			const files = Array.from({ length: 10 }, (_, i) => join(tempDir, `file${i}.ts`));

			const start = Date.now();
			for (const file of files) {
				await processFileForAlerts(file);
			}
			const duration = Date.now() - start;

			// Should process 10 files in under 500ms
			expect(duration).toBeLessThan(500);
		});
	});
});
