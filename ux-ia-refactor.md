# SnapBack UX/IA Implementation - Phase 2: Information Architecture (REVISED v2)

**Estimated Time**: 10-14 hours
**Priority**: HIGH
**Dependencies**: Phase 1 complete
**Goal**: Create a calm, confident, glanceable interface that respects developer attention
**Future-Proofing**: Includes extensible grouping architecture for system-aware features

---

## Design Philosophy

Before writing any code, internalize these principles:

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SNAPBACK DESIGN PRINCIPLES                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  1. LEAD WITH VALUE, NOT STATUS                                      │
│     "232 files protected" > "Protection Status: Active"             │
│                                                                      │
│  2. NO NEWS IS GOOD NEWS                                             │
│     Don't show "All good!" - absence of problems IS the signal      │
│                                                                      │
│  3. HIDE EMPTY STATES                                                │
│     If there's nothing to show, don't show a section                │
│                                                                      │
│  4. SNAPSHOTS ARE THE PRODUCT                                        │
│     The ability to go back IS the value - make it prominent         │
│                                                                      │
│  5. RESPECT ATTENTION                                                │
│     Every pixel should earn its place                               │
│                                                                      │
│  6. PROBLEMS INTERRUPT, CONFIDENCE REASSURES                         │
│     Show problems loudly, show health quietly                       │
│                                                                      │
│  7. DESIGN FOR EXTENSION                                             │
│     Build flexibility for system-aware grouping without complexity  │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### The Glanceable Test

A developer glancing at the sidebar should instantly know:
- ✅ "Am I protected?" → Single number, positive framing
- ✅ "Recent activity?" → Snapshots visible without clicking
- ✅ "Any problems?" → Only shown if YES
- ✅ "How do I restore?" → Obvious action available

---

## Future-Proof Architecture

### Grouping Modes

The TreeView will support three grouping modes (only `time` implemented now):

```
┌─────────────────────────────────────────────────────────────────────┐
│                       GROUPING MODES                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  MODE: 'time' (DEFAULT - Implement Now)                              │
│  ├─ RECENT                                                          │
│  │   ├─ AI Edit (Cursor) - Button.tsx              19m ago          │
│  │   └─ Auto-save - config.json                    2h ago           │
│  ├─ YESTERDAY                                                       │
│  └─ THIS WEEK                                                       │
│                                                                      │
│  MODE: 'system' (Future - Post-Demo)                                 │
│  ├─ BY SYSTEM ▼                                                     │
│  │   ├─ 📦 apps/web (45)                                            │
│  │   │   ├─ Button.tsx                                              │
│  │   │   └─ config.json                                             │
│  │   └─ 📦 packages/sdk (12)                                        │
│  │       └─ ...                                                     │
│                                                                      │
│  MODE: 'file' (Future - Power Users)                                 │
│  ├─ BY FILE ▼                                                       │
│  │   ├─ src/Button.tsx (8 snapshots)                                │
│  │   ├─ package.json (5 snapshots)                                  │
│  │   └─ ...                                                         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Architecture Benefits

| Benefit | Description |
|---------|-------------|
| **Zero breaking changes** | Adding system/file grouping later won't require refactoring |
| **Config-driven** | Users can change grouping via settings or dropdown |
| **Testable** | Each grouping strategy is isolated and testable |
| **Extensible** | New grouping modes can be added without touching existing code |

---

## Before/After Comparison

```
BEFORE (Cluttered)                AFTER (Focused + Extensible)
─────────────────────────         ─────────────────────────
SAFETY DASHBOARD                  🛡️ 232 files protected
├─ Protection Status Error
│  ├─ Status: Error               RECENT              [BY TIME ▼]
│  ├─ Protected: 0 files          ├─ .env.local           19m ago
├─ ✓ All critical...              ├─ pnpm-lock.yaml       12h ago
├─ Blocking Issues (0)            ├─ Manual checkpoint    12h ago
│  └─ ✓ All good!                 └─ ⋯ 9 more
├─ Watch Items (0)
│  └─ ✓ No items                  YESTERDAY               ▶
├─ Snapshot (12)
│  ├─ Modified .env...            ─────────────────────────
│  └─ ...                         ACTIONS
├─ PROTECTED FILES                ├─ 📷 Create Snapshot
│  ├─ Block (25)                  ├─ ↩️ Restore Last
│  ├─ Warn (38)                   └─ 🔍 Search...
│  └─ Watch (169)
├─ SESSIONS

Lines: ~25+                       Lines: ~12
Cognitive load: HIGH              Cognitive load: LOW
                                  Future-proof: YES ✓
```

---

## Pre-Implementation Checklist

```bash
# Verify Phase 1 is complete
cd apps/vscode

# 1. Constants exist
ls src/constants/icons.ts src/constants/colors.ts src/constants/commands.ts

# 2. No hardcoded emojis
grep -rn "['\"]\(👁️\|⚠️\|🛑\|🛡️\|🚨\|✅\|❌\)" src/ --include="*.ts" | grep -v "constants/" | wc -l
# Should return 0

# 3. Build passes
pnpm build && pnpm typecheck
```

---

## Task 1: Define Types with Future-Proof Grouping (1 hour)

### 1.1 Create Types File

**File**: `apps/vscode/src/views/types.ts`

```typescript
// ============================================
// GROUPING MODES (Future-Proof Architecture)
// ============================================

/**
 * Grouping mode for TreeView display.
 * - 'time': Group by recency (Today, Yesterday, This Week) - DEFAULT
 * - 'system': Group by detected system/package (apps/web, packages/sdk) - FUTURE
 * - 'file': Group by file path - FUTURE
 */
export type GroupingMode = 'time' | 'system' | 'file';

/**
 * TreeView configuration with extensible grouping
 */
export interface TreeViewConfig {
  /** How to group snapshots in the tree */
  groupBy: GroupingMode;

  /** Show AI detection indicators */
  showAI: boolean;

  /** Show protection level badges */
  showProtection: boolean;

  /** Maximum snapshots to show per group before "show more" */
  maxPerGroup: number;
}

/**
 * Default configuration - time-based grouping
 */
export const DEFAULT_TREE_CONFIG: TreeViewConfig = {
  groupBy: 'time',
  showAI: true,
  showProtection: true,
  maxPerGroup: 5,
};

// ============================================
// SNAPSHOT DISPLAY TYPES
// ============================================

/**
 * Snapshot display item for TreeView
 */
export interface SnapshotDisplayItem {
  id: string;
  name: string;           // "AI Edit (Cursor) - Button.tsx"
  timestamp: Date;
  trigger: SnapshotTrigger;
  fileCount: number;
  primaryFile: string;
  aiTool?: string;
  description: string;    // "19 minutes ago"

  // For system grouping (future)
  detectedSystem?: string;  // "apps/web", "packages/sdk"
}

export type SnapshotTrigger = 'auto' | 'manual' | 'ai-detected' | 'pre-save';

// ============================================
// TIME GROUPING (Implement Now)
// ============================================

/**
 * Time-based group keys
 */
export type TimeGroup = 'recent' | 'yesterday' | 'this-week' | 'older';

/**
 * Grouped snapshots by time
 */
export interface TimeGroupedSnapshots {
  recent: SnapshotDisplayItem[];      // Last 24 hours
  yesterday: SnapshotDisplayItem[];   // Yesterday
  thisWeek: SnapshotDisplayItem[];    // This week (excluding today/yesterday)
  older: SnapshotDisplayItem[];       // Everything else
}

// ============================================
// SYSTEM GROUPING (Future - Stub Only)
// ============================================

/**
 * System-based group (for future implementation)
 */
export interface SystemGroup {
  /** System identifier: "apps/web", "packages/sdk" */
  systemId: string;

  /** Human-readable name */
  displayName: string;

  /** Icon for the system type */
  icon: string;

  /** Snapshots in this system */
  snapshots: SnapshotDisplayItem[];

  /** File count in this system */
  fileCount: number;
}

/**
 * Grouped snapshots by system (future)
 */
export interface SystemGroupedSnapshots {
  systems: SystemGroup[];
  ungrouped: SnapshotDisplayItem[];  // Files that don't belong to a detected system
}

// ============================================
// FILE GROUPING (Future - Stub Only)
// ============================================

/**
 * File-based group (for future implementation)
 */
export interface FileGroup {
  /** File path */
  filePath: string;

  /** File name for display */
  fileName: string;

  /** Snapshots containing this file */
  snapshots: SnapshotDisplayItem[];
}

/**
 * Grouped snapshots by file (future)
 */
export interface FileGroupedSnapshots {
  files: FileGroup[];
}

// ============================================
// UNION TYPE FOR ALL GROUPINGS
// ============================================

/**
 * Union type for grouped snapshots based on mode
 */
export type GroupedSnapshots =
  | { mode: 'time'; data: TimeGroupedSnapshots }
  | { mode: 'system'; data: SystemGroupedSnapshots }
  | { mode: 'file'; data: FileGroupedSnapshots };

// ============================================
// QUICK ACTIONS & PROBLEMS
// ============================================

/**
 * Quick action item
 */
export interface QuickAction {
  id: string;
  label: string;
  icon: string;
  command: string;
}

/**
 * A problem that needs attention
 */
export interface ProblemItem {
  id: string;
  severity: 'warning' | 'error';
  title: string;
  description: string;
  action?: {
    label: string;
    command: string;
  };
}
```

---

## Task 2: Implement Grouping Strategy Pattern (1 hour)

### 2.1 Create Grouping Strategy Interface

**File**: `apps/vscode/src/views/grouping/types.ts`

```typescript
import type {
  SnapshotDisplayItem,
  GroupingMode,
  TimeGroupedSnapshots,
  SystemGroupedSnapshots,
  FileGroupedSnapshots
} from '../types';

/**
 * Strategy interface for grouping snapshots
 */
export interface GroupingStrategy<T> {
  /** The mode this strategy handles */
  readonly mode: GroupingMode;

  /** Group snapshots according to this strategy */
  group(snapshots: SnapshotDisplayItem[]): T;

  /** Get display label for a group */
  getGroupLabel(groupKey: string): string;

  /** Get icon for a group */
  getGroupIcon(groupKey: string): string;

  /** Check if group should be expanded by default */
  isExpandedByDefault(groupKey: string): boolean;
}
```

### 2.2 Implement Time Grouping Strategy

**File**: `apps/vscode/src/views/grouping/TimeGroupingStrategy.ts`

```typescript
import type { GroupingStrategy } from './types';
import type { SnapshotDisplayItem, TimeGroupedSnapshots, TimeGroup } from '../types';

/**
 * Groups snapshots by time (Today, Yesterday, This Week, Older)
 * This is the DEFAULT and ONLY implemented strategy for now.
 */
export class TimeGroupingStrategy implements GroupingStrategy<TimeGroupedSnapshots> {
  readonly mode = 'time' as const;

  group(snapshots: SnapshotDisplayItem[]): TimeGroupedSnapshots {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

    const grouped: TimeGroupedSnapshots = {
      recent: [],
      yesterday: [],
      thisWeek: [],
      older: []
    };

    for (const snap of snapshots) {
      const snapDate = snap.timestamp;

      if (snapDate >= today) {
        grouped.recent.push(snap);
      } else if (snapDate >= yesterday) {
        grouped.yesterday.push(snap);
      } else if (snapDate >= weekAgo) {
        grouped.thisWeek.push(snap);
      } else {
        grouped.older.push(snap);
      }
    }

    return grouped;
  }

  getGroupLabel(groupKey: TimeGroup): string {
    switch (groupKey) {
      case 'recent': return 'RECENT';
      case 'yesterday': return 'YESTERDAY';
      case 'this-week': return 'THIS WEEK';
      case 'older': return 'OLDER';
      default: return groupKey.toUpperCase();
    }
  }

  getGroupIcon(groupKey: TimeGroup): string {
    // Time groups don't need icons - the label is sufficient
    return '';
  }

  isExpandedByDefault(groupKey: TimeGroup): boolean {
    // Only expand "recent" by default
    return groupKey === 'recent';
  }
}
```

### 2.3 Create Stub Strategies for Future (Optional but Recommended)

**File**: `apps/vscode/src/views/grouping/SystemGroupingStrategy.ts`

```typescript
import type { GroupingStrategy } from './types';
import type { SnapshotDisplayItem, SystemGroupedSnapshots } from '../types';
import { SNAPBACK_ICONS } from '../../constants';

/**
 * Groups snapshots by detected system (apps/web, packages/sdk, etc.)
 *
 * STATUS: STUB - Full implementation coming post-demo
 * This stub exists to validate the architecture.
 */
export class SystemGroupingStrategy implements GroupingStrategy<SystemGroupedSnapshots> {
  readonly mode = 'system' as const;

  group(snapshots: SnapshotDisplayItem[]): SystemGroupedSnapshots {
    // STUB: For now, just return everything as ungrouped
    // Full implementation will use SystemDetector from system-aware architecture
    console.warn('[SystemGroupingStrategy] Not fully implemented yet');

    return {
      systems: [],
      ungrouped: snapshots
    };
  }

  getGroupLabel(systemId: string): string {
    // e.g., "apps/web" → "apps/web"
    return systemId;
  }

  getGroupIcon(systemId: string): string {
    // Use folder icon for systems
    return SNAPBACK_ICONS.FOLDER;
  }

  isExpandedByDefault(systemId: string): boolean {
    // Expand first system by default
    return false;  // Will be dynamic when implemented
  }
}
```

### 2.4 Create Grouping Strategy Factory

**File**: `apps/vscode/src/views/grouping/index.ts`

```typescript
import type { GroupingStrategy } from './types';
import type { GroupingMode } from '../types';
import { TimeGroupingStrategy } from './TimeGroupingStrategy';
import { SystemGroupingStrategy } from './SystemGroupingStrategy';

export * from './types';
export { TimeGroupingStrategy } from './TimeGroupingStrategy';
export { SystemGroupingStrategy } from './SystemGroupingStrategy';

/**
 * Factory to get the appropriate grouping strategy
 */
export function getGroupingStrategy(mode: GroupingMode): GroupingStrategy<unknown> {
  switch (mode) {
    case 'time':
      return new TimeGroupingStrategy();
    case 'system':
      return new SystemGroupingStrategy();
    case 'file':
      // Not implemented yet
      throw new Error('File grouping not implemented yet');
    default:
      return new TimeGroupingStrategy();
  }
}

/**
 * Get available grouping modes (for UI dropdown)
 */
export function getAvailableGroupingModes(): Array<{
  mode: GroupingMode;
  label: string;
  enabled: boolean;
}> {
  return [
    { mode: 'time', label: 'By Time', enabled: true },
    { mode: 'system', label: 'By System', enabled: false },  // Coming soon
    { mode: 'file', label: 'By File', enabled: false },      // Coming soon
  ];
}
```

---

## Task 3: Implement TreeView Provider with Grouping Support (3 hours)

### 3.1 Create TreeView Provider

**File**: `apps/vscode/src/views/SnapBackTreeProvider.ts`

```typescript
import * as vscode from 'vscode';
import { SNAPBACK_ICONS, COMMANDS } from '../constants';
import type {
  SnapshotDisplayItem,
  TimeGroup,
  TimeGroupedSnapshots,
  QuickAction,
  ProblemItem,
  TreeViewConfig,
  GroupingMode
} from './types';
import { DEFAULT_TREE_CONFIG } from './types';
import { getGroupingStrategy, TimeGroupingStrategy } from './grouping';
import type { IStorageManager } from '../storage/types';
import type { SnapshotManifest } from '../storage/types';

// ============================================
// TREE ITEM TYPES
// ============================================

type TreeItemType =
  | 'header'
  | 'header-detail'
  | 'grouping-toggle'
  | 'time-group'
  | 'system-group'
  | 'file-group'
  | 'snapshot'
  | 'more-snapshots'
  | 'action'
  | 'actions-header'
  | 'problems-header'
  | 'problem';

interface SnapBackTreeItemData {
  type: TreeItemType;
  id?: string;
  groupKey?: string;
  count?: number;
}

class SnapBackTreeItem extends vscode.TreeItem {
  constructor(
    label: string,
    public readonly data: SnapBackTreeItemData,
    collapsibleState?: vscode.TreeItemCollapsibleState
  ) {
    super(label, collapsibleState);
  }
}

// ============================================
// PROVIDER
// ============================================

export class SnapBackTreeProvider implements vscode.TreeDataProvider<SnapBackTreeItem> {
  private _onDidChangeTreeData = new vscode.EventEmitter<SnapBackTreeItem | undefined>();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  private problems: ProblemItem[] = [];
  private config: TreeViewConfig;
  private cachedSnapshots: SnapshotDisplayItem[] = [];

  constructor(
    private storageManager: IStorageManager,
    private configManager: IConfigManager
  ) {
    this.config = { ...DEFAULT_TREE_CONFIG };
  }

  // ============================================
  // PUBLIC API
  // ============================================

  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  setProblems(problems: ProblemItem[]): void {
    this.problems = problems;
    this.refresh();
  }

  /**
   * Change grouping mode (for future use)
   */
  setGroupingMode(mode: GroupingMode): void {
    if (mode !== 'time') {
      vscode.window.showInformationMessage(
        `${mode} grouping coming soon! Using time grouping for now.`
      );
      return;
    }
    this.config.groupBy = mode;
    this.refresh();
  }

  getGroupingMode(): GroupingMode {
    return this.config.groupBy;
  }

  // ============================================
  // TREE DATA PROVIDER IMPLEMENTATION
  // ============================================

  getTreeItem(element: SnapBackTreeItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: SnapBackTreeItem): Promise<SnapBackTreeItem[]> {
    if (!element) {
      return this.getRootItems();
    }

    switch (element.data.type) {
      case 'header':
        return this.getProtectionBreakdown();
      case 'time-group':
        return this.getSnapshotsForTimeGroup(element.data.groupKey as TimeGroup);
      case 'system-group':
        return this.getSnapshotsForSystemGroup(element.data.groupKey!);
      case 'actions-header':
        return this.getActionItems();
      case 'problems-header':
        return this.getProblemItems();
      default:
        return [];
    }
  }

  // ============================================
  // ROOT LEVEL
  // ============================================

  private async getRootItems(): Promise<SnapBackTreeItem[]> {
    const items: SnapBackTreeItem[] = [];

    // 1. HEADER - Always show (the confidence builder)
    items.push(await this.createHeader());

    // 2. PROBLEMS - Only if there are problems (respect attention)
    if (this.problems.length > 0) {
      items.push(this.createProblemsSection());
    }

    // 3. GROUPING TOGGLE (Future - when multiple modes enabled)
    // Uncomment when system grouping is ready:
    // items.push(this.createGroupingToggle());

    // 4. SNAPSHOT GROUPS - Based on current grouping mode
    const snapshotGroups = await this.createSnapshotGroups();
    items.push(...snapshotGroups);

    // 5. ACTIONS - Always available at bottom
    items.push(this.createActionsSection());

    return items;
  }

  // ============================================
  // HEADER (Protected Files Count)
  // ============================================

  private async createHeader(): Promise<SnapBackTreeItem> {
    const totalProtected = await this.getTotalProtectedCount();

    const item = new SnapBackTreeItem(
      `${SNAPBACK_ICONS.SHIELD} ${totalProtected} files protected`,
      { type: 'header' },
      vscode.TreeItemCollapsibleState.Collapsed
    );

    item.tooltip = 'Click to see protection breakdown';
    item.contextValue = 'header';

    return item;
  }

  private async getProtectionBreakdown(): Promise<SnapBackTreeItem[]> {
    const counts = await this.configManager.getProtectionCounts();

    const items: SnapBackTreeItem[] = [];

    if (counts.block > 0) {
      items.push(this.createDetailItem('Block', counts.block, SNAPBACK_ICONS.BLOCK));
    }
    if (counts.warn > 0) {
      items.push(this.createDetailItem('Warn', counts.warn, SNAPBACK_ICONS.WARN));
    }
    if (counts.watch > 0) {
      items.push(this.createDetailItem('Watch', counts.watch, SNAPBACK_ICONS.WATCH));
    }

    return items;
  }

  private createDetailItem(level: string, count: number, icon: string): SnapBackTreeItem {
    const item = new SnapBackTreeItem(
      `${icon} ${level}: ${count}`,
      { type: 'header-detail', count },
      vscode.TreeItemCollapsibleState.None
    );
    item.command = {
      command: COMMANDS.SHOW_PROTECTED_FILES,
      title: `Show ${level} files`,
      arguments: [level.toLowerCase()]
    };
    return item;
  }

  private async getTotalProtectedCount(): Promise<number> {
    const counts = await this.configManager.getProtectionCounts();
    return counts.block + counts.warn + counts.watch;
  }

  // ============================================
  // GROUPING TOGGLE (Future Feature)
  // ============================================

  private createGroupingToggle(): SnapBackTreeItem {
    const modeLabel = this.config.groupBy.toUpperCase();
    const item = new SnapBackTreeItem(
      `BY ${modeLabel} ▼`,
      { type: 'grouping-toggle' },
      vscode.TreeItemCollapsibleState.None
    );
    item.tooltip = 'Click to change grouping mode';
    item.command = {
      command: COMMANDS.TOGGLE_GROUPING_MODE,
      title: 'Toggle Grouping Mode'
    };
    return item;
  }

  // ============================================
  // SNAPSHOT GROUPS (Strategy Pattern)
  // ============================================

  private async createSnapshotGroups(): Promise<SnapBackTreeItem[]> {
    // Load snapshots
    await this.loadSnapshots();

    // Use strategy pattern based on grouping mode
    switch (this.config.groupBy) {
      case 'time':
        return this.createTimeGroups();
      case 'system':
        return this.createSystemGroups();
      case 'file':
        return this.createFileGroups();
      default:
        return this.createTimeGroups();
    }
  }

  private async loadSnapshots(): Promise<void> {
    const manifests = await this.storageManager.listSnapshots({ limit: 100 });
    this.cachedSnapshots = manifests.map(m => this.toDisplayItem(m));
  }

  // ============================================
  // TIME GROUPING (Implemented)
  // ============================================

  private createTimeGroups(): SnapBackTreeItem[] {
    const strategy = new TimeGroupingStrategy();
    const grouped = strategy.group(this.cachedSnapshots);
    const items: SnapBackTreeItem[] = [];

    const groups: Array<{ key: TimeGroup; data: SnapshotDisplayItem[] }> = [
      { key: 'recent', data: grouped.recent },
      { key: 'yesterday', data: grouped.yesterday },
      { key: 'this-week', data: grouped.thisWeek },
      { key: 'older', data: grouped.older },
    ];

    for (const { key, data } of groups) {
      if (data.length > 0) {
        const item = new SnapBackTreeItem(
          strategy.getGroupLabel(key),
          { type: 'time-group', groupKey: key, count: data.length },
          strategy.isExpandedByDefault(key)
            ? vscode.TreeItemCollapsibleState.Expanded
            : vscode.TreeItemCollapsibleState.Collapsed
        );
        item.description = `${data.length}`;
        items.push(item);
      }
    }

    return items;
  }

  private async getSnapshotsForTimeGroup(groupKey: TimeGroup): Promise<SnapBackTreeItem[]> {
    const strategy = new TimeGroupingStrategy();
    const grouped = strategy.group(this.cachedSnapshots);

    const snapshots = grouped[groupKey === 'this-week' ? 'thisWeek' : groupKey];
    return this.createSnapshotItems(snapshots);
  }

  // ============================================
  // SYSTEM GROUPING (Stub - Future)
  // ============================================

  private createSystemGroups(): SnapBackTreeItem[] {
    // STUB: Fall back to time grouping until implemented
    vscode.window.showInformationMessage('System grouping coming soon!');
    return this.createTimeGroups();
  }

  private async getSnapshotsForSystemGroup(systemId: string): Promise<SnapBackTreeItem[]> {
    // STUB: Return empty until implemented
    return [];
  }

  // ============================================
  // FILE GROUPING (Stub - Future)
  // ============================================

  private createFileGroups(): SnapBackTreeItem[] {
    // STUB: Fall back to time grouping until implemented
    vscode.window.showInformationMessage('File grouping coming soon!');
    return this.createTimeGroups();
  }

  // ============================================
  // SNAPSHOT ITEMS
  // ============================================

  private createSnapshotItems(snapshots: SnapshotDisplayItem[]): SnapBackTreeItem[] {
    const maxVisible = this.config.maxPerGroup;
    const items = snapshots.slice(0, maxVisible).map(snap => this.createSnapshotItem(snap));

    if (snapshots.length > maxVisible) {
      items.push(this.createMoreItem(snapshots.length - maxVisible));
    }

    return items;
  }

  private createSnapshotItem(snapshot: SnapshotDisplayItem): SnapBackTreeItem {
    const icon = this.getSnapshotIcon(snapshot);

    const item = new SnapBackTreeItem(
      `${icon} ${snapshot.name}`,
      { type: 'snapshot', id: snapshot.id },
      vscode.TreeItemCollapsibleState.None
    );

    item.description = snapshot.description;
    item.tooltip = this.getSnapshotTooltip(snapshot);
    item.contextValue = 'snapshot';

    item.command = {
      command: COMMANDS.SHOW_SNAPSHOT_DETAILS,
      title: 'Show Snapshot Details',
      arguments: [snapshot.id]
    };

    return item;
  }

  private getSnapshotIcon(snapshot: SnapshotDisplayItem): string {
    if (!this.config.showAI) {
      return SNAPBACK_ICONS.CAMERA;
    }

    switch (snapshot.trigger) {
      case 'ai-detected': return SNAPBACK_ICONS.AI;
      case 'manual': return SNAPBACK_ICONS.MANUAL;
      case 'pre-save': return SNAPBACK_ICONS.BLOCK;
      default: return SNAPBACK_ICONS.CAMERA;
    }
  }

  private getSnapshotTooltip(snapshot: SnapshotDisplayItem): string {
    const lines = [
      snapshot.name,
      `Files: ${snapshot.fileCount}`,
      `Trigger: ${snapshot.trigger}`,
    ];
    if (snapshot.aiTool) {
      lines.push(`AI Tool: ${snapshot.aiTool}`);
    }
    if (snapshot.detectedSystem) {
      lines.push(`System: ${snapshot.detectedSystem}`);
    }
    lines.push(`Time: ${snapshot.timestamp.toLocaleString()}`);
    return lines.join('\n');
  }

  private createMoreItem(remaining: number): SnapBackTreeItem {
    const item = new SnapBackTreeItem(
      `⋯ ${remaining} more snapshots`,
      { type: 'more-snapshots', count: remaining },
      vscode.TreeItemCollapsibleState.None
    );
    item.command = {
      command: COMMANDS.SEARCH_SNAPSHOTS,
      title: 'Search Snapshots'
    };
    return item;
  }

  // ============================================
  // ACTIONS SECTION
  // ============================================

  private createActionsSection(): SnapBackTreeItem {
    const item = new SnapBackTreeItem(
      'ACTIONS',
      { type: 'actions-header' },
      vscode.TreeItemCollapsibleState.Expanded
    );
    return item;
  }

  private getActionItems(): SnapBackTreeItem[] {
    const actions: QuickAction[] = [
      { id: 'create', label: 'Create Snapshot', icon: SNAPBACK_ICONS.CAMERA, command: COMMANDS.CREATE_SNAPSHOT },
      { id: 'restore', label: 'Restore Last', icon: SNAPBACK_ICONS.RESTORE, command: COMMANDS.RESTORE_LAST },
      { id: 'search', label: 'Search Snapshots...', icon: SNAPBACK_ICONS.SEARCH, command: COMMANDS.SEARCH_SNAPSHOTS },
      { id: 'configure', label: 'Configure Protection', icon: SNAPBACK_ICONS.SETTINGS, command: COMMANDS.CONFIGURE_PROTECTION },
    ];

    return actions.map(action => {
      const item = new SnapBackTreeItem(
        `${action.icon} ${action.label}`,
        { type: 'action', id: action.id },
        vscode.TreeItemCollapsibleState.None
      );
      item.command = {
        command: action.command,
        title: action.label
      };
      return item;
    });
  }

  // ============================================
  // PROBLEMS SECTION
  // ============================================

  private createProblemsSection(): SnapBackTreeItem {
    const item = new SnapBackTreeItem(
      `${SNAPBACK_ICONS.WARNING} PROBLEMS (${this.problems.length})`,
      { type: 'problems-header', count: this.problems.length },
      vscode.TreeItemCollapsibleState.Expanded
    );
    item.contextValue = 'problems-header';
    return item;
  }

  private getProblemItems(): SnapBackTreeItem[] {
    return this.problems.map(problem => {
      const icon = problem.severity === 'error' ? SNAPBACK_ICONS.ERROR : SNAPBACK_ICONS.WARNING;
      const item = new SnapBackTreeItem(
        `${icon} ${problem.title}`,
        { type: 'problem', id: problem.id },
        vscode.TreeItemCollapsibleState.None
      );
      item.description = problem.action?.label;
      item.tooltip = problem.description;

      if (problem.action) {
        item.command = {
          command: problem.action.command,
          title: problem.action.label,
          arguments: [problem.id]
        };
      }

      return item;
    });
  }

  // ============================================
  // HELPERS
  // ============================================

  private toDisplayItem(manifest: SnapshotManifest): SnapshotDisplayItem {
    return {
      id: manifest.id,
      name: manifest.name,
      timestamp: new Date(manifest.timestamp),
      trigger: manifest.trigger,
      fileCount: Object.keys(manifest.files).length,
      primaryFile: Object.keys(manifest.files)[0] || 'unknown',
      aiTool: manifest.metadata?.aiDetection?.tool,
      description: this.formatRelativeTime(manifest.timestamp),
      detectedSystem: undefined,  // Future: manifest.metadata?.detectedSystem
    };
  }

  private formatRelativeTime(timestamp: number): string {
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'yesterday';
    return `${days}d ago`;
  }
}

// Type for config manager (to be defined in your codebase)
interface IConfigManager {
  getProtectionCounts(): Promise<{ block: number; warn: number; watch: number }>;
}
```

---

## Task 4: Add Grouping Toggle Command (30 minutes)

### 4.1 Register Command

**File**: `apps/vscode/src/commands/toggleGroupingMode.ts`

```typescript
import * as vscode from 'vscode';
import { getAvailableGroupingModes } from '../views/grouping';
import type { SnapBackTreeProvider } from '../views/SnapBackTreeProvider';

export function registerToggleGroupingModeCommand(
  context: vscode.ExtensionContext,
  treeProvider: SnapBackTreeProvider
): void {
  const command = vscode.commands.registerCommand(
    'snapback.toggleGroupingMode',
    async () => {
      const modes = getAvailableGroupingModes();
      const currentMode = treeProvider.getGroupingMode();

      const items = modes.map(m => ({
        label: m.label,
        description: m.mode === currentMode ? '(current)' : '',
        detail: m.enabled ? undefined : 'Coming soon',
        mode: m.mode,
        enabled: m.enabled
      }));

      const selected = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select grouping mode',
        title: 'Group Snapshots By'
      });

      if (selected && selected.enabled) {
        treeProvider.setGroupingMode(selected.mode);
      } else if (selected && !selected.enabled) {
        vscode.window.showInformationMessage(
          `${selected.label} grouping is coming soon!`
        );
      }
    }
  );

  context.subscriptions.push(command);
}
```

### 4.2 Add to package.json

```json
{
  "contributes": {
    "commands": [
      {
        "command": "snapback.toggleGroupingMode",
        "title": "Toggle Grouping Mode",
        "category": "SnapBack"
      }
    ]
  }
}
```

---

## Task 5: Centralize Notification System (2 hours)

*[Same as original Phase 2 - NotificationManager implementation]*

See the full NotificationManager implementation in the types file. Key points:
- 5 notification tiers (Silent, Subtle, Informational, Warning, Blocking)
- Rate limiting (5 second cooldown)
- Acknowledgment persistence ("Don't Show Again")
- Non-blocking welcome message

---

## Task 6: Implement Intelligent Snapshot Naming (1 hour)

*[Same as original Phase 2 - snapshotNamer.ts]*

---

## Final Verification

### Build & Test

```bash
cd apps/vscode

# 1. Clean build
rm -rf dist
pnpm build

# 2. Type check
pnpm typecheck

# 3. Run tests
pnpm test

# 4. Package VSIX
pnpm vsce package
```

### Manual Smoke Test

```markdown
## TreeView Structure
1. [ ] Open SnapBack sidebar
2. [ ] Header shows "X files protected" (not "0 files")
3. [ ] No "All good!" messages anywhere
4. [ ] No empty sections (0 counts hidden)
5. [ ] RECENT shows snapshots immediately (expanded)
6. [ ] YESTERDAY and THIS WEEK collapsed by default
7. [ ] Time groups only appear if they have content
8. [ ] Actions section visible and expanded at bottom
9. [ ] Problems section ONLY appears when there's a problem

## Future-Proof Architecture
1. [ ] GroupingMode type exists in types.ts
2. [ ] TreeViewConfig interface includes groupBy property
3. [ ] TimeGroupingStrategy class implements GroupingStrategy
4. [ ] SystemGroupingStrategy stub exists (shows "coming soon")
5. [ ] Toggle command registered (shows quick pick)

## Snapshot Items
1. [ ] Shows intelligent name, not UUID
2. [ ] Shows relative time ("19m ago")
3. [ ] AI-detected shows "AI Edit (Cursor) - file.ts"
4. [ ] Manual shows "Manual - file.ts"
5. [ ] Auto shows "Auto-save - file.ts"
6. [ ] Click opens details

## Notifications
1. [ ] Welcome only shows once
2. [ ] "Don't Show Again" persists across reloads
3. [ ] No repeated notifications
4. [ ] Rapid saves don't spam notifications
```

### Commit

```bash
git add -A
git commit -m "feat(ux): redesign TreeView with future-proof grouping architecture

BREAKING: Complete TreeView restructure with extensible grouping

Philosophy changes:
- Lead with value, not status
- No news is good news (removed 'All good!' messages)
- Hide empty states completely
- Snapshots are the product (now primary content)
- Respect developer attention
- Design for extension (grouping modes)

Architecture:
- Added GroupingMode type: 'time' | 'system' | 'file'
- Implemented Strategy pattern for grouping
- TimeGroupingStrategy fully implemented
- SystemGroupingStrategy stubbed for post-demo
- TreeViewConfig for user preferences

Removed:
- 'Safety Dashboard' metaphor
- Nested status hierarchies
- Empty section placeholders
- Double checkmark confirmations

Added:
- Single 'X files protected' header
- Time-grouped snapshots (Recent, Yesterday, This Week)
- Conditional Problems section (only when needed)
- Simplified Actions section
- Intelligent snapshot naming
- Toggle grouping mode command (future-ready)

This reduces TreeView from ~25 lines to ~12 while providing
more useful information at a glance and enabling future
system-aware grouping without breaking changes."
```

---

## Success Criteria

| Metric | Target | How to Verify |
|--------|--------|---------------|
| Root-level items | ≤5 | Count in TreeView |
| "All good" messages | 0 | Visual check |
| Empty sections shown | 0 | Collapse all, verify |
| Time to understand | <3 sec | User test |
| Clicks to restore | ≤2 | Test flow |
| GroupingMode types | 3 defined | Check types.ts |
| Future grouping ready | Yes | SystemGroupingStrategy exists |

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                    TREEVIEW ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────────┐     ┌─────────────────────┐                   │
│  │ TreeViewConfig   │────▶│ SnapBackTreeProvider │                   │
│  │ - groupBy: Mode  │     │                     │                   │
│  │ - showAI: bool   │     │ getChildren()       │                   │
│  │ - maxPerGroup    │     │ createSnapshotGroups│                   │
│  └──────────────────┘     └─────────┬───────────┘                   │
│                                     │                               │
│                           ┌─────────▼───────────┐                   │
│                           │ Strategy Selection  │                   │
│                           └─────────┬───────────┘                   │
│                                     │                               │
│         ┌───────────────────────────┼───────────────────────────┐   │
│         │                           │                           │   │
│         ▼                           ▼                           ▼   │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐ │
│  │TimeGrouping  │         │SystemGrouping│         │FileGrouping  │ │
│  │Strategy      │         │Strategy      │         │Strategy      │ │
│  │              │         │              │         │              │ │
│  │ ✓ IMPL      │         │ ○ STUB       │         │ ○ STUB       │ │
│  └──────────────┘         └──────────────┘         └──────────────┘ │
│         │                                                           │
│         ▼                                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ TimeGroupedSnapshots                                         │   │
│  │ - recent: SnapshotDisplayItem[]                              │   │
│  │ - yesterday: SnapshotDisplayItem[]                           │   │
│  │ - thisWeek: SnapshotDisplayItem[]                            │   │
│  │ - older: SnapshotDisplayItem[]                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

**Phase 2 Complete → Proceed to Phase 3 (Documentation)**
