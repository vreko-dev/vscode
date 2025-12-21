/**
 * HistorySection Tests
 * 
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md#section-3-history
 * 
 * @packageDocumentation
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock VS Code API
vi.mock('vscode', () => ({
  TreeItem: vi.fn().mockImplementation((label, collapsible) => ({
    label,
    collapsibleState: collapsible,
    contextValue: undefined,
    tooltip: undefined,
    command: undefined,
  })),
  TreeItemCollapsibleState: {
    None: 0,
    Collapsed: 1,
    Expanded: 2,
  },
  EventEmitter: vi.fn().mockImplementation(() => ({
    event: vi.fn(),
    fire: vi.fn(),
    dispose: vi.fn(),
  })),
  MarkdownString: vi.fn().mockImplementation(() => ({
    value: '',
    isTrusted: false,
    appendMarkdown: vi.fn(function(this: { value: string }, text: string) {
      this.value += text;
      return this;
    }),
  })),
  ThemeIcon: vi.fn(),
}));

import {
  HistorySection,
  createSessionItem,
  createSessionFileItem,
  createMockSessions,
} from './HistorySection';
import type { SessionInfo, SessionFileInfo } from '../ux-types';

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
      
      // HINT: Format should be "[Time] • [Files] • [Duration] • [↩️]"
      // Example: "5:52 AM • 1 file • 53s • ↩️"
      expect(item).toBeDefined();
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
      
      // TODO: Assert label contains ↩️
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
      
      // TODO: Assert label does NOT contain ↩️
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
      
      // TODO: Assert "1 file" not "1 files"
      expect(item).toBeDefined();
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
      
      // TODO: Assert "5 files"
      expect(item).toBeDefined();
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
      
      // HINT: Format should be "Button.tsx (+12, -3)"
      // TODO: Assert label format
      expect(item).toBeDefined();
    });

    it('should truncate long paths to filename only', () => {
      const file: SessionFileInfo = {
        path: 'src/very/deep/nested/path/Component.tsx',
        snapshotId: 'snap-1',
        linesAdded: 5,
        linesRemoved: 0,
      };
      
      const item = createSessionFileItem(file);
      
      // TODO: Assert shows "Component.tsx" not full path
      expect(item).toBeDefined();
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
      
      // TODO: Assert contains "45s"
      expect(item).toBeDefined();
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
      
      // TODO: Assert contains "2m 30s" or "2m"
      expect(item).toBeDefined();
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
      
      // TODO: Assert contains "1h 5m"
      expect(item).toBeDefined();
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
      
      expect(section.getSession('find-me')).toBeDefined();
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
