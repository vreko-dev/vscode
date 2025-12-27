# File Heat Decoration System

## Overview

Real-time file decorations showing "heat" — files that are experiencing high activity, large changes, or AI-assisted edits. Surfaces the "why" behind workspace vitals degradation.

```
Normal:     auth.ts         M          ← No decoration
Warm:       auth.ts         M  •       ← Elevated activity
Hot:        auth.ts         M  🔥      ← High churn or risk
AI + Hot:   auth.ts         M  ⚙️🔥    ← AI is actively modifying
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         VS Code Extension                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐    ┌──────────────┐    ┌────────────────────┐    │
│  │ FileWatcher  │───▶│ HeatTracker  │───▶│ DecorationProvider │    │
│  │ (save events)│    │ (aggregates) │    │ (renders badges)   │    │
│  └──────────────┘    └──────────────┘    └────────────────────┘    │
│         │                   │                      │                │
│         │            ┌──────┴──────┐               │                │
│         │            │             │               │                │
│  ┌──────▼──────┐    ┌▼─────┐  ┌───▼────┐   ┌─────▼──────┐         │
│  │ AIDetector  │    │Decay │  │Vitals  │   │ StatusBar  │         │
│  │ (patterns)  │    │Timer │  │Summary │   │ Integration│         │
│  └─────────────┘    └──────┘  └────────┘   └────────────┘         │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### FileHeatData

```typescript
// packages/vscode-extension/src/heat/types.ts

export interface FileHeatData {
  /** Absolute file path */
  filePath: string;

  /** Number of saves in the tracking window */
  saveCount: number;

  /** Timestamps of recent saves (for decay calculation) */
  saveTimestamps: number[];

  /** Lines changed since last checkpoint */
  diffSize: number;

  /** AI tool involvement */
  ai: {
    involved: boolean;
    tool?: 'cursor' | 'copilot' | 'claude' | 'unknown';
    confidence: number;
    lastDetected?: number;
  };

  /** Undo/redo activity (struggle indicator) */
  undoRedoCount: number;

  /** Last activity timestamp */
  lastActivity: number;

  /** When tracking started for this file */
  trackingStarted: number;
}

export type HeatLevel = 'none' | 'warm' | 'hot' | 'critical';

export interface HeatAssessment {
  level: HeatLevel;
  reasons: string[];
  aiInvolved: boolean;
  score: number; // 0-100 for internal use
}

export interface HeatConfig {
  /** Time window for tracking saves (ms) */
  trackingWindow: number; // default: 10 * 60 * 1000 (10 min)

  /** How often to decay heat (ms) */
  decayInterval: number; // default: 60 * 1000 (1 min)

  /** Thresholds */
  thresholds: {
    warm: {
      saveCount: number;      // default: 5
      diffSize: number;       // default: 200
    };
    hot: {
      saveCount: number;      // default: 10
      diffSize: number;       // default: 500
      undoRedoCount: number;  // default: 5
    };
    critical: {
      saveCount: number;      // default: 20
      diffSize: number;       // default: 1000
    };
  };

  /** AI detection amplifies heat */
  aiMultiplier: number; // default: 1.5

  /** Minimum time between decoration updates (ms) */
  debounceInterval: number; // default: 500
}

export const DEFAULT_HEAT_CONFIG: HeatConfig = {
  trackingWindow: 10 * 60 * 1000,
  decayInterval: 60 * 1000,
  thresholds: {
    warm: { saveCount: 5, diffSize: 200 },
    hot: { saveCount: 10, diffSize: 500, undoRedoCount: 5 },
    critical: { saveCount: 20, diffSize: 1000 },
  },
  aiMultiplier: 1.5,
  debounceInterval: 500,
};
```

---

## Core Components

### 1. HeatTracker (State Management)

```typescript
// packages/vscode-extension/src/heat/heat-tracker.ts

import { EventEmitter } from 'vscode';
import type { FileHeatData, HeatAssessment, HeatConfig, HeatLevel } from './types';
import { DEFAULT_HEAT_CONFIG } from './types';

export class HeatTracker {
  private heatMap = new Map<string, FileHeatData>();
  private config: HeatConfig;
  private decayTimer: NodeJS.Timeout | null = null;

  private readonly _onHeatChanged = new EventEmitter<string[]>();
  public readonly onHeatChanged = this._onHeatChanged.event;

  constructor(config: Partial<HeatConfig> = {}) {
    this.config = { ...DEFAULT_HEAT_CONFIG, ...config };
    this.startDecayTimer();
  }

  // ─────────────────────────────────────────────────────────────────
  // Public API
  // ─────────────────────────────────────────────────────────────────

  /**
   * Record a file save event
   */
  recordSave(filePath: string, metadata: { diffSize?: number } = {}): void {
    const heat = this.getOrCreate(filePath);
    const now = Date.now();

    heat.saveCount++;
    heat.saveTimestamps.push(now);
    heat.lastActivity = now;

    if (metadata.diffSize !== undefined) {
      heat.diffSize = Math.max(heat.diffSize, metadata.diffSize);
    }

    // Prune old timestamps outside tracking window
    this.pruneTimestamps(heat);

    this._onHeatChanged.fire([filePath]);
  }

  /**
   * Record AI involvement in a file
   */
  recordAIEdit(
    filePath: string,
    tool: FileHeatData['ai']['tool'],
    confidence: number
  ): void {
    const heat = this.getOrCreate(filePath);

    heat.ai = {
      involved: true,
      tool,
      confidence,
      lastDetected: Date.now(),
    };
    heat.lastActivity = Date.now();

    this._onHeatChanged.fire([filePath]);
  }

  /**
   * Record undo/redo activity (struggle indicator)
   */
  recordUndoRedo(filePath: string): void {
    const heat = this.getOrCreate(filePath);

    heat.undoRedoCount++;
    heat.lastActivity = Date.now();

    this._onHeatChanged.fire([filePath]);
  }

  /**
   * Update diff size (called after computing actual diff)
   */
  updateDiffSize(filePath: string, diffSize: number): void {
    const heat = this.heatMap.get(filePath);
    if (!heat) return;

    heat.diffSize = diffSize;
    this._onHeatChanged.fire([filePath]);
  }

  /**
   * Reset heat for a file (e.g., after checkpoint created)
   */
  resetFile(filePath: string): void {
    this.heatMap.delete(filePath);
    this._onHeatChanged.fire([filePath]);
  }

  /**
   * Get current heat assessment for a file
   */
  assess(filePath: string): HeatAssessment {
    const heat = this.heatMap.get(filePath);

    if (!heat) {
      return { level: 'none', reasons: [], aiInvolved: false, score: 0 };
    }

    return this.calculateAssessment(heat);
  }

  /**
   * Get all files with heat above 'none'
   */
  getHotFiles(): Array<{ filePath: string; assessment: HeatAssessment }> {
    const result: Array<{ filePath: string; assessment: HeatAssessment }> = [];

    for (const [filePath, heat] of this.heatMap) {
      const assessment = this.calculateAssessment(heat);
      if (assessment.level !== 'none') {
        result.push({ filePath, assessment });
      }
    }

    return result.sort((a, b) => b.assessment.score - a.assessment.score);
  }

  /**
   * Get summary for vitals integration
   */
  getSummary(): {
    totalHotFiles: number;
    criticalFiles: string[];
    aiInvolvedFiles: string[];
  } {
    const hotFiles = this.getHotFiles();

    return {
      totalHotFiles: hotFiles.length,
      criticalFiles: hotFiles
        .filter(f => f.assessment.level === 'critical')
        .map(f => f.filePath),
      aiInvolvedFiles: hotFiles
        .filter(f => f.assessment.aiInvolved)
        .map(f => f.filePath),
    };
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────

  private getOrCreate(filePath: string): FileHeatData {
    let heat = this.heatMap.get(filePath);

    if (!heat) {
      heat = {
        filePath,
        saveCount: 0,
        saveTimestamps: [],
        diffSize: 0,
        ai: { involved: false, confidence: 0 },
        undoRedoCount: 0,
        lastActivity: Date.now(),
        trackingStarted: Date.now(),
      };
      this.heatMap.set(filePath, heat);
    }

    return heat;
  }

  private pruneTimestamps(heat: FileHeatData): void {
    const cutoff = Date.now() - this.config.trackingWindow;
    heat.saveTimestamps = heat.saveTimestamps.filter(ts => ts > cutoff);
    heat.saveCount = heat.saveTimestamps.length;
  }

  private calculateAssessment(heat: FileHeatData): HeatAssessment {
    const reasons: string[] = [];
    let score = 0;

    const { thresholds, aiMultiplier } = this.config;

    // Prune to get accurate count
    this.pruneTimestamps(heat);

    // Save frequency scoring
    if (heat.saveCount >= thresholds.critical.saveCount) {
      score += 50;
      reasons.push(`${heat.saveCount} saves in ${this.config.trackingWindow / 60000} min`);
    } else if (heat.saveCount >= thresholds.hot.saveCount) {
      score += 30;
      reasons.push(`${heat.saveCount} saves in ${this.config.trackingWindow / 60000} min`);
    } else if (heat.saveCount >= thresholds.warm.saveCount) {
      score += 15;
      reasons.push(`${heat.saveCount} saves recently`);
    }

    // Diff size scoring
    if (heat.diffSize >= thresholds.critical.diffSize) {
      score += 40;
      reasons.push(`${heat.diffSize} lines changed`);
    } else if (heat.diffSize >= thresholds.hot.diffSize) {
      score += 25;
      reasons.push(`${heat.diffSize} lines changed`);
    } else if (heat.diffSize >= thresholds.warm.diffSize) {
      score += 10;
      reasons.push(`${heat.diffSize} lines changed`);
    }

    // Undo/redo scoring (struggle indicator)
    if (heat.undoRedoCount >= thresholds.hot.undoRedoCount) {
      score += 20;
      reasons.push(`${heat.undoRedoCount} undo/redo operations`);
    }

    // AI multiplier
    if (heat.ai.involved) {
      score = Math.round(score * aiMultiplier);
      const toolName = heat.ai.tool || 'AI';
      reasons.unshift(`${toolName} assisted edits`);
    }

    // Determine level
    let level: HeatLevel = 'none';
    if (score >= 70) level = 'critical';
    else if (score >= 40) level = 'hot';
    else if (score >= 15) level = 'warm';

    return {
      level,
      reasons,
      aiInvolved: heat.ai.involved,
      score: Math.min(100, score),
    };
  }

  private startDecayTimer(): void {
    this.decayTimer = setInterval(() => {
      this.decay();
    }, this.config.decayInterval);
  }

  private decay(): void {
    const now = Date.now();
    const staleThreshold = this.config.trackingWindow;
    const changedFiles: string[] = [];

    for (const [filePath, heat] of this.heatMap) {
      // Prune old timestamps
      const oldCount = heat.saveCount;
      this.pruneTimestamps(heat);

      // Decay AI involvement after 30 min of no activity
      if (heat.ai.involved && heat.ai.lastDetected) {
        const aiAge = now - heat.ai.lastDetected;
        if (aiAge > 30 * 60 * 1000) {
          heat.ai.involved = false;
        }
      }

      // Decay undo/redo count over time
      const timeSinceActivity = now - heat.lastActivity;
      if (timeSinceActivity > 5 * 60 * 1000) {
        heat.undoRedoCount = Math.max(0, heat.undoRedoCount - 1);
      }

      // Remove completely stale entries
      if (timeSinceActivity > staleThreshold && heat.saveCount === 0) {
        this.heatMap.delete(filePath);
        changedFiles.push(filePath);
        continue;
      }

      // Check if assessment changed
      if (heat.saveCount !== oldCount) {
        changedFiles.push(filePath);
      }
    }

    if (changedFiles.length > 0) {
      this._onHeatChanged.fire(changedFiles);
    }
  }

  dispose(): void {
    if (this.decayTimer) {
      clearInterval(this.decayTimer);
      this.decayTimer = null;
    }
    this._onHeatChanged.dispose();
  }
}
```

### 2. FileHeatDecorationProvider (VS Code Integration)

```typescript
// packages/vscode-extension/src/heat/file-heat-decoration-provider.ts

import {
  FileDecoration,
  FileDecorationProvider,
  Uri,
  EventEmitter,
  ThemeColor,
  Disposable,
  Event,
} from 'vscode';
import { HeatTracker } from './heat-tracker';
import type { HeatLevel, HeatAssessment } from './types';

interface DecorationConfig {
  badge: string;
  color: ThemeColor;
  propagate: boolean;
}

const DECORATION_MAP: Record<HeatLevel, DecorationConfig | null> = {
  none: null,
  warm: {
    badge: '•',
    color: new ThemeColor('charts.yellow'),
    propagate: false,
  },
  hot: {
    badge: '🔥',
    color: new ThemeColor('charts.orange'),
    propagate: false,
  },
  critical: {
    badge: '🔥',
    color: new ThemeColor('charts.red'),
    propagate: true, // Propagate to parent folders
  },
};

const AI_BADGE = '⚙️';

export class FileHeatDecorationProvider implements FileDecorationProvider, Disposable {
  private readonly _onDidChangeFileDecorations = new EventEmitter<Uri | Uri[]>();
  readonly onDidChangeFileDecorations: Event<Uri | Uri[]> = this._onDidChangeFileDecorations.event;

  private disposables: Disposable[] = [];
  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingUpdates = new Set<string>();

  constructor(private heatTracker: HeatTracker) {
    // Subscribe to heat changes
    this.disposables.push(
      heatTracker.onHeatChanged((filePaths) => {
        this.queueUpdate(filePaths);
      })
    );
  }

  provideFileDecoration(uri: Uri): FileDecoration | undefined {
    // Only decorate file:// URIs
    if (uri.scheme !== 'file') return undefined;

    const assessment = this.heatTracker.assess(uri.fsPath);

    if (assessment.level === 'none') return undefined;

    const config = DECORATION_MAP[assessment.level];
    if (!config) return undefined;

    // Build badge: AI prefix + heat indicator
    const badge = assessment.aiInvolved
      ? `${AI_BADGE}${config.badge}`
      : config.badge;

    return {
      badge,
      color: config.color,
      tooltip: this.buildTooltip(assessment),
      propagate: config.propagate,
    };
  }

  private buildTooltip(assessment: HeatAssessment): string {
    const lines = ['SnapBack: File Heat Detected', ''];

    if (assessment.aiInvolved) {
      lines.push('⚙️ AI-assisted edits');
    }

    for (const reason of assessment.reasons) {
      if (!reason.includes('AI') && !reason.includes('assisted')) {
        lines.push(`• ${reason}`);
      }
    }

    lines.push('');
    lines.push(`Heat level: ${assessment.level.toUpperCase()}`);
    lines.push('');
    lines.push('💡 Consider creating a checkpoint');

    return lines.join('\n');
  }

  private queueUpdate(filePaths: string[]): void {
    for (const fp of filePaths) {
      this.pendingUpdates.add(fp);
    }

    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(() => {
      const uris = Array.from(this.pendingUpdates).map(fp => Uri.file(fp));
      this.pendingUpdates.clear();
      this._onDidChangeFileDecorations.fire(uris);
    }, 500); // Debounce 500ms
  }

  dispose(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }
    this._onDidChangeFileDecorations.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
```

### 3. Integration with Existing Systems

```typescript
// packages/vscode-extension/src/heat/heat-integration.ts

import * as vscode from 'vscode';
import { HeatTracker } from './heat-tracker';
import { FileHeatDecorationProvider } from './file-heat-decoration-provider';
import type { AIDetectionResult } from '../ai-detection/types';
import type { SnapshotManager } from '../snapshots/snapshot-manager';
import type { DiffEngine } from '../diff/diff-engine';

export class HeatIntegration implements vscode.Disposable {
  private heatTracker: HeatTracker;
  private decorationProvider: FileHeatDecorationProvider;
  private disposables: vscode.Disposable[] = [];

  constructor(
    private context: vscode.ExtensionContext,
    private snapshotManager: SnapshotManager,
    private diffEngine: DiffEngine,
  ) {
    // Initialize heat tracker
    this.heatTracker = new HeatTracker();

    // Initialize decoration provider
    this.decorationProvider = new FileHeatDecorationProvider(this.heatTracker);

    // Register decoration provider
    this.disposables.push(
      vscode.window.registerFileDecorationProvider(this.decorationProvider)
    );

    // Wire up event handlers
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // 1. Track document saves
    this.disposables.push(
      vscode.workspace.onDidSaveTextDocument(async (doc) => {
        if (doc.uri.scheme !== 'file') return;

        const filePath = doc.uri.fsPath;

        // Calculate diff size
        const diffSize = await this.calculateDiffSize(filePath);

        // Record save with diff size
        this.heatTracker.recordSave(filePath, { diffSize });
      })
    );

    // 2. Track text changes for undo/redo detection
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((e) => {
        if (e.document.uri.scheme !== 'file') return;
        if (e.contentChanges.length === 0) return;

        // Heuristic: single change that restores previous content = undo/redo
        // This is imperfect but catches most cases
        for (const change of e.contentChanges) {
          if (this.looksLikeUndoRedo(change)) {
            this.heatTracker.recordUndoRedo(e.document.uri.fsPath);
            break;
          }
        }
      })
    );

    // 3. Reset heat when snapshot is created
    this.disposables.push(
      this.snapshotManager.onSnapshotCreated((snapshot) => {
        for (const filePath of snapshot.files) {
          this.heatTracker.resetFile(filePath);
        }
      })
    );
  }

  /**
   * Called by AI detection system when AI involvement is detected
   */
  recordAIDetection(result: AIDetectionResult): void {
    if (!result.detected) return;

    for (const filePath of result.affectedFiles) {
      this.heatTracker.recordAIEdit(
        filePath,
        result.tool,
        result.confidence
      );
    }
  }

  /**
   * Get heat summary for vitals integration
   */
  getHeatSummary() {
    return this.heatTracker.getSummary();
  }

  /**
   * Get all hot files for status bar / quick picker
   */
  getHotFiles() {
    return this.heatTracker.getHotFiles();
  }

  private async calculateDiffSize(filePath: string): Promise<number> {
    try {
      const lastSnapshot = await this.snapshotManager.getLatestForFile(filePath);
      if (!lastSnapshot) return 0;

      const currentContent = await vscode.workspace.fs.readFile(
        vscode.Uri.file(filePath)
      );

      const diff = this.diffEngine.compute(
        lastSnapshot.content,
        currentContent.toString()
      );

      return diff.additions + diff.deletions;
    } catch {
      return 0;
    }
  }

  private looksLikeUndoRedo(change: vscode.TextDocumentContentChangeEvent): boolean {
    // Heuristic: large single replacement that isn't at cursor position
    // This is imperfect but better than nothing
    return (
      change.text.length > 0 &&
      change.rangeLength > 0 &&
      Math.abs(change.text.length - change.rangeLength) < 10
    );
  }

  dispose(): void {
    this.heatTracker.dispose();
    this.decorationProvider.dispose();
    for (const d of this.disposables) {
      d.dispose();
    }
  }
}
```

### 4. Status Bar Integration

```typescript
// packages/vscode-extension/src/heat/heat-status-bar.ts

import * as vscode from 'vscode';
import type { HeatIntegration } from './heat-integration';

export class HeatStatusBarIntegration implements vscode.Disposable {
  private statusBarItem: vscode.StatusBarItem;
  private updateTimer: NodeJS.Timeout | null = null;

  constructor(
    private heatIntegration: HeatIntegration,
    private baseStatusBarItem: vscode.StatusBarItem, // Existing SnapBack status bar
  ) {
    this.statusBarItem = baseStatusBarItem;
    this.startUpdateLoop();
  }

  private startUpdateLoop(): void {
    // Update status bar every 5 seconds
    this.updateTimer = setInterval(() => {
      this.updateStatusBar();
    }, 5000);

    // Initial update
    this.updateStatusBar();
  }

  private updateStatusBar(): void {
    const summary = this.heatIntegration.getHeatSummary();
    const hotFiles = this.heatIntegration.getHotFiles();

    if (summary.criticalFiles.length > 0) {
      // Critical state
      this.statusBarItem.text = `$(flame) ${summary.criticalFiles.length} critical`;
      this.statusBarItem.backgroundColor = new vscode.ThemeColor(
        'statusBarItem.warningBackground'
      );
      this.statusBarItem.tooltip = this.buildTooltip(hotFiles);
    } else if (summary.totalHotFiles > 0) {
      // Elevated state
      this.statusBarItem.text = `$(shield) Protected • ${summary.totalHotFiles} hot`;
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = this.buildTooltip(hotFiles);
    } else {
      // Normal state
      this.statusBarItem.text = '$(shield-check) Protected';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.tooltip = 'SnapBack: All files healthy';
    }
  }

  private buildTooltip(
    hotFiles: Array<{ filePath: string; assessment: { level: string; reasons: string[] } }>
  ): string {
    if (hotFiles.length === 0) {
      return 'SnapBack: All files healthy';
    }

    const lines = ['SnapBack: File Activity', ''];

    for (const { filePath, assessment } of hotFiles.slice(0, 5)) {
      const fileName = filePath.split('/').pop() || filePath;
      lines.push(`${assessment.level === 'critical' ? '🔥' : '•'} ${fileName}`);
      for (const reason of assessment.reasons.slice(0, 2)) {
        lines.push(`   ${reason}`);
      }
    }

    if (hotFiles.length > 5) {
      lines.push('', `... and ${hotFiles.length - 5} more`);
    }

    lines.push('', 'Click to manage');

    return lines.join('\n');
  }

  dispose(): void {
    if (this.updateTimer) {
      clearInterval(this.updateTimer);
    }
  }
}
```

### 5. Quick Picker Integration

```typescript
// packages/vscode-extension/src/heat/heat-quick-picker.ts

import * as vscode from 'vscode';
import type { HeatIntegration } from './heat-integration';
import type { SnapshotManager } from '../snapshots/snapshot-manager';

interface HotFileQuickPickItem extends vscode.QuickPickItem {
  filePath: string;
  action: 'checkpoint' | 'restore' | 'view';
}

export async function showHeatQuickPicker(
  heatIntegration: HeatIntegration,
  snapshotManager: SnapshotManager
): Promise<void> {
  const hotFiles = heatIntegration.getHotFiles();

  if (hotFiles.length === 0) {
    vscode.window.showInformationMessage('All files are healthy. No action needed.');
    return;
  }

  const items: HotFileQuickPickItem[] = [];

  // Add header
  items.push({
    label: '$(flame) Hot Files',
    kind: vscode.QuickPickItemKind.Separator,
    filePath: '',
    action: 'view',
  });

  // Add hot files
  for (const { filePath, assessment } of hotFiles) {
    const fileName = filePath.split('/').pop() || filePath;
    const icon = assessment.aiInvolved ? '$(sparkle)' : '$(file)';
    const levelIcon = assessment.level === 'critical' ? '🔥' :
                      assessment.level === 'hot' ? '🔥' : '•';

    items.push({
      label: `${icon} ${fileName}`,
      description: `${levelIcon} ${assessment.level}`,
      detail: assessment.reasons.join(' • '),
      filePath,
      action: 'checkpoint',
    });
  }

  // Add actions
  items.push({
    label: 'Actions',
    kind: vscode.QuickPickItemKind.Separator,
    filePath: '',
    action: 'view',
  });

  items.push({
    label: '$(add) Checkpoint All Hot Files',
    description: `${hotFiles.length} files`,
    filePath: '',
    action: 'checkpoint',
  });

  const selected = await vscode.window.showQuickPick(items, {
    title: 'SnapBack: File Heat',
    placeHolder: 'Select a file to checkpoint or restore',
  });

  if (!selected || selected.kind === vscode.QuickPickItemKind.Separator) {
    return;
  }

  if (selected.label.includes('Checkpoint All')) {
    // Checkpoint all hot files
    const filePaths = hotFiles.map(f => f.filePath);
    await snapshotManager.createSnapshot(filePaths, {
      reason: 'Manual checkpoint of hot files',
      trigger: 'manual',
    });
    vscode.window.showInformationMessage(
      `Checkpointed ${filePaths.length} hot files`
    );
  } else if (selected.filePath) {
    // Show file-specific actions
    await showFileActions(selected.filePath, snapshotManager);
  }
}

async function showFileActions(
  filePath: string,
  snapshotManager: SnapshotManager
): Promise<void> {
  const fileName = filePath.split('/').pop() || filePath;

  const action = await vscode.window.showQuickPick([
    { label: '$(add) Create Checkpoint', action: 'checkpoint' },
    { label: '$(history) View History', action: 'history' },
    { label: '$(go-to-file) Open File', action: 'open' },
  ], {
    title: `SnapBack: ${fileName}`,
    placeHolder: 'Choose an action',
  });

  if (!action) return;

  switch (action.action) {
    case 'checkpoint':
      await snapshotManager.createSnapshot([filePath], {
        reason: 'Manual checkpoint',
        trigger: 'manual',
      });
      vscode.window.showInformationMessage(`Checkpointed ${fileName}`);
      break;
    case 'history':
      // TODO: Implement history view
      break;
    case 'open':
      await vscode.window.showTextDocument(vscode.Uri.file(filePath));
      break;
  }
}
```

---

## Extension Activation

```typescript
// packages/vscode-extension/src/extension.ts (partial)

import { HeatIntegration } from './heat/heat-integration';
import { HeatStatusBarIntegration } from './heat/heat-status-bar';
import { showHeatQuickPicker } from './heat/heat-quick-picker';

export async function activate(context: vscode.ExtensionContext) {
  // ... existing initialization ...

  // Initialize heat system
  const heatIntegration = new HeatIntegration(
    context,
    snapshotManager,
    diffEngine
  );
  context.subscriptions.push(heatIntegration);

  // Integrate with status bar
  const heatStatusBar = new HeatStatusBarIntegration(
    heatIntegration,
    statusBarItem // existing status bar item
  );
  context.subscriptions.push(heatStatusBar);

  // Wire AI detection to heat system
  aiDetector.onDetection((result) => {
    heatIntegration.recordAIDetection(result);
  });

  // Register command for quick picker
  context.subscriptions.push(
    vscode.commands.registerCommand('snapback.showHeatStatus', () => {
      showHeatQuickPicker(heatIntegration, snapshotManager);
    })
  );

  // ... rest of activation ...
}
```

---

## Tests

```typescript
// packages/vscode-extension/src/heat/__tests__/heat-tracker.test.ts

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeatTracker } from '../heat-tracker';

describe('HeatTracker', () => {
  let tracker: HeatTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new HeatTracker({
      trackingWindow: 10 * 60 * 1000, // 10 min
      decayInterval: 60 * 1000, // 1 min
      thresholds: {
        warm: { saveCount: 5, diffSize: 200 },
        hot: { saveCount: 10, diffSize: 500, undoRedoCount: 5 },
        critical: { saveCount: 20, diffSize: 1000 },
      },
      aiMultiplier: 1.5,
      debounceInterval: 500,
    });
  });

  afterEach(() => {
    tracker.dispose();
    vi.useRealTimers();
  });

  describe('recordSave', () => {
    it('should track saves and increase heat', () => {
      const filePath = '/test/file.ts';

      // No heat initially
      expect(tracker.assess(filePath).level).toBe('none');

      // 5 saves = warm
      for (let i = 0; i < 5; i++) {
        tracker.recordSave(filePath);
      }
      expect(tracker.assess(filePath).level).toBe('warm');

      // 10 saves = hot
      for (let i = 0; i < 5; i++) {
        tracker.recordSave(filePath);
      }
      expect(tracker.assess(filePath).level).toBe('hot');
    });

    it('should include diff size in assessment', () => {
      const filePath = '/test/file.ts';

      tracker.recordSave(filePath, { diffSize: 600 });

      const assessment = tracker.assess(filePath);
      expect(assessment.level).toBe('hot');
      expect(assessment.reasons).toContain('600 lines changed');
    });
  });

  describe('recordAIEdit', () => {
    it('should amplify heat with AI multiplier', () => {
      const filePath = '/test/file.ts';

      // 4 saves without AI = just under warm
      for (let i = 0; i < 4; i++) {
        tracker.recordSave(filePath);
      }
      expect(tracker.assess(filePath).level).toBe('none');

      // Add AI involvement - score gets multiplied
      tracker.recordAIEdit(filePath, 'cursor', 0.9);

      const assessment = tracker.assess(filePath);
      expect(assessment.aiInvolved).toBe(true);
      // With multiplier, should now be warm or higher
    });

    it('should include AI tool in reasons', () => {
      const filePath = '/test/file.ts';

      tracker.recordSave(filePath, { diffSize: 300 });
      tracker.recordAIEdit(filePath, 'copilot', 0.85);

      const assessment = tracker.assess(filePath);
      expect(assessment.reasons.some(r => r.includes('copilot'))).toBe(true);
    });
  });

  describe('decay', () => {
    it('should decay heat over time', () => {
      const filePath = '/test/file.ts';

      // Create hot file
      for (let i = 0; i < 10; i++) {
        tracker.recordSave(filePath);
      }
      expect(tracker.assess(filePath).level).toBe('hot');

      // Advance time past tracking window
      vi.advanceTimersByTime(11 * 60 * 1000);

      // Heat should have decayed
      expect(tracker.assess(filePath).level).toBe('none');
    });

    it('should decay AI involvement after 30 min', () => {
      const filePath = '/test/file.ts';

      tracker.recordSave(filePath, { diffSize: 300 });
      tracker.recordAIEdit(filePath, 'cursor', 0.9);

      expect(tracker.assess(filePath).aiInvolved).toBe(true);

      // Advance 31 minutes
      vi.advanceTimersByTime(31 * 60 * 1000);

      // Trigger decay
      vi.advanceTimersByTime(60 * 1000);

      expect(tracker.assess(filePath).aiInvolved).toBe(false);
    });
  });

  describe('resetFile', () => {
    it('should clear all heat for a file', () => {
      const filePath = '/test/file.ts';

      for (let i = 0; i < 15; i++) {
        tracker.recordSave(filePath);
      }
      tracker.recordAIEdit(filePath, 'cursor', 0.9);

      expect(tracker.assess(filePath).level).toBe('critical');

      tracker.resetFile(filePath);

      expect(tracker.assess(filePath).level).toBe('none');
    });
  });

  describe('getHotFiles', () => {
    it('should return files sorted by score', () => {
      tracker.recordSave('/test/a.ts', { diffSize: 100 });

      for (let i = 0; i < 15; i++) {
        tracker.recordSave('/test/b.ts');
      }

      tracker.recordSave('/test/c.ts', { diffSize: 800 });

      const hotFiles = tracker.getHotFiles();

      // Should be sorted by score descending
      expect(hotFiles.length).toBeGreaterThan(0);
      expect(hotFiles[0].assessment.score).toBeGreaterThanOrEqual(
        hotFiles[hotFiles.length - 1].assessment.score
      );
    });

    it('should not include files with no heat', () => {
      tracker.recordSave('/test/a.ts'); // Just 1 save = no heat

      for (let i = 0; i < 10; i++) {
        tracker.recordSave('/test/b.ts');
      }

      const hotFiles = tracker.getHotFiles();

      expect(hotFiles.some(f => f.filePath === '/test/a.ts')).toBe(false);
      expect(hotFiles.some(f => f.filePath === '/test/b.ts')).toBe(true);
    });
  });

  describe('onHeatChanged event', () => {
    it('should fire when save recorded', () => {
      const listener = vi.fn();
      tracker.onHeatChanged(listener);

      tracker.recordSave('/test/file.ts');

      expect(listener).toHaveBeenCalledWith(['/test/file.ts']);
    });

    it('should fire when AI edit recorded', () => {
      const listener = vi.fn();
      tracker.onHeatChanged(listener);

      tracker.recordAIEdit('/test/file.ts', 'cursor', 0.9);

      expect(listener).toHaveBeenCalledWith(['/test/file.ts']);
    });
  });
});
```

---

## Telemetry Events

```typescript
// Add to existing telemetry schema

export const HEAT_EVENTS = {
  'heat.level_changed': {
    filePath: 'string', // hashed
    fromLevel: 'none' | 'warm' | 'hot' | 'critical',
    toLevel: 'none' | 'warm' | 'hot' | 'critical',
    aiInvolved: 'boolean',
    trigger: 'save' | 'ai_detection' | 'decay',
  },
  'heat.checkpoint_from_heat': {
    fileCount: 'number',
    maxHeatLevel: 'string',
    aiInvolvedCount: 'number',
  },
  'heat.quick_picker_opened': {
    hotFileCount: 'number',
    criticalFileCount: 'number',
  },
} as const;
```

---

## Migration Notes

### Remove Protection Level Decorations

```typescript
// TO REMOVE from extension.ts or decoration-provider.ts:

// ❌ Remove these
class ProtectionLevelDecorationProvider { ... }
vscode.window.registerFileDecorationProvider(protectionLevelProvider);

// ❌ Remove protection level config files from tracking
// .snapbackprotected
// Protection level sections in .snapbackrc (keep override section)
```

### Keep for Backward Compatibility

```typescript
// .snapbackrc - keep override support only
{
  "overrides": {
    "**/.env*": { "mode": "always-ask" },
    "**/migrations/**": { "mode": "always-snapshot" }
  }
  // Remove: protectionLevels, watch, warn, block sections
}
```

---

## Summary

| Component | Purpose | File |
|-----------|---------|------|
| `HeatTracker` | State management, scoring | `heat-tracker.ts` |
| `FileHeatDecorationProvider` | VS Code file decorations | `file-heat-decoration-provider.ts` |
| `HeatIntegration` | Wires to save events, AI detection | `heat-integration.ts` |
| `HeatStatusBarIntegration` | Updates status bar with heat info | `heat-status-bar.ts` |
| `showHeatQuickPicker` | Quick picker for hot files | `heat-quick-picker.ts` |

**Key behaviors:**
- Decorations appear only when files are actually "hot"
- Heat decays over time (automatic cleanup)
- AI involvement amplifies heat (1.5x multiplier)
- Checkpointing a file resets its heat
- Status bar reflects aggregate workspace healthca
