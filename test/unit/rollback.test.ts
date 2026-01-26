import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as vscode from 'vscode';
import { RollbackService } from '../../src/rollback/RollbackService';
import { StorageManager } from '../../src/storage/StorageManager';

// Mock vscode
vi.mock('vscode', () => {
	const workspaceEdit = {
		replace: vi.fn(),
		createFile: vi.fn(),
		deleteFile: vi.fn(),
		insert: vi.fn(),
	};
	return {
		Uri: {
			file: (path: string) => ({ fsPath: path, path }),
		},
		WorkspaceEdit: vi.fn(() => workspaceEdit),
		workspace: {
			applyEdit: vi.fn(() => Promise.resolve(true)),
			fs: {
				readFile: vi.fn(),
			}
		},
		Range: vi.fn(),
		Position: vi.fn(),
	};
});

describe('RollbackService', () => {
	let rollbackService: RollbackService;
	let storageManagerMock: any;

	beforeEach(() => {
		// Mock StorageManager
		storageManagerMock = {
			createSnapshot: vi.fn(),
			getSnapshot: vi.fn(),
			createPreRollbackCheckpoint: vi.fn(),
		} as unknown as StorageManager;

		rollbackService = new RollbackService(storageManagerMock as any);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	it('should create PRE_ROLLBACK checkpoint before restoring', async () => {
		const targetSnapshotId = 'snap-123';

		// Mock finding the snapshot (V1 format with contents)
		storageManagerMock.getSnapshot.mockResolvedValue({
			id: targetSnapshotId,
			timestamp: Date.now(),
			files: {
				'test.ts': { blobHash: 'abc', size: 100 }
			},
			contents: {
				'test.ts': 'previous content'
			}
		});

		// Mock PRE_ROLLBACK creation
		storageManagerMock.createPreRollbackCheckpoint.mockResolvedValue({
			id: 'pre-rollback-123'
		});

		await rollbackService.restoreToSnapshot(targetSnapshotId);

		// Verify PRE_ROLLBACK checkpoint was requested
		expect(storageManagerMock.createPreRollbackCheckpoint).toHaveBeenCalledWith(targetSnapshotId);
	});

	it('should use WorkspaceEdit for atomic restoration', async () => {
		const targetSnapshotId = 'snap-456';

		storageManagerMock.getSnapshot.mockResolvedValue({
			id: targetSnapshotId,
			files: {},
			contents: {
				'file1.ts': 'content1',
				'file2.ts': 'content2'
			}
		});

		await rollbackService.restoreToSnapshot(targetSnapshotId);

		// Verify applyEdit was called once (atomic)
		expect(vscode.workspace.applyEdit).toHaveBeenCalledTimes(1);
	});

	it('should handle restore failure gracefully', async () => {
		storageManagerMock.getWithContentV2 = vi.fn().mockResolvedValue(null); // Snapshot not found

		await expect(rollbackService.restoreToSnapshot('invalid-id'))
			.rejects.toThrow();
	});
});
