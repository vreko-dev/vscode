/**
 * AlertWriter Tests (RED phase)
 *
 * Comprehensive test suite for AlertWriter following TDD methodology.
 * Tests cover: basic writes, concurrency, filesystem operations, error handling,
 * data integrity, and performance.
 *
 * @module test/unit/services/AlertWriter
 */

import { mkdir, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AlertWriter, type ProactiveAlert } from "../../../src/services/AlertWriter";

describe("AlertWriter", () => {
	let tempDir: string;
	let writer: AlertWriter;
	let alertsPath: string;

	beforeEach(async () => {
		// Create temporary directory for testing
		tempDir = await mkdtemp(join(tmpdir(), "alert-writer-test-"));
		writer = new AlertWriter({ workspaceRoot: tempDir });
		alertsPath = join(tempDir, ".vreko", "alerts.jsonl");
	});

	afterEach(async () => {
		// Clean up temporary directory
		await rm(tempDir, { recursive: true, force: true });
	});

	/**
	 * Helper to create test alert
	 */
	const createAlert = (overrides: Partial<ProactiveAlert> = {}): ProactiveAlert => ({
		id: `alert-${Date.now()}-${Math.random()}`,
		timestamp: Date.now(),
		severity: "warning",
		category: "high_risk_file",
		summary: "Test alert summary",
		confidence: 90,
		dismissible: true,
		...overrides,
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
				.map((line) => JSON.parse(line) as ProactiveAlert);
		} catch {
			return [];
		}
	};

	// ============================================================================
	// CATEGORY 1: Basic Write Operations
	// ============================================================================

	describe("Basic Write Operations", () => {
		it("should create alerts.jsonl file on first write", async () => {
			const alert = createAlert();

			await writer.write(alert);

			const alerts = await readAlerts();
			expect(alerts).toHaveLength(1);
			expect(alerts[0].id).toBe(alert.id);
		});

		it("should append alert in JSONL format", async () => {
			const alert = createAlert({ summary: "First alert" });

			await writer.write(alert);

			const content = await readFile(alertsPath, "utf-8");
			const lines = content.trim().split("\n");
			expect(lines).toHaveLength(1);
			expect(() => JSON.parse(lines[0])).not.toThrow();
		});

		it("should write multiple alerts sequentially", async () => {
			const alert1 = createAlert({ summary: "Alert 1" });
			const alert2 = createAlert({ summary: "Alert 2" });
			const alert3 = createAlert({ summary: "Alert 3" });

			await writer.write(alert1);
			await writer.write(alert2);
			await writer.write(alert3);

			const alerts = await readAlerts();
			expect(alerts).toHaveLength(3);
			expect(alerts[0].summary).toBe("Alert 1");
			expect(alerts[1].summary).toBe("Alert 2");
			expect(alerts[2].summary).toBe("Alert 3");
		});

		it("should include all alert fields in output", async () => {
			const alert = createAlert({
				severity: "critical",
				category: "critical_file_touch",
				summary: "Critical file modified",
				details: "Detailed information here",
				suggested_action: "Review changes",
				learning_id: "learning-123",
				confidence: 95,
				dismissible: false,
			});

			await writer.write(alert);

			const alerts = await readAlerts();
			expect(alerts[0]).toMatchObject({
				severity: "critical",
				category: "critical_file_touch",
				summary: "Critical file modified",
				details: "Detailed information here",
				suggested_action: "Review changes",
				learning_id: "learning-123",
				confidence: 95,
				dismissible: false,
			});
		});

		it("should add newline after each alert", async () => {
			const alert1 = createAlert();
			const alert2 = createAlert();

			await writer.write(alert1);
			await writer.write(alert2);

			const content = await readFile(alertsPath, "utf-8");
			// Each alert should end with newline
			expect(content.endsWith("\n")).toBe(true);
			// Should have exactly 2 lines
			expect(content.trim().split("\n")).toHaveLength(2);
		});

		it("should handle empty alert properties gracefully", async () => {
			const alert = createAlert({
				details: undefined,
				suggested_action: undefined,
				learning_id: undefined,
			});

			await writer.write(alert);

			const alerts = await readAlerts();
			expect(alerts).toHaveLength(1);
			expect(alerts[0].id).toBe(alert.id);
		});
	});

	// ============================================================================
	// CATEGORY 2: Concurrency & Race Conditions
	// ============================================================================

	describe("Concurrency & Race Conditions", () => {
		it("should queue concurrent writes to same file", async () => {
			const alert1 = createAlert({ summary: "Concurrent 1" });
			const alert2 = createAlert({ summary: "Concurrent 2" });
			const alert3 = createAlert({ summary: "Concurrent 3" });

			// Write all three concurrently
			await Promise.all([writer.write(alert1), writer.write(alert2), writer.write(alert3)]);

			const alerts = await readAlerts();
			expect(alerts).toHaveLength(3);
		});

		it("should not interleave alert data during concurrent writes", async () => {
			const alerts = Array.from({ length: 10 }, (_, i) =>
				createAlert({ summary: `Alert ${i}`, confidence: 80 + i }),
			);

			// Write all concurrently
			await Promise.all(alerts.map((alert) => writer.write(alert)));

			const written = await readAlerts();
			expect(written).toHaveLength(10);
			// Verify each alert is complete and valid
			for (const alert of written) {
				expect(alert).toHaveProperty("id");
				expect(alert).toHaveProperty("timestamp");
				expect(alert).toHaveProperty("summary");
				expect(alert.summary).toMatch(/^Alert \d+$/);
			}
		});

		it("should maintain write order when called rapidly", async () => {
			const alerts = Array.from({ length: 5 }, (_, i) => createAlert({ summary: `Order ${i}` }));

			// Write sequentially but rapidly
			for (const alert of alerts) {
				void writer.write(alert); // Don't await - fire and forget
			}

			// Wait for all writes to complete
			await new Promise((resolve) => setTimeout(resolve, 100));

			const written = await readAlerts();
			expect(written).toHaveLength(5);
		});

		it("should handle write queue cleanup after completion", async () => {
			const alert = createAlert();

			await writer.write(alert);

			// Queue should be cleaned up after write completes
			// We can't directly test internal queue, but we can verify
			// subsequent writes still work correctly
			const alert2 = createAlert();
			await writer.write(alert2);

			const alerts = await readAlerts();
			expect(alerts).toHaveLength(2);
		});
	});

	// ============================================================================
	// CATEGORY 3: File System Operations
	// ============================================================================

	describe("File System Operations", () => {
		it("should create .vreko directory if not exists", async () => {
			const alert = createAlert();

			await writer.write(alert);

			// Verify .vreko directory was created
			const alerts = await readAlerts();
			expect(alerts).toHaveLength(1);
		});

		it("should create alerts.jsonl if not exists", async () => {
			const alert = createAlert();

			await writer.write(alert);

			const content = await readFile(alertsPath, "utf-8");
			expect(content).toBeTruthy();
		});

		it("should append to existing alerts.jsonl file", async () => {
			// Create file with initial content
			await mkdir(join(tempDir, ".vreko"), { recursive: true });
			await writer.write(createAlert({ summary: "Initial" }));

			// Append new alert
			await writer.write(createAlert({ summary: "Appended" }));

			const alerts = await readAlerts();
			expect(alerts).toHaveLength(2);
			expect(alerts[0].summary).toBe("Initial");
			expect(alerts[1].summary).toBe("Appended");
		});

		it("should handle nested directory creation", async () => {
			// Workspace root doesn't exist yet
			const nestedPath = join(tempDir, "deep", "nested", "path");
			await mkdir(nestedPath, { recursive: true });

			const nestedWriter = new AlertWriter({ workspaceRoot: nestedPath });
			const alert = createAlert();

			await nestedWriter.write(alert);

			const nestedAlertPath = join(nestedPath, ".vreko", "alerts.jsonl");
			const content = await readFile(nestedAlertPath, "utf-8");
			expect(content).toBeTruthy();
		});
	});

	// ============================================================================
	// CATEGORY 4: Error Handling
	// ============================================================================

	describe("Error Handling", () => {
		it("should throw error on invalid workspace root", async () => {
			const invalidWriter = new AlertWriter({ workspaceRoot: "\0invalid\0path" });
			const alert = createAlert();

			await expect(invalidWriter.write(alert)).rejects.toThrow();
		});

		it("should reject with error if directory creation fails", async () => {
			// Create a file where directory should be
			const blockedPath = join(tempDir, ".vreko");
			await mkdir(tempDir, { recursive: true });
			// Create .vreko as a file instead of directory
			await readFile(__filename).then((content) =>
				require("fs/promises").writeFile(blockedPath, content),
			);

			const alert = createAlert();

			await expect(writer.write(alert)).rejects.toThrow();
		});

		it("should handle special characters in alert text", async () => {
			const alert = createAlert({
				summary: 'Special chars: "quotes", \'apostrophes\', \n newlines, \t tabs, 🚀 emoji',
				details: "Unicode: 日本語, العربية, Ελληνικά",
			});

			await writer.write(alert);

			const alerts = await readAlerts();
			expect(alerts[0].summary).toContain("🚀");
			expect(alerts[0].details).toContain("日本語");
		});
	});

	// ============================================================================
	// CATEGORY 5: Data Integrity
	// ============================================================================

	describe("Data Integrity", () => {
		it("should write valid JSON per line", async () => {
			await writer.write(createAlert({ summary: "Line 1" }));
			await writer.write(createAlert({ summary: "Line 2" }));
			await writer.write(createAlert({ summary: "Line 3" }));

			const content = await readFile(alertsPath, "utf-8");
			const lines = content.trim().split("\n");

			expect(lines).toHaveLength(3);
			for (const line of lines) {
				expect(() => JSON.parse(line)).not.toThrow();
			}
		});

		it("should not corrupt existing alerts on new write", async () => {
			// Write initial alerts
			const initial = [createAlert({ summary: "A" }), createAlert({ summary: "B" }), createAlert({ summary: "C" })];

			for (const alert of initial) {
				await writer.write(alert);
			}

			// Write additional alert
			await writer.write(createAlert({ summary: "D" }));

			const alerts = await readAlerts();
			expect(alerts).toHaveLength(4);
			expect(alerts[0].summary).toBe("A");
			expect(alerts[1].summary).toBe("B");
			expect(alerts[2].summary).toBe("C");
			expect(alerts[3].summary).toBe("D");
		});

		it("should preserve alert metadata accurately", async () => {
			const timestamp = 1234567890123;
			const alert = createAlert({
				timestamp,
				confidence: 87,
				dismissible: false,
			});

			await writer.write(alert);

			const alerts = await readAlerts();
			expect(alerts[0].timestamp).toBe(timestamp);
			expect(alerts[0].confidence).toBe(87);
			expect(alerts[0].dismissible).toBe(false);
		});
	});

	// ============================================================================
	// CATEGORY 6: Performance
	// ============================================================================

	describe("Performance", () => {
		it("should write 100 alerts without memory issues", async () => {
			const alerts = Array.from({ length: 100 }, (_, i) => createAlert({ summary: `Perf test ${i}` }));

			const startTime = Date.now();

			for (const alert of alerts) {
				await writer.write(alert);
			}

			const duration = Date.now() - startTime;

			const written = await readAlerts();
			expect(written).toHaveLength(100);
			// Should complete in reasonable time (< 5 seconds)
			expect(duration).toBeLessThan(5000);
		});

		it("should maintain consistent latency across writes", async () => {
			const latencies: number[] = [];

			for (let i = 0; i < 10; i++) {
				const alert = createAlert({ summary: `Latency test ${i}` });
				const start = Date.now();
				await writer.write(alert);
				latencies.push(Date.now() - start);
			}

			// Calculate average and max latency
			const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
			const maxLatency = Math.max(...latencies);

			// Average should be low (< 50ms)
			expect(avgLatency).toBeLessThan(50);
			// Max shouldn't be excessive (< 100ms)
			expect(maxLatency).toBeLessThan(100);
		});
	});
});
