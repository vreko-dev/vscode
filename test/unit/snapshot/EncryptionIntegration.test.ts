import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnapshotManager } from "@vscode/snapshot/SnapshotManager";
import type {
	IConfirmationService,
	IEventEmitter,
	IStorage,
	RichSnapshot,
} from "@vscode/types/snapshot";

describe("Encryption Integration Tests", () => {
	let mockStorage: IStorage;
	let mockConfirmationService: IConfirmationService;
	let mockEventEmitter: IEventEmitter;
	let snapshotManager: SnapshotManager;

	beforeEach(() => {
		// Mock storage implementation
		const snapshots = new Map<string, RichSnapshot>();
		mockStorage = {
			save: vi.fn(async (snapshot: RichSnapshot) => {
				snapshots.set(snapshot.id, snapshot);
			}),
			get: vi.fn(async (id: string) => {
				return snapshots.get(id);
			}),
			getAll: vi.fn(async () => {
				return Array.from(snapshots.values());
			}),
			delete: vi.fn(async (id: string) => {
				snapshots.delete(id);
			}),
			update: vi.fn(async (id: string, updates: Partial<RichSnapshot>) => {
				const existing = snapshots.get(id);
				if (existing) {
					Object.assign(existing, updates);
					snapshots.set(id, existing);
				}
			}),
		};

		// Mock confirmation service
		mockConfirmationService = {
			confirm: vi.fn(async () => true),
		};

		// Mock event emitter
		mockEventEmitter = {
			emit: vi.fn(),
		};

		// Create snapshot manager
		snapshotManager = new SnapshotManager(
			"/test/workspace",
			mockStorage,
			mockConfirmationService,
			mockEventEmitter,
		);
	});

	it("should encrypt file contents when creating snapshots", async () => {
		const files = [
			{
				path: "/test/workspace/src/index.ts",
				content: 'console.log("Hello, world!");',
				action: "add" as const,
			},
		];

		const snapshot = await snapshotManager.createSnapshot(files);

		// Verify the snapshot was created
		expect(snapshot).toBeDefined();
		expect(snapshot.id).toBeTruthy();

		// Verify storage was called
		expect(mockStorage.save).toHaveBeenCalled();

		// Get the stored snapshot to check encryption
		const storedSnapshot = await mockStorage.get(snapshot.id);
		expect(storedSnapshot).toBeDefined();
		expect(storedSnapshot?.fileStates).toBeDefined();

		// Verify each file has encrypted data
		for (const fileState of storedSnapshot?.fileStates || []) {
			expect(fileState.encrypted).toBeDefined();
			expect(fileState.encrypted?.algorithm).toBe("aes-256-gcm");
			expect(fileState.encrypted?.ciphertext).toBeTruthy();
			expect(fileState.encrypted?.iv).toBeTruthy();
			expect(fileState.encrypted?.authTag).toBeTruthy();

			// Verify plaintext content is still there (for deduplication)
			expect(fileState.content).toBe(files[0].content);
			expect(fileState.hash).toBeTruthy();
		}
	});

	it("should maintain deduplication with encrypted data", async () => {
		const files1 = [
			{
				path: "/test/workspace/src/index.ts",
				content: 'console.log("Hello, world!");',
				action: "add" as const,
			},
		];

		const files2 = [
			{
				path: "/test/workspace/src/index.ts",
				content: 'console.log("Hello, world!");',
				action: "add" as const,
			},
		];

		// Create first snapshot
		const snapshot1 = await snapshotManager.createSnapshot(files1);

		// Create second snapshot with same content
		const snapshot2 = await snapshotManager.createSnapshot(files2);

		// Should return the same snapshot ID (deduplication)
		expect(snapshot2.id).toBe(snapshot1.id);

		// Should update the timestamp
		expect(snapshot2.timestamp).toBeGreaterThanOrEqual(snapshot1.timestamp);
	});

	it("should handle encryption errors gracefully", async () => {
		// Mock the encryption service to throw an error
		const encryptionService = (snapshotManager as any).encryptionService;
		vi.spyOn(encryptionService, "encrypt").mockImplementation(() => {
			throw new Error("Encryption failed");
		});

		const files = [
			{
				path: "/test/workspace/src/index.ts",
				content: 'console.log("Hello, world!");',
				action: "add" as const,
			},
		];

		// Should throw an error when encryption fails
		await expect(snapshotManager.createSnapshot(files)).rejects.toThrow(
			"Encryption failed",
		);
	});

	it("should work with multiple files", async () => {
		const files = [
			{
				path: "/test/workspace/src/index.ts",
				content: 'console.log("Hello, world!");',
				action: "add" as const,
			},
			{
				path: "/test/workspace/src/utils.ts",
				content: "export const util = () => {};",
				action: "add" as const,
			},
			{
				path: "/test/workspace/README.md",
				content: "# Test Project",
				action: "add" as const,
			},
		];

		const snapshot = await snapshotManager.createSnapshot(files);

		// Verify the snapshot was created
		expect(snapshot).toBeDefined();

		// Get the stored snapshot to check encryption
		const storedSnapshot = await mockStorage.get(snapshot.id);
		expect(storedSnapshot).toBeDefined();
		expect(storedSnapshot?.fileStates).toBeDefined();
		expect(storedSnapshot?.fileStates?.length).toBe(3);

		// Verify each file has encrypted data
		for (const fileState of storedSnapshot?.fileStates || []) {
			expect(fileState.encrypted).toBeDefined();
			expect(fileState.encrypted?.algorithm).toBe("aes-256-gcm");
		}
	});
});
