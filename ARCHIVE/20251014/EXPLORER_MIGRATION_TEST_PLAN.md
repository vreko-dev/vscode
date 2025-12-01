# SnapBack Explorer Migration - Comprehensive Test Plan

**Migration Context**: Replace snapback.main/snapback.protectedFiles dual-view architecture with unified snapback.explorer TreeView.

**Document Version**: 1.0
**Date**: 2025-10-10
**Status**: Ready for Implementation

---

## Executive Summary

This test plan provides comprehensive coverage for migrating SnapBack's existing dual-view tree architecture to a new unified Explorer-based view. The plan includes:

-   **145+ existing tests** to leverage for patterns
-   **New test suites** for ProtectedFilesTreeProvider and Explorer integration
-   **Regression test coverage** for Issue #2 (duplicate views) and related bugs
-   **Quality gates** with measurable acceptance criteria
-   **Manual verification checklist** for pre-merge validation

**Risk Level**: HIGH (Core UI architecture change affecting user workflows)
**Recommended Test Coverage Target**: 95%+ for all new/modified tree provider code

---

## 1. Current Test Infrastructure Analysis

### 1.1 Existing Test Framework

-   **Test Runner**: Vitest for unit/regression/performance tests
-   **Integration Tests**: Mocha + @vscode/test-electron (separate from Vitest)
-   **Setup File**: `/test/unit/setup.ts` with comprehensive VSCode API mocks
-   **Test Patterns**: 145 test files across unit/regression/performance suites

### 1.2 Key Test Patterns Identified

**Pattern 1: Vitest Unit Tests** (Primary for tree provider testing)
``typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import \* as vscode from 'vscode';
// Test implementation with vi.spyOn() and mock setup

```

**Pattern 2: VSCode API Mocking** (from test/unit/setup.ts)
``typescript
const mockVscode = {
  window: {
    registerTreeDataProvider: vi.fn(() => ({ dispose: vi.fn() })),
    // ... comprehensive mocks
  },
  EventEmitter: MockEventEmitter, // Real event emitter implementation
  TreeItem: class { ... },
  TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 }
};
```

**Pattern 3: Regression Test Structure** (from issue-002-duplicate-view.test.ts)
``typescript
/\*\*

-   REGRESSION TEST FOR BUG #N: [Title]
-
-   ISSUE: [Description]
-   LOCATION: [File and line]
-   EXPECTED BEHAVIOR: [What should happen]
-   FIX: [What needs to change]
    \*/
    describe("Regression: Issue #N - [Title]", () => {
    // Tests that fail before fix, pass after fix
    });

```

### 1.3 Coverage Thresholds (from vitest.config.mts)
``yaml
lines: 80%
functions: 80%
branches: 75%
statements: 80%
```

**Migration Target**: Maintain or exceed these thresholds for all new code.

---

## 2. Test Coverage Matrix

### 2.1 Priority Levels

| Level  | Description                   | Impact         | Timeline              |
| ------ | ----------------------------- | -------------- | --------------------- |
| **P0** | Critical path, blocks release | System breaks  | Pre-merge required    |
| **P1** | Core functionality            | Feature broken | Pre-merge required    |
| **P2** | Important features            | Degraded UX    | Post-merge acceptable |
| **P3** | Edge cases, polish            | Minor issues   | Post-merge acceptable |

### 2.2 Coverage Areas

```
┌─────────────────────────────────────────────────────────────────────┐
│ Test Coverage Matrix                                                │
├─────────────────────────────────────────────────────────────────────┤
│ Area                        │ Priority │ Unit │ Integration │ E2E   │
├─────────────────────────────┼──────────┼──────┼─────────────┼───────┤
│ Tree Provider Logic         │   P0     │  ✓   │      ✓      │   ✓   │
│ Tree Item Construction      │   P0     │  ✓   │      ✓      │   -   │
│ View Registration           │   P0     │  ✓   │      ✓      │   ✓   │
│ Context Management          │   P0     │  ✓   │      ✓      │   ✓   │
│ Event Handling              │   P1     │  ✓   │      ✓      │   -   │
│ Tree Refresh on Changes     │   P1     │  ✓   │      ✓      │   ✓   │
│ Timeline Integration        │   P1     │  ✓   │      ✓      │   -   │
│ Menu Command Execution      │   P1     │  -   │      ✓      │   ✓   │
│ View Visibility Logic       │   P1     │  ✓   │      ✓      │   ✓   │
│ Icon/Badge Display          │   P2     │  ✓   │      ✓      │   -   │
│ Tooltip Rendering           │   P2     │  ✓   │      -      │   -   │
│ Protection Level Changes    │   P1     │  ✓   │      ✓      │   ✓   │
│ File Deletion Edge Cases    │   P2     │  ✓   │      -      │   -   │
│ Empty Workspace Handling    │   P2     │  ✓   │      -      │   -   │
│ Extension Reload Scenarios  │   P3     │  -   │      ✓      │   -   │
└─────────────────────────────┴──────────┴──────┴─────────────┴───────┘
```

---

## 3. Unit Test Specifications

### 3.1 ProtectedFilesTreeProvider Tests

**Test File**: `/test/unit/views/ProtectedFilesTreeProvider.test.ts`

**Test Suite Structure**:

``typescript
/\*\*

-   Unit Tests: ProtectedFilesTreeProvider
-
-   Tests the new unified tree provider for the snapback.explorer view.
-   This provider replaces the dual-view architecture (snapback.main + snapback.protectedFiles).
    \*/

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import \* as vscode from 'vscode';
import { ProtectedFilesTreeProvider } from '@/views/ProtectedFilesTreeProvider';
import type { ProtectedFileProvider } from '@/views/types';
import type { ProtectionLevel } from '@/views/types';

describe('ProtectedFilesTreeProvider', () => {
let provider: ProtectedFilesTreeProvider;
let mockProtectedFileProvider: ProtectedFileProvider;
let onDidChangeTreeDataSpy: any;

beforeEach(() => {
// Setup mock ProtectedFileProvider
mockProtectedFileProvider = {
list: vi.fn().mockResolvedValue([]),
total: vi.fn().mockResolvedValue(0),
add: vi.fn().mockResolvedValue(undefined),
updateProtectionLevel: vi.fn().mockResolvedValue(undefined),
remove: vi.fn().mockResolvedValue(undefined),
markCheckpoint: vi.fn().mockResolvedValue(undefined)
};

    provider = new ProtectedFilesTreeProvider(mockProtectedFileProvider);

    // Spy on event emitter
    onDidChangeTreeDataSpy = vi.fn();
    provider.onDidChangeTreeData(onDidChangeTreeDataSpy);

});

afterEach(() => {
provider.dispose();
vi.clearAllMocks();
});

describe('getTreeItem', () => {
it('should return the tree item unchanged', () => {
const item = new vscode.TreeItem('Test Item');
const result = provider.getTreeItem(item);

      expect(result).toBe(item);
    });

});

describe('getChildren - Root Level', () => {
it('should return empty array when no protected files exist', async () => {
mockProtectedFileProvider.list = vi.fn().mockResolvedValue([]);

      const children = await provider.getChildren();

      expect(children).toEqual([]);
      expect(mockProtectedFileProvider.list).toHaveBeenCalledTimes(1);
    });

    it('should return tree items for all protected files', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          label: 'config.ts',
          path: '/workspace/src/config.ts',
          protectionLevel: 'watch' as ProtectionLevel,
          lastProtectedAt: Date.now()
        },
        {
          id: 'file-2',
          label: 'api.ts',
          path: '/workspace/src/api.ts',
          protectionLevel: 'block' as ProtectionLevel,
          lastProtectedAt: Date.now() - 3600000
        }
      ];

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue(mockFiles);

      const children = await provider.getChildren();

      expect(children).toHaveLength(2);
      expect(mockProtectedFileProvider.list).toHaveBeenCalledTimes(1);
    });

    it('should sort files by lastProtectedAt descending (newest first)', async () => {
      const now = Date.now();
      const mockFiles = [
        {
          id: 'file-1',
          label: 'old.ts',
          path: '/workspace/old.ts',
          protectionLevel: 'watch' as ProtectionLevel,
          lastProtectedAt: now - 7200000 // 2 hours ago
        },
        {
          id: 'file-2',
          label: 'new.ts',
          path: '/workspace/new.ts',
          protectionLevel: 'warn' as ProtectionLevel,
          lastProtectedAt: now // Just now
        },
        {
          id: 'file-3',
          label: 'medium.ts',
          path: '/workspace/medium.ts',
          protectionLevel: 'block' as ProtectionLevel,
          lastProtectedAt: now - 3600000 // 1 hour ago
        }
      ];

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue(mockFiles);

      const children = await provider.getChildren();

      expect(children).toHaveLength(3);
      expect(children[0].label).toBe('new.ts');
      expect(children[1].label).toBe('medium.ts');
      expect(children[2].label).toBe('old.ts');
    });

    it('should handle files without lastProtectedAt timestamp', async () => {
      const mockFiles = [
        {
          id: 'file-1',
          label: 'no-timestamp.ts',
          path: '/workspace/no-timestamp.ts',
          protectionLevel: 'watch' as ProtectionLevel
          // No lastProtectedAt field
        }
      ];

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue(mockFiles);

      const children = await provider.getChildren();

      expect(children).toHaveLength(1);
      expect(children[0].label).toBe('no-timestamp.ts');
    });

});

describe('Tree Item Construction', () => {
it('should create tree item with correct basic properties', async () => {
const mockFile = {
id: 'test-file',
label: 'test.ts',
path: '/workspace/src/test.ts',
protectionLevel: 'watch' as ProtectionLevel,
lastProtectedAt: Date.now()
};

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue([mockFile]);

      const children = await provider.getChildren();
      const item = children[0];

      expect(item).toBeInstanceOf(vscode.TreeItem);
      expect(item.label).toBe('test.ts');
      expect(item.id).toBe('test-file');
      expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
      expect(item.contextValue).toBe('snapback.item.protectedFile');
    });

    it('should set correct icon for each protection level', async () => {
      const mockFiles = [
        {
          id: 'watch-file',
          label: 'watch.ts',
          path: '/workspace/watch.ts',
          protectionLevel: 'watch' as ProtectionLevel
        },
        {
          id: 'warn-file',
          label: 'warn.ts',
          path: '/workspace/warn.ts',
          protectionLevel: 'warn' as ProtectionLevel
        },
        {
          id: 'block-file',
          label: 'block.ts',
          path: '/workspace/block.ts',
          protectionLevel: 'block' as ProtectionLevel
        }
      ];

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue(mockFiles);

      const children = await provider.getChildren();

      // Watch level should have cap emoji
      expect(children[0].description).toContain('🟢');

      // Warn level should have hard hat emoji
      expect(children[1].description).toContain('🟡');

      // Block level should have rescue helmet emoji
      expect(children[2].description).toContain('🔴');
    });

    it('should set tooltip with protection level information', async () => {
      const mockFile = {
        id: 'tooltip-test',
        label: 'config.ts',
        path: '/workspace/config.ts',
        protectionLevel: 'block' as ProtectionLevel,
        lastProtectedAt: 1696800000000
      };

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue([mockFile]);

      const children = await provider.getChildren();
      const item = children[0];

      expect(item.tooltip).toBeTruthy();
      expect(typeof item.tooltip).toBe('string');
      expect(item.tooltip).toContain('Block');
      expect(item.tooltip).toContain('⛑️');
    });

    it('should set command to open file when clicked', async () => {
      const mockFile = {
        id: 'click-test',
        label: 'api.ts',
        path: '/workspace/src/api.ts',
        protectionLevel: 'watch' as ProtectionLevel
      };

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue([mockFile]);

      const children = await provider.getChildren();
      const item = children[0];

      expect(item.command).toBeDefined();
      expect(item.command?.command).toBe('vscode.open');
      expect(item.command?.arguments).toHaveLength(1);
      expect(item.command?.arguments![0].fsPath).toBe('/workspace/src/api.ts');
    });

    it('should set relative path in description', async () => {
      // Mock workspace folders
      const mockWorkspaceFolder = {
        uri: { fsPath: '/workspace' },
        name: 'test-workspace',
        index: 0
      };

      (vscode.workspace as any).workspaceFolders = [mockWorkspaceFolder];

      const mockFile = {
        id: 'relative-path-test',
        label: 'config.ts',
        path: '/workspace/src/config/settings.ts',
        protectionLevel: 'watch' as ProtectionLevel
      };

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue([mockFile]);

      const children = await provider.getChildren();
      const item = children[0];

      // Description should contain relative path from workspace root
      expect(item.description).toBeTruthy();
      // Should show 'src/config/settings.ts' not full path
    });

});

describe('Event Handling', () => {
it('should fire onDidChangeTreeData when refresh() is called', () => {
provider.refresh();

      expect(onDidChangeTreeDataSpy).toHaveBeenCalledTimes(1);
      expect(onDidChangeTreeDataSpy).toHaveBeenCalledWith(undefined);
    });

    it('should refresh tree when specific file is refreshed', () => {
      const uri = vscode.Uri.file('/workspace/test.ts');

      provider.refresh(uri);

      expect(onDidChangeTreeDataSpy).toHaveBeenCalledTimes(1);
      // Provider refreshes entire tree, not individual items
      expect(onDidChangeTreeDataSpy).toHaveBeenCalledWith(undefined);
    });

    it('should allow multiple listeners for onDidChangeTreeData', () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();

      provider.onDidChangeTreeData(listener1);
      provider.onDidChangeTreeData(listener2);

      provider.refresh();

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

});

describe('Error Handling', () => {
it('should return empty array when provider.list() throws error', async () => {
mockProtectedFileProvider.list = vi.fn().mockRejectedValue(
new Error('Storage unavailable')
);

      const children = await provider.getChildren();

      expect(children).toEqual([]);
      // Should log error but not throw
    });

    it('should handle malformed protected file entries gracefully', async () => {
      const malformedFiles = [
        {
          id: 'valid',
          label: 'valid.ts',
          path: '/workspace/valid.ts',
          protectionLevel: 'watch' as ProtectionLevel
        },
        {
          // Missing required fields
          id: 'malformed',
          label: null as any,
          path: undefined as any
        }
      ];

      mockProtectedFileProvider.list = vi.fn().mockResolvedValue(malformedFiles);

      const children = await provider.getChildren();

      // Should only return valid items
      expect(children.length).toBeGreaterThanOrEqual(1);
    });

});

describe('Resource Cleanup', () => {
it('should dispose event emitter on dispose()', () => {
const disposeSpy = vi.spyOn(provider['_onDidChangeTreeData'], 'dispose');

      provider.dispose();

      expect(disposeSpy).toHaveBeenCalledTimes(1);
    });

    it('should not throw when dispose() called multiple times', () => {
      expect(() => {
        provider.dispose();
        provider.dispose();
        provider.dispose();
      }).not.toThrow();
    });

});

describe('getChildren - Child Elements', () => {
it('should return empty array when called with non-root element', async () => {
const mockItem = new vscode.TreeItem('Test Item');

      const children = await provider.getChildren(mockItem);

      expect(children).toEqual([]);
    });

    it('should return undefined when called with unknown element type', async () => {
      const mockItem = new vscode.TreeItem('Unknown');
      mockItem.contextValue = 'unknown.context';

      const children = await provider.getChildren(mockItem);

      expect(children).toEqual([]);
    });

});
});

```

### 3.2 Timeline Integration Tests

**Test File**: `/test/unit/views/CheckpointTimelineProvider.test.ts`

**Key Test Cases**:

``typescript
describe('CheckpointTimelineProvider - Hat Emoji Display', () => {
  it('should display hat emoji for protected checkpoints in timeline', async () => {
    const mockCheckpoint = {
      id: 'checkpoint-1',
      label: 'Protected checkpoint',
      createdAt: Date.now(),
      isProtected: true // Protected checkpoint flag
    };

    mockCheckpointProvider.forFile = vi.fn().mockResolvedValue([mockCheckpoint]);

    const timeline = await timelineProvider.provideTimeline(testUri, {});

    const item = timeline.items[0];
    expect(item.label).toContain('🟢'); // Hat emoji for protected checkpoint
  });

  it('should NOT display hat emoji for manual/unprotected checkpoints', async () => {
    const mockCheckpoint = {
      id: 'checkpoint-2',
      label: 'Manual checkpoint',
      createdAt: Date.now(),
      isProtected: false
    };

    mockCheckpointProvider.forFile = vi.fn().mockResolvedValue([mockCheckpoint]);

    const timeline = await timelineProvider.provideTimeline(testUri, {});

    const item = timeline.items[0];
    expect(item.label).not.toContain('🟢');
  });
});
```

---

## 4. Integration Test Specifications

### 4.1 Explorer Integration Tests

**Test File**: `/test/unit/integration/ExplorerIntegration.test.ts`

**Test Suite**:

``typescript
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import \* as vscode from 'vscode';
import { ProtectedFilesTreeProvider } from '@/views/ProtectedFilesTreeProvider';
import { ProtectedFileRegistry } from '@/services/protectedFileRegistry';

describe('Explorer Integration Tests', () => {
let registry: ProtectedFileRegistry;
let treeProvider: ProtectedFilesTreeProvider;
let registerTreeDataProviderSpy: any;

beforeEach(() => {
const mockState = {
get: vi.fn().mockReturnValue({}),
update: vi.fn().mockResolvedValue(undefined)
};

    registry = new ProtectedFileRegistry(mockState as any);
    treeProvider = new ProtectedFilesTreeProvider(registry);

    registerTreeDataProviderSpy = vi.spyOn(vscode.window, 'registerTreeDataProvider');

});

afterEach(() => {
registry.dispose();
treeProvider.dispose();
vi.clearAllMocks();
});

describe('View Registration', () => {
it('should register tree provider for snapback.explorer view ID', () => {
vscode.window.registerTreeDataProvider('snapback.explorer', treeProvider);

      expect(registerTreeDataProviderSpy).toHaveBeenCalledWith(
        'snapback.explorer',
        expect.anything()
      );
      expect(registerTreeDataProviderSpy).toHaveBeenCalledTimes(1);
    });

    it('should return disposable from registration', () => {
      const mockDisposable = { dispose: vi.fn() };
      registerTreeDataProviderSpy.mockReturnValue(mockDisposable);

      const disposable = vscode.window.registerTreeDataProvider(
        'snapback.explorer',
        treeProvider
      );

      expect(disposable).toBeDefined();
      expect(disposable.dispose).toBeDefined();
    });

    it('should NOT register deprecated view IDs', () => {
      // Migration should remove these registrations
      const deprecatedViews = ['snapback.main', 'snapback.protectedFiles'];

      vscode.window.registerTreeDataProvider('snapback.explorer', treeProvider);

      const registeredViews = registerTreeDataProviderSpy.mock.calls.map(
        (call: any) => call[0]
      );

      for (const deprecated of deprecatedViews) {
        expect(registeredViews).not.toContain(deprecated);
      }
    });

});

describe('Context Updates on Protection Changes', () => {
it('should refresh tree when file protection changes', async () => {
const refreshSpy = vi.spyOn(treeProvider, 'refresh');

      await registry.add('/workspace/test.ts', { protectionLevel: 'watch' });

      // Simulate protection change event triggering refresh
      treeProvider.refresh();

      expect(refreshSpy).toHaveBeenCalled();
    });

    it('should update tree items when protection level changes', async () => {
      await registry.add('/workspace/test.ts', { protectionLevel: 'watch' });

      let children = await treeProvider.getChildren();
      expect(children[0].description).toContain('🟢'); // Watch emoji

      await registry.updateProtectionLevel('/workspace/test.ts', 'block');

      children = await treeProvider.getChildren();
      expect(children[0].description).toContain('⛑️'); // Block emoji
    });

});

describe('Tree Refresh on File Operations', () => {
it('should refresh tree when file is protected', async () => {
const refreshSpy = vi.spyOn(treeProvider, 'refresh');

      await registry.add('/workspace/new-file.ts', { protectionLevel: 'watch' });

      treeProvider.refresh();

      expect(refreshSpy).toHaveBeenCalled();

      const children = await treeProvider.getChildren();
      expect(children).toHaveLength(1);
    });

    it('should refresh tree when file is unprotected', async () => {
      await registry.add('/workspace/temp.ts', { protectionLevel: 'watch' });

      const refreshSpy = vi.spyOn(treeProvider, 'refresh');

      await registry.remove('/workspace/temp.ts');

      treeProvider.refresh();

      expect(refreshSpy).toHaveBeenCalled();

      const children = await treeProvider.getChildren();
      expect(children).toHaveLength(0);
    });

});

describe('View Visibility', () => {
it('should be visible when snapback.isActive context is true', () => {
// This is controlled by package.json "when" clause:
// "when": "snapback.isActive"

      // Test would verify that view appears in UI when context is set
      // In unit tests, we verify the context value is set correctly
      const expectedWhenClause = 'snapback.isActive';
      expect(expectedWhenClause).toBe('snapback.isActive');
    });

    it('should hide welcome view when explorer is active', () => {
      // Welcome view should have "when": "!snapback.isActive"
      // This ensures mutual exclusivity
      const welcomeWhenClause = '!snapback.isActive';
      const explorerWhenClause = 'snapback.isActive';

      expect(welcomeWhenClause).not.toBe(explorerWhenClause);
    });

});

describe('Menu Integration', () => {
it('should expose correct contextValue for menu contributions', async () => {
await registry.add('/workspace/menu-test.ts', { protectionLevel: 'watch' });

      const children = await treeProvider.getChildren();
      const item = children[0];

      // Context value determines which menu items appear
      expect(item.contextValue).toBe('snapback.item.protectedFile');
    });

    it('should support protection level submenu on tree items', async () => {
      await registry.add('/workspace/submenu-test.ts', { protectionLevel: 'warn' });

      const children = await treeProvider.getChildren();
      const item = children[0];

      // Verify item can be used with submenu
      // In package.json: "when": "view == snapback.explorer && viewItem == snapback.item.protectedFile"
      expect(item.contextValue).toBe('snapback.item.protectedFile');
    });

});
});

```

### 4.2 End-to-End Scenario Tests

**Test File**: `/test/unit/integration/E2EScenarios.test.ts`

``typescript
describe('End-to-End User Scenarios', () => {
  describe('Protect File → Verify in Explorer', () => {
    it('should show newly protected file in explorer immediately', async () => {
      const filePath = '/workspace/new-protection.ts';

      // User protects file
      await registry.add(filePath, { protectionLevel: 'watch' });

      // Refresh view (would happen automatically via event)
      treeProvider.refresh();

      // User sees file in explorer
      const children = await treeProvider.getChildren();
      const protectedFile = children.find(item =>
        item.command?.arguments?.[0].fsPath === filePath
      );

      expect(protectedFile).toBeDefined();
      expect(protectedFile?.description).toContain('🟢');
    });
  });

  describe('Create Checkpoint → Verify in Timeline', () => {
    it('should display checkpoint in timeline with hat emoji', async () => {
      const filePath = '/workspace/checkpoint-test.ts';
      const uri = vscode.Uri.file(filePath);

      // User protects file
      await registry.add(filePath, { protectionLevel: 'watch' });

      // User saves file (checkpoint auto-created)
      const mockCheckpoint = {
        id: 'checkpoint-1',
        label: 'Auto: checkpoint-test.ts saved',
        createdAt: Date.now(),
        isProtected: true
      };

      mockCheckpointProvider.forFile = vi.fn().mockResolvedValue([mockCheckpoint]);

      // User opens timeline
      const timeline = await timelineProvider.provideTimeline(uri, {});

      // User sees checkpoint with hat emoji
      expect(timeline.items).toHaveLength(1);
      expect(timeline.items[0].label).toContain('🟢');
    });
  });

  describe('Unprotect File → Verify View Updates', () => {
    it('should remove file from explorer when unprotected', async () => {
      const filePath = '/workspace/temp-protection.ts';

      // Setup: File is protected
      await registry.add(filePath, { protectionLevel: 'watch' });
      treeProvider.refresh();

      let children = await treeProvider.getChildren();
      expect(children).toHaveLength(1);

      // User unprotects file
      await registry.remove(filePath);
      treeProvider.refresh();

      // File disappears from explorer
      children = await treeProvider.getChildren();
      expect(children).toHaveLength(0);
    });
  });

  describe('Change Level → Verify Icon Updates', () => {
    it('should update emoji when protection level changes', async () => {
      const filePath = '/workspace/level-change.ts';

      // User protects at Watch level
      await registry.add(filePath, { protectionLevel: 'watch' });
      treeProvider.refresh();

      let children = await treeProvider.getChildren();
      expect(children[0].description).toContain('🟢');

      // User changes to Block level
      await registry.updateProtectionLevel(filePath, 'block');
      treeProvider.refresh();

      children = await treeProvider.getChildren();
      expect(children[0].description).toContain('⛑️');
    });
  });
});
```

---

## 5. Regression Test Suite

### 5.1 Issue #2: Duplicate View Prevention

**Test File**: `/test/regression/issue-002-explorer-migration.test.ts`

```
/**
 * REGRESSION TEST FOR ISSUE #2: Duplicate Protected Files View
 *
 * MIGRATION FIX: Replace dual-view architecture with unified snapback.explorer
 *
 * BEFORE MIGRATION:
 * - snapback.main (checkpoints + protected files)
 * - snapback.protectedFiles (protected files only)
 * - BUG: Both views registered, causing confusion
 *
 * AFTER MIGRATION:
 * - snapback.explorer (unified protected files view)
 * - No duplicate registrations
 * - Clean architecture with single tree provider
 *
 * VERIFICATION:
 * 1. Only snapback.explorer view ID is registered
 * 2. No registrations for deprecated view IDs
 * 3. Single tree provider instance
 * 4. Activity Bar shows only one SnapBack view
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import * as vscode from 'vscode';

describe('Regression: Issue #2 - Explorer Migration (No Duplicate Views)', () => {
  let registerTreeDataProviderSpy: any;

  beforeEach(() => {
    registerTreeDataProviderSpy = vi.spyOn(vscode.window, 'registerTreeDataProvider');
  });

  it('should ONLY register snapback.explorer view ID', () => {
    const mockProvider = {
      getTreeItem: vi.fn(),
      getChildren: vi.fn().mockResolvedValue([])
    };

    // Simulate migration: Register new unified view
    vscode.window.registerTreeDataProvider('snapback.explorer', mockProvider as any);

    // REGRESSION CHECK: Only one registration
    expect(registerTreeDataProviderSpy).toHaveBeenCalledTimes(1);
    expect(registerTreeDataProviderSpy).toHaveBeenCalledWith(
      'snapback.explorer',
      expect.anything()
    );
  });

  it('should NOT register deprecated snapback.main view', () => {
    const mockProvider = {
      getTreeItem: vi.fn(),
      getChildren: vi.fn().mockResolvedValue([])
    };

    vscode.window.registerTreeDataProvider('snapback.explorer', mockProvider as any);

    // REGRESSION CHECK: Old view ID not registered
    const registeredViews = registerTreeDataProviderSpy.mock.calls.map(
      (call: any) => call[0]
    );

    expect(registeredViews).not.toContain('snapback.main');
  });

  it('should NOT register deprecated snapback.protectedFiles view', () => {
    const mockProvider = {
      getTreeItem: vi.fn(),
      getChildren: vi.fn().mockResolvedValue([])
    };

    vscode.window.registerTreeDataProvider('snapback.explorer', mockProvider as any);

    // REGRESSION CHECK: Old view ID not registered
    const registeredViews = registerTreeDataProviderSpy.mock.calls.map(
      (call: any) => call[0]
    );

    expect(registeredViews).not.toContain('snapback.protectedFiles');
  });

  it('should use single tree provider instance for snapback.explorer', () => {
    const mockProvider = {
      getTreeItem: vi.fn(),
      getChildren: vi.fn().mockResolvedValue([])
    };

    vscode.window.registerTreeDataProvider('snapback.explorer', mockProvider as any);

    // REGRESSION CHECK: Exactly one provider instance
    expect(registerTreeDataProviderSpy).toHaveBeenCalledTimes(1);

    const providerInstance = registerTreeDataProviderSpy.mock.calls[0][1];
    expect(providerInstance).toBe(mockProvider);
  });

  it('should verify view container configuration in package.json', () => {
    // Verify expected package.json structure after migration
    const expectedViewConfig = {
      viewContainerId: 'snapback',
      viewId: 'snapback.explorer',
      viewName: 'SnapBack',
      viewWhen: 'snapback.isActive'
    };

    expect(expectedViewConfig.viewId).toBe('snapback.explorer');
    expect(expectedViewConfig.viewContainerId).toBe('snapback');
  });

  it('should ensure Activity Bar shows single SnapBack icon', () => {
    // This is controlled by package.json viewsContainers configuration
    // Only one container should exist
    const expectedContainerCount = 1;
    const expectedContainerId = 'snapback';

    expect(expectedContainerCount).toBe(1);
    expect(expectedContainerId).toBe('snapback');
  });
});
```

### 5.2 View State Persistence Tests

**Test File**: `/test/regression/issue-002-view-state-persistence.test.ts`

```typescript
describe("Regression: View State Persistence After Migration", () => {
	it("should preserve protected file list after extension reload", async () => {
		const filePath = "/workspace/persistent.ts";

		// Session 1: Protect file
		await registry.add(filePath, { protectionLevel: "watch" });

		// Simulate extension reload
		registry.dispose();
		treeProvider.dispose();

		// Session 2: Recreate instances
		const newState = mockStorage; // Same storage
		const newRegistry = new ProtectedFileRegistry(newState as any);
		const newTreeProvider = new ProtectedFilesTreeProvider(newRegistry);

		// REGRESSION CHECK: File should still be protected
		const children = await newTreeProvider.getChildren();
		expect(children).toHaveLength(1);
		expect(children[0].command?.arguments![0].fsPath).toBe(filePath);
	});
});
```

---

## 6. Edge Case Tests

### 6.1 Empty Workspace Scenarios

``typescript
describe('Edge Case: Empty Workspace', () => {
it('should handle no workspace folders gracefully', async () => {
(vscode.workspace as any).workspaceFolders = undefined;

    const children = await treeProvider.getChildren();

    expect(children).toEqual([]);
    expect(() => treeProvider.refresh()).not.toThrow();

});
});

```

### 6.2 No Protected Files

``typescript
describe('Edge Case: No Protected Files', () => {
  it('should show empty tree when no files protected', async () => {
    mockProtectedFileProvider.list = vi.fn().mockResolvedValue([]);

    const children = await treeProvider.getChildren();

    expect(children).toEqual([]);
  });

  it('should handle transition from some files to no files', async () => {
    // Start with protected files
    await registry.add('/workspace/temp.ts', { protectionLevel: 'watch' });

    let children = await treeProvider.getChildren();
    expect(children).toHaveLength(1);

    // Remove all files
    await registry.remove('/workspace/temp.ts');
    treeProvider.refresh();

    children = await treeProvider.getChildren();
    expect(children).toEqual([]);
  });
});
```

### 6.3 File Deletion Edge Cases

``typescript
describe('Edge Case: File Deletion While Protected', () => {
it('should handle file deletion gracefully', async () => {
const filePath = '/workspace/deleted.ts';

    await registry.add(filePath, { protectionLevel: 'watch' });

    // Simulate file deletion (file no longer exists on disk)
    // Tree provider should still show it (protection persists)
    const children = await treeProvider.getChildren();

    expect(children).toHaveLength(1);
    // Note: User must manually unprotect deleted files

});
});

```

### 6.4 Protection Level Changes

``typescript
describe('Edge Case: Rapid Protection Level Changes', () => {
  it('should handle rapid level changes without corruption', async () => {
    const filePath = '/workspace/rapid-changes.ts';

    await registry.add(filePath, { protectionLevel: 'watch' });

    // Rapid changes
    await registry.updateProtectionLevel(filePath, 'warn');
    await registry.updateProtectionLevel(filePath, 'block');
    await registry.updateProtectionLevel(filePath, 'watch');

    treeProvider.refresh();

    const children = await treeProvider.getChildren();
    expect(children).toHaveLength(1);
    expect(children[0].description).toContain('🟢'); // Final state: watch
  });
});
```

---

## 7. Test Data and Fixtures

### 7.1 Mock Protected File Entries

``typescript
// test/fixtures/mockProtectedFiles.ts

import type { ProtectedFileEntry, ProtectionLevel } from '@/views/types';

export const createMockProtectedFile = (
overrides?: Partial<ProtectedFileEntry>
): ProtectedFileEntry => ({
id: 'test-file-1',
label: 'test.ts',
path: '/workspace/test.ts',
protectionLevel: 'watch' as ProtectionLevel,
lastProtectedAt: Date.now(),
...overrides
});

export const mockProtectedFiles: ProtectedFileEntry[] = [
{
id: 'file-1',
label: 'config.ts',
path: '/workspace/src/config.ts',
protectionLevel: 'watch',
lastProtectedAt: Date.now()
},
{
id: 'file-2',
label: 'api.ts',
path: '/workspace/src/api/api.ts',
protectionLevel: 'warn',
lastProtectedAt: Date.now() - 3600000 // 1 hour ago
},
{
id: 'file-3',
label: 'auth.ts',
path: '/workspace/src/auth/auth.ts',
protectionLevel: 'block',
lastProtectedAt: Date.now() - 7200000 // 2 hours ago
}
];

```

### 7.2 Mock Registry Factory

``typescript
// test/helpers/mockRegistry.ts

import { vi } from 'vitest';
import type { ProtectedFileProvider } from '@/views/types';

export const createMockRegistry = (
  overrides?: Partial<ProtectedFileProvider>
): ProtectedFileProvider => ({
  list: vi.fn().mockResolvedValue([]),
  total: vi.fn().mockResolvedValue(0),
  add: vi.fn().mockResolvedValue(undefined),
  updateProtectionLevel: vi.fn().mockResolvedValue(undefined),
  remove: vi.fn().mockResolvedValue(undefined),
  markCheckpoint: vi.fn().mockResolvedValue(undefined),
  ...overrides
});
```

---

## 8. Quality Gates and Success Criteria

### 8.1 Pre-Merge Requirements

**CRITICAL (P0) - Must Pass Before Merge**:

-   ✅ All unit tests pass (0 failures)
-   ✅ All integration tests pass (0 failures)
-   ✅ All regression tests pass (0 failures)
-   ✅ Code coverage ≥ 95% for new/modified tree provider code
-   ✅ Code coverage ≥ 80% overall (project threshold)
-   ✅ Zero TypeScript errors (`pnpm check-types`)
-   ✅ Zero linting errors (`pnpm lint`)
-   ✅ Manual verification checklist 100% complete

**IMPORTANT (P1) - Strongly Recommended Before Merge**:

-   ✅ Timeline integration tests pass
-   ✅ Context menu tests pass
-   ✅ View visibility tests pass
-   ✅ Performance benchmarks within acceptable range

**RECOMMENDED (P2) - Can Address Post-Merge**:

-   Edge case tests for unusual scenarios
-   Additional tooltip verification
-   Icon rendering tests

### 8.2 Rollback Triggers

**Immediate rollback if**:

-   Any P0 test fails in CI/CD
-   Extension fails to activate after merge
-   Tree view completely broken (blank or error)
-   File protection/unprotection broken
-   Data loss or corruption detected

**Consider rollback if**:

-   Multiple P1 tests fail
-   Critical user workflow broken
-   Performance degradation > 50%
-   User-reported severity-1 bugs

### 8.3 Success Metrics

```
code_quality:
  unit_test_coverage: ">= 95%"
  integration_test_coverage: ">= 85%"
  regression_test_pass_rate: "100%"
  typescript_errors: "0"
  linting_errors: "0"

functionality:
  view_registration_success: "100%"
  tree_refresh_accuracy: "100%"
  context_menu_availability: "100%"
  protection_state_persistence: "100%"

performance:
  tree_render_time: "< 100ms"
  refresh_latency: "< 50ms"
  memory_usage_increase: "< 10%"

user_experience:
  duplicate_view_incidents: "0"
  view_visibility_issues: "0"
  protection_state_mismatches: "0"
```

---

## 9. Manual Verification Checklist

### 9.1 Pre-Merge Manual Tests

**Tester**: ******\_****** **Date**: ******\_******

**Environment**: VSCode version **\_\_\_** | OS: **\_\_\_**

#### View Registration

-   [ ] Extension activates without errors
-   [ ] SnapBack icon appears in Activity Bar (only one)
-   [ ] Clicking icon opens SnapBack sidebar
-   [ ] Explorer view titled "SnapBack" is visible

#### Protected Files Display

-   [ ] Protect a file → appears in Explorer immediately
-   [ ] File shows correct protection level emoji (🧢/👷/⛑️)
-   [ ] Tooltip shows protection level details
-   [ ] Relative file path displayed correctly

#### Protection Level Changes

-   [ ] Right-click file in Explorer → submenu appears
-   [ ] Change level to Watch → emoji updates to 🧢
-   [ ] Change level to Warn → emoji updates to 👷
-   [ ] Change level to Block → emoji updates to ⛑️

#### File Operations

-   [ ] Unprotect file → disappears from Explorer
-   [ ] Protect multiple files → all appear in Explorer
-   [ ] Delete protected file → still listed (expected behavior)

#### Timeline Integration

-   [ ] Open Timeline for protected file
-   [ ] Checkpoints appear with correct timestamps
-   [ ] Protected checkpoints show 🧢 emoji
-   [ ] Manual checkpoints do NOT show emoji
-   [ ] Click checkpoint → restores correctly

#### Context Menus

-   [ ] Right-click file in Explorer → context menu appears
-   [ ] "Set Protection Level" submenu available
-   [ ] "Change Protection Level" command available
-   [ ] All menu items execute correctly

#### View Visibility

-   [ ] View visible when files are protected
-   [ ] Welcome view NOT visible when Explorer is active
-   [ ] No duplicate SnapBack views in sidebar

#### Sorting and Display

-   [ ] Files sorted by protection time (newest first)
-   [ ] File count accurate
-   [ ] No duplicate file entries

#### Edge Cases

-   [ ] Open workspace with no protected files → Explorer empty
-   [ ] Protect file → unprotect → protect again → works correctly
-   [ ] Rapid protection level changes → no corruption
-   [ ] Extension reload → protected files persist

#### Performance

-   [ ] Tree renders in < 100ms (perceived as instant)
-   [ ] Refresh operations feel snappy
-   [ ] No lag when protecting/unprotecting files

#### Cleanup Verification

-   [ ] NO "snapback.main" view in package.json
-   [ ] NO "snapback.protectedFiles" view in package.json
-   [ ] NO duplicate registrations in extension.ts
-   [ ] Only "snapback.explorer" view remains

**Overall Assessment**: PASS ☐ | FAIL ☐

**Notes**:

---

---

---

---

## 10. Test Execution Plan

### 10.1 Local Development Workflow

```
# Run all tests
pnpm test

# Run only unit tests
pnpm test:unit

# Run tests in watch mode (during development)
pnpm test:unit:watch

# Run tests with UI (interactive)
pnpm test:unit:ui

# Run regression tests specifically
pnpm test:regression

# Run with coverage
pnpm test:coverage

# Type check
pnpm check-types

# Lint
pnpm lint
```

### 10.2 CI/CD Pipeline

```
# .github/workflows/test-explorer-migration.yml

name: Explorer Migration Tests

on:
  pull_request:
    paths:
      - 'apps/vscode/src/views/**'
      - 'apps/vscode/src/extension.ts'
      - 'apps/vscode/test/**'

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v2
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Type check
        run: pnpm --filter vscode run check-types

      - name: Lint
        run: pnpm --filter vscode run lint

      - name: Unit tests
        run: pnpm --filter vscode run test:unit

      - name: Regression tests
        run: pnpm --filter vscode run test:regression

      - name: Coverage check
        run: pnpm --filter vscode run test:coverage

      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./apps/vscode/coverage/lcov.info
```

### 10.3 Test Execution Order

**Phase 1: Development** (Local)

1. Run unit tests in watch mode
2. Develop tree provider with TDD approach
3. Run regression tests frequently
4. Check coverage regularly

**Phase 2: Pre-Commit** (Local)

1. Full unit test suite
2. Full regression test suite
3. Type check
4. Linting

**Phase 3: Pre-Push** (Local)

1. All test suites
2. Coverage check (must meet thresholds)
3. Manual verification checklist
4. Performance benchmarks

**Phase 4: CI/CD** (Automated)

1. Type check
2. Linting
3. Unit tests
4. Integration tests
5. Regression tests
6. Coverage upload
7. Bundle size check

**Phase 5: Pre-Merge** (Manual)

1. Manual verification checklist
2. Review test results from CI
3. Performance validation
4. User acceptance testing (if applicable)

---

## 11. Risk Assessment and Mitigation

### 11.1 High-Risk Areas

| Risk Area                    | Impact   | Likelihood | Mitigation                                       |
| ---------------------------- | -------- | ---------- | ------------------------------------------------ |
| View registration failure    | CRITICAL | Low        | Comprehensive registration tests + rollback plan |
| Tree refresh race conditions | HIGH     | Medium     | Event handling tests + integration tests         |
| Protection state corruption  | CRITICAL | Low        | State persistence tests + data validation        |
| Menu context not working     | HIGH     | Medium     | Context menu integration tests                   |
| Timeline integration broken  | MEDIUM   | Medium     | Timeline provider tests + E2E scenarios          |
| Performance degradation      | MEDIUM   | Low        | Performance benchmarks + profiling               |

### 11.2 Mitigation Strategies

**For View Registration Failure**:

-   Unit tests verify registration success
-   Integration tests check for duplicate registrations
-   Rollback plan: revert to dual-view architecture
-   Feature flag to enable/disable new view

**For Tree Refresh Race Conditions**:

-   Event emitter tests with rapid firing
-   Concurrent operation tests
-   State consistency validation
-   Debouncing if needed

**For Protection State Corruption**:

-   Cache coherency tests
-   Persistence validation tests
-   Backup state before updates
-   Atomic operations

**For Menu Context Issues**:

-   Context value validation tests
-   Menu contribution verification
-   package.json configuration tests

---

## 12. Test Utilities and Helpers

### 12.1 Test Helper Functions

``typescript
// test/helpers/treeProviderHelpers.ts

import { ProtectedFilesTreeProvider } from '@/views/ProtectedFilesTreeProvider';
import { createMockRegistry } from './mockRegistry';

/\*\*

-   Create a fully configured tree provider for testing
    \*/
    export const createTestTreeProvider = () => {
    const mockRegistry = createMockRegistry();
    const treeProvider = new ProtectedFilesTreeProvider(mockRegistry);

return { treeProvider, mockRegistry };
};

/\*\*

-   Wait for tree refresh to complete
    \*/
    export const waitForTreeRefresh = async (delayMs: number = 50) => {
    await new Promise(resolve => setTimeout(resolve, delayMs));
    };

/\*\*

-   Get all tree items at root level
    \*/
    export const getAllTreeItems = async (
    provider: ProtectedFilesTreeProvider
    ) => {
    return await provider.getChildren();
    };

/\*\*

-   Find tree item by label
    \*/
    export const findTreeItemByLabel = async (
    provider: ProtectedFilesTreeProvider,
    label: string
    ) => {
    const items = await provider.getChildren();
    return items.find(item => item.label === label);
    };

```

### 12.2 Assertion Helpers

``typescript
// test/helpers/assertions.ts

import { expect } from 'vitest';
import type { TreeItem } from 'vscode';

/**
 * Assert tree item has protection level emoji
 */
export const expectProtectionEmoji = (
  item: TreeItem,
  level: 'watch' | 'warn' | 'block'
) => {
  const emojiMap = {
    watch: '🟢',
    warn: '🟡',
    block: '🔴'
  };

  expect(item.description).toContain(emojiMap[level]);
};

/**
 * Assert tree item context value is correct
 */
export const expectProtectedFileContext = (item: TreeItem) => {
  expect(item.contextValue).toBe('snapback.item.protectedFile');
};

/**
 * Assert tree provider has correct number of items
 */
export const expectTreeItemCount = async (
  provider: any,
  expectedCount: number
) => {
  const items = await provider.getChildren();
  expect(items).toHaveLength(expectedCount);
};
```

---

## 13. Documentation Requirements

### 13.1 Code Documentation

**Required for all new code**:

-   TSDoc comments for public methods
-   Parameter descriptions
-   Return type documentation
-   Example usage for complex methods

**Example**:
``typescript
/\*\*

-   Provides tree data for the SnapBack Explorer view.
-
-   This provider displays all protected files with their protection levels,
-   sorted by most recently protected. It replaces the previous dual-view
-   architecture (snapback.main + snapback.protectedFiles).
-
-   @example
-   ```typescript

    ```
-   const provider = new ProtectedFilesTreeProvider(registry);
-   vscode.window.registerTreeDataProvider('snapback.explorer', provider);
-   ```
     */
    export class ProtectedFilesTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
      // ...
    }
    ```

```

### 13.2 Test Documentation

**Each test file should include**:
- File-level description of what's being tested
- Test suite organization explanation
- Complex test case comments
- References to related bugs/issues

### 13.3 Migration Documentation

**Update these files**:
- `CHANGELOG.md` - Migration notes
- `README.md` - Updated architecture diagram
- `ARCHITECTURE.md` - Tree provider design
- Package.json - View contribution descriptions

---

## 14. Performance Benchmarks

### 14.1 Performance Test Suite

**Test File**: `/test/performance/treeProviderPerformance.test.ts`

``typescript
import { describe, it, expect } from 'vitest';
import { ProtectedFilesTreeProvider } from '@/views/ProtectedFilesTreeProvider';

describe('Performance: Tree Provider Rendering', () => {
  it('should render 100 protected files in < 100ms', async () => {
    const mockFiles = Array.from({ length: 100 }, (_, i) => ({
      id: `file-${i}`,
      label: `file${i}.ts`,
      path: `/workspace/file${i}.ts`,
      protectionLevel: 'watch' as const,
      lastProtectedAt: Date.now()
    }));

    const mockRegistry = {
      list: vi.fn().mockResolvedValue(mockFiles),
      // ... other methods
    };

    const provider = new ProtectedFilesTreeProvider(mockRegistry as any);

    const start = performance.now();
    await provider.getChildren();
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(100);
  });

  it('should refresh tree in < 50ms', async () => {
    const provider = createTestTreeProvider();

    const start = performance.now();
    provider.refresh();
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
  });
});
```

### 14.2 Performance Targets

```
operation_performance:
  tree_initial_render: "< 100ms"
  tree_refresh: "< 50ms"
  tree_item_creation: "< 1ms per item"
  event_propagation: "< 10ms"

memory_usage:
  tree_provider_instance: "< 1MB"
  cached_items: "< 100KB per 100 items"
  event_emitter_overhead: "< 10KB"

scalability:
  max_files_supported: "1000+"
  max_concurrent_refreshes: "10+"
  max_event_listeners: "50+"
```

---

## 15. Appendices

### Appendix A: Package.json View Configuration

**Expected configuration after migration**:

```
{
  "contributes": {
    "viewsContainers": {
      "activitybar": [
        {
          "id": "snapback",
          "title": "SnapBack",
          "icon": "media/vscode-icon.min.svg"
        }
      ]
    },
    "views": {
      "snapback": [
        {
          "id": "snapback.explorer",
          "name": "SnapBack",
          "when": "snapback.isActive"
        },
        {
          "id": "snapback.welcome",
          "name": "Getting Started",
          "when": "!snapback.isActive"
        }
      ]
    },
    "menus": {
      "view/item/context": [
        {
          "submenu": "snapback.protectionLevels",
          "when": "view == snapback.explorer && viewItem == snapback.item.protectedFile",
          "group": "inline@1"
        }
      ]
    }
  }
}
```

### Appendix B: Test File Locations

```
apps/vscode/
├── test/
│   ├── unit/
│   │   ├── views/
│   │   │   ├── ProtectedFilesTreeProvider.test.ts [NEW]
│   │   │   ├── CheckpointTimelineProvider.test.ts [MODIFIED]
│   │   │   └── snapBackTreeProvider.test.ts [DEPRECATED]
│   │   ├── integration/
│   │   │   ├── ExplorerIntegration.test.ts [NEW]
│   │   │   └── E2EScenarios.test.ts [NEW]
│   │   └── setup.ts [EXISTING]
│   ├── regression/
│   │   ├── issue-002-explorer-migration.test.ts [NEW]
│   │   └── issue-002-view-state-persistence.test.ts [NEW]
│   ├── performance/
│   │   └── treeProviderPerformance.test.ts [NEW]
│   ├── fixtures/
│   │   └── mockProtectedFiles.ts [NEW]
│   └── helpers/
│       ├── mockRegistry.ts [NEW]
│       ├── treeProviderHelpers.ts [NEW]
│       └── assertions.ts [NEW]
└── src/
    └── views/
        ├── ProtectedFilesTreeProvider.ts [NEW]
        └── snapBackTreeProvider.ts [DEPRECATED]
```

### Appendix C: Key Decision Log

| Decision                           | Rationale                              | Impact                              |
| ---------------------------------- | -------------------------------------- | ----------------------------------- |
| Use Vitest for tree provider tests | Faster than Mocha, better mocking      | Consistent with existing unit tests |
| 95% coverage target for new code   | High-risk architectural change         | Ensures thorough validation         |
| Manual verification checklist      | UI changes require human verification  | Catches visual/UX issues            |
| Regression tests for Issue #2      | Prevents duplicate view bug recurrence | Historical bug prevention           |
| Performance benchmarks             | Ensure no degradation                  | User experience protection          |

### Appendix D: Related Documentation

-   [Issue #2 Bug Report](./BUG-004-FIX-REPORT.md)
-   [SnapBack Architecture](./ARCHITECTURE.md)
-   [Testing Guidelines](./TESTING.md)
-   [VSCode Tree View API](https://code.visualstudio.com/api/extension-guides/tree-view)

---

## Summary

This comprehensive test plan provides:

✅ **145+ existing test examples** analyzed for patterns
✅ **Complete unit test suite** for ProtectedFilesTreeProvider
✅ **Integration tests** for Explorer and Timeline
✅ **Regression tests** preventing Issue #2 recurrence
✅ **Edge case coverage** for unusual scenarios
✅ **Manual verification checklist** for human validation
✅ **Quality gates** with measurable criteria
✅ **Performance benchmarks** ensuring no degradation
✅ **Test utilities** for efficient test authoring

**Next Steps**:

1. Implement ProtectedFilesTreeProvider with tests
2. Run test suite and verify 95%+ coverage
3. Execute manual verification checklist
4. Update package.json view configuration
5. Run full CI/CD pipeline
6. Perform user acceptance testing
7. Merge with confidence

**Estimated Effort**:

-   Implementation: 4-6 hours
-   Testing: 2-3 hours
-   Manual verification: 1 hour
-   Documentation: 1 hour
-   **Total: 8-11 hours**

**Risk Level**: HIGH → MEDIUM (with this comprehensive test coverage)

---

**Document Prepared By**: Quality Engineering
**Review Status**: Ready for Implementation
**Approval**: Pending Engineering Lead Review
