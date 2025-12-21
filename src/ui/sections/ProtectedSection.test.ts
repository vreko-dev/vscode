/**
 * ProtectedSection Tests
 * 
 * Reference: ai_dev_utils/resources/extension-ux/EXTENSION_UX_SPEC.md#section-2-protected
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
    description: undefined,
    iconPath: undefined,
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
  ThemeIcon: vi.fn((id, color) => ({ id, color })),
  ThemeColor: vi.fn((id) => ({ id })),
  Uri: {
    file: vi.fn((path) => ({ path })),
  },
}));

import {
  ProtectedSection,
  createProtectedFileItem,
  createLevelGroupItem,
  createAllFilesItem,
  groupFilesByLevel,
  sortFilesBySeverity,
  createMockProtectedFiles,
} from './ProtectedSection';
import type { ProtectedFileInfo } from '../ux-types';

describe('ProtectedSection', () => {
  // ===========================================================================
  // TREE ITEM CREATION TESTS
  // ===========================================================================
  
  describe('createProtectedFileItem', () => {
    it('should show filename (not full path)', () => {
      const file: ProtectedFileInfo = {
        path: 'src/components/Button.tsx',
        absolutePath: '/project/src/components/Button.tsx',
        level: 'BLOCK',
        isInherited: false,
        snapshotCount: 3,
      };
      
      const item = createProtectedFileItem(file);
      
      // HINT: Label should be "Button.tsx", not full path
      // TODO: Assert label is just filename
      expect(item).toBeDefined();
    });

    it('should show inheritance info in description', () => {
      const file: ProtectedFileInfo = {
        path: 'src/hooks/useButton.ts',
        absolutePath: '/project/src/hooks/useButton.ts',
        level: 'WARN',
        isInherited: true,
        anchorFile: 'src/components/Button.tsx',
        snapshotCount: 1,
      };
      
      const item = createProtectedFileItem(file);
      
      // HINT: Description should be "(from Button.tsx)"
      expect(item.description).toBe('(from Button.tsx)');
    });

    it('should NOT show inheritance for non-inherited files', () => {
      const file: ProtectedFileInfo = {
        path: 'src/components/Button.tsx',
        absolutePath: '/project/src/components/Button.tsx',
        level: 'BLOCK',
        isInherited: false,
        snapshotCount: 3,
      };
      
      const item = createProtectedFileItem(file);
      
      expect(item.description).toBeUndefined();
    });

    it('should set correct context value', () => {
      const file: ProtectedFileInfo = {
        path: 'test.ts',
        absolutePath: '/project/test.ts',
        level: 'WATCH',
        isInherited: false,
        snapshotCount: 0,
      };
      
      const item = createProtectedFileItem(file);
      
      expect(item.contextValue).toBe('protected-file');
    });

    it('should have command to open file', () => {
      const file: ProtectedFileInfo = {
        path: 'test.ts',
        absolutePath: '/project/test.ts',
        level: 'BLOCK',
        isInherited: false,
        snapshotCount: 0,
      };
      
      const item = createProtectedFileItem(file);
      
      expect(item.command?.command).toBe('vscode.open');
    });
  });

  describe('createLevelGroupItem', () => {
    it('should include badge and text for BLOCK', () => {
      const item = createLevelGroupItem('BLOCK', 2);
      
      // HINT: Label should be "🛑 BLOCK (2)"
      // TODO: Assert label format
      expect(item).toBeDefined();
    });

    it('should include badge and text for WARN', () => {
      const item = createLevelGroupItem('WARN', 1);
      
      // HINT: Label should be "⚠️ WARN (1)"
      expect(item).toBeDefined();
    });

    it('should include badge and text for WATCH', () => {
      const item = createLevelGroupItem('WATCH', 3);
      
      // HINT: Label should be "👁️ WATCH (3)"
      expect(item).toBeDefined();
    });

    it('should be expanded by default', () => {
      const item = createLevelGroupItem('BLOCK', 2);
      
      // TODO: Assert collapsibleState is Expanded
      expect(item).toBeDefined();
    });
  });

  describe('createAllFilesItem', () => {
    it('should show total count', () => {
      const item = createAllFilesItem(5);
      
      // HINT: Label should be "All (5)"
      // TODO: Assert label
      expect(item).toBeDefined();
    });

    it('should be collapsed by default', () => {
      const item = createAllFilesItem(5);
      
      // Users typically want grouped view, "All" is secondary
      // TODO: Assert collapsibleState is Collapsed
      expect(item).toBeDefined();
    });
  });

  // ===========================================================================
  // GROUPING TESTS
  // ===========================================================================
  
  describe('groupFilesByLevel', () => {
    it('should group files by protection level', () => {
      const files = createMockProtectedFiles();
      const groups = groupFilesByLevel(files);
      
      expect(groups.has('BLOCK')).toBe(true);
      expect(groups.has('WARN')).toBe(true);
      expect(groups.has('WATCH')).toBe(true);
    });

    it('should return in severity order (BLOCK first)', () => {
      const files = createMockProtectedFiles();
      const groups = groupFilesByLevel(files);
      
      const keys = Array.from(groups.keys());
      
      // HINT: Order should be BLOCK, WARN, WATCH
      expect(keys[0]).toBe('BLOCK');
    });

    it('should NOT include empty groups', () => {
      const files: ProtectedFileInfo[] = [
        {
          path: 'test.ts',
          absolutePath: '/test.ts',
          level: 'BLOCK',
          isInherited: false,
          snapshotCount: 0,
        },
      ];
      
      const groups = groupFilesByLevel(files);
      
      expect(groups.has('BLOCK')).toBe(true);
      expect(groups.has('WARN')).toBe(false);
      expect(groups.has('WATCH')).toBe(false);
    });

    it('should sort files by path within each group', () => {
      const files: ProtectedFileInfo[] = [
        { path: 'z.ts', absolutePath: '/z.ts', level: 'BLOCK', isInherited: false, snapshotCount: 0 },
        { path: 'a.ts', absolutePath: '/a.ts', level: 'BLOCK', isInherited: false, snapshotCount: 0 },
        { path: 'm.ts', absolutePath: '/m.ts', level: 'BLOCK', isInherited: false, snapshotCount: 0 },
      ];
      
      const groups = groupFilesByLevel(files);
      const blockFiles = groups.get('BLOCK')!;
      
      expect(blockFiles[0].path).toBe('a.ts');
      expect(blockFiles[1].path).toBe('m.ts');
      expect(blockFiles[2].path).toBe('z.ts');
    });
  });

  describe('sortFilesBySeverity', () => {
    it('should sort BLOCK before WARN before WATCH', () => {
      const files: ProtectedFileInfo[] = [
        { path: 'watch.ts', absolutePath: '/watch.ts', level: 'WATCH', isInherited: false, snapshotCount: 0 },
        { path: 'block.ts', absolutePath: '/block.ts', level: 'BLOCK', isInherited: false, snapshotCount: 0 },
        { path: 'warn.ts', absolutePath: '/warn.ts', level: 'WARN', isInherited: false, snapshotCount: 0 },
      ];
      
      const sorted = sortFilesBySeverity(files);
      
      expect(sorted[0].level).toBe('BLOCK');
      expect(sorted[1].level).toBe('WARN');
      expect(sorted[2].level).toBe('WATCH');
    });

    it('should sort by path within same severity', () => {
      const files: ProtectedFileInfo[] = [
        { path: 'z.ts', absolutePath: '/z.ts', level: 'BLOCK', isInherited: false, snapshotCount: 0 },
        { path: 'a.ts', absolutePath: '/a.ts', level: 'BLOCK', isInherited: false, snapshotCount: 0 },
      ];
      
      const sorted = sortFilesBySeverity(files);
      
      expect(sorted[0].path).toBe('a.ts');
      expect(sorted[1].path).toBe('z.ts');
    });

    it('should not mutate original array', () => {
      const files: ProtectedFileInfo[] = [
        { path: 'b.ts', absolutePath: '/b.ts', level: 'WARN', isInherited: false, snapshotCount: 0 },
        { path: 'a.ts', absolutePath: '/a.ts', level: 'BLOCK', isInherited: false, snapshotCount: 0 },
      ];
      
      const original = [...files];
      sortFilesBySeverity(files);
      
      expect(files[0].path).toBe(original[0].path);
    });
  });

  // ===========================================================================
  // PROTECTED SECTION CLASS TESTS
  // ===========================================================================
  
  describe('ProtectedSection', () => {
    let section: ProtectedSection;
    
    beforeEach(() => {
      section = new ProtectedSection();
    });

    it('should start empty', () => {
      expect(section.totalCount).toBe(0);
    });

    it('should set files', () => {
      const files = createMockProtectedFiles();
      section.setFiles(files);
      
      expect(section.totalCount).toBe(files.length);
    });

    it('should add/update individual file', () => {
      section.setFile({
        path: 'test.ts',
        absolutePath: '/test.ts',
        level: 'BLOCK',
        isInherited: false,
        snapshotCount: 0,
      });
      
      expect(section.totalCount).toBe(1);
      
      // Update same file
      section.setFile({
        path: 'test.ts',
        absolutePath: '/test.ts',
        level: 'WARN', // Changed level
        isInherited: false,
        snapshotCount: 1,
      });
      
      // Should still be 1, not 2
      expect(section.totalCount).toBe(1);
      expect(section.getFiles()[0].level).toBe('WARN');
    });

    it('should remove file', () => {
      section.setFile({
        path: 'test.ts',
        absolutePath: '/test.ts',
        level: 'BLOCK',
        isInherited: false,
        snapshotCount: 0,
      });
      
      section.removeFile('test.ts');
      
      expect(section.totalCount).toBe(0);
    });

    it('should get grouped files', () => {
      section.setFiles(createMockProtectedFiles());
      
      const groups = section.getGroupedFiles();
      
      expect(groups.size).toBeGreaterThan(0);
    });

    it('should get sorted files for "All" view', () => {
      section.setFiles(createMockProtectedFiles());
      
      const sorted = section.getSortedFiles();
      
      // First file should be BLOCK
      expect(sorted[0].level).toBe('BLOCK');
    });

    it('should get level counts', () => {
      section.setFiles(createMockProtectedFiles());
      
      const counts = section.getLevelCounts();
      
      expect(counts.BLOCK).toBeGreaterThan(0);
      expect(counts.WARN).toBeGreaterThanOrEqual(0);
      expect(counts.WATCH).toBeGreaterThanOrEqual(0);
    });
  });
});
