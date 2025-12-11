import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => ({
    Uri: {
        file: (path: string) => ({ fsPath: path, path, toString: () => path }),
        joinPath: (uri: any, ...segments: string[]) => ({
            fsPath: uri.fsPath + '/' + segments.join('/'),
            path: uri.path + '/' + segments.join('/'),
            toString: () => uri.toString() + '/' + segments.join('/')
        }),
    },
    workspace: {
        fs: {
            createDirectory: vi.fn(),
            writeFile: vi.fn(),
            readFile: vi.fn(),
            rename: vi.fn(),
            stat: vi.fn()
        },
        getConfiguration: vi.fn().mockReturnValue({
            get: vi.fn().mockReturnValue(true)
        })
    },
    ExtensionContext: {},
    FileType: { File: 1, Directory: 2 }
}));

import * as vscode from 'vscode';
import { StorageManager } from '@vscode/storage/StorageManager';
import { SnapshotStore } from '@vscode/storage/SnapshotStore';
import { CooldownCache } from '@vscode/storage/CooldownCache';

describe('StorageManager (Persist Snapshot)', () => {
    let storageManager: StorageManager;
    let mockContext: vscode.ExtensionContext;

    beforeEach(() => {
        mockContext = {
            globalStorageUri: vscode.Uri.file('/mock/globalStorage'),
            subscriptions: []
        } as any;

        storageManager = new StorageManager(mockContext);

        // Mock internal SnapshotStore create method
        // Since it is private/protected, we can't easily mock it without casting or prototype spying on the class BEFORE instantiation if it was injected.
        // But here it's instantiated inside constructor.
        // We can spy on the public method `createSnapshot` which `persistSnapshot` calls.
        vi.spyOn(storageManager, 'createSnapshot').mockResolvedValue({
            id: 'mock-snap-id',
            timestamp: 1234567890,
            name: 'Mock Snapshot',
            trigger: 'manual',
            anchorFile: '/path/to/anchor.ts',
            files: {}
        });
    });

    it('should expose persistSnapshot method', () => {
        expect(storageManager.persistSnapshot).toBeDefined();
    });

    it('should create snapshot and set cooldown when not in cooldown', async () => {
        const cluster = {
            anchorFile: '/path/to/anchor.ts',
            clusterFiles: new Map([['/path/to/anchor.ts', 'content']])
        };

        const result = await storageManager.persistSnapshot(cluster, 'manual');

        expect(result).not.toBeNull();
        expect(storageManager.createSnapshot).toHaveBeenCalledWith(cluster.clusterFiles, expect.objectContaining({
            anchorFile: '/path/to/anchor.ts'
        }));

        // Verify cooldown set
        expect(storageManager.isInCooldown('/path/to/anchor.ts', 'snapshot_created')).toBe(true);
    });

    it('should return null and skip snapshot if in cooldown', async () => {
        // manually set cooldown
        storageManager.setCooldown({
            filePath: '/path/to/anchor.ts',
            protectionLevel: 'snapshot_created',
            triggeredAt: Date.now(),
            expiresAt: Date.now() + 10000,
            actionTaken: 'snapshot_created'
        });

        const cluster = {
            anchorFile: '/path/to/anchor.ts',
            clusterFiles: new Map([['/path/to/anchor.ts', 'content']])
        };

        const result = await storageManager.persistSnapshot(cluster, 'manual');

        expect(result).toBeNull();
        expect(storageManager.createSnapshot).not.toHaveBeenCalled();
    });
});
