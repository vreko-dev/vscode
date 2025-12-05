# SnapBack Research Summary - Library Integration & Architecture

**Date**: December 4, 2025
**Focus**: VS Code Extension API patterns, library integration, and architectural alignment
**Status**: Complete - Ready for Phase 21 implementation

---

## Research Conducted

### 1. VS Code Extension Lifecycle (Context7 API Docs)

**Key Findings:**
- Extensions activate on specific `activationEvents` (not on startup)
- Lazy activation improves VS Code startup time
- Must implement `activate()` and `deactivate()` functions
- `deactivate()` must return Promise if async

**Recommended Pattern for SnapBack:**
```
activationEvents: [
  "onCommand:snapback.createSnapshot",      // User command
  "onCommand:snapback.showDashboard",       // User command
  "onView:snapback-snapshots",              // Tree view
  "onStartupFinished"                       // Fallback
]
```

**Benefit**: Extension only loads when user explicitly uses SnapBack

---

### 2. State Management Tiers (Context7 State Management)

| Tier | Scope | Persistence | Use Case | Sync |
|------|-------|-------------|----------|------|
| **globalState** | All workspaces | Survives reload | User preferences, statistics | ✅ Yes (cross-machine) |
| **workspaceState** | Per-folder | Survives reload | Folder-specific snapshots | ❌ No |
| **secrets** | Machine-local | Encrypted | API keys, tokens | ❌ No (security) |
| **WorkspaceConfig** | Per-folder | Settings file | Settings schema | ✅ Yes (in .vscode) |

**SnapBack Mapping:**
- `riskThreshold`, `notifyThreshold` → `globalState` (user preference)
- Snapshot metadata → `workspaceState` (per-folder)
- API keys → `secrets` (encrypted, not synced)
- Plugin settings → `WorkspaceConfig` (VS Code native UI)

---

### 3. Event Architecture (Context7 EventEmitter)

**Pattern: Subscription-based architecture**

```
File Change (user keystroke)
  ↓
onDidChangeTextDocument (VS Code event)
  ↓
SaveContextBuilder (extract metadata)
  ↓
AutoDecisionEngine.evaluate() → fire onDecision event
  ↓
Subscribers: NotificationManager, Dashboard, StatusBar
  ↓
UI updates (non-blocking)
```

**Key Insight**: All updates flow through `EventEmitter.fire()` → subscribers don't block

**SnapBack Implementation**:
```typescript
// In AutoDecisionEngine
private onDecisionEmitter = new vscode.EventEmitter<Decision>();
readonly onDecision = this.onDecisionEmitter.event;

evaluate(context): Decision {
  // ... compute decision
  this.onDecisionEmitter.fire(decision);  // Non-blocking
  return decision;
}
```

---

### 4. WebView Communication Pattern (Context7 WebView)

**Bi-directional messaging:**

```typescript
// Extension → WebView (push updates)
panel.webview.postMessage({
  command: 'updateStats',
  data: { riskScore: 62, threats: [...] }
});

// WebView → Extension (user actions)
vscode.postMessage({
  command: 'restoreSnapshot',
  snapshotId: 'snap-123'
});
```

**Critical Details:**
- CSP (Content Security Policy) required for security
- `retainContextWhenHidden: true` for state persistence
- WebView can use `vscode.getState()` / `vscode.setState()` for local state

---

### 5. Command Registration (Context7 Commands)

**Pattern: Centralized command registry**

```typescript
// User-facing commands (Command Palette)
context.subscriptions.push(
  vscode.commands.registerCommand('snapback.createSnapshot', handler)
);

// Internal commands (WebView/StatusBar)
context.subscriptions.push(
  vscode.commands.registerCommand('snapback.viewThreats', handler)
);
```

**SnapBack Commands:**
- `snapback.createSnapshot` - Manual snapshot
- `snapback.showDashboard` - Open dashboard
- `snapback.restoreSnapshot` - Restore from list
- `snapback.viewThreats` - View threat details
- `snapback.openSettings` - Settings

---

### 6. File Watcher Pattern (Context7 FileWatcher)

**Efficient watching:**

```typescript
// Watch specific file types only
const watcher = vscode.workspace.createFileSystemWatcher(
  '**/*.{ts,tsx,js,jsx}',  // Glob pattern
  false,  // includeCreateEvents
  false,  // includeChangeEvents
  true    // ignoreDeleteEvents (we don't care)
);

watcher.onDidChange(uri => {
  // Handle change
});

context.subscriptions.push(watcher);  // Auto-cleanup
```

**SnapBack Pattern**: Debounce rapid changes (300ms batching)

---

### 7. Configuration Management (Context7 Configuration)

**Two-layer approach:**

```typescript
// Layer 1: VS Code settings (user-facing)
const config = vscode.workspace.getConfiguration('snapback');
const threshold = config.get('autoDecision.riskThreshold', 60);

// Layer 2: Listen for changes
vscode.workspace.onDidChangeConfiguration(e => {
  if (e.affectsConfiguration('snapback.autoDecision')) {
    // Update engine reactively
    engine.updateConfig(loadNewConfig());
  }
});
```

**SnapBack Integration:**
- Settings defined in `package.json` "configuration"
- `SettingsLoader` reads and validates
- `AutoDecisionIntegration` wires changes to engine
- Settings validated: `notifyThreshold ≤ riskThreshold`

---

### 8. StatusBar Integration (Context7 StatusBar)

**Lightweight real-time indicators:**

```typescript
const item = vscode.window.createStatusBarItem(
  vscode.StatusBarAlignment.Right,
  100  // Priority
);

item.text = '$(shield) Protected';
item.tooltip = 'Risk: 60%';
item.command = 'snapback.showDashboard';  // Click action
item.show();

// Update reactively
engine.onDecision((decision) => {
  item.text = decision.threats.length > 0 ? '$(error) Alert' : '$(shield) Safe';
});
```

**SnapBack Items:**
- Main status (shield/warning icon)
- Threat counter
- Risk score
- Session status

---

## Library Integration Summary

### How All Pieces Connect

```
┌─────────────────────────────────────────────────────────────┐
│                    VS Code Extension API                    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Activation Events                 Subscriptions             │
│  (onCommand, onView)          (context.subscriptions)        │
│         ↓                                ↓                   │
│  ┌────────────────────────────────────────────┐             │
│  │   Extension Activation (extension.ts)      │             │
│  │   - Initialize managers                    │             │
│  │   - Register commands                      │             │
│  │   - Start watchers                         │             │
│  │   - Create dashboard/statusbar             │             │
│  └────────────────────────────────────────────┘             │
│         ↓                                                    │
│  ┌────────────────────────────────────────────┐             │
│  │   Event Watchers (FileSystemWatcher)       │             │
│  │   - onDidChangeTextDocument                │             │
│  │   - onDidSaveTextDocument                  │             │
│  │   - onDidChangeConfiguration               │             │
│  └────────────────────────────────────────────┘             │
│         ↓                                                    │
│  ┌────────────────────────────────────────────┐             │
│  │   AutoDecisionIntegration (core logic)      │             │
│  │   - Debounce changes (300ms)                │             │
│  │   - Build SaveContext (metadata)            │             │
│  │   - Evaluate risk via engine                │             │
│  │   - Fire onDecision EventEmitter            │             │
│  └────────────────────────────────────────────┘             │
│         ↓                                                    │
│  ┌─────────────────┬──────────────────┬────────────────┐   │
│  │                 │                  │                │   │
│  ↓                 ↓                  ↓                ↓   │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │Notifications│ Dashboard │ StatusBar  │  │Snapshots │   │
│  │(Phase 21) │ (Phase 20) │(Phase 20) │  │(Phase 16)│   │
│  │show*Msg  │  WebView   │ Items     │  │ Storage  │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                              │
│  ┌────────────────────────────────────────────┐             │
│  │   State Management Layers                  │             │
│  │   ├─ globalState (preferences, sync)       │             │
│  │   ├─ workspaceState (folder snapshots)     │             │
│  │   ├─ secrets (encrypted keys)              │             │
│  │   └─ WorkspaceConfig (settings)            │             │
│  └────────────────────────────────────────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Benefits

### 1. **Separation of Concerns**
- AutoDecisionIntegration (orchestration)
- AutoDecisionEngine (logic)
- SnapshotManager (data)
- NotificationManager (UI alerts)
- Dashboard (visualizations)
- StatusBar (quick status)

### 2. **Non-Blocking Updates**
- Events fire asynchronously
- UI updates don't block decision logic
- Multiple subscribers don't interfere

### 3. **Reactive Settings**
- User changes settings
- `onDidChangeConfiguration` fires
- Engine updates in real-time
- No reload needed

### 4. **Persistent State**
- `globalState`: Survives reloads AND syncs across machines
- `workspaceState`: Survives reloads per-folder
- `secrets`: Encrypted, not synced
- Auto-saved, no manual persistence needed

### 5. **Lazy Activation**
- Extension loads only when needed
- Saves VS Code startup time
- Resources allocated on-demand

---

## Alignment with Rules

### always-typescript-patterns.md ✅

**Discriminated Unions**:
```typescript
type Decision =
  | { shouldCreateSnapshot: true; snapshot: Snapshot }
  | { shouldNotify: true; notification: Notification }
  | { shouldRestore: true; restoreId: string }
  | { noAction: true };
```

**Type Guards**:
```typescript
function isDecisionToSnapshot(d: Decision): d is { shouldCreateSnapshot: true } {
  return 'shouldCreateSnapshot' in d && d.shouldCreateSnapshot;
}
```

### always-result-type-pattern.md ✅

**Result<T, E> for recoverable errors:**
```typescript
async function createSnapshot(): Promise<Result<Snapshot, SnapshotError>> {
  // Implementation returns Err() for user-recoverable errors
}
```

### always-monorepo-imports.md ✅

**Package imports:**
```typescript
import { logger } from "@snapback/infrastructure";
import type { Snapshot } from "@snapback/contracts";
```

---

## Ready for Phase 21

All research complete. SnapBack architecture now fully documented with:

1. ✅ **Extension lifecycle** - Lazy activation patterns
2. ✅ **State management** - Multi-tier persistence
3. ✅ **Event architecture** - Non-blocking updates
4. ✅ **WebView communication** - Bi-directional messaging
5. ✅ **Command registration** - User-facing & internal
6. ✅ **File watching** - Debounced, efficient
7. ✅ **Configuration** - Reactive settings flow
8. ✅ **StatusBar** - Real-time indicators
9. ✅ **Integration guide** - Complete reference
10. ✅ **Implementation roadmap** - Phases 21-24 detailed

**Files Created:**
- `LIBRARY_INTEGRATION_GUIDE.md` (716 lines) - Comprehensive reference
- `IMPLEMENTATION_ROADMAP_PHASES_21-24.md` (611 lines) - Detailed roadmap
- `RESEARCH_SUMMARY.md` (this file) - Executive summary

**Phase 21 Ready**: Notifications & Threat Alerts (30+ tests, 200-250 LOC implementation)
