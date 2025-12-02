/**
 * @fileoverview SessionStore Tests
 * 
 * Tests for session manifest storage with lifecycle management.
 * Verifies session creation, finalization, and query operations.
 */

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SessionStore } from '../../../src/storage/SessionStore';
import type { SessionManifest, SessionFileEntry } from '../../../src/storage/types';

describe('SessionStore', () => {
  let tempDir: string;
  let storageUri: vscode.Uri;
  let sessionStore: SessionStore;

  beforeEach(async () => {
    tempDir = path.join(os.tmpdir(), `snapback-session-test-${Date.now()}-${Math.random()}`);
    await fs.mkdir(tempDir, { recursive: true });
    storageUri = vscode.Uri.file(tempDir);
    
    sessionStore = new SessionStore(storageUri);
    await sessionStore.initialize();
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('Session Lifecycle', () => {
    it('should start a new session', () => {
      const sessionId = sessionStore.startSession();
      
      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^sess-\d+-/);
    });

    it('should return existing active session', () => {
      const sessionId1 = sessionStore.startSession();
      const sessionId2 = sessionStore.startSession();
      
      expect(sessionId1).toBe(sessionId2); // Same session
    });

    it('should finalize active session', async () => {
      const sessionId = sessionStore.startSession();
      
      const files: SessionFileEntry[] = [
        { filePath: '/file1.ts', snapshotId: 'snap-1', changeStats: { added: 5, deleted: 0 } },
        { filePath: '/file2.ts', snapshotId: 'snap-2', changeStats: { added: 0, deleted: 2 } },
      ];

      const manifest = await sessionStore.finalizeSession('manual', files);

      expect(manifest).toBeDefined();
      expect(manifest?.id).toBe(sessionId);
      expect(manifest?.reason).toBe('manual');
      expect(manifest?.files).toEqual(files);
    });

    it('should return null when finalizing with no active session', async () => {
      const manifest = await sessionStore.finalizeSession('manual', []);
      expect(manifest).toBeNull();
    });

    it('should cancel active session without saving', () => {
      const sessionId = sessionStore.startSession();
      expect(sessionStore.hasActiveSession()).toBe(true);

      sessionStore.cancelSession();
      expect(sessionStore.hasActiveSession()).toBe(false);

      // Session should not be saved to disk
      sessionStore.get(sessionId).then(stored => {
        expect(stored).toBeNull();
      });
    });

    it('should track session timestamps', async () => {
      const startId = sessionStore.startSession();
      const startedAt = sessionStore.getActiveSessionStartedAt();
      
      expect(startedAt).toBeDefined();
      expect(startedAt).toBeGreaterThan(0);

      const files: SessionFileEntry[] = [];
      const manifest = await sessionStore.finalizeSession('manual', files);

      expect(manifest?.startedAt).toBe(startedAt);
      expect(manifest?.endedAt).toBeGreaterThanOrEqual(manifest!.startedAt);
    });
  });

  describe('Session Queries', () => {
    it('should get session by ID', async () => {
      const sessionId = sessionStore.startSession();
      const files: SessionFileEntry[] = [
        { filePath: '/test.ts', snapshotId: 'snap-1', changeStats: { added: 1, deleted: 0 } },
      ];

      await sessionStore.finalizeSession('manual', files);

      const retrieved = await sessionStore.get(sessionId);
      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(sessionId);
    });

    it('should return null for non-existent session', async () => {
      const retrieved = await sessionStore.get('nonexistent-session-id');
      expect(retrieved).toBeNull();
    });

    it('should list all sessions', async () => {
      for (let i = 0; i < 3; i++) {
        const sessionId = sessionStore.startSession();
        const files: SessionFileEntry[] = [];
        await sessionStore.finalizeSession('manual', files);
        
        // Create new session for next iteration
        sessionStore.startSession();
        sessionStore.cancelSession();
      }

      const sessions = await sessionStore.list();
      expect(sessions).toHaveLength(3);
    });

    it('should sort sessions by timestamp (newest first)', async () => {
      const session1Id = sessionStore.startSession();
      const files: SessionFileEntry[] = [];
      await sessionStore.finalizeSession('manual', files);

      // Wait and create second session
      await new Promise(resolve => setTimeout(resolve, 10));
      
      const session2Id = sessionStore.startSession();
      await sessionStore.finalizeSession('manual', files);

      const sessions = await sessionStore.list();
      expect(sessions[0].id).toBe(session2Id); // Newest first
      expect(sessions[1].id).toBe(session1Id);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        const sessionId = sessionStore.startSession();
        await sessionStore.finalizeSession('manual', []);
      }

      const sessions = await sessionStore.list({ limit: 2 });
      expect(sessions).toHaveLength(2);
    });

    it('should filter by session reason', async () => {
      const files: SessionFileEntry[] = [];

      sessionStore.startSession();
      await sessionStore.finalizeSession('manual', files);

      sessionStore.startSession();
      await sessionStore.finalizeSession('idle', files);

      sessionStore.startSession();
      await sessionStore.finalizeSession('manual', files);

      const manualSessions = await sessionStore.list({ reason: 'manual' });
      expect(manualSessions).toHaveLength(2);
      expect(manualSessions.every(s => s.reason === 'manual')).toBe(true);
    });

    it('should filter by timestamp range', async () => {
      const before = Date.now();
      const files: SessionFileEntry[] = [];

      sessionStore.startSession();
      const manifest = await sessionStore.finalizeSession('manual', files);
      const after = Date.now();

      const filtered = await sessionStore.list({
        after: before,
        before: after + 1000,
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe(manifest?.id);
    });

    it('should return empty list for empty storage', async () => {
      const sessions = await sessionStore.list();
      expect(sessions).toEqual([]);
    });
  });

  describe('Session Details', () => {
    it('should store session with files and metadata', async () => {
      const sessionId = sessionStore.startSession();
      const files: SessionFileEntry[] = [
        { filePath: '/src/index.ts', snapshotId: 'snap-1', changeStats: { added: 10, deleted: 2 } },
        { filePath: '/src/utils.ts', snapshotId: 'snap-2', changeStats: { added: 5, deleted: 0 } },
      ];

      const manifest = await sessionStore.finalizeSession('manual', files, {
        tags: ['feature', 'bugfix'],
        summary: 'Implementation of new feature',
      });

      expect(manifest?.files).toEqual(files);
      expect(manifest?.tags).toEqual(['feature', 'bugfix']);
      expect(manifest?.summary).toBe('Implementation of new feature');
    });

    it('should handle sessions with no files', async () => {
      sessionStore.startSession();
      const manifest = await sessionStore.finalizeSession('idle', []);

      expect(manifest?.files).toEqual([]);
    });

    it('should track different session reasons', async () => {
      const reasons: Array<'idle' | 'manual' | 'window-close' | 'timeout'> = [
        'idle',
        'manual',
        'window-close',
        'timeout',
      ];

      for (const reason of reasons) {
        sessionStore.startSession();
        await sessionStore.finalizeSession(reason, []);
      }

      const sessions = await sessionStore.list({ limit: 100 });
      expect(sessions).toHaveLength(4);

      const idleSessions = await sessionStore.list({ reason: 'idle' });
      expect(idleSessions).toHaveLength(1);
    });
  });

  describe('Deletion', () => {
    it('should delete session', async () => {
      const sessionId = sessionStore.startSession();
      const files: SessionFileEntry[] = [];
      await sessionStore.finalizeSession('manual', files);

      const deleted = await sessionStore.delete(sessionId);
      expect(deleted).toBe(true);

      const retrieved = await sessionStore.get(sessionId);
      expect(retrieved).toBeNull();
    });

    it('should handle deletion of non-existent session', async () => {
      const deleted = await sessionStore.delete('nonexistent-id');
      expect(deleted).toBe(false);
    });
  });

  describe('Existence Checks', () => {
    it('should check session existence', async () => {
      const sessionId = sessionStore.startSession();
      const files: SessionFileEntry[] = [];
      await sessionStore.finalizeSession('manual', files);

      let exists = await sessionStore.exists(sessionId);
      expect(exists).toBe(true);

      await sessionStore.delete(sessionId);
      exists = await sessionStore.exists(sessionId);
      expect(exists).toBe(false);
    });
  });

  describe('Statistics', () => {
    it('should count sessions', async () => {
      const files: SessionFileEntry[] = [];
      
      for (let i = 0; i < 5; i++) {
        sessionStore.startSession();
        await sessionStore.finalizeSession('manual', files);
      }

      const count = await sessionStore.count();
      expect(count).toBe(5);
    });

    it('should return 0 for empty storage', async () => {
      const count = await sessionStore.count();
      expect(count).toBe(0);
    });

    it('should get most recent session', async () => {
      const files: SessionFileEntry[] = [];
      
      sessionStore.startSession();
      await sessionStore.finalizeSession('manual', files);

      await new Promise(resolve => setTimeout(resolve, 10));

      const recentId = sessionStore.startSession();
      const recent = await sessionStore.finalizeSession('manual', files);

      const mostRecent = await sessionStore.getMostRecent();
      expect(mostRecent?.id).toBe(recentId);
    });

    it('should calculate total duration', async () => {
      const files: SessionFileEntry[] = [];
      
      // Create session 1: ~50ms duration
      sessionStore.startSession();
      await new Promise(resolve => setTimeout(resolve, 50));
      await sessionStore.finalizeSession('manual', files);

      // Create session 2: ~50ms duration
      sessionStore.startSession();
      await new Promise(resolve => setTimeout(resolve, 50));
      await sessionStore.finalizeSession('manual', files);

      const duration = await sessionStore.getTotalDuration();
      expect(duration).toBeGreaterThanOrEqual(100); // At least 100ms from both sessions
    });
  });

  describe('Active Session Management', () => {
    it('should track active session ID', () => {
      expect(sessionStore.getActiveSessionId()).toBeNull();

      const sessionId = sessionStore.startSession();
      expect(sessionStore.getActiveSessionId()).toBe(sessionId);
    });

    it('should track active session start time', () => {
      expect(sessionStore.getActiveSessionStartedAt()).toBeNull();

      sessionStore.startSession();
      const startedAt = sessionStore.getActiveSessionStartedAt();
      
      expect(startedAt).toBeDefined();
      expect(startedAt).toBeGreaterThan(0);
    });

    it('should check if session is active', () => {
      expect(sessionStore.hasActiveSession()).toBe(false);

      sessionStore.startSession();
      expect(sessionStore.hasActiveSession()).toBe(true);

      sessionStore.cancelSession();
      expect(sessionStore.hasActiveSession()).toBe(false);
    });

    it('should clear active session after finalization', async () => {
      sessionStore.startSession();
      expect(sessionStore.hasActiveSession()).toBe(true);

      await sessionStore.finalizeSession('manual', []);
      expect(sessionStore.hasActiveSession()).toBe(false);
    });
  });

  describe('Concurrent Session Management', () => {
    it('should handle rapid session start/finalize cycles', async () => {
      const files: SessionFileEntry[] = [];

      for (let i = 0; i < 10; i++) {
        sessionStore.startSession();
        await sessionStore.finalizeSession('manual', files);
      }

      const sessions = await sessionStore.list({ limit: 100 });
      expect(sessions).toHaveLength(10);
    });
  });

  describe('Edge Cases', () => {
    it('should handle session with empty file list', async () => {
      sessionStore.startSession();
      const manifest = await sessionStore.finalizeSession('idle', []);

      expect(manifest?.files).toEqual([]);
    });

    it('should handle session with large file count', async () => {
      sessionStore.startSession();
      
      const files: SessionFileEntry[] = Array.from({ length: 100 }, (_, i) => ({
        filePath: `/file${i}.ts`,
        snapshotId: `snap-${i}`,
        changeStats: { added: Math.random() * 100, deleted: Math.random() * 50 },
      }));

      const manifest = await sessionStore.finalizeSession('manual', files);
      expect(manifest?.files).toHaveLength(100);
    });

    it('should handle all session reason types', async () => {
      const reasons: Array<'idle' | 'manual' | 'window-close' | 'timeout'> = [
        'idle',
        'manual',
        'window-close',
        'timeout',
      ];

      for (const reason of reasons) {
        sessionStore.startSession();
        await sessionStore.finalizeSession(reason, []);
      }

      const sessions = await sessionStore.list({ limit: 100 });
      expect(sessions).toHaveLength(4);
    });
  });
});
