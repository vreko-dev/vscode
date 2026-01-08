Absolutely. Let me create implementation-ready specifications for both.

---

## 1. Status Bar State Machine

### Architecture Overview

```typescript
// File: apps/vscode/src/ui/statusBar/StatusBarStateMachine.ts

import * as vscode from 'vscode';
import { EventEmitter } from 'events';

/**
 * Status bar states representing the trust-building progression.
 * Each state maps to a specific visual treatment and user intent.
 */
export type StatusBarState =
  | 'idle'           // Default: SnapBack is watching
  | 'protected'      // Just created a snapshot (flash state)
  | 'ambient-risk'   // Risk 0.35-0.55: subtle awareness
  | 'recommend'      // Risk 0.55-0.80: gentle nudge
  | 'critical'       // Risk ≥0.80: assertive prompt
  | 'recovering'     // Active recovery in progress
  | 'error'          // Something went wrong
  | 'disabled';      // User paused protection

export interface StatusBarContext {
  state: StatusBarState;
  riskScore?: number;
  lastSnapshotAge?: number;        // seconds
  snapshotCountToday?: number;
  recoverySuccessRate?: number;    // 0-1
  currentPhase?: Phase;
  snoozedUntil?: Date;
  errorMessage?: string;
}

export type Phase = 'critical' | 'feature' | 'refactor' | 'exploratory';

/**
 * State transition rules - defines valid state changes
 */
const VALID_TRANSITIONS: Record<StatusBarState, StatusBarState[]> = {
  'idle':         ['protected', 'ambient-risk', 'recommend', 'critical', 'recovering', 'error', 'disabled'],
  'protected':    ['idle', 'ambient-risk', 'recommend', 'critical', 'error'],
  'ambient-risk': ['idle', 'protected', 'recommend', 'critical', 'recovering', 'error', 'disabled'],
  'recommend':    ['idle', 'protected', 'ambient-risk', 'critical', 'recovering', 'error', 'disabled'],
  'critical':     ['idle', 'protected', 'ambient-risk', 'recommend', 'recovering', 'error', 'disabled'],
  'recovering':   ['idle', 'error'],
  'error':        ['idle', 'disabled'],
  'disabled':     ['idle'],
};

/**
 * Visual configuration for each state
 */
interface StateVisuals {
  icon: string;
  text?: string;
  color?: vscode.ThemeColor;
  backgroundColor?: vscode.ThemeColor;
  tooltip: (ctx: StatusBarContext) => vscode.MarkdownString;
  priority: number;  // Higher = more visible
  autoRevert?: {
    to: StatusBarState;
    afterMs: number;
  };
}

const STATE_VISUALS: Record<StatusBarState, StateVisuals> = {
  'idle': {
    icon: '$(shield)',
    color: undefined,  // Default foreground
    tooltip: (ctx) => buildTooltip({
      title: 'SnapBack Active',
      stats: [
        `Protected ${ctx.snapshotCountToday ?? 0} times today`,
        `Recovery rate: ${formatPercent(ctx.recoverySuccessRate)}`,
        ctx.lastSnapshotAge !== undefined
          ? `Last snapshot: ${formatAge(ctx.lastSnapshotAge)}`
          : 'No snapshots yet',
      ],
      actions: ['Click to open dashboard'],
    }),
    priority: 100,
  },

  'protected': {
    icon: '$(shield-check)',
    text: 'Protected',
    color: new vscode.ThemeColor('statusBarItem.prominentForeground'),
    backgroundColor: new vscode.ThemeColor('statusBarItem.prominentBackground'),
    tooltip: (ctx) => buildTooltip({
      title: '✓ Snapshot Created',
      stats: [
        `${ctx.snapshotCountToday ?? 0} snapshots today`,
        'Your work is safe',
      ],
    }),
    priority: 200,
    autoRevert: { to: 'idle', afterMs: 3000 },
  },

  'ambient-risk': {
    icon: '$(shield)',
    color: new vscode.ThemeColor('statusBarItem.warningForeground'),
    tooltip: (ctx) => buildTooltip({
      title: 'Risk Building',
      stats: [
        `Risk score: ${formatPercent(ctx.riskScore)}`,
        `Phase: ${formatPhase(ctx.currentPhase)}`,
        'Changes accumulating—SnapBack is watching',
      ],
      actions: ['Click to view details'],
    }),
    priority: 150,
  },

  'recommend': {
    icon: '$(git-commit)',
    text: 'Commit?',
    color: new vscode.ThemeColor('statusBarItem.warningForeground'),
    backgroundColor: new vscode.ThemeColor('statusBarItem.warningBackground'),
    tooltip: (ctx) => buildTooltip({
      title: 'Consider Committing',
      stats: [
        `Risk score: ${formatPercent(ctx.riskScore)}`,
        `Phase: ${formatPhase(ctx.currentPhase)}`,
        'Multiple changes since last commit',
      ],
      actions: [
        'Click to view changes',
        'Right-click to snooze',
      ],
    }),
    priority: 300,
  },

  'critical': {
    icon: '$(warning)',
    text: 'High Risk',
    color: new vscode.ThemeColor('statusBarItem.errorForeground'),
    backgroundColor: new vscode.ThemeColor('statusBarItem.errorBackground'),
    tooltip: (ctx) => buildTooltip({
      title: '⚠️ High Risk - Commit Recommended',
      stats: [
        `Risk score: ${formatPercent(ctx.riskScore)}`,
        `Phase: ${formatPhase(ctx.currentPhase)}`,
        'Significant uncommitted changes detected',
      ],
      actions: [
        'Click to review and commit',
        'Your work is still protected by snapshots',
      ],
    }),
    priority: 400,
  },

  'recovering': {
    icon: '$(sync~spin)',
    text: 'Recovering...',
    color: new vscode.ThemeColor('statusBarItem.prominentForeground'),
    backgroundColor: new vscode.ThemeColor('statusBarItem.prominentBackground'),
    tooltip: () => buildTooltip({
      title: 'Recovery in Progress',
      stats: ['Restoring your previous state...'],
    }),
    priority: 500,
  },

  'error': {
    icon: '$(error)',
    text: 'Error',
    color: new vscode.ThemeColor('statusBarItem.errorForeground'),
    backgroundColor: new vscode.ThemeColor('statusBarItem.errorBackground'),
    tooltip: (ctx) => buildTooltip({
      title: 'SnapBack Error',
      stats: [ctx.errorMessage ?? 'Unknown error occurred'],
      actions: ['Click to retry', 'Your snapshots are safe'],
    }),
    priority: 450,
  },

  'disabled': {
    icon: '$(shield-x)',
    text: 'Paused',
    color: new vscode.ThemeColor('disabledForeground'),
    tooltip: (ctx) => buildTooltip({
      title: 'SnapBack Paused',
      stats: ctx.snoozedUntil
        ? [`Resumes ${formatTime(ctx.snoozedUntil)}`]
        : ['Protection is disabled'],
      actions: ['Click to resume'],
    }),
    priority: 100,
  },
};
```

### Core State Machine Implementation

```typescript
// File: apps/vscode/src/ui/statusBar/StatusBarStateMachine.ts (continued)

export class StatusBarStateMachine extends EventEmitter {
  private statusBarItem: vscode.StatusBarItem;
  private currentState: StatusBarState = 'idle';
  private context: StatusBarContext = { state: 'idle' };
  private autoRevertTimer?: NodeJS.Timeout;
  private pulseInterval?: NodeJS.Timeout;
  private isPulsing = false;

  constructor(private readonly extensionContext: vscode.ExtensionContext) {
    super();

    this.statusBarItem = vscode.window.createStatusBarItem(
      'snapback.status',
      vscode.StatusBarAlignment.Right,
      100  // Priority among other status bar items
    );

    this.statusBarItem.name = 'SnapBack Status';
    this.statusBarItem.command = 'snapback.openDashboard';

    this.extensionContext.subscriptions.push(this.statusBarItem);
    this.render();
    this.statusBarItem.show();
  }

  /**
   * Transition to a new state with optional context updates
   */
  public transition(
    newState: StatusBarState,
    contextUpdates?: Partial<StatusBarContext>
  ): boolean {
    // Validate transition
    if (!VALID_TRANSITIONS[this.currentState].includes(newState)) {
      console.warn(
        `[StatusBar] Invalid transition: ${this.currentState} → ${newState}`
      );
      return false;
    }

    // Clear any pending auto-revert
    if (this.autoRevertTimer) {
      clearTimeout(this.autoRevertTimer);
      this.autoRevertTimer = undefined;
    }

    // Stop pulsing if we're leaving ambient-risk
    if (this.currentState === 'ambient-risk' && newState !== 'ambient-risk') {
      this.stopPulse();
    }

    const previousState = this.currentState;
    this.currentState = newState;
    this.context = {
      ...this.context,
      ...contextUpdates,
      state: newState
    };

    this.render();
    this.emit('stateChange', { from: previousState, to: newState, context: this.context });

    // Set up auto-revert if configured
    const visuals = STATE_VISUALS[newState];
    if (visuals.autoRevert) {
      this.autoRevertTimer = setTimeout(() => {
        this.transition(visuals.autoRevert!.to);
      }, visuals.autoRevert.afterMs);
    }

    // Start pulsing for ambient-risk state
    if (newState === 'ambient-risk') {
      this.startPulse();
    }

    return true;
  }

  /**
   * Update context without changing state
   */
  public updateContext(updates: Partial<StatusBarContext>): void {
    this.context = { ...this.context, ...updates };
    this.render();
  }

  /**
   * Get current state and context
   */
  public getState(): { state: StatusBarState; context: StatusBarContext } {
    return { state: this.currentState, context: { ...this.context } };
  }

  /**
   * Render the status bar based on current state
   */
  private render(): void {
    const visuals = STATE_VISUALS[this.currentState];

    // Build display text
    const parts: string[] = [visuals.icon];
    if (visuals.text) {
      parts.push(visuals.text);
    }

    this.statusBarItem.text = parts.join(' ');
    this.statusBarItem.tooltip = visuals.tooltip(this.context);
    this.statusBarItem.color = visuals.color;
    this.statusBarItem.backgroundColor = visuals.backgroundColor;

    // Update command based on state
    this.statusBarItem.command = this.getCommandForState(this.currentState);
  }

  /**
   * Determine click action based on state
   */
  private getCommandForState(state: StatusBarState): string | vscode.Command {
    switch (state) {
      case 'recommend':
      case 'critical':
        return {
          command: 'snapback.openDashboard',
          title: 'Open SnapBack',
          arguments: [{ focus: 'commit-recommendation' }],
        };
      case 'error':
        return 'snapback.retryLastAction';
      case 'disabled':
        return 'snapback.resume';
      default:
        return 'snapback.openDashboard';
    }
  }

  /**
   * Ambient pulse animation for risk awareness
   * VS Code doesn't support CSS animations, so we toggle opacity via color
   */
  private startPulse(): void {
    if (this.isPulsing) return;
    this.isPulsing = true;

    let bright = true;
    this.pulseInterval = setInterval(() => {
      if (this.currentState !== 'ambient-risk') {
        this.stopPulse();
        return;
      }

      // Toggle between warning color and slightly dimmed
      this.statusBarItem.color = bright
        ? new vscode.ThemeColor('statusBarItem.warningForeground')
        : new vscode.ThemeColor('statusBarItem.foreground');

      bright = !bright;
    }, 1500);  // Slow, gentle pulse
  }

  private stopPulse(): void {
    if (this.pulseInterval) {
      clearInterval(this.pulseInterval);
      this.pulseInterval = undefined;
    }
    this.isPulsing = false;
  }

  /**
   * Cleanup
   */
  public dispose(): void {
    this.stopPulse();
    if (this.autoRevertTimer) {
      clearTimeout(this.autoRevertTimer);
    }
    this.statusBarItem.dispose();
  }
}
```

### Tooltip Builder Utility

```typescript
// File: apps/vscode/src/ui/statusBar/tooltipBuilder.ts

interface TooltipConfig {
  title: string;
  stats?: string[];
  actions?: string[];
}

export function buildTooltip(config: TooltipConfig): vscode.MarkdownString {
  const md = new vscode.MarkdownString();
  md.isTrusted = true;
  md.supportHtml = true;

  // Title
  md.appendMarkdown(`**${config.title}**\n\n`);

  // Stats
  if (config.stats?.length) {
    config.stats.forEach(stat => {
      md.appendMarkdown(`$(circle-filled) ${stat}\n\n`);
    });
  }

  // Actions
  if (config.actions?.length) {
    md.appendMarkdown('---\n\n');
    config.actions.forEach(action => {
      md.appendMarkdown(`*${action}*\n\n`);
    });
  }

  return md;
}

export function formatPercent(value?: number): string {
  if (value === undefined) return 'N/A';
  return `${(value * 100).toFixed(1)}%`;
}

export function formatAge(seconds: number): string {
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

export function formatPhase(phase?: Phase): string {
  const labels: Record<Phase, string> = {
    critical: '🔥 Critical',
    feature: '✨ Feature',
    refactor: '🔧 Refactor',
    exploratory: '🧪 Exploratory',
  };
  return phase ? labels[phase] : 'Unknown';
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  });
}
```

### Integration with Risk Score System

```typescript
// File: apps/vscode/src/ui/statusBar/StatusBarController.ts

import { StatusBarStateMachine, StatusBarState, Phase } from './StatusBarStateMachine';
import { RiskScoreService } from '../../services/RiskScoreService';
import { SnapshotService } from '../../services/SnapshotService';
import { RecoveryService } from '../../services/RecoveryService';
import { PhaseDetector } from '../../services/PhaseDetector';

/**
 * Controller that bridges domain services with status bar UI
 */
export class StatusBarController {
  private stateMachine: StatusBarStateMachine;
  private disposables: vscode.Disposable[] = [];

  constructor(
    extensionContext: vscode.ExtensionContext,
    private readonly riskScoreService: RiskScoreService,
    private readonly snapshotService: SnapshotService,
    private readonly recoveryService: RecoveryService,
    private readonly phaseDetector: PhaseDetector,
  ) {
    this.stateMachine = new StatusBarStateMachine(extensionContext);
    this.setupListeners();
    this.initializeContext();
  }

  private setupListeners(): void {
    // Risk score changes
    this.disposables.push(
      this.riskScoreService.onScoreChange((score) => {
        this.handleRiskScoreChange(score);
      })
    );

    // Snapshot created
    this.disposables.push(
      this.snapshotService.onSnapshotCreated((snapshot) => {
        this.handleSnapshotCreated(snapshot);
      })
    );

    // Recovery events
    this.disposables.push(
      this.recoveryService.onRecoveryStart(() => {
        this.stateMachine.transition('recovering');
      }),
      this.recoveryService.onRecoveryComplete((success) => {
        this.stateMachine.transition(success ? 'idle' : 'error', {
          errorMessage: success ? undefined : 'Recovery failed',
        });
      })
    );

    // Phase changes
    this.disposables.push(
      this.phaseDetector.onPhaseChange((phase) => {
        this.stateMachine.updateContext({ currentPhase: phase });
      })
    );

    // Periodic stats refresh
    const statsInterval = setInterval(() => this.refreshStats(), 30000);
    this.disposables.push({ dispose: () => clearInterval(statsInterval) });
  }

  private async initializeContext(): Promise<void> {
    const [stats, phase] = await Promise.all([
      this.snapshotService.getTodayStats(),
      this.phaseDetector.getCurrentPhase(),
    ]);

    this.stateMachine.updateContext({
      snapshotCountToday: stats.count,
      lastSnapshotAge: stats.lastSnapshotAge,
      recoverySuccessRate: stats.recoverySuccessRate,
      currentPhase: phase,
    });
  }

  private handleRiskScoreChange(score: number): void {
    const { state } = this.stateMachine.getState();

    // Don't interrupt certain states
    if (['recovering', 'error', 'disabled'].includes(state)) {
      return;
    }

    // Determine target state based on score
    let targetState: StatusBarState;
    if (score >= 0.80) {
      targetState = 'critical';
    } else if (score >= 0.55) {
      targetState = 'recommend';
    } else if (score >= 0.35) {
      targetState = 'ambient-risk';
    } else {
      targetState = 'idle';
    }

    // Only transition if state changes (avoid flicker)
    if (targetState !== state) {
      this.stateMachine.transition(targetState, { riskScore: score });
    } else {
      // Just update the score in context
      this.stateMachine.updateContext({ riskScore: score });
    }
  }

  private handleSnapshotCreated(snapshot: { id: string; automatic: boolean }): void {
    const { state } = this.stateMachine.getState();

    // Flash "protected" state briefly
    if (!['recovering', 'error', 'disabled'].includes(state)) {
      this.stateMachine.transition('protected');
    }

    // Update snapshot count
    this.refreshStats();
  }

  private async refreshStats(): Promise<void> {
    const stats = await this.snapshotService.getTodayStats();
    this.stateMachine.updateContext({
      snapshotCountToday: stats.count,
      lastSnapshotAge: stats.lastSnapshotAge,
      recoverySuccessRate: stats.recoverySuccessRate,
    });
  }

  /**
   * Handle user snooze request
   */
  public snooze(duration: number): void {
    const snoozedUntil = new Date(Date.now() + duration);
    this.stateMachine.transition('disabled', { snoozedUntil });

    // Auto-resume after snooze
    setTimeout(() => {
      const { state } = this.stateMachine.getState();
      if (state === 'disabled') {
        this.stateMachine.transition('idle');
      }
    }, duration);
  }

  public dispose(): void {
    this.stateMachine.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}
```

### State Transition Diagram

```
                                    ┌─────────────┐
                                    │   disabled  │
                                    └──────┬──────┘
                                           │ resume
                                           ▼
    ┌────────────────────────────────────────────────────────────────┐
    │                                                                │
    │  ┌──────────┐  score<0.35   ┌──────────┐  score≥0.35          │
    │  │   idle   │◄──────────────│ protected │◄─────┐               │
    │  └────┬─────┘               └──────────┘       │               │
    │       │                          ▲             │               │
    │       │ score≥0.35               │ snapshot    │ 3s timeout    │
    │       ▼                          │ created     │               │
    │  ┌────────────┐                  │             │               │
    │  │ambient-risk│──────────────────┴─────────────┘               │
    │  └────┬───────┘                                                │
    │       │ score≥0.55                                             │
    │       ▼                                                        │
    │  ┌───────────┐                                                 │
    │  │ recommend │                                                 │
    │  └────┬──────┘                                                 │
    │       │ score≥0.80                                             │
    │       ▼                                                        │
    │  ┌──────────┐      recovery       ┌───────────┐                │
    │  │ critical │─────started────────►│ recovering│                │
    │  └──────────┘                     └─────┬─────┘                │
    │       │                                 │                      │
    │       │ error                           │ complete             │
    │       ▼                                 ▼                      │
    │  ┌──────────┐                     ┌──────────┐                 │
    │  │  error   │─────────────────────│   idle   │                 │
    │  └──────────┘      retry          └──────────┘                 │
    │                                                                │
    └────────────────────────────────────────────────────────────────┘
```

---

## 2. Session Health Dashboard Webview Components

### Component Architecture

```
SessionHealthDashboard/
├── index.tsx                    # Main container
├── components/
│   ├── VitalsGrid/
│   │   ├── VitalsGrid.tsx       # 3-column vitals display
│   │   ├── VitalCard.tsx        # Individual vital metric
│   │   └── VitalCard.module.css
│   ├── ProtectionStats/
│   │   ├── ProtectionStats.tsx  # Snapshot count, age, recovery rate
│   │   └── StatBadge.tsx
│   ├── ActivityFeed/
│   │   ├── ActivityFeed.tsx     # Recent protection events
│   │   ├── ActivityItem.tsx
│   │   └── ActivityItem.module.css
│   ├── ActionBar/
│   │   ├── ActionBar.tsx        # Test Restore, Commit, History buttons
│   │   └── ActionButton.tsx
│   ├── CriticalBanner/
│   │   ├── CriticalBanner.tsx   # High-risk warning banner
│   │   └── CriticalBanner.module.css
│   └── common/
│       ├── Tooltip.tsx
│       ├── ProgressRing.tsx
│       └── Icons.tsx
├── hooks/
│   ├── useVSCodeAPI.ts          # VS Code webview API wrapper
│   ├── useSessionState.ts       # State management
│   └── useActivityFeed.ts       # Activity polling/subscription
├── types/
│   └── index.ts                 # Shared type definitions
└── styles/
    ├── variables.css            # VS Code theme tokens
    └── global.css
```

### Type Definitions

```typescript
// File: apps/vscode/src/webview/SessionHealthDashboard/types/index.ts

export type VitalStatus = 'healthy' | 'caution' | 'warning' | 'critical';
export type VitalTrend = 'stable' | 'rising' | 'falling';

export interface Vital {
  id: 'pulse' | 'temperature' | 'pressure';
  label: string;
  value: number;
  displayValue: string;
  unit?: string;
  status: VitalStatus;
  trend: VitalTrend;
  description: string;
}

export interface ProtectionStats {
  snapshotCountToday: number;
  lastSnapshotAge: number | null;  // seconds, null if none
  recoverySuccessRate: number;     // 0-1
  totalRecoveries: number;
}

export interface ActivityItem {
  id: string;
  type: 'auto-protect' | 'checkpoint' | 'recovery' | 'session-start' | 'commit';
  timestamp: Date;
  description: string;
  metadata?: {
    fileName?: string;
    aiTool?: string;
    riskScore?: number;
  };
}

export interface SessionState {
  vitals: Vital[];
  stats: ProtectionStats;
  activities: ActivityItem[];
  riskScore: number;
  phase: Phase;
  showCriticalBanner: boolean;
}

export type Phase = 'critical' | 'feature' | 'refactor' | 'exploratory';

// Messages between extension and webview
export type ExtensionMessage =
  | { type: 'state-update'; payload: Partial<SessionState> }
  | { type: 'activity-added'; payload: ActivityItem }
  | { type: 'show-critical-banner'; payload: { riskScore: number } }
  | { type: 'hide-critical-banner' }
  | { type: 'test-restore-result'; payload: { success: boolean; diff?: string } };

export type WebviewMessage =
  | { type: 'request-state' }
  | { type: 'action-test-restore' }
  | { type: 'action-commit' }
  | { type: 'action-view-history' }
  | { type: 'dismiss-critical-banner' }
  | { type: 'snooze'; payload: { durationMs: number } };
```

### Main Dashboard Container

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/index.tsx

import { useEffect, useCallback } from 'react';
import { VitalsGrid } from './components/VitalsGrid/VitalsGrid';
import { ProtectionStats } from './components/ProtectionStats/ProtectionStats';
import { ActivityFeed } from './components/ActivityFeed/ActivityFeed';
import { ActionBar } from './components/ActionBar/ActionBar';
import { CriticalBanner } from './components/CriticalBanner/CriticalBanner';
import { useVSCodeAPI } from './hooks/useVSCodeAPI';
import { useSessionState } from './hooks/useSessionState';
import styles from './Dashboard.module.css';

export function SessionHealthDashboard() {
  const vscode = useVSCodeAPI();
  const { state, dispatch } = useSessionState();

  // Request initial state on mount
  useEffect(() => {
    vscode.postMessage({ type: 'request-state' });
  }, [vscode]);

  // Listen for messages from extension
  useEffect(() => {
    const handler = (event: MessageEvent) => {
      const message = event.data as ExtensionMessage;

      switch (message.type) {
        case 'state-update':
          dispatch({ type: 'UPDATE_STATE', payload: message.payload });
          break;
        case 'activity-added':
          dispatch({ type: 'ADD_ACTIVITY', payload: message.payload });
          break;
        case 'show-critical-banner':
          dispatch({ type: 'SHOW_CRITICAL', payload: message.payload });
          break;
        case 'hide-critical-banner':
          dispatch({ type: 'HIDE_CRITICAL' });
          break;
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [dispatch]);

  const handleTestRestore = useCallback(() => {
    vscode.postMessage({ type: 'action-test-restore' });
  }, [vscode]);

  const handleCommit = useCallback(() => {
    vscode.postMessage({ type: 'action-commit' });
  }, [vscode]);

  const handleViewHistory = useCallback(() => {
    vscode.postMessage({ type: 'action-view-history' });
  }, [vscode]);

  const handleDismissBanner = useCallback(() => {
    vscode.postMessage({ type: 'dismiss-critical-banner' });
    dispatch({ type: 'HIDE_CRITICAL' });
  }, [vscode, dispatch]);

  const handleSnooze = useCallback((durationMs: number) => {
    vscode.postMessage({ type: 'snooze', payload: { durationMs } });
  }, [vscode]);

  return (
    <div className={styles.dashboard}>
      {/* Critical Banner - conditionally rendered at top */}
      {state.showCriticalBanner && (
        <CriticalBanner
          riskScore={state.riskScore}
          onDismiss={handleDismissBanner}
          onViewChanges={handleViewHistory}
          onSnooze={handleSnooze}
        />
      )}

      {/* Header */}
      <header className={styles.header}>
        <h1 className={styles.title}>SnapBack</h1>
        <PhaseIndicator phase={state.phase} />
      </header>

      {/* Vitals Grid */}
      <section className={styles.section}>
        <VitalsGrid vitals={state.vitals} />
      </section>

      {/* Divider */}
      <hr className={styles.divider} />

      {/* Protection Stats */}
      <section className={styles.section}>
        <ProtectionStats stats={state.stats} />
      </section>

      {/* Divider */}
      <hr className={styles.divider} />

      {/* Activity Feed */}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent Activity</h2>
        <ActivityFeed activities={state.activities} />
      </section>

      {/* Divider */}
      <hr className={styles.divider} />

      {/* Action Bar */}
      <ActionBar
        onTestRestore={handleTestRestore}
        onCommit={handleCommit}
        onViewHistory={handleViewHistory}
      />
    </div>
  );
}

function PhaseIndicator({ phase }: { phase: Phase }) {
  const config: Record<Phase, { icon: string; label: string; className: string }> = {
    critical: { icon: '🔥', label: 'Critical', className: styles.phaseCritical },
    feature: { icon: '✨', label: 'Feature', className: styles.phaseFeature },
    refactor: { icon: '🔧', label: 'Refactor', className: styles.phaseRefactor },
    exploratory: { icon: '🧪', label: 'Exploratory', className: styles.phaseExploratory },
  };

  const { icon, label, className } = config[phase];

  return (
    <span className={`${styles.phaseIndicator} ${className}`}>
      {icon} {label}
    </span>
  );
}
```

### Vitals Grid Component

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/VitalsGrid/VitalsGrid.tsx

import { VitalCard } from './VitalCard';
import type { Vital } from '../../types';
import styles from './VitalsGrid.module.css';

interface VitalsGridProps {
  vitals: Vital[];
}

export function VitalsGrid({ vitals }: VitalsGridProps) {
  return (
    <div className={styles.grid}>
      {vitals.map((vital) => (
        <VitalCard key={vital.id} vital={vital} />
      ))}
    </div>
  );
}
```

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/VitalsGrid/VitalCard.tsx

import { ProgressRing } from '../common/ProgressRing';
import { Tooltip } from '../common/Tooltip';
import type { Vital, VitalStatus, VitalTrend } from '../../types';
import styles from './VitalCard.module.css';

interface VitalCardProps {
  vital: Vital;
}

export function VitalCard({ vital }: VitalCardProps) {
  const statusColors: Record<VitalStatus, string> = {
    healthy: 'var(--vscode-charts-green)',
    caution: 'var(--vscode-charts-yellow)',
    warning: 'var(--vscode-charts-orange)',
    critical: 'var(--vscode-charts-red)',
  };

  const trendIcons: Record<VitalTrend, string> = {
    stable: '→',
    rising: '↑',
    falling: '↓',
  };

  const trendLabels: Record<VitalTrend, string> = {
    stable: 'Stable',
    rising: 'Rising',
    falling: 'Falling',
  };

  return (
    <Tooltip content={vital.description}>
      <div className={`${styles.card} ${styles[vital.status]}`}>
        <div className={styles.ringContainer}>
          <ProgressRing
            value={vital.value}
            max={100}
            size={64}
            strokeWidth={6}
            color={statusColors[vital.status]}
          />
          <span className={styles.ringValue}>{vital.displayValue}</span>
        </div>

        <div className={styles.info}>
          <span className={styles.label}>{vital.label}</span>
          <span className={styles.trend}>
            <span className={styles.trendIcon}>{trendIcons[vital.trend]}</span>
            {trendLabels[vital.trend]}
          </span>
        </div>
      </div>
    </Tooltip>
  );
}
```

```css
/* File: apps/vscode/src/webview/SessionHealthDashboard/components/VitalsGrid/VitalCard.module.css */

.card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px;
  background: var(--vscode-editor-background);
  border: 1px solid var(--vscode-widget-border);
  border-radius: 8px;
  transition: border-color 0.2s ease;
}

.card:hover {
  border-color: var(--vscode-focusBorder);
}

.card.healthy {
  border-left: 3px solid var(--vscode-charts-green);
}

.card.caution {
  border-left: 3px solid var(--vscode-charts-yellow);
}

.card.warning {
  border-left: 3px solid var(--vscode-charts-orange);
}

.card.critical {
  border-left: 3px solid var(--vscode-charts-red);
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.ringContainer {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
}

.ringValue {
  position: absolute;
  font-size: 14px;
  font-weight: 600;
  color: var(--vscode-foreground);
}

.info {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-top: 8px;
  gap: 2px;
}

.label {
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-foreground);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.trend {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}

.trendIcon {
  font-size: 10px;
}
```

### Protection Stats Component

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/ProtectionStats/ProtectionStats.tsx

import { StatBadge } from './StatBadge';
import type { ProtectionStats as ProtectionStatsType } from '../../types';
import styles from './ProtectionStats.module.css';

interface ProtectionStatsProps {
  stats: ProtectionStatsType;
}

export function ProtectionStats({ stats }: ProtectionStatsProps) {
  const formatAge = (seconds: number | null): string => {
    if (seconds === null) return 'Never';
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const formatRate = (rate: number): string => {
    return `${(rate * 100).toFixed(1)}%`;
  };

  return (
    <div className={styles.container}>
      <StatBadge
        icon="shield"
        label="Protected"
        value={`${stats.snapshotCountToday} times today`}
        variant="primary"
      />

      <StatBadge
        icon="clock"
        label="Last snapshot"
        value={formatAge(stats.lastSnapshotAge)}
        variant={stats.lastSnapshotAge && stats.lastSnapshotAge > 300 ? 'warning' : 'default'}
      />

      <StatBadge
        icon="check-circle"
        label="Recovery rate"
        value={`${formatRate(stats.recoverySuccessRate)} (${stats.totalRecoveries} total)`}
        variant={stats.recoverySuccessRate >= 0.95 ? 'success' : 'default'}
      />
    </div>
  );
}
```

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/ProtectionStats/StatBadge.tsx

import { Icon } from '../common/Icons';
import styles from './StatBadge.module.css';

type BadgeVariant = 'default' | 'primary' | 'success' | 'warning';

interface StatBadgeProps {
  icon: string;
  label: string;
  value: string;
  variant?: BadgeVariant;
}

export function StatBadge({ icon, label, value, variant = 'default' }: StatBadgeProps) {
  return (
    <div className={`${styles.badge} ${styles[variant]}`}>
      <Icon name={icon} className={styles.icon} />
      <div className={styles.content}>
        <span className={styles.label}>{label}</span>
        <span className={styles.value}>{value}</span>
      </div>
    </div>
  );
}
```

### Activity Feed Component

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/ActivityFeed/ActivityFeed.tsx

import { ActivityItem as ActivityItemComponent } from './ActivityItem';
import type { ActivityItem } from '../../types';
import styles from './ActivityFeed.module.css';

interface ActivityFeedProps {
  activities: ActivityItem[];
  maxItems?: number;
}

export function ActivityFeed({ activities, maxItems = 5 }: ActivityFeedProps) {
  const displayActivities = activities.slice(0, maxItems);

  if (displayActivities.length === 0) {
    return (
      <div className={styles.empty}>
        <span className={styles.emptyIcon}>📋</span>
        <span className={styles.emptyText}>No activity yet</span>
        <span className={styles.emptySubtext}>Start coding—SnapBack will protect you</span>
      </div>
    );
  }

  return (
    <ul className={styles.feed}>
      {displayActivities.map((activity, index) => (
        <ActivityItemComponent
          key={activity.id}
          activity={activity}
          isLatest={index === 0}
        />
      ))}
    </ul>
  );
}
```

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/ActivityFeed/ActivityItem.tsx

import type { ActivityItem as ActivityItemType } from '../../types';
import styles from './ActivityItem.module.css';

interface ActivityItemProps {
  activity: ActivityItemType;
  isLatest?: boolean;
}

export function ActivityItem({ activity, isLatest }: ActivityItemProps) {
  const typeConfig: Record<ActivityItemType['type'], { icon: string; color: string }> = {
    'auto-protect': { icon: '🛡️', color: 'var(--vscode-charts-blue)' },
    'checkpoint': { icon: '📍', color: 'var(--vscode-charts-purple)' },
    'recovery': { icon: '⏪', color: 'var(--vscode-charts-green)' },
    'session-start': { icon: '▶️', color: 'var(--vscode-charts-yellow)' },
    'commit': { icon: '✓', color: 'var(--vscode-charts-green)' },
  };

  const { icon, color } = typeConfig[activity.type];

  const formatTime = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffMins < 1440) return `${Math.floor(diffMins / 60)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <li className={`${styles.item} ${isLatest ? styles.latest : ''}`}>
      <span className={styles.icon} style={{ color }}>{icon}</span>
      <div className={styles.content}>
        <span className={styles.description}>{activity.description}</span>
        {activity.metadata?.aiTool && (
          <span className={styles.metadata}>via {activity.metadata.aiTool}</span>
        )}
      </div>
      <span className={styles.time}>{formatTime(activity.timestamp)}</span>
    </li>
  );
}
```

```css
/* File: apps/vscode/src/webview/SessionHealthDashboard/components/ActivityFeed/ActivityItem.module.css */

.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--vscode-widget-border);
}

.item:last-child {
  border-bottom: none;
}

.item.latest {
  background: var(--vscode-list-hoverBackground);
  margin: 0 -12px;
  padding: 8px 12px;
  border-radius: 4px;
}

.icon {
  flex-shrink: 0;
  font-size: 14px;
  line-height: 1;
  margin-top: 2px;
}

.content {
  flex: 1;
  min-width: 0;
}

.description {
  display: block;
  font-size: 12px;
  color: var(--vscode-foreground);
  line-height: 1.4;
}

.metadata {
  display: block;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin-top: 2px;
}

.time {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
}
```

### Critical Banner Component

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/CriticalBanner/CriticalBanner.tsx

import { useState } from 'react';
import styles from './CriticalBanner.module.css';

interface CriticalBannerProps {
  riskScore: number;
  onDismiss: () => void;
  onViewChanges: () => void;
  onSnooze: (durationMs: number) => void;
}

export function CriticalBanner({
  riskScore,
  onDismiss,
  onViewChanges,
  onSnooze
}: CriticalBannerProps) {
  const [showSnoozeMenu, setShowSnoozeMenu] = useState(false);

  const snoozeOptions = [
    { label: '25 minutes', duration: 25 * 60 * 1000, icon: '🍅' },
    { label: '1 hour', duration: 60 * 60 * 1000, icon: '⏰' },
    { label: 'Until next commit', duration: -1, icon: '🎯' },
  ];

  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <span className={styles.icon}>⚠️</span>
        <div className={styles.message}>
          <strong>High Risk: {(riskScore * 100).toFixed(0)}%</strong>
          <span>Multiple uncommitted changes detected. Consider committing.</span>
        </div>
      </div>

      <div className={styles.actions}>
        <button
          className={styles.primaryButton}
          onClick={onViewChanges}
        >
          View Changes
        </button>

        <div className={styles.snoozeContainer}>
          <button
            className={styles.secondaryButton}
            onClick={() => setShowSnoozeMenu(!showSnoozeMenu)}
          >
            Snooze ▾
          </button>

          {showSnoozeMenu && (
            <div className={styles.snoozeMenu}>
              {snoozeOptions.map((option) => (
                <button
                  key={option.label}
                  className={styles.snoozeOption}
                  onClick={() => {
                    onSnooze(option.duration);
                    setShowSnoozeMenu(false);
                  }}
                >
                  <span>{option.icon}</span>
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <button
          className={styles.dismissButton}
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

```css
/* File: apps/vscode/src/webview/SessionHealthDashboard/components/CriticalBanner/CriticalBanner.module.css */

.banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  background: var(--vscode-inputValidation-warningBackground);
  border: 1px solid var(--vscode-inputValidation-warningBorder);
  border-radius: 6px;
  margin-bottom: 16px;
  animation: slideDown 0.3s ease-out;
}

@keyframes slideDown {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.content {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  flex: 1;
}

.icon {
  font-size: 20px;
  line-height: 1;
}

.message {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.message strong {
  font-size: 13px;
  color: var(--vscode-foreground);
}

.message span {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
}

.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.primaryButton {
  padding: 6px 12px;
  font-size: 12px;
  font-weight: 500;
  color: var(--vscode-button-foreground);
  background: var(--vscode-button-background);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.15s ease;
}

.primaryButton:hover {
  background: var(--vscode-button-hoverBackground);
}

.secondaryButton {
  padding: 6px 12px;
  font-size: 12px;
  color: var(--vscode-foreground);
  background: var(--vscode-button-secondaryBackground);
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.secondaryButton:hover {
  background: var(--vscode-button-secondaryHoverBackground);
}

.snoozeContainer {
  position: relative;
}

.snoozeMenu {
  position: absolute;
  top: 100%;
  right: 0;
  margin-top: 4px;
  padding: 4px;
  background: var(--vscode-dropdown-background);
  border: 1px solid var(--vscode-dropdown-border);
  border-radius: 6px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  z-index: 100;
  min-width: 160px;
}

.snoozeOption {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  font-size: 12px;
  color: var(--vscode-foreground);
  background: transparent;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  text-align: left;
}

.snoozeOption:hover {
  background: var(--vscode-list-hoverBackground);
}

.dismissButton {
  padding: 4px 8px;
  font-size: 14px;
  color: var(--vscode-descriptionForeground);
  background: transparent;
  border: none;
  cursor: pointer;
  border-radius: 4px;
}

.dismissButton:hover {
  background: var(--vscode-toolbar-hoverBackground);
  color: var(--vscode-foreground);
}
```

### Action Bar Component

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/ActionBar/ActionBar.tsx

import { ActionButton } from './ActionButton';
import styles from './ActionBar.module.css';

interface ActionBarProps {
  onTestRestore: () => void;
  onCommit: () => void;
  onViewHistory: () => void;
}

export function ActionBar({ onTestRestore, onCommit, onViewHistory }: ActionBarProps) {
  return (
    <div className={styles.bar}>
      <ActionButton
        icon="🔄"
        label="Test Restore"
        description="Preview recovery without applying"
        onClick={onTestRestore}
        variant="secondary"
      />

      <ActionButton
        icon="📝"
        label="Commit Now"
        description="Save your work to git"
        onClick={onCommit}
        variant="primary"
      />

      <ActionButton
        icon="📜"
        label="History"
        description="View all snapshots"
        onClick={onViewHistory}
        variant="secondary"
      />
    </div>
  );
}
```

```tsx
// File: apps/vscode/src/webview/SessionHealthDashboard/components/ActionBar/ActionButton.tsx

import styles from './ActionButton.module.css';

interface ActionButtonProps {
  icon: string;
  label: string;
  description: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}

export function ActionButton({
  icon,
  label,
  description,
  onClick,
  variant = 'secondary',
  disabled = false
}: ActionButtonProps) {
  return (
    <button
      className={`${styles.button} ${styles[variant]}`}
      onClick={onClick}
      disabled={disabled}
      title={description}
    >
      <span className={styles.icon}>{icon}</span>
      <span className={styles.label}>{label}</span>
    </button>
  );
}
```

### VS Code API Hook

```typescript
// File: apps/vscode/src/webview/SessionHealthDashboard/hooks/useVSCodeAPI.ts

import { useMemo } from 'react';
import type { WebviewMessage } from '../types';

interface VSCodeAPI {
  postMessage: (message: WebviewMessage) => void;
  getState: <T>() => T | undefined;
  setState: <T>(state: T) => void;
}

declare function acquireVsCodeApi(): VSCodeAPI;

let api: VSCodeAPI | null = null;

export function useVSCodeAPI(): VSCodeAPI {
  return useMemo(() => {
    if (!api) {
      api = acquireVsCodeApi();
    }
    return api;
  }, []);
}
```

### State Management Hook

```typescript
// File: apps/vscode/src/webview/SessionHealthDashboard/hooks/useSessionState.ts

import { useReducer, Dispatch } from 'react';
import type { SessionState, ActivityItem, Vital, Phase } from '../types';

// Default vitals configuration
const defaultVitals: Vital[] = [
  {
    id: 'pulse',
    label: 'Pulse',
    value: 75,
    displayValue: '●●●●○',
    status: 'healthy',
    trend: 'stable',
    description: 'Change frequency—how actively you\'re coding',
  },
  {
    id: 'temperature',
    label: 'Temperature',
    value: 72,
    displayValue: '72°',
    unit: '°',
    status: 'healthy',
    trend: 'stable',
    description: 'Risk heat—complexity and scope of changes',
  },
  {
    id: 'pressure',
    label: 'Pressure',
    value: 42,
    displayValue: '0.42',
    status: 'healthy',
    trend: 'rising',
    description: 'Commit pressure—time since last commit',
  },
];

const initialState: SessionState = {
  vitals: defaultVitals,
  stats: {
    snapshotCountToday: 0,
    lastSnapshotAge: null,
    recoverySuccessRate: 1.0,
    totalRecoveries: 0,
  },
  activities: [],
  riskScore: 0,
  phase: 'feature',
  showCriticalBanner: false,
};

type Action =
  | { type: 'UPDATE_STATE'; payload: Partial<SessionState> }
  | { type: 'ADD_ACTIVITY'; payload: ActivityItem }
  | { type: 'SHOW_CRITICAL'; payload: { riskScore: number } }
  | { type: 'HIDE_CRITICAL' }
  | { type: 'UPDATE_VITALS'; payload: Vital[] }
  | { type: 'SET_PHASE'; payload: Phase };

function reducer(state: SessionState, action: Action): SessionState {
  switch (action.type) {
    case 'UPDATE_STATE':
      return { ...state, ...action.payload };

    case 'ADD_ACTIVITY':
      return {
        ...state,
        activities: [action.payload, ...state.activities].slice(0, 20),
      };

    case 'SHOW_CRITICAL':
      return {
        ...state,
        showCriticalBanner: true,
        riskScore: action.payload.riskScore,
      };

    case 'HIDE_CRITICAL':
      return { ...state, showCriticalBanner: false };

    case 'UPDATE_VITALS':
      return { ...state, vitals: action.payload };

    case 'SET_PHASE':
      return { ...state, phase: action.payload };

    default:
      return state;
  }
}

export function useSessionState(): {
  state: SessionState;
  dispatch: Dispatch<Action>;
} {
  const [state, dispatch] = useReducer(reducer, initialState);
  return { state, dispatch };
}
```

### CSS Variables for VS Code Theme Integration

```css
/* File: apps/vscode/src/webview/SessionHealthDashboard/styles/variables.css */

:root {
  /* These are automatically provided by VS Code webview */
  /* Documenting for reference */

  /* Core colors */
  --vscode-foreground: var(--vscode-foreground);
  --vscode-descriptionForeground: var(--vscode-descriptionForeground);
  --vscode-disabledForeground: var(--vscode-disabledForeground);

  /* Backgrounds */
  --vscode-editor-background: var(--vscode-editor-background);
  --vscode-sideBar-background: var(--vscode-sideBar-background);

  /* Interactive elements */
  --vscode-button-background: var(--vscode-button-background);
  --vscode-button-foreground: var(--vscode-button-foreground);
  --vscode-button-hoverBackground: var(--vscode-button-hoverBackground);
  --vscode-button-secondaryBackground: var(--vscode-button-secondaryBackground);
  --vscode-button-secondaryHoverBackground: var(--vscode-button-secondaryHoverBackground);

  /* Borders */
  --vscode-widget-border: var(--vscode-widget-border);
  --vscode-focusBorder: var(--vscode-focusBorder);

  /* Charts (for vitals) */
  --vscode-charts-green: var(--vscode-charts-green, #4ec9b0);
  --vscode-charts-yellow: var(--vscode-charts-yellow, #dcdcaa);
  --vscode-charts-orange: var(--vscode-charts-orange, #ce9178);
  --vscode-charts-red: var(--vscode-charts-red, #f14c4c);
  --vscode-charts-blue: var(--vscode-charts-blue, #569cd6);
  --vscode-charts-purple: var(--vscode-charts-purple, #c586c0);

  /* Status */
  --vscode-inputValidation-warningBackground: var(--vscode-inputValidation-warningBackground);
  --vscode-inputValidation-warningBorder: var(--vscode-inputValidation-warningBorder);
}
```

---

## Integration Example

Here's how to wire everything together in your extension:

```typescript
// File: apps/vscode/src/extension.ts (relevant excerpt)

import { StatusBarController } from './ui/statusBar/StatusBarController';
import { SessionHealthWebviewProvider } from './webview/SessionHealthWebviewProvider';

export async function activate(context: vscode.ExtensionContext) {
  // ... existing activation code ...

  // Initialize status bar
  const statusBarController = new StatusBarController(
    context,
    riskScoreService,
    snapshotService,
    recoveryService,
    phaseDetector,
  );
  context.subscriptions.push(statusBarController);

  // Register webview provider
  const webviewProvider = new SessionHealthWebviewProvider(
    context.extensionUri,
    {
      riskScoreService,
      snapshotService,
      recoveryService,
      phaseDetector,
    }
  );

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'snapback.sessionHealth',
      webviewProvider
    )
  );

  // Command to open dashboard (triggered by status bar click)
  context.subscriptions.push(
    vscode.commands.registerCommand('snapback.openDashboard', (args?: { focus?: string }) => {
      vscode.commands.executeCommand('snapback.sessionHealth.focus');
      if (args?.focus === 'commit-recommendation') {
        webviewProvider.showCriticalBanner();
      }
    })
  );
}
```

---

## Summary

**Status Bar State Machine**:
- 8 distinct states with clear visual hierarchy
- Smooth transitions with auto-revert for transient states
- Ambient pulse animation for risk awareness (0.35-0.55 band)
- Full integration with risk score, snapshot, and recovery services

**Session Health Dashboard**:
- Modular React component architecture
- VS Code theme-aware styling
- Real-time state updates via message passing
- Critical banner with smart snooze options
- Activity feed showing protection events
- Action bar for test restore, commit, and history

Want me to continue with the Trust Metrics API spec for extension ↔ console synchronization, or dive deeper into any of these components?
