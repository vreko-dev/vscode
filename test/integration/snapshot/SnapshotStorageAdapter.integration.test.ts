import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { StorageManager } from "../../../src/storage/StorageManager";
import { SnapshotStorageAdapter } from "../../../src/snapshot/SnapshotStorageAdapter";
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

describe("SnapshotStorageAdapter (Legacy Bridge)", () => {
	let storage: StorageManager;
	let adapter: SnapshotStorageAdapter;
	let mockContext: vscode.ExtensionContext;
	let tempDir: vscode.Uri;

	beforeEach(async () => {
		// Clear mock filesystem state between tests
		existingDirs.clear();
		existingFiles.clear();

		tempDir = vscode.Uri.file(`/tmp/snapback-test-${Date.now()}`);
		mockContext = {
			globalStorageUri: tempDir,
			subscriptions: [],
		} as any;

		storage = new StorageManager(mockContext);
		await storage.initialize();

		adapter = new SnapshotStorageAdapter(storage);
	});

	afterEach(async () => {
		storage.dispose();
		try {
			await vscode.workspace.fs.delete(tempDir, { recursive: true });
		} catch (error) {
			// Ignore cleanup errors
		}
	});

	// Design Decision Validation
	it("should throw on direct save (by design)", async () => {
		const mockSnapshot = {
			id: "test-id",
			name: "Test",
			timestamp: Date.now(),
			files: [],
			isProtected: false,
			icon: "circle",
			iconColor: "#fff",
		};

		await expect(adapter.save(mockSnapshot)).rejects.toThrow("Direct save not supported");
	});

	// Happy Path
	it("should retrieve snapshot after creation", async () => {
		// Create via StorageManager
		const files = new Map([["/test.ts", "content"]]);
		const created = await storage.createSnapshot(files, {
			name: "Test Snapshot",
			trigger: "manual",
		});

		// Retrieve via adapter
		const retrieved = await adapter.get(created.id);

		expect(retrieved).toBeDefined();
		expect(retrieved?.id).toBe(created.id);
		expect(retrieved?.name).toBe("Test Snapshot");
	});

	it("should list all snapshots", async () => {
		// Create 3 snapshots
		for (let i = 0; i < 3; i++) {
			await storage.createSnapshot(new Map([[`/file${i}.ts`, `content ${i}`]]), {
				name: `Snapshot ${i}`,
				trigger: "manual",
			});
		}

		const snapshots = await adapter.getAll();
		expect(snapshots).toHaveLength(3);
	});

	it("should delete snapshot", async () => {
		const files = new Map([["/test.ts", "content"]]);
		const created = await storage.createSnapshot(files, {
			name: "To Delete",
			trigger: "manual",
		});

		await adapter.delete(created.id);

		const retrieved = await adapter.get(created.id);
		expect(retrieved).toBeUndefined();
	});

	// Sad Path
	it("should return undefined for missing snapshot", async () => {
		const result = await adapter.get("nonexistent");
		expect(result).toBeUndefined();
	});

	it("should handle update gracefully (calls save internally)", async () => {
		const files = new Map([["/test.ts", "content"]]);
		const created = await storage.createSnapshot(files, {
			name: "Original",
			trigger: "manual",
		});

		const snapshot = await adapter.get(created.id);
		expect(snapshot).toBeDefined();

		// Update should throw (update is also not supported)
		await expect(adapter.update(created.id, { name: "Updated" })).rejects.toThrow(
			"Direct update not supported",
		);
	});
});
