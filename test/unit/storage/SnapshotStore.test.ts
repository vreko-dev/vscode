/**
 * @fileoverview SnapshotStore Tests
 * 
 * Tests for snapshot manifest storage using content-addressable blobs.
 * Verifies CRUD operations, filtering, and blob reference resolution.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BlobStore } from '../../../src/storage/BlobStore';
import { SnapshotStore } from '../../../src/storage/SnapshotStore';
import type { SnapshotManifest } from '../../../src/storage/types';

describe('SnapshotStore', () => {
  let tempDir: string;
  let storageUri: vscode.Uri;
  let blobStore: BlobStore;
  let snapshotStore: SnapshotStore;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `snapback-snapshot-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(tempDir, { recursive: true });
    storageUri = vscode.Uri.file(tempDir);
    
    blobStore = new BlobStore(storageUri);
    await blobStore.initialize();
    
    snapshotStore = new SnapshotStore(storageUri, blobStore);
    await snapshotStore.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Snapshot Creation', () => {
    it('should create snapshot from file map', async () => {
      const files = new Map([
        ['file1.ts', 'const x = 1;'],
        ['file2.ts', 'const y = 2;'],
      ]);

      const manifest = await snapshotStore.create(files, {
        name: 'Test Snapshot',
        trigger: 'manual',
      });

      expect(manifest.id).toBeDefined();
      expect(manifest.timestamp).toBeGreaterThan(0);
      expect(manifest.name).toBe('Test Snapshot');
      expect(manifest.trigger).toBe('manual');
      expect(manifest.files).toHaveProperty('file1.ts');
      expect(manifest.files).toHaveProperty('file2.ts');
    });

    it('should store files as blob references', async () => {
      const files = new Map([
        ['test.ts', 'const test = true;'],
      ]);

      const manifest = await snapshotStore.create(files, {
        name: 'Blob Reference Test',
        trigger: 'auto',
      });

      const ref = manifest.files['test.ts'];
      expect(ref.blob).toBeDefined();
      expect(ref.blob).toHaveLength(64); // SHA-256 hash
      expect(ref.size).toBeGreaterThan(0);
    });

    it('should handle snapshot with metadata', async () => {
      const files = new Map([['test.ts', 'code']]);

      const manifest = await snapshotStore.create(files, {
        name: 'With Metadata',
        trigger: 'ai-detected',
        metadata: {
          riskScore: 0.8,
          aiDetection: {
            detected: true,
            tool: 'claude',
            confidence: 0.95,
          },
        },
      });

      expect(manifest.metadata?.riskScore).toBe(0.8);
      expect(manifest.metadata?.aiDetection?.detected).toBe(true);
    });

    it('should handle empty file map', async () => {
      const files = new Map();

      const manifest = await snapshotStore.create(files, {
        name: 'Empty Snapshot',
        trigger: 'manual',
      });

      expect(manifest.files).toEqual({});
    });

    it('should use unique IDs for each snapshot', async () => {
      const files = new Map([['test.ts', 'code']]);
      
      const manifest1 = await snapshotStore.create(files, {
        name: 'Snap 1',
        trigger: 'manual',
      });
      
      const manifest2 = await snapshotStore.create(files, {
        name: 'Snap 2',
        trigger: 'manual',
      });

      expect(manifest1.id).not.toBe(manifest2.id);
    });
  });

  describe('Snapshot Retrieval', () => {
    it('should retrieve snapshot by ID', async () => {
      const files = new Map([['test.ts', 'code content']]);
      const created = await snapshotStore.create(files, {
        name: 'Retrieval Test',
        trigger: 'manual',
      });

      const manifest = await snapshotStore.getManifest(created.id);
      expect(manifest).toBeDefined();
      expect(manifest?.id).toBe(created.id);
      expect(manifest?.name).toBe('Retrieval Test');
    });

    it('should return null for non-existent snapshot', async () => {
      const manifest = await snapshotStore.getManifest('nonexistent-id');
      expect(manifest).toBeNull();
    });

    it('should retrieve snapshot with resolved content', async () => {
      const content = 'function test() { return true; }';
      const files = new Map([['test.ts', content]]);
      
      const created = await snapshotStore.create(files, {
        name: 'With Content',
        trigger: 'manual',
      });

      const withContent = await snapshotStore.getWithContent(created.id);
      expect(withContent).toBeDefined();
      expect(withContent?.contents['test.ts']).toBe(content);
    });

    it('should handle missing blob references gracefully', async () => {
      const files = new Map([['test.ts', 'content']]);
      const created = await snapshotStore.create(files, {
        name: 'Missing Blob Test',
        trigger: 'manual',
      });

      // Delete the blob to simulate missing file
      const blobHash = created.files['test.ts'].blob;
      await blobStore.delete(blobHash);

      // Should log warning but not crash
      const consoleWarn = vi.spyOn(console, 'warn');
      const withContent = await snapshotStore.getWithContent(created.id);
      
      expect(consoleWarn).toHaveBeenCalled();
      expect(withContent?.contents['test.ts']).toBeUndefined();
    });
  });

  describe('Snapshot Listing', () => {
    it('should list all snapshots', async () => {
      const files = new Map([['test.ts', 'code']]);
      
      await snapshotStore.create(files, {
        name: 'Snap 1',
        trigger: 'manual',
      });
      
      await snapshotStore.create(files, {
        name: 'Snap 2',
        trigger: 'auto',
      });

      const snapshots = await snapshotStore.list();
      expect(snapshots).toHaveLength(2);
    });

    it('should sort snapshots by timestamp (newest first)', async () => {
      const files = new Map([['test.ts', 'code']]);
      
      const snap1 = await snapshotStore.create(files, {
        name: 'Snap 1',
        trigger: 'manual',
      });
      
      // Wait a bit to ensure different timestamp
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const snap2 = await snapshotStore.create(files, {
        name: 'Snap 2',
        trigger: 'manual',
      });

      const snapshots = await snapshotStore.list();
      expect(snapshots[0].id).toBe(snap2.id); // Newest first
      expect(snapshots[1].id).toBe(snap1.id);
    });

    it('should respect limit parameter', async () => {
      const files = new Map([['test.ts', 'code']]);
      
      for (let i = 0; i < 5; i++) {
        await snapshotStore.create(files, {
          name: `Snap ${i}`,
          trigger: 'manual',
        });
      }

      const snapshots = await snapshotStore.list({ limit: 2 });
      expect(snapshots).toHaveLength(2);
    });

    it('should filter by timestamp range', async () => {
      const files = new Map([['test.ts', 'code']]);
      const before = Date.now();
      
      const snap = await snapshotStore.create(files, {
        name: 'In Range',
        trigger: 'manual',
      });
      
      const after = Date.now();

      const filtered = await snapshotStore.list({
        after: before,
        before: after + 1000,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(snap.id);
    });

    it('should filter by trigger type', async () => {
      const files = new Map([['test.ts', 'code']]);
      
      await snapshotStore.create(files, {
        name: 'Manual',
        trigger: 'manual',
      });
      
      await snapshotStore.create(files, {
        name: 'Auto',
        trigger: 'auto',
      });
      
      await snapshotStore.create(files, {
        name: 'AI',
        trigger: 'ai-detected',
      });

      const manualOnly = await snapshotStore.list({ trigger: 'manual' });
      expect(manualOnly).toHaveLength(1);
      expect(manualOnly[0].trigger).toBe('manual');
    });

    it('should return empty list for empty storage', async () => {
      const snapshots = await snapshotStore.list();
      expect(snapshots).toEqual([]);
    });
  });

  describe('Snapshot Queries', () => {
    it('should get snapshots for specific file', async () => {
      const files1 = new Map([['file1.ts', 'code']]);
      const files2 = new Map([
        ['file1.ts', 'code'],
        ['file2.ts', 'code'],
      ]);

      const snap1 = await snapshotStore.create(files1, {
        name: 'With file1',
        trigger: 'manual',
      });
      
      const snap2 = await snapshotStore.create(files2, {
        name: 'With file1 and file2',
        trigger: 'manual',
      });

      const forFile1 = await snapshotStore.getForFile('file1.ts');
      expect(forFile1).toContainEqual(expect.objectContaining({ id: snap1.id }));
      expect(forFile1).toContainEqual(expect.objectContaining({ id: snap2.id }));
      
      const forFile2 = await snapshotStore.getForFile('file2.ts');
      expect(forFile2).toContainEqual(expect.objectContaining({ id: snap2.id }));
      expect(forFile2).not.toContainEqual(expect.objectContaining({ id: snap1.id }));
    });

    it('should get most recent snapshot', async () => {
      const files = new Map([['test.ts', 'code']]);
      
      await snapshotStore.create(files, {
        name: 'Snap 1',
        trigger: 'manual',
      });
      
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const recent = await snapshotStore.create(files, {
        name: 'Snap 2',
        trigger: 'manual',
      });

      const mostRecent = await snapshotStore.getMostRecent();
      expect(mostRecent?.id).toBe(recent.id);
    });

    it('should get snapshots by trigger type', async () => {
      const files = new Map([['test.ts', 'code']]);
      
      await snapshotStore.create(files, {
        name: 'Manual 1',
        trigger: 'manual',
      });
      
      await snapshotStore.create(files, {
        name: 'Auto 1',
        trigger: 'auto',
      });
      
      const manualSnapshots = await snapshotStore.getByTrigger('manual');
      expect(manualSnapshots).toHaveLength(1);
      expect(manualSnapshots[0].trigger).toBe('manual');
    });
  });

  describe('Snapshot Deletion', () => {
    it('should delete snapshot manifest', async () => {
      const files = new Map([['test.ts', 'code']]);
      const created = await snapshotStore.create(files, {
        name: 'To Delete',
        trigger: 'manual',
      });

      const deleted = await snapshotStore.delete(created.id);
      expect(deleted).toBe(true);

      const retrieved = await snapshotStore.getManifest(created.id);
      expect(retrieved).toBeNull();
    });

    it('should handle deletion of non-existent snapshot', async () => {
      const deleted = await snapshotStore.delete('nonexistent-id');
      expect(deleted).toBe(false);
    });

    it('should check snapshot existence', async () => {
      const files = new Map([['test.ts', 'code']]);
      const created = await snapshotStore.create(files, {
        name: 'Existence Check',
        trigger: 'manual',
      });

      let exists = await snapshotStore.exists(created.id);
      expect(exists).toBe(true);

      await snapshotStore.delete(created.id);
      exists = await snapshotStore.exists(created.id);
      expect(exists).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should count snapshots correctly', async () => {
      const files = new Map([['test.ts', 'code']]);
      
      for (let i = 0; i < 3; i++) {
        await snapshotStore.create(files, {
          name: `Snap ${i}`,
          trigger: 'manual',
        });
      }

      const count = await snapshotStore.count();
      expect(count).toBe(3);
    });

    it('should return 0 for empty storage', async () => {
      const count = await snapshotStore.count();
      expect(count).toBe(0);
    });
  });

  describe('Deduplication Integration', () => {
    it('should deduplicate identical file content across snapshots', async () => {
      const sharedContent = 'shared code';
      
      const files1 = new Map([['test.ts', sharedContent]]);
      const snap1 = await snapshotStore.create(files1, {
        name: 'Snap 1',
        trigger: 'manual',
      });

      const files2 = new Map([['other.ts', sharedContent]]);
      const snap2 = await snapshotStore.create(files2, {
        name: 'Snap 2',
        trigger: 'manual',
      });

      // Both should reference same blob
      const blob1 = snap1.files['test.ts'].blob;
      const blob2 = snap2.files['other.ts'].blob;
      expect(blob1).toBe(blob2);
    });
  });
});
