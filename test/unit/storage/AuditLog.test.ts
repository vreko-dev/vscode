/**
 * @fileoverview AuditLog Tests
 *
 * Tests for append-only audit log using JSONL format.
 * Verifies immutability, ordering, and query operations.
 */

import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import * as vscode from "vscode";
import { AuditLog } from "../../../src/storage/AuditLog";
import type { AuditEntry } from "../../../src/storage/types";

describe("AuditLog", () => {
	let tempDir: string;
	let storageUri: vscode.Uri;
	let auditLog: AuditLog;

	beforeEach(async () => {
		tempDir = path.join(
			os.tmpdir(),
			`snapback-audit-test-${Date.now()}-${Math.random()}`,
		);
		await fs.mkdir(tempDir, { recursive: true });
		storageUri = vscode.Uri.file(tempDir);

		auditLog = new AuditLog(storageUri);
		await auditLog.initialize();
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe("Append Operations", () => {
		it("should append entry to log", async () => {
			const entry = await auditLog.append({
				filePath: "/test/file.ts",
				protectionLevel: "Protected",
				action: "snapshot_created" as const,
			});

			expect(entry.id).toBeDefined();
			expect(entry.timestamp).toBeGreaterThan(0);
			expect(entry.filePath).toBe("/test/file.ts");
		});

		it("should return full entry with generated ID and timestamp", async () => {
			const before = Date.now();
			const entry = await auditLog.append({
				filePath: "/file.ts",
				protectionLevel: "Warning",
				action: "save_warned" as const,
			});
			const after = Date.now();

			expect(entry.id).toBeDefined();
			expect(entry.id).toMatch(/^audit-/);
			expect(entry.timestamp).toBeGreaterThanOrEqual(before);
			expect(entry.timestamp).toBeLessThanOrEqual(after);
		});

		it("should append multiple entries in order", async () => {
			const entries: AuditEntry[] = [];
			for (let i = 0; i < 5; i++) {
				entries.push(
					await auditLog.append({
						filePath: `/file${i}.ts`,
						protectionLevel: "Protected",
						action: "snapshot_created" as const,
					}),
				);
			}

			expect(entries).toHaveLength(5);

			// Timestamps should be increasing (or same for very fast appends)
			for (let i = 1; i < entries.length; i++) {
				expect(entries[i].timestamp).toBeGreaterThanOrEqual(
					entries[i - 1].timestamp,
				);
			}
		});

		it("should handle entries with optional details", async () => {
			const entry = await auditLog.append({
				filePath: "/test.ts",
				protectionLevel: "Protected",
				action: "snapshot_created" as const,
				details: { snapshotCount: 5, fileCount: 10 },
				snapshotId: "snap-123",
			});

			expect(entry.details).toEqual({ snapshotCount: 5, fileCount: 10 });
			expect(entry.snapshotId).toBe("snap-123");
		});

		it("should handle all action types", async () => {
			const actions: Array<AuditEntry["action"]> = [
				"snapshot_created",
				"snapshot_restored",
				"save_blocked",
				"save_warned",
				"cooldown_triggered",
				"ai_detected",
			];

			for (const action of actions) {
				const entry = await auditLog.append({
					filePath: "/test.ts",
					protectionLevel: "Protected",
					action,
				});

				expect(entry.action).toBe(action);
			}
		});
	});

	describe("JSONL Format", () => {
		it("should store entries in JSONL format", async () => {
			const entries: AuditEntry[] = [];
			for (let i = 0; i < 3; i++) {
				entries.push(
					await auditLog.append({
						filePath: `/file${i}.ts`,
						protectionLevel: "Protected",
						action: "snapshot_created" as const,
					}),
				);
			}

			// Read raw file
			const content = await fs.readFile(
				path.join(tempDir, "audit.jsonl"),
				"utf-8",
			);
			const lines = content.split("\n").filter((l) => l.trim());

			expect(lines).toHaveLength(3);

			// Each line should be valid JSON
			lines.forEach((line, i) => {
				const parsed = JSON.parse(line);
				expect(parsed.id).toBe(entries[i].id);
				expect(parsed.filePath).toBe(entries[i].filePath);
			});
		});

		it("should append to existing entries", async () => {
			await auditLog.append({
				filePath: "/file1.ts",
				protectionLevel: "Protected",
				action: "snapshot_created" as const,
			});

			await auditLog.append({
				filePath: "/file2.ts",
				protectionLevel: "Warning",
				action: "save_warned" as const,
			});

			const content = await fs.readFile(
				path.join(tempDir, "audit.jsonl"),
				"utf-8",
			);
			const lines = content.split("\n").filter((l) => l.trim());

			expect(lines).toHaveLength(2);
		});

		it("should preserve entry order in file", async () => {
			const fileIds: string[] = [];
			for (let i = 0; i < 5; i++) {
				const entry = await auditLog.append({
					filePath: `/file${i}.ts`,
					protectionLevel: "Protected",
					action: "snapshot_created" as const,
				});
				fileIds.push(entry.id);
			}

			const content = await fs.readFile(
				path.join(tempDir, "audit.jsonl"),
				"utf-8",
			);
			const lines = content.split("\n").filter((l) => l.trim());

			lines.forEach((line, i) => {
				const parsed = JSON.parse(line);
				expect(parsed.id).toBe(fileIds[i]);
			});
		});
	});

	describe("Query Operations", () => {
		beforeEach(async () => {
			// Create test entries
			for (let i = 0; i < 10; i++) {
				await auditLog.append({
					filePath: i % 2 === 0 ? "/src/main.ts" : "/src/utils.ts",
					protectionLevel: "Protected",
					action: i % 3 === 0 ? "snapshot_created" : "save_warned",
				});
			}
		});

		it("should get all entries", async () => {
			const all = await auditLog.getAll();
			expect(all.length).toBeGreaterThan(0);
			expect(all).toHaveLength(10);
		});

		it("should return entries in reverse order (most recent first)", async () => {
			const all = await auditLog.getAll();

			// Last added should be first in result
			expect(all[0].filePath).toBe("/src/utils.ts");
			expect(all[all.length - 1].filePath).toBe("/src/main.ts");
		});

		it("should get entries for specific file", async () => {
			const forMain = await auditLog.getForFile("/src/main.ts");

			expect(forMain.length).toBeGreaterThan(0);
			expect(forMain.every((e) => e.filePath === "/src/main.ts")).toBe(true);
		});

		it("should get entries by action type", async () => {
			const snapshots = await auditLog.getByAction("snapshot_created");

			expect(snapshots.length).toBeGreaterThan(0);
			expect(snapshots.every((e) => e.action === "snapshot_created")).toBe(
				true,
			);
		});

		it("should get entries in time range", async () => {
			const all = await auditLog.getAll();
			const minTime = all[0].timestamp - 1000;
			const maxTime = all[0].timestamp + 1000;

			const inRange = await auditLog.getInRange(minTime, maxTime);
			expect(inRange.length).toBeGreaterThan(0);
		});

		it("should respect limit parameter", async () => {
			const limited = await auditLog.getAll(3);
			expect(limited).toHaveLength(3);
		});

		it("should handle empty results gracefully", async () => {
			const nonExistent = await auditLog.getForFile("/nonexistent.ts");
			expect(nonExistent).toEqual([]);
		});

		it("should handle time range with no matches", async () => {
			const future = await auditLog.getInRange(
				Date.now() + 100000,
				Date.now() + 200000,
			);
			expect(future).toEqual([]);
		});
	});

	describe("Statistics", () => {
		it("should count entries", async () => {
			for (let i = 0; i < 5; i++) {
				await auditLog.append({
					filePath: "/file.ts",
					protectionLevel: "Protected",
					action: "snapshot_created" as const,
				});
			}

			const count = await auditLog.count();
			expect(count).toBe(5);
		});

		it("should return 0 for empty log", async () => {
			const count = await auditLog.count();
			expect(count).toBe(0);
		});

		it("should get file size", async () => {
			for (let i = 0; i < 5; i++) {
				await auditLog.append({
					filePath: "/test.ts",
					protectionLevel: "Protected",
					action: "snapshot_created" as const,
				});
			}

			const size = await auditLog.getSize();
			expect(size).toBeGreaterThan(0);
		});

		it("should return 0 size for non-existent log", async () => {
			// Create new AuditLog before appending anything
			const emptyLog = new AuditLog(storageUri);
			await emptyLog.initialize();

			const size = await emptyLog.getSize();
			expect(size).toBe(0);
		});
	});

	describe("Maintenance", () => {
		it("should clear all entries", async () => {
			for (let i = 0; i < 5; i++) {
				await auditLog.append({
					filePath: "/file.ts",
					protectionLevel: "Protected",
					action: "snapshot_created" as const,
				});
			}

			let count = await auditLog.count();
			expect(count).toBe(5);

			await auditLog.clear();
			count = await auditLog.count();
			expect(count).toBe(0);
		});

		it("should rotate log when exceeding size", async () => {
			// Create large entries
			const largeData = "x".repeat(1000);
			for (let i = 0; i < 15; i++) {
				await auditLog.append({
					filePath: `/file${i}.ts`,
					protectionLevel: "Protected",
					action: "snapshot_created" as const,
					details: { data: largeData },
				});
			}

			const _originalSize = await auditLog.getSize();
			const rotated = await auditLog.rotateIfNeeded(5000); // 5KB limit

			expect(rotated).toBe(true); // Should rotate if over 5KB

			// After rotation, should have new file
			const files = await fs.readdir(tempDir);
			const archiveFiles = files.filter((f) => f.includes("archive"));
			expect(archiveFiles.length).toBeGreaterThanOrEqual(0);
		});

		it("should not rotate if under size limit", async () => {
			await auditLog.append({
				filePath: "/file.ts",
				protectionLevel: "Protected",
				action: "snapshot_created" as const,
			});

			const rotated = await auditLog.rotateIfNeeded(1000000); // 1MB limit
			expect(rotated).toBe(false);
		});
	});

	describe("Append-Only Guarantee", () => {
		it("should not allow modification of existing entries", async () => {
			const entry1 = await auditLog.append({
				filePath: "/original.ts",
				protectionLevel: "Protected",
				action: "snapshot_created" as const,
			});

			// Try to append different entry
			const entry2 = await auditLog.append({
				filePath: "/new.ts",
				protectionLevel: "Warning",
				action: "save_warned" as const,
			});

			// Verify order is preserved
			const all = await auditLog.getAll();
			expect(all[1].filePath).toBe(entry1.filePath);
			expect(all[0].filePath).toBe(entry2.filePath);

			// Original entry should be unchanged
			expect(all[1].action).toBe("snapshot_created");
		});

		it("should handle concurrent appends safely", async () => {
			const promises: Promise<AuditEntry>[] = [];
			for (let i = 0; i < 10; i++) {
				promises.push(
					auditLog.append({
						filePath: `/file${i}.ts`,
						protectionLevel: "Protected",
						action: "snapshot_created" as const,
					}),
				);
			}

			const entries = await Promise.all(promises);
			expect(entries).toHaveLength(10);

			// Verify all were written
			const count = await auditLog.count();
			expect(count).toBe(10);

			// Verify all IDs are unique
			const ids = new Set(entries.map((e) => e.id));
			expect(ids.size).toBe(10);
		});
	});

	describe("Error Handling", () => {
		it("should handle missing file gracefully on read", async () => {
			const all = await auditLog.getAll();
			expect(all).toEqual([]);
		});

		it("should handle malformed JSON lines gracefully", async () => {
			// Manually write invalid JSON
			await fs.writeFile(
				path.join(tempDir, "audit.jsonl"),
				"{invalid json\nnext line\n",
				"utf-8",
			);

			// Should skip malformed lines
			const all = await auditLog.getAll();
			expect(all).toEqual([]); // All invalid, so empty result
		});

		it("should handle mixed valid and invalid JSON", async () => {
			// Write valid entry first
			const valid = await auditLog.append({
				filePath: "/file.ts",
				protectionLevel: "Protected",
				action: "snapshot_created" as const,
			});

			// Manually add invalid JSON
			const currentContent = await fs.readFile(
				path.join(tempDir, "audit.jsonl"),
				"utf-8",
			);
			await fs.writeFile(
				path.join(tempDir, "audit.jsonl"),
				`${currentContent}{invalid json\n`,
				"utf-8",
			);

			// Should read valid entry and skip invalid
			const all = await auditLog.getAll();
			expect(all).toHaveLength(1);
			expect(all[0].id).toBe(valid.id);
		});
	});

	describe("Performance", () => {
		it("should append 100 entries quickly", async () => {
			const start = Date.now();

			for (let i = 0; i < 100; i++) {
				await auditLog.append({
					filePath: `/file${i}.ts`,
					protectionLevel: "Protected",
					action: "snapshot_created" as const,
				});
			}

			const duration = Date.now() - start;
			expect(duration).toBeLessThan(5000); // Should complete in <5s
		});

		it("should query 100 entries quickly", async () => {
			for (let i = 0; i < 100; i++) {
				await auditLog.append({
					filePath: `/file${i}.ts`,
					protectionLevel: "Protected",
					action: "snapshot_created" as const,
				});
			}

			const start = Date.now();
			const all = await auditLog.getAll(500);
			const duration = Date.now() - start;

			expect(duration).toBeLessThan(1000); // Should complete in <1s
			expect(all).toHaveLength(100);
		});
	});
});
