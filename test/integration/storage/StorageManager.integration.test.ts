import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StorageManager } from "../../../src/storage/StorageManager";
import { SnapBackEventBus } from "@snapback/contracts";
import type * as VSCode from "vscode";

// Mock vscode module
const existingDirs = new Set<string>();
const existingFiles = new Map<string, Uint8Array>();

vi.mock("vscode", async () => {
	const { createVscodeMock } = await import("@snapback/testing/mocks/vscode");

	const mockFs = {
		stat: vi.fn().mockImplementation(async (uri: any) => {
			const path = uri.fsPath || uri.path || String(uri);
			if (existingDirs.has(path)) {
				return { type: 2, size: 0 }; // Directory
			}
			if (existingFiles.has(path)) {
				return { type: 1, size: existingFiles.get(path)!.length }; // File
			}
			const error: any = new Error("FileNotFound");
			error.code = "FileNotFound";
			throw error;
		}),
		readFile: vi.fn().mockImplementation(async (uri: any) => {
			const path = uri.fsPath || uri.path || String(uri);
			if (existingFiles.has(path)) {
				return existingFiles.get(path)!;
			}
			const error: any = new Error("FileNotFound");
			error.code = "FileNotFound";
			throw error;
		}),
		writeFile: vi.fn().mockImplementation(async (uri: any, content: Uint8Array) => {
			const path = uri.fsPath || uri.path || String(uri);
			existingFiles.set(path, content);
		}),
		delete: vi.fn().mockImplementation(async (uri: any) => {
			const path = uri.fsPath || uri.path || String(uri);
			existingDirs.delete(path);
			existingFiles.delete(path);
		}),
		readDirectory: vi.fn().mockResolvedValue([]),
		createDirectory: vi.fn().mockImplementation(async (uri: any) => {
			const path = uri.fsPath || uri.path || String(uri);
			existingDirs.add(path);
		}),
		rename: vi.fn().mockImplementation(async (source: any, target: any) => {
			const srcPath = source.fsPath || source.path || String(source);
			const tgtPath = target.fsPath || target.path || String(target);
			const content = existingFiles.get(srcPath);
			if (content) {
				existingFiles.set(tgtPath, content);
				existingFiles.delete(srcPath);
			}
		}),
	};
	const mock = createVscodeMock();
	return {
		...mock,
		workspace: {
			...mock.workspace,
			fs: mockFs,
		},
		FileType: {
			Unknown: 0,
			File: 1,
			Directory: 2,
			SymbolicLink: 64,
		},
	};
});

import * as vscode from "vscode";

describe("StorageManager Integration", () => {
	let storage: StorageManager;
	let mockContext: vscode.ExtensionContext;
	let eventBus: SnapBackEventBus;
	let tempDir: vscode.Uri;

	beforeEach(async () => {
		// Clear in-memory file system storage
		existingDirs.clear();
		existingFiles.clear();

		// Setup mock context with temp directory
		tempDir = vscode.Uri.file(`/tmp/snapback-test-${Date.now()}`);
		mockContext = {
			globalStorageUri: tempDir,
			subscriptions: [],
		} as any;

		eventBus = new SnapBackEventBus();
		await eventBus.initialize();

		storage = new StorageManager(mockContext, eventBus);
	});

	afterEach(async () => {
		storage.dispose();
		// Cleanup temp directory
		try {
			await vscode.workspace.fs.delete(tempDir, { recursive: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	// Happy Path
	it("should initialize with lazy component loading", async () => {
		await storage.initialize();

		expect(storage.isInitialized()).toBe(true);
		// Cooldown cache starts immediately
		expect(storage.getActiveCooldowns()).toEqual([]);
	});

	it("should create snapshot with full flow", async () => {
		await storage.initialize();

		const files = new Map([
			["/test/file1.ts", "console.log('test');"],
			["/test/file2.ts", "export const foo = 'bar';"],
		]);

		const snapshot = await storage.createSnapshot(files, {
			name: "Test Snapshot",
			trigger: "manual",
		});

		expect(snapshot).toBeDefined();
		expect(snapshot.id).toBeTruthy();
		expect(snapshot.name).toBe("Test Snapshot");
		expect(Object.keys(snapshot.files)).toHaveLength(2);
	});

	it("should deduplicate blob storage", async () => {
		await storage.initialize();

		const duplicateContent = "console.log('duplicate');";
		const files1 = new Map([["/file1.ts", duplicateContent]]);
		const files2 = new Map([["/file2.ts", duplicateContent]]);

		await storage.createSnapshot(files1, {
			name: "Snapshot 1",
			trigger: "manual",
		});

		await storage.createSnapshot(files2, {
			name: "Snapshot 2",
			trigger: "manual",
		});

		const stats = await storage.getQuickStats();
		expect(stats.snapshots).toBe(2);
		// Only 1 blob should exist due to deduplication
		expect(stats.blobs).toBe(1);
	});

	it("should record audit trail", async () => {
		await storage.initialize();

		await storage.recordAudit({
			action: "snapshot_created",
			filePath: "/test/file.ts",
			protectionLevel: "watch",
		});

		const trail = await storage.getAuditTrail("/test/file.ts");
		expect(trail).toHaveLength(1);
		expect(trail[0].action).toBe("snapshot_created");
	});

	// Sad Path
	it("should throw StorageSpaceError when disk is full (ENOSPC)", async () => {
		// Mock ENOSPC error on directory creation
		vi.spyOn(vscode.workspace.fs, "createDirectory").mockRejectedValueOnce(
			Object.assign(new Error("ENOSPC: no space left on device"), {
				code: "NoSpace",
			}),
		);

		const failStorage = new StorageManager(mockContext);

		await expect(failStorage.initialize()).rejects.toMatchObject({
			name: "StorageSpaceError",
			message: expect.stringContaining("disk is full"),
		});
	});

	it("should throw StoragePermissionError when permissions denied", async () => {
		// Mock permission error on directory creation
		vi.spyOn(vscode.workspace.fs, "createDirectory").mockRejectedValueOnce(
			Object.assign(new Error("EACCES: permission denied"), {
				code: "NoPermissions",
			}),
		);

		const failStorage = new StorageManager(mockContext);

		await expect(failStorage.initialize()).rejects.toMatchObject({
			name: "StoragePermissionError",
			message: expect.stringContaining("Permission denied"),
		});
	});

	it("should throw StorageInitializationError for unknown errors", async () => {
		// Mock unknown error
		vi.spyOn(vscode.workspace.fs, "createDirectory").mockRejectedValueOnce(new Error("Something went wrong"));

		const failStorage = new StorageManager(mockContext);

		await expect(failStorage.initialize()).rejects.toMatchObject({
			name: "StorageInitializationError",
			message: expect.stringContaining("Something went wrong"),
		});
	});

	it("should allow directory that already exists", async () => {
		// Mock FileExists error (which is OK)
		vi.spyOn(vscode.workspace.fs, "createDirectory").mockRejectedValueOnce(
			Object.assign(new Error("File exists"), {
				code: "FileExists",
			}),
		);

		const failStorage = new StorageManager(mockContext);

		// Should not throw - directory already exists is fine
		await expect(failStorage.initialize()).resolves.not.toThrow();
		expect(failStorage.isInitialized()).toBe(true);
	});

	it("should handle missing snapshot", async () => {
		await storage.initialize();

		const result = await storage.getSnapshot("nonexistent-id");
		expect(result).toBeNull();
	});

	// Edge Cases
	it("should handle empty snapshot creation", async () => {
		await storage.initialize();

		const emptyFiles = new Map();
		const snapshot = await storage.createSnapshot(emptyFiles, {
			name: "Empty Snapshot",
			trigger: "manual",
		});

		expect(Object.keys(snapshot.files)).toHaveLength(0);
	});

	it("should handle concurrent operations", async () => {
		await storage.initialize();

		const operations = Array.from({ length: 10 }, (_, i) =>
			storage.createSnapshot(new Map([[`/file${i}.ts`, `content ${i}`]]), {
				name: `Snapshot ${i}`,
				trigger: "manual",
			}),
		);

		const results = await Promise.all(operations);
		expect(results).toHaveLength(10);
		expect(new Set(results.map((r) => r.id))).toHaveLength(10); // All unique IDs
	});

	// Error Handling
	it("should work with lazy initialization", async () => {
		// Don't call initialize()
		const files = new Map([["/test.ts", "content"]]);

		// Should still work due to lazy initialization
		const snapshot = await storage.createSnapshot(files, {
			name: "Test",
			trigger: "manual",
		});

		expect(snapshot).toBeDefined();
	});

	it("should provide user-friendly error when lazy init fails due to disk full", async () => {
		await storage.initialize(); // Initialize main storage

		// Mock ENOSPC error during component initialization
		vi.spyOn(vscode.workspace.fs, "createDirectory").mockRejectedValue(
			Object.assign(new Error("ENOSPC: no space left on device"), {
				code: "NoSpace",
			}),
		);

		const files = new Map([["/test.ts", "content"]]);

		// Should throw user-friendly error
		await expect(
			storage.createSnapshot(files, {
				name: "Test",
				trigger: "manual",
			}),
		).rejects.toMatchObject({
			name: "StorageSpaceError",
			message: expect.stringContaining("disk is full"),
		});
	});

	it("should provide user-friendly error when lazy init fails due to permissions", async () => {
		await storage.initialize(); // Initialize main storage

		// Mock permission error during component initialization
		vi.spyOn(vscode.workspace.fs, "createDirectory").mockRejectedValue(
			Object.assign(new Error("EACCES: permission denied"), {
				code: "NoPermissions",
			}),
		);

		const files = new Map([["/test.ts", "content"]]);

		// Should throw user-friendly error
		await expect(
			storage.createSnapshot(files, {
				name: "Test",
				trigger: "manual",
			}),
		).rejects.toMatchObject({
			name: "StoragePermissionError",
			message: expect.stringContaining("Permission denied"),
		});
	});
});
