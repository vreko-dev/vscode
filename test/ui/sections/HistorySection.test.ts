/**
 * HistorySection Tests
 *
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md#section-3-history
 *
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

import {
  HistorySection,
  createSessionItem,
  createSessionFileItem,
  createMockSessions,
} from '../../../src/ui/sections/HistorySection';
import type { SessionInfo, SessionFileInfo } from '../../../src/ui/ux-types';

describe('HistorySection', () => {
  // ===========================================================================
  // TREE ITEM CREATION TESTS
  // ===========================================================================

  describe('createSessionItem', () => {
    it('should create item with correct format', () => {
      const session: SessionInfo = {
        id: 'test-1',
        timestamp: Date.now(),
        duration: 53,
        fileCount: 1,
        canRestore: true,
        files: [],
      };

      const item = createSessionItem(session);

      // Format: "[Time] • [Files] • [Duration] • [↩️]"
      // Example: "5:52 AM • 1 file • 53s • ↩️"
      const label = item.label as string;
      expect(label).toContain(' • 1 file • ');
      expect(label).toContain('53s');
      expect(label).toContain(' • ↩️');
    });

    it('should show undoable badge when canRestore is true', () => {
      const session: SessionInfo = {
        id: 'test-1',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 2,
        canRestore: true,
        files: [],
      };

      const item = createSessionItem(session);

      const label = item.label as string;
      expect(label).toContain('↩️');
      expect(item.contextValue).toBe('session-restorable');
    });

    it('should NOT show undoable badge when canRestore is false', () => {
      const session: SessionInfo = {
        id: 'test-1',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 2,
        canRestore: false,
        files: [],
      };

      const item = createSessionItem(session);

      const label = item.label as string;
      expect(label).not.toContain('↩️');
      expect(item.contextValue).toBe('session');
    });

    it('should use singular "file" for count of 1', () => {
      const session: SessionInfo = {
        id: 'test-1',
        timestamp: Date.now(),
        duration: 30,
        fileCount: 1,
        canRestore: false,
        files: [],
      };

      const item = createSessionItem(session);

      const label = item.label as string;
      expect(label).toContain('1 file');
      expect(label).not.toContain('1 files');
    });

    it('should use plural "files" for count > 1', () => {
      const session: SessionInfo = {
        id: 'test-1',
        timestamp: Date.now(),
        duration: 30,
        fileCount: 5,
        canRestore: false,
        files: [],
      };

      const item = createSessionItem(session);

      const label = item.label as string;
      expect(label).toContain('5 files');
    });
  });

  describe('createSessionFileItem', () => {
    it('should show filename with change stats', () => {
      const file: SessionFileInfo = {
        path: 'src/components/Button.tsx',
        snapshotId: 'snap-1',
        linesAdded: 12,
        linesRemoved: 3,
      };

      const item = createSessionFileItem(file);

      // Format: "Button.tsx (+12, -3)"
      expect(item.label).toBe('Button.tsx (+12, -3)');
    });

    it('should truncate long paths to filename only', () => {
      const file: SessionFileInfo = {
        path: 'src/very/deep/nested/path/Component.tsx',
        snapshotId: 'snap-1',
        linesAdded: 5,
        linesRemoved: 0,
      };

      const item = createSessionFileItem(file);

      // Shows filename only, not full path
      expect(item.label).toBe('Component.tsx (+5, -0)');
    });

    it('should set context value for menu filtering', () => {
      const file: SessionFileInfo = {
        path: 'test.ts',
        snapshotId: 'snap-1',
        linesAdded: 1,
        linesRemoved: 1,
      };

      const item = createSessionFileItem(file);

      expect(item.contextValue).toBe('session-file');
    });
  });

  // ===========================================================================
  // DURATION FORMATTING TESTS
  // ===========================================================================

  describe('duration formatting', () => {
    it('should format seconds correctly', () => {
      const session: SessionInfo = {
        id: 'test',
        timestamp: Date.now(),
        duration: 45,
        fileCount: 1,
        canRestore: false,
        files: [],
      };

      const item = createSessionItem(session);

      const label = item.label as string;
      expect(label).toContain('45s');
    });

    it('should format minutes and seconds', () => {
      const session: SessionInfo = {
        id: 'test',
        timestamp: Date.now(),
        duration: 150, // 2m 30s
        fileCount: 1,
        canRestore: false,
        files: [],
      };

      const item = createSessionItem(session);

      const label = item.label as string;
      expect(label).toContain('2m 30s');
    });

    it('should format hours and minutes', () => {
      const session: SessionInfo = {
        id: 'test',
        timestamp: Date.now(),
        duration: 3900, // 1h 5m
        fileCount: 1,
        canRestore: false,
        files: [],
      };

      const item = createSessionItem(session);

      const label = item.label as string;
      expect(label).toContain('1h 5m');
    });
  });

  // ===========================================================================
  // HISTORY SECTION CLASS TESTS
  // ===========================================================================

  describe('HistorySection', () => {
    let section: HistorySection;

    beforeEach(() => {
      section = new HistorySection();
    });

    it('should start empty', () => {
      expect(section.totalCount).toBe(0);
    });

    it('should add sessions', () => {
      const session: SessionInfo = {
        id: 'test',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 2,
        canRestore: true,
        files: [],
      };

      section.addSession(session);

      expect(section.totalCount).toBe(1);
    });

    it('should NOT add sessions with 0 files', () => {
      const emptySession: SessionInfo = {
        id: 'test',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 0, // Empty!
        canRestore: true,
        files: [],
      };

      section.addSession(emptySession);

      // Empty sessions should be ignored
      expect(section.totalCount).toBe(0);
    });

    it('should get session by ID', () => {
      const session: SessionInfo = {
        id: 'find-me',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 1,
        canRestore: true,
        files: [],
      };

      section.addSession(session);

      const found = section.getSession('find-me');
      expect(found?.id).toBe('find-me');
      expect(found?.duration).toBe(60);
      expect(section.getSession('not-found')).toBeUndefined();
    });

    it('should group sessions by date', () => {
      const mockSessions = createMockSessions();
      for (const session of mockSessions) {
        section.addSession(session);
      }

      const groups = section.getGroupedSessions();

      // Should have some groups
      expect(groups.size).toBeGreaterThan(0);
    });

    it('should filter restorable sessions', () => {
      section.addSession({
        id: 'restorable',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 1,
        canRestore: true,
        files: [],
      });
      section.addSession({
        id: 'not-restorable',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 1,
        canRestore: false,
        files: [],
      });

      const restorable = section.getRestorableSessions();

      expect(restorable.length).toBe(1);
      expect(restorable[0].id).toBe('restorable');
    });

    it('should mark session as restored', () => {
      section.addSession({
        id: 'test',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 1,
        canRestore: true,
        files: [],
      });

      section.markRestored('test');

      const session = section.getSession('test');
      expect(session?.canRestore).toBe(false);
    });

    it('should delete session', () => {
      section.addSession({
        id: 'delete-me',
        timestamp: Date.now(),
        duration: 60,
        fileCount: 1,
        canRestore: true,
        files: [],
      });

      expect(section.totalCount).toBe(1);

      section.deleteSession('delete-me');

      expect(section.totalCount).toBe(0);
    });

    it('should limit total sessions', () => {
      // Add more than MAX_TOTAL_SESSIONS (50)
      for (let i = 0; i < 100; i++) {
        section.addSession({
          id: `sess-${i}`,
          timestamp: Date.now() - i * 1000,
          duration: 30,
          fileCount: 1,
          canRestore: true,
          files: [],
        });
      }

      expect(section.totalCount).toBeLessThanOrEqual(50);
    });
  });
});
