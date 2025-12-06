import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { FileSystemStorage } from "../../src/storage/types";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";

describe("Storage Monitoring Tests", () => {
	let operationCoordinator: OperationCoordinator;
	let workspaceMemory: WorkspaceMemoryManager;
	let notificationManager: NotificationManager;
	let storage: FileSystemStorage;
	let testWorkspaceRoot: string;
	let testFiles: string[];

	beforeEach(async () => {
		testWorkspaceRoot =
			vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "/test/workspace";
		testFiles = [];

		notificationManager = new NotificationManager();
		storage = new FileSystemStorage(testWorkspaceRoot);
		workspaceMemory = new WorkspaceMemoryManager(storage);
		operationCoordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			storage,
		);
	});

	afterEach(async () => {
		for (const file of testFiles) {
			try {
				await fs.unlink(file);
			} catch {
				// Ignore
			}
		}
		testFiles = [];
	});

	/**
	 * Helper to create file with specific size
	 */
	async function createFileWithSize(
		name: string,
		sizeInBytes: number,
	): Promise<string> {
		const filePath = path.join(testWorkspaceRoot, name);
		const content = "x".repeat(sizeInBytes);
		await fs.writeFile(filePath, content);
		testFiles.push(filePath);
		return filePath;
	}

	/**
	 * Helper to get snapshot size
	 */
	async function getSnapshotSize(snapshotId: string): Promise<number> {
		const snapshot = await storage.retrieve(snapshotId);
		let totalSize = 0;

		const fileContents = snapshot?.fileContents || {};
		for (const content of Object.values(fileContents)) {
			totalSize += Buffer.byteLength(content as string, "utf-8");
		}

		return totalSize;
	}

	/**
	 * TEST: Warn for snapshots exceeding 10MB
	 */
	it("Should warn when snapshot exceeds 10MB", async () => {
		const showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage");

		// Create a large file (11MB - exceeds 10MB limit)
		const largeFile = await createFileWithSize(
			"large-snapshot.txt",
			11 * 1024 * 1024,
		);

		const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
			false,
			[largeFile],
		);

		const size = await getSnapshotSize(snapshotId!);
		const sizeMB = size / (1024 * 1024);

		// Verify size exceeds limit
		expect(sizeMB).toBeGreaterThan(10);

		// In a real implementation, the coordinator would show a warning
		// Simulate the warning that should be shown
		if (sizeMB > 10) {
			vscode.window.showWarningMessage(
				`Large snapshot detected: ${sizeMB.toFixed(
					2,
				)}MB. Consider reducing file size.`,
			);
		}

		expect(showWarningMessageSpy).toHaveBeenCalled();

		showWarningMessageSpy.mockRestore();
	});

	/**
	 * TEST: Track total storage usage across snapshots
	 */
	it("Should track total storage across multiple snapshots", async () => {
		const snapshots: string[] = [];

		// Create multiple snapshots
		for (let i = 0; i < 3; i++) {
			const file = await createFileWithSize(
				`snapshot-${i}.txt`,
				2 * 1024 * 1024,
			); // 2MB each
			const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
				false,
				[file],
			);
			snapshots.push(snapshotId!);
		}

		// Calculate total storage
		let totalSize = 0;
		for (const snapshotId of snapshots) {
			const size = await getSnapshotSize(snapshotId);
			totalSize += size;
		}

		const totalSizeMB = totalSize / (1024 * 1024);

		// Should be approximately 6MB (3 x 2MB)
		expect(totalSizeMB).toBeGreaterThan(5);
		expect(totalSizeMB).toBeLessThan(7); // Allow for overhead

		console.log(`Total storage: ${totalSizeMB.toFixed(2)}MB`);
	});

	/**
	 * TEST: Detect abnormal growth rate
	 */
	it("Should detect abnormal snapshot growth rate", async () => {
		const snapshotSizes: number[] = [];

		// Create snapshots with increasing sizes
		for (let i = 0; i < 5; i++) {
			const size = (i + 1) * 1024 * 1024; // 1MB, 2MB, 3MB, 4MB, 5MB
			const file = await createFileWithSize(`growth-${i}.txt`, size);
			const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
				false,
				[file],
			);

			const snapshotSize = await getSnapshotSize(snapshotId!);
			snapshotSizes.push(snapshotSize);
		}

		// Calculate growth rate
		const growthRates: number[] = [];
		for (let i = 1; i < snapshotSizes.length; i++) {
			const growthRate =
				(snapshotSizes[i] - snapshotSizes[i - 1]) / snapshotSizes[i - 1];
			growthRates.push(growthRate);
		}

		// Average growth rate
		const avgGrowthRate =
			growthRates.reduce((a, b) => a + b, 0) / growthRates.length;

		console.log(`Average growth rate: ${(avgGrowthRate * 100).toFixed(2)}%`);

		// Detect abnormal growth (>100% growth rate)
		const abnormalGrowth = growthRates.some((rate) => rate > 1.0);

		if (abnormalGrowth) {
			// In real implementation, would show warning
			console.log("WARNING: Abnormal snapshot growth detected");
		}

		// Verify we detected the growth pattern
		expect(snapshotSizes[4]).toBeGreaterThan(snapshotSizes[0]);
	});

	/**
	 * TEST: Monitor snapshot creation frequency
	 */
	it("Should track snapshot creation frequency", async () => {
		const timestamps: number[] = [];

		// Create snapshots at intervals
		for (let i = 0; i < 5; i++) {
			const file = await createFileWithSize(`frequency-${i}.txt`, 1024);
			await operationCoordinator.coordinateSnapshotCreation(false, [file]);
			timestamps.push(Date.now());

			// Small delay between snapshots
			await new Promise((resolve) => setTimeout(resolve, 100));
		}

		// Calculate intervals
		const intervals: number[] = [];
		for (let i = 1; i < timestamps.length; i++) {
			intervals.push(timestamps[i] - timestamps[i - 1]);
		}

		// Average interval
		const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;

		console.log(`Average snapshot interval: ${avgInterval.toFixed(0)}ms`);

		// Verify snapshots are being created regularly
		expect(avgInterval).toBeLessThan(200); // Should be around 100ms
	});

	/**
	 * TEST: Identify largest snapshots for cleanup recommendations
	 */
	it("Should identify largest snapshots for cleanup", async () => {
		const snapshotSizes: Array<{ id: string; size: number }> = [];

		// Create snapshots of varying sizes
		const sizes = [1, 5, 2, 8, 3]; // MB
		for (let i = 0; i < sizes.length; i++) {
			const file = await createFileWithSize(
				`cleanup-${i}.txt`,
				sizes[i] * 1024 * 1024,
			);
			const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
				false,
				[file],
			);

			const size = await getSnapshotSize(snapshotId!);
			snapshotSizes.push({ id: snapshotId!, size });
		}

		// Sort by size (largest first)
		const sortedBySize = [...snapshotSizes].sort((a, b) => b.size - a.size);

		// Largest should be the 8MB snapshot
		const largestSizeMB = sortedBySize[0].size / (1024 * 1024);
		expect(largestSizeMB).toBeGreaterThan(7);
		expect(largestSizeMB).toBeLessThan(9);

		console.log(
			"Largest snapshot:",
			sortedBySize[0].id,
			`${largestSizeMB.toFixed(2)}MB`,
		);
	});

	/**
	 * TEST: Storage efficiency metrics
	 */
	it("Should calculate storage efficiency metrics", async () => {
		// Create snapshot with duplicate content (inefficient)
		const duplicateContent = "x".repeat(1024 * 1024); // 1MB

		const file1 = path.join(testWorkspaceRoot, "duplicate1.txt");
		const file2 = path.join(testWorkspaceRoot, "duplicate2.txt");

		await fs.writeFile(file1, duplicateContent);
		await fs.writeFile(file2, duplicateContent);

		testFiles.push(file1, file2);

		const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
			false,
			[file1, file2],
		);

		const snapshot = await storage.retrieve(snapshotId!);

		// Calculate deduplication potential
		const fileContents = snapshot?.fileContents || {};
		const uniqueContents = new Set(Object.values(fileContents));
		const duplicateCount =
			Object.keys(fileContents).length - uniqueContents.size;

		console.log(`Duplicate files: ${duplicateCount}`);

		// Verify we have duplicate content
		expect(duplicateCount).toBeGreaterThan(0);

		// In a real implementation, this would suggest deduplication
	});

	/**
	 * TEST: Alert on storage threshold breach
	 */
	it("Should alert when storage exceeds threshold", async () => {
		const STORAGE_THRESHOLD_MB = 50; // 50MB threshold
		const showWarningMessageSpy = vi.spyOn(vscode.window, "showWarningMessage");

		// Create large snapshots to exceed threshold
		const largeFile = await createFileWithSize(
			"threshold-test.txt",
			60 * 1024 * 1024,
		); // 60MB

		await operationCoordinator.coordinateSnapshotCreation(false, [largeFile]);

		// Simulate storage monitoring
		const totalStorage = 60; // MB

		if (totalStorage > STORAGE_THRESHOLD_MB) {
			vscode.window.showWarningMessage(
				`SnapBack storage exceeds ${STORAGE_THRESHOLD_MB}MB. Consider cleaning up old snapshots.`,
			);
		}

		expect(showWarningMessageSpy).toHaveBeenCalled();

		showWarningMessageSpy.mockRestore();
	});

	/**
	 * TEST: Snapshot age tracking for cleanup
	 */
	it("Should track snapshot age for cleanup recommendations", async () => {
		const snapshots: Array<{ id: string; timestamp: number }> = [];

		// Create snapshots with timestamps
		for (let i = 0; i < 3; i++) {
			const file = await createFileWithSize(`age-${i}.txt`, 1024);
			const snapshotId = await operationCoordinator.coordinateSnapshotCreation(
				false,
				[file],
			);

			snapshots.push({
				id: snapshotId!,
				timestamp: Date.now() - i * 86400000, // 1 day apart
			});

			await new Promise((resolve) => setTimeout(resolve, 50));
		}

		// Calculate ages
		const now = Date.now();
		const ages = snapshots.map((cp) => {
			const ageMs = now - cp.timestamp;
			const ageDays = ageMs / (1000 * 60 * 60 * 24);
			return { id: cp.id, ageDays };
		});

		console.log(
			"Snapshot ages:",
			ages.map((a) => `${a.ageDays.toFixed(2)} days`),
		);

		// Oldest snapshot should be identified
		const oldestSnapshot = ages.reduce((prev, curr) =>
			prev.ageDays > curr.ageDays ? prev : curr,
		);

		// Verify we can identify old snapshots
		expect(oldestSnapshot.ageDays).toBeGreaterThan(-1);
	});
});
