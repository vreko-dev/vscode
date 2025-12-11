import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Explicit mock to avoid broken shared mock
vi.mock('vscode', () => ({
    Uri: {
        file: (path: string) => ({ fsPath: path, path, with: vi.fn(), toString: () => path }),
        joinPath: (uri: any, ...segments: string[]) => ({
            fsPath: uri.fsPath + '/' + segments.join('/'),
            path: uri.path + '/' + segments.join('/'),
            with: vi.fn(),
            toString: () => uri.toString() + '/' + segments.join('/')
        }),
    },
    workspace: {
        fs: {
            createDirectory: vi.fn(),
            writeFile: vi.fn(),
            readFile: vi.fn(),
            stat: vi.fn(),
            delete: vi.fn(),
            readDirectory: vi.fn(),
            rename: vi.fn()
        }
    },
    FileType: {
        File: 1,
        Directory: 2
    }
}));

import * as vscode from 'vscode';
import { SnapshotStore } from '@vscode/storage/SnapshotStore';
import { BlobStore } from '@vscode/storage/BlobStore';
import type { SnapshotManifest } from '@vscode/storage/types';

// Mocks
const mockStorageUri = vscode.Uri.file('/mock/storage');
const mockFiles = new Map<string, string>([
    ['/path/to/anchor.ts', 'anchor content'],
    ['/path/to/related.ts', 'related content']
]);

describe('SnapshotStore (Cluster Support)', () => {
    let snapshotStore: SnapshotStore;
    let blobStore: BlobStore;

    beforeEach(() => {
        blobStore = new BlobStore(mockStorageUri);
        // Mock blob store methods
        blobStore.store = vi.fn().mockImplementation(async (content) => ({
            hash: 'mock-hash-' + content.length,
            size: content.length,
            isNew: true
        }));

        snapshotStore = new SnapshotStore(mockStorageUri, blobStore);

        // Mock fs
        vi.spyOn(vscode.workspace.fs, 'createDirectory').mockResolvedValue(undefined);
        vi.spyOn(vscode.workspace.fs, 'writeFile').mockResolvedValue(undefined);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should create a snapshot with anchorFile and cluster files', async () => {
        const manifest = await snapshotStore.create(mockFiles, {
            name: 'Test Snapshot',
            trigger: 'manual',
            anchorFile: '/path/to/anchor.ts'
        });

        expect(manifest.anchorFile).toBe('/path/to/anchor.ts');
        expect(manifest.files['/path/to/anchor.ts']).toBeDefined();
        expect(manifest.files['/path/to/related.ts']).toBeDefined();
        expect(Object.keys(manifest.files)).toHaveLength(2);
        expect(blobStore.store).toHaveBeenCalledTimes(2);
    });

    it('should set anchorFile automatically if only one file provided and no anchor specified', async () => {
        const singleFile = new Map([['/path/to/single.ts', 'content']]);
        const manifest = await snapshotStore.create(singleFile, {
            name: 'Single File',
            trigger: 'manual'
        });

        // Current implementation suggestion: require anchorFile explicitly for cluster support reliability,
        // or infer it. Let's start by requiring it or defaulting to first key.
        expect(manifest.anchorFile).toBe('/path/to/single.ts');
    });

    it('should throw error/warn if anchorFile is not in file list', async () => {
        await expect(snapshotStore.create(mockFiles, {
            name: 'Bad Anchor',
            trigger: 'manual',
            anchorFile: '/path/to/missing.ts'
        })).rejects.toThrow(/Anchor file .* not found in snapshot/);
    });
});
