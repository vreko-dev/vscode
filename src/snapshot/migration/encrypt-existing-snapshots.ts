import * as fs from "node:fs/promises";
import * as path from "node:path";
import { logger } from "../../utils/logger.js";
import { EncryptionService } from "../EncryptionService.js";

/**
 * One-time migration: Encrypt existing plaintext snapshots
 * Run automatically on first launch after update
 */
export async function migrateExistingSnapshots(
	snapshotsDir: string,
): Promise<void> {
	const migrationFlag = path.join(snapshotsDir, ".migration-v1-encrypted");

	// Check if migration already completed
	try {
		await fs.access(migrationFlag);
		logger.info("Snapshot encryption migration already completed");
		return;
	} catch {
		// Migration flag doesn't exist, continue with migration
	}

	// Check if snapshots directory exists
	try {
		const stats = await fs.stat(snapshotsDir);
		if (!stats.isDirectory()) {
			logger.info(
				"Snapshots path exists but is not a directory, skipping encryption migration",
			);
			return;
		}
	} catch (_error) {
		// Snapshots directory doesn't exist, nothing to migrate
		logger.info("No snapshots directory found, skipping encryption migration");
		return;
	}

	logger.info("Starting snapshot encryption migration");
	const encryptionService = new EncryptionService();
	let migrated = 0;
	let failed = 0;

	try {
		// Double-check directory exists before reading
		const snapshotFiles = await fs.readdir(snapshotsDir).catch((error) => {
			logger.warn("Failed to read snapshots directory", {
				snapshotsDir,
				error: error instanceof Error ? error.message : String(error),
			});
			throw error;
		});

		for (const file of snapshotFiles) {
			if (!file.endsWith(".json")) continue;

			try {
				const snapshotPath = path.join(snapshotsDir, file);

				// Read and parse JSON
				const snapshotContent = await fs.readFile(snapshotPath, "utf8");
				const snapshot = JSON.parse(snapshotContent);

				// Check if already encrypted (has 'encrypted' field)
				if (snapshot.files?.[0]?.encrypted) {
					continue; // Skip already encrypted
				}

				// Encrypt each file in snapshot
				if (snapshot.files) {
					for (const snapshotFile of snapshot.files) {
						if (snapshotFile.content) {
							// Old format: plaintext content
							const encrypted = encryptionService.encrypt(snapshotFile.content);
							snapshotFile.encrypted = encrypted;
							delete snapshotFile.content; // Remove plaintext
						}
					}
				}

				// Save encrypted version
				await fs.writeFile(
					snapshotPath,
					JSON.stringify(snapshot, null, 2),
					"utf8",
				);
				migrated++;
			} catch (error) {
				logger.error(`Failed to migrate snapshot ${file}`, error as Error);
				failed++;
			}
		}

		// Mark migration as complete
		await fs.writeFile(migrationFlag, Date.now().toString());

		logger.info("Snapshot encryption migration completed", {
			migrated,
			failed,
		});
	} catch (error) {
		logger.error("Snapshot encryption migration failed", error as Error);
		throw error;
	}
}
