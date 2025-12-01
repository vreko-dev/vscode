import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { CooldownManager } from "../../src/services/cooldownManager.js";
import type { ProtectionLevel } from "../../src/views/types.js";

describe("CooldownManager", () => {
	let cooldownManager: CooldownManager;
	let dbPath: string;

	beforeEach(async () => {
		// Create a temporary database file for testing
		dbPath = path.join(
			os.tmpdir(),
			`snapback_test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.db`,
		);
		cooldownManager = new CooldownManager(dbPath);
		await cooldownManager.initialize();
	});

	afterEach(async () => {
		// Clean up the temporary database file
		await cooldownManager.close();
		if (fs.existsSync(dbPath)) {
			fs.unlinkSync(dbPath);
		}
	});

	describe("setCooldown and isInCooldown", () => {
		it("should set and check cooldown correctly", async () => {
			const filePath = "/test/file.ts";
			const protectionLevel: ProtectionLevel = "Warning";
			const actionTaken = "snapshot_created" as const;

			// Initially, the file should not be in cooldown
			let inCooldown = await cooldownManager.isInCooldown(
				filePath,
				protectionLevel,
			);
			expect(inCooldown).toBe(false);

			// Set a cooldown
			await cooldownManager.setCooldown(filePath, protectionLevel, actionTaken);

			// Now the file should be in cooldown
			inCooldown = await cooldownManager.isInCooldown(
				filePath,
				protectionLevel,
			);
			expect(inCooldown).toBe(true);
		});

		it("should respect cooldown expiration", async () => {
			const filePath = "/test/file.ts";
			const protectionLevel: ProtectionLevel = "Protected";
			const actionTaken = "save_blocked" as const;
			const customDuration = 100; // 100ms cooldown

			// Set a short cooldown
			await cooldownManager.setCooldown(
				filePath,
				protectionLevel,
				actionTaken,
				undefined,
				customDuration,
			);

			// The file should be in cooldown immediately
			let inCooldown = await cooldownManager.isInCooldown(
				filePath,
				protectionLevel,
			);
			expect(inCooldown).toBe(true);

			// Wait for cooldown to expire
			await new Promise((resolve) => setTimeout(resolve, customDuration + 10));

			// The file should no longer be in cooldown
			inCooldown = await cooldownManager.isInCooldown(
				filePath,
				protectionLevel,
			);
			expect(inCooldown).toBe(false);
		});

		it("should handle different protection levels separately", async () => {
			const filePath = "/test/file.ts";
			const actionTaken = "snapshot_created" as const;
			const customDuration = 1000; // 1 second cooldown

			// Set cooldown for Warning level
			await cooldownManager.setCooldown(
				filePath,
				"Warning",
				actionTaken,
				undefined,
				customDuration,
			);

			// Warning level should be in cooldown
			let inCooldown = await cooldownManager.isInCooldown(filePath, "Warning");
			expect(inCooldown).toBe(true);

			// Protected level should not be in cooldown
			inCooldown = await cooldownManager.isInCooldown(filePath, "Protected");
			expect(inCooldown).toBe(false);
		});
	});

	describe("recordAudit and getAuditTrail", () => {
		it("should record and retrieve audit entries", async () => {
			const filePath = "/test/file.ts";
			const protectionLevel: ProtectionLevel = "Warning";
			const action = "snapshot_created" as const;
			const details = { reason: "test", testId: "audit-1" };
			const snapshotId = "snapshot-123";

			// Record an audit entry
			await cooldownManager.recordAudit(
				filePath,
				protectionLevel,
				action,
				details,
				snapshotId,
			);

			// Retrieve the audit trail
			const auditTrail = await cooldownManager.getAuditTrail(filePath, 10);

			// Should have one entry
			expect(auditTrail).toHaveLength(1);

			// Check the entry details
			const entry = auditTrail[0];
			expect(entry.filePath).toBe(filePath);
			expect(entry.protectionLevel).toBe(protectionLevel);
			expect(entry.action).toBe(action);
			expect(entry.details).toEqual(details);
			expect(entry.snapshotId).toBe(snapshotId);
			expect(entry.timestamp).toBeGreaterThan(0);
		});

		it("should return empty array for files with no audit entries", async () => {
			const filePath = "/nonexistent/file.ts";

			// Retrieve the audit trail for a file with no entries
			const auditTrail = await cooldownManager.getAuditTrail(filePath, 10);

			// Should be empty
			expect(auditTrail).toHaveLength(0);
		});

		it("should limit the number of audit entries returned", async () => {
			const filePath = "/test/file.ts";
			const protectionLevel: ProtectionLevel = "Warning";
			const action = "save_attempt" as const;

			// Record multiple audit entries
			for (let i = 0; i < 5; i++) {
				await cooldownManager.recordAudit(filePath, protectionLevel, action, {
					testId: `audit-${i}`,
				});
			}

			// Retrieve only 3 entries
			const auditTrail = await cooldownManager.getAuditTrail(filePath, 3);

			// Should have only 3 entries
			expect(auditTrail).toHaveLength(3);
		});
	});

	describe("clearExpiredCooldowns", () => {
		it("should clear expired cooldowns", async () => {
			const filePath1 = "/test/file1.ts";
			const filePath2 = "/test/file2.ts";
			const protectionLevel: ProtectionLevel = "Warning";
			const actionTaken = "snapshot_created" as const;
			const shortDuration = 50; // 50ms
			const longDuration = 5000; // 5 seconds

			// Set a short cooldown that will expire
			await cooldownManager.setCooldown(
				filePath1,
				protectionLevel,
				actionTaken,
				undefined,
				shortDuration,
			);

			// Set a long cooldown that won't expire
			await cooldownManager.setCooldown(
				filePath2,
				protectionLevel,
				actionTaken,
				undefined,
				longDuration,
			);

			// Both files should be in cooldown
			let inCooldown1 = await cooldownManager.isInCooldown(
				filePath1,
				protectionLevel,
			);
			let inCooldown2 = await cooldownManager.isInCooldown(
				filePath2,
				protectionLevel,
			);
			expect(inCooldown1).toBe(true);
			expect(inCooldown2).toBe(true);

			// Wait for the first cooldown to expire
			await new Promise((resolve) => setTimeout(resolve, shortDuration + 10));

			// Clear expired cooldowns
			await cooldownManager.clearExpiredCooldowns();

			// First file should no longer be in cooldown
			inCooldown1 = await cooldownManager.isInCooldown(
				filePath1,
				protectionLevel,
			);
			expect(inCooldown1).toBe(false);

			// Second file should still be in cooldown
			inCooldown2 = await cooldownManager.isInCooldown(
				filePath2,
				protectionLevel,
			);
			expect(inCooldown2).toBe(true);
		});
	});
});
