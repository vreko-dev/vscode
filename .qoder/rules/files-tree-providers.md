---
globs:
  - "src/views/**/*Provider.ts"
  - "**/*TreeProvider.ts"
---

# Tree Provider Patterns

## Core Principle
Tree providers MUST use defensive programming. Filter invalid data, NEVER crash the tree, always return empty array on error. Production builds may optimize away defensive checks.

## Critical Pattern (ProtectedFilesTreeProvider.ts)
```typescript
export class ProtectedFilesTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {

  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private disposables: vscode.Disposable[] = [];

  constructor(private readonly protectedFiles: ProtectedFileRegistry) {
    // Auto-refresh on data changes
    this.disposables.push(
      this.protectedFiles.onDidChangeProtectedFiles(() => {
        this.refresh();
      })
    );
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    // Flat list - no hierarchy
    if (element) {
      return [];
    }

    try {
      const files = await this.protectedFiles.list();

      // CRITICAL: Filter invalid entries (production builds may remove this!)
      const validFiles = files.filter(file => {
        if (!file) {
          logger.warn('⚠️ Skipping undefined protected file entry');
          return false;
        }
        if (!file.label) {
          logger.warn('⚠️ Skipping file with no label:', file);
          return false;
        }
        return true;
      });

      if (validFiles.length !== files.length) {
        logger.info(
          `📦 Found ${validFiles.length} valid protected files out of ${files.length} total`
        );
      }

      // 🛡️ Verify state consistency
      for (const file of validFiles) {
        await this.protectedFiles.verifyProtectionState(file.path);
      }

      // Sort by protection level, then name
      return validFiles
        .sort((a, b) => {
          const levelOrder: Record<ProtectionLevel, number> = {
            Protected: 0,
            Warning: 1,
            Watched: 2,
          };
          const aLevel = a.protectionLevel || "Watched";
          const bLevel = b.protectionLevel || "Watched";

          if (levelOrder[aLevel] !== levelOrder[bLevel]) {
            return levelOrder[aLevel] - levelOrder[bLevel];
          }

          return a.label.localeCompare(b.label);
        })
        .map(entry => createProtectedFileTreeItem(entry));

    } catch (error) {
      logger.error(
        "Error loading protected files:",
        error instanceof Error ? error : undefined
      );
      return []; // NEVER throw - return empty array
    }
  }

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
```

## Tree Item Creation with Defensive Checks
```typescript
export function createProtectedFileTreeItem(
  entry: ProtectedFileEntry
): vscode.TreeItem {
  // Defensive check (prevents crashes with invalid entries)
  if (!entry || !entry.label) {
    logger.error(
      "⚠️ Invalid entry in createProtectedFileTreeItem",
      undefined,
      { entry: JSON.stringify(entry) }
    );
    return new vscode.TreeItem("Unknown File");
  }

  const level = entry.protectionLevel || "Watched";
  const metadata = PROTECTION_LEVELS[level];

  const item = new vscode.TreeItem(
    `${entry.label} ${metadata.label}`,
    vscode.TreeItemCollapsibleState.None
  );

  item.id = entry.id;
  item.contextValue = "snapback.item.protectedFile";

  // Themed icon with color
  item.iconPath = new vscode.ThemeIcon(
    "shield",
    new vscode.ThemeColor(metadata.themeColor)
  );

  // Relative path in description
  item.description = computeRelativePath(entry.path);

  // Rich tooltip
  item.tooltip = buildTooltip(entry, metadata);

  // Command on click
  item.command = {
    command: "snapback.openProtectedFile",
    title: "Open file",
    arguments: [vscode.Uri.file(entry.path)],
  };

  return item;
}
```

## Snapshot Tree Provider Pattern
```typescript
// SnapshotsTreeProvider.ts
export class SnapshotsTreeProvider
  implements vscode.TreeDataProvider<vscode.TreeItem>, vscode.Disposable {

  private _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  constructor(private snapshotService: SnapshotService) {
    // Listen for snapshot events
    this.disposables.push(
      this.snapshotService.onSnapshotCreated(() => this.refresh()),
      this.snapshotService.onSnapshotDeleted(() => this.refresh())
    );
  }

  async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
    if (!element) {
      // Root level - show snapshots
      const snapshots = await this.snapshotService.listSnapshots();
      return snapshots.map(s =>
        new SnapshotTreeItem(s, vscode.TreeItemCollapsibleState.Collapsed)
      );
    }

    if (element instanceof SnapshotTreeItem) {
      // Show files in snapshot
      const files = element.snapshot.meta?.files || [];
      const filesArray = Array.isArray(files) ? files : [];
      return filesArray.map(f => new FileTreeItem(f));
    }

    return [];
  }
}
```

## Tooltip Generation
```typescript
function buildTooltip(
  entry: ProtectedFileEntry,
  metadata: ProtectionMetadata
): vscode.MarkdownString {
  const tooltip = new vscode.MarkdownString();
  tooltip.isTrusted = true;

  tooltip.appendMarkdown(`### ${entry.label}\n\n`);
  tooltip.appendMarkdown(`**Path:** \`${entry.path}\`\n\n`);
  tooltip.appendMarkdown(
    `**Protection Level:** ${metadata.icon} ${metadata.label}\n\n`
  );
  tooltip.appendMarkdown(`${metadata.description}\n\n`);

  if (entry.lastProtectedAt) {
    const date = new Date(entry.lastProtectedAt).toLocaleString();
    tooltip.appendMarkdown(`**Last Protected:** ${date}\n\n`);
  }

  if (entry.lastSnapshotId) {
    tooltip.appendMarkdown(`**Snapshot ID:** \`${entry.lastSnapshotId}\`\n`);
  }

  return tooltip;
}
```

## Context Values for Menus
```typescript
// Tree item with context value for conditional menus
item.contextValue = "snapback.item.protectedFile";

// In package.json, menu shows only for this context:
// "view/item/context": [
//   {
//     "command": "snapback.unprotectFile",
//     "when": "view == snapback.protectedFiles && viewItem == snapback.item.protectedFile"
//   }
// ]
```

## Requirements
✅ Implement `vscode.TreeDataProvider<vscode.TreeItem>`
✅ Implement `vscode.Disposable`
✅ Create EventEmitter for `onDidChangeTreeData`
✅ Subscribe to data source events for auto-refresh
✅ Wrap `getChildren()` in try-catch, return `[]` on error
✅ Filter undefined/null entries before mapping
✅ Log warnings for invalid data
✅ NEVER throw in `getChildren()` or `getTreeItem()`
✅ Use themed icons (`vscode.ThemeIcon` + `vscode.ThemeColor`)
✅ Provide rich tooltips with `vscode.MarkdownString`
✅ Set `contextValue` for conditional menu items
✅ Dispose EventEmitter in `dispose()`

## Anti-Patterns
❌ Throwing exceptions in `getChildren()` (crashes tree)
❌ Not filtering invalid data (shows "undefined" in UI)
❌ Forgetting to dispose EventEmitter
❌ Not subscribing to data source events (stale UI)
❌ Returning undefined instead of empty array
❌ Using hardcoded icon paths (not theme-compatible)
❌ Not handling async errors gracefully
❌ Mutating tree items after creation

## Testing Tree Providers
```typescript
import { VSCodeMockFactory } from '../../helpers/vscodeHelpers';

describe('ProtectedFilesTreeProvider', () => {
  let provider: ProtectedFilesTreeProvider;
  let mockRegistry: ProtectedFileRegistry;

  beforeEach(() => {
    mockRegistry = createMockRegistry();
    provider = new ProtectedFilesTreeProvider(mockRegistry);
  });

  it('should filter undefined entries', async () => {
    mockRegistry.list.mockResolvedValue([
      { id: '1', label: 'valid.ts', path: '/valid.ts' },
      undefined, // Invalid entry
      { id: '2', label: 'valid2.ts', path: '/valid2.ts' }
    ]);

    const children = await provider.getChildren();

    expect(children).toHaveLength(2); // Filtered out undefined
  });

  it('should return empty array on error', async () => {
    mockRegistry.list.mockRejectedValue(new Error('DB connection lost'));

    const children = await provider.getChildren();

    expect(children).toEqual([]); // No crash
  });
});
```
