# SnapBack VS Code Extension - Complete Architecture Overview

**Comprehensive system design for phases 14-24**

---

## System Layers

```
┌──────────────────────────────────────────────────────────────┐
│                      USER INTERFACE LAYER                     │
│  Dashboard (WebView) │ StatusBar │ Notifications │ Commands  │
├──────────────────────────────────────────────────────────────┤
│                    ORCHESTRATION LAYER                        │
│              AutoDecisionIntegration                          │
│         (wires all components, manages lifecycle)            │
├──────────────────────────────────────────────────────────────┤
│                     DECISION ENGINE LAYER                     │
│            AutoDecisionEngine (risk evaluation)              │
│    ├─ Risk scoring (file size, complexity, patterns)        │
│    ├─ Burst detection (rapid saves)                         │
│    ├─ Critical file identification (key files)              │
│    └─ Decision logic (create? notify? restore?)             │
├──────────────────────────────────────────────────────────────┤
│                    BUSINESS LOGIC LAYER                       │
│  ├─ SnapshotManager (CRUD snapshots)                        │
│  ├─ SnapshotOrchestrator (persistence + indexing)           │
│  ├─ SaveContextBuilder (metadata extraction)                │
│  ├─ NotificationManager (user alerts) [Phase 21]            │
│  ├─ TeamCollaborationManager (sharing) [Phase 22]           │
│  └─ TelemetryCollector (analytics) [Phase 23]               │
├──────────────────────────────────────────────────────────────┤
│                    DATA & PERSISTENCE LAYER                   │
│  ├─ GlobalStateStorageAdapter (cross-workspace)             │
│  ├─ WorkspaceStateStorageAdapter (per-folder)               │
│  ├─ SettingsLoader (reactive config)                        │
│  └─ SecretStorage (encrypted keys)                          │
├──────────────────────────────────────────────────────────────┤
│                    EVENT & STATE MANAGEMENT                   │
│  ├─ EventEmitter<Decision>                                  │
│  ├─ VS Code EventEmitter (onDidChangeTextDocument, etc.)    │
│  ├─ ConfigurationChangeEvent                                │
│  └─ FileSystemWatcher                                       │
├──────────────────────────────────────────────────────────────┤
│                      INFRASTRUCTURE LAYER                      │
│  ├─ Logger (@snapback/infrastructure)                       │
│  ├─ ErrorHandler (recovery strategies)                      │
│  ├─ PerformanceMonitor (metrics collection)                 │
│  └─ TypeSafeContracts (@snapback/contracts)                 │
└──────────────────────────────────────────────────────────────┘
```

---

## Component Responsibilities

### 1. AutoDecisionIntegration (Orchestration)
**File**: `src/integration/AutoDecisionIntegration.ts`
**Responsibility**: Wire all components, manage lifecycle
**Key Methods**:
- `activate()` - Start watchers, listen to events
- `onFileChange()` - Entry point for file change events
- `processBatch()` - Batch process changes (debounced)
- `deactivate()` - Cleanup and disposal

**Connections**:
```
↓ Receives: File changes (from watchers)
↓ Sends to: AutoDecisionEngine.evaluate()
↓ Listens to: engine.onDecision (EventEmitter)
↓ Triggers: SnapshotManager, NotificationManager, Dashboard
↓ Managed by: context.subscriptions (auto-cleanup)
```

---

### 2. AutoDecisionEngine (Decision Logic)
**File**: `src/domain/engine.ts`
**Responsibility**: Evaluate risk and make decisions
**Key Methods**:
- `evaluate(context: SaveContext): Decision` - Compute risk score
- `updateConfig(config: AutoDecisionConfig)` - Reactive settings
- `getConfig()` - Current configuration
- `onDecision` EventEmitter - Notify subscribers

**Decision Types**:
```typescript
type Decision =
  | { action: 'snapshot'; reason: string; snapshot: SnapshotData }
  | { action: 'notify'; level: 'info' | 'warning' | 'error'; message: string }
  | { action: 'restore'; snapshotId: string; reason: string }
  | { action: 'none'; reason: string };
```

---

### 3. SnapshotManager (CRUD Operations)
**File**: `src/managers/SnapshotManager.ts`
**Responsibility**: Create, read, restore snapshots
**Key Methods**:
- `create(data: SnapshotData): Promise<Snapshot>` - New snapshot
- `getAll(): Promise<Snapshot[]>` - List all snapshots
- `restore(id: string): Promise<Result<void, SnapshotError>>` - Restore
- `delete(id: string): Promise<void>` - Delete snapshot

**Integration**: Calls `SnapshotOrchestrator` for persistence

---

### 4. SnapshotOrchestrator (Persistence & Indexing)
**File**: `src/storage/orchestrator.ts`
**Responsibility**: Store snapshots, maintain indices
**Features**:
- Persist to `context.globalState` or `context.workspaceState`
- Metadata indexing (fast lookups)
- Storage limit enforcement
- Expiration policies
- File deduplication

**Storage Structure**:
```json
{
  "snapshots": [
    {
      "id": "snap-123",
      "filePath": "/path/to/file.ts",
      "content": "file contents",
      "timestamp": 1701705600000,
      "metadata": { "risk": 62, "size": 2048 }
    }
  ],
  "index": {
    "byPath": { "/path/to/file.ts": ["snap-123"] },
    "byTimestamp": { "1701705600000": "snap-123" }
  }
}
```

---

### 5. SaveContextBuilder (Metadata Extraction)
**File**: `src/context/SaveContextBuilder.ts`
**Responsibility**: Extract file & change metadata
**Extracted Data**:
- File path, size, type
- Change magnitude (lines added/removed)
- Complexity metrics
- Pattern matching (critical files)
- Time context (late night? weekend?)

**Used by**: AutoDecisionEngine for risk scoring

---

### 6. SettingsLoader (Configuration Management)
**File**: `src/config/settingsLoader.ts`
**Responsibility**: Load and react to settings changes
**Features**:
- Load settings from `workspace.getConfiguration()`
- Validate constraints (threshold relationships)
- Emit `onSettingsChange` events
- Clamp values to valid ranges

**Lifecycle**:
```
User changes setting in VS Code
  ↓
onDidChangeConfiguration fires
  ↓
SettingsLoader validates & loads new config
  ↓
Emits onSettingsChange
  ↓
AutoDecisionIntegration listener
  ↓
engine.updateConfig()
  ↓
Next decision uses new settings
```

---

### 7. NotificationManager (Phase 21)
**File**: `src/notifications/notificationManager.ts`
**Responsibility**: Display alerts to users
**Features**:
- Throttle duplicate notifications (max 1 per 30s)
- Multiple levels (info, warning, error)
- Actionable notifications (with callbacks)
- History tracking
- Integration with engine.onDecision

**Message Types**:
- `info`: Recovery completed, snapshot restored
- `warning`: Risk threshold breached, watch activated
- `error`: Critical threat detected, immediate action needed

---

### 8. TeamCollaborationManager (Phase 22)
**File**: `src/collaboration/teamSharing.ts`
**Responsibility**: Share policies and audit logs
**Features**:
- Export/import protection policies
- Team workspace support
- Audit trail logging
- Permission management
- Policy versioning

**Audit Events**:
```typescript
{
  timestamp: number;
  user: string;
  action: 'policy.update' | 'snapshot.create' | 'restore.execute';
  context: { filePath?: string; riskScore?: number };
}
```

---

### 9. TelemetryCollector (Phase 23)
**File**: `src/analytics/telemetryCollector.ts`
**Responsibility**: Collect anonymized metrics
**Features**:
- Event tracking (snapshot creation, risk changes)
- Aggregation (daily stats, weekly trends)
- Privacy protection (anonymization)
- Insights generation (recommendations)
- Opt-out support

**Events Tracked** (anonymized):
- `snapshot.created` - Count and timing
- `risk.changed` - Score transitions
- `restore.executed` - Recovery success
- `notification.shown` - Alert engagement

---

### 10. ErrorHandler & PerformanceMonitor (Phase 24)
**File**: `src/hardening/errorHandler.ts`, `src/hardening/performance.ts`
**Responsibility**: Resilience and optimization
**Features**:
- Graceful error recovery
- Performance benchmarking
- Slow operation detection
- Resource cleanup validation
- Security scanning

---

## Data Flow Examples

### Example 1: User Saves File

```
User saves file (Ctrl+S)
  ↓
vscode.workspace.onDidSaveTextDocument fires
  ↓
AutoDecisionIntegration.onDidSaveTextDocument()
  └─ Save context to batch queue
  └─ Debounce timer starts (300ms)
  ↓
[After 300ms with no more saves]
  ↓
AutoDecisionIntegration.processBatch()
  ├─ SaveContextBuilder.build() → metadata
  ├─ AutoDecisionEngine.evaluate() → compute risk
  ↓
Risk score: 62% (medium-high)
  ↓
engine.onDecision emits:
  ├─ SnapshotManager.create() → snapshot stored
  ├─ NotificationManager.show("Risk threshold breached")
  ├─ Dashboard.updateStats({ risk: 62 })
  └─ StatusBar.setText("$(warning) Alert")
  ↓
User sees:
  ├─ Notification toast ("Risk: 62%")
  ├─ StatusBar warning icon
  ├─ Dashboard updates in real-time
  └─ Snapshot saved to storage
```

---

### Example 2: User Changes Settings

```
User opens VS Code settings
  ↓
User changes snapback.autoDecision.riskThreshold from 60 to 75
  ↓
vscode.workspace.onDidChangeConfiguration fires
  ↓
SettingsLoader.onConfigurationChanged()
  ├─ Validate: new threshold (75) ≥ notifyThreshold (40) ✓
  ├─ Load: AutoDecisionSettings { riskThreshold: 75, ... }
  └─ Emit: onSettingsChange event
  ↓
AutoDecisionIntegration listener
  ↓
engine.updateConfig({ riskThreshold: 75 })
  ↓
Next file save evaluation uses threshold 75 (not 60)
  ↓
User sees: Updated behavior immediately (no reload)
```

---

### Example 3: User Opens Dashboard

```
User clicks StatusBar item or runs command
  ↓
snapback.showDashboard command handler
  ↓
DashboardProvider.openDashboard()
  ├─ Create WebviewPanel with CSP
  ├─ Set HTML content (with message listener)
  └─ Add to context.subscriptions (auto-cleanup)
  ↓
WebView renders and sends "getData" message
  ↓
Extension receives message
  ├─ Collect current stats (snapshots, risk, threats)
  ├─ Send postMessage({ command: 'updateStats', data: {...} })
  ↓
WebView receives and renders dashboard
  ↓
User sees:
  ├─ Total snapshots: 15
  ├─ Average risk score: 62%
  ├─ Protected files: 8
  └─ Quick actions (Create, Restore, Settings)
  ↓
[Real-time updates]
  ↓
AutoDecisionEngine.onDecision fires
  ├─ Extension collects new stats
  ├─ postMessage({ command: 'updateStats', ... })
  └─ WebView automatically updates (no polling)
```

---

## Test Coverage by Phase

| Phase | Component | Tests | Focus |
|-------|-----------|-------|-------|
| 14 | AutoDecisionIntegration | 40+ | Activation, events, batching |
| 15 | File Watchers | 20+ | Debouncing, filtering, metadata |
| 16 | Storage | 25+ | Persistence, limits, recovery |
| 17 | Recovery UI | 20+ | List, diff, restore workflow |
| 18 | Settings | 29+ | Loading, validation, reactivity |
| 19 | Integration | 23+ | Settings → Engine flow |
| 20 | Dashboard & StatusBar | 59+ | WebView, real-time updates |
| 21 | Notifications | 30+ | Display, throttle, actions |
| 22 | Collaboration | 25+ | Sharing, audit, permissions |
| 23 | Analytics | 28+ | Events, aggregation, insights |
| 24 | Hardening | 35+ | Errors, performance, security |

**Total**: 400+ tests (comprehensive TDD coverage)

---

## Key Architectural Decisions

### 1. Event-Driven Updates (non-blocking)
**Why**: UI responsiveness, parallel subscribers
**How**: EventEmitter.fire() → async subscribers

### 2. Debounced Batch Processing
**Why**: Prevent decision spam, improve efficiency
**How**: 300ms debounce window for file changes

### 3. Reactive Settings
**Why**: User changes apply immediately
**How**: onDidChangeConfiguration → engine.updateConfig()

### 4. Multi-tier State Management
**Why**: Different persistence needs
**How**: globalState (user prefs) vs workspaceState (snapshots) vs secrets (keys)

### 5. Lazy Component Activation
**Why**: Minimal startup overhead
**How**: onCommand/onView activation events

### 6. Typed Result Pattern
**Why**: Explicit error handling
**How**: Result<T, E> discriminated union

### 7. Subscription-based Lifecycle
**Why**: Automatic cleanup
**How**: context.subscriptions.push() → auto-dispose

---

## Integration Points

### With @snapback/core
- Import `SnapshotManager`, `SnapshotOrchestrator`
- Use shared `Snapshot` type contract

### With @snapback/infrastructure
- `logger.info()`, `logger.error()` for observability
- Structured logging with context

### With @snapback/contracts
- Type definitions (`Snapshot`, `SaveContext`, `Decision`)
- Ensures type safety across boundaries

### With VS Code API
- `vscode.workspace` (files, watchers, config)
- `vscode.window` (notifications, webviews)
- `vscode.commands` (user actions)
- `ExtensionContext` (state, secrets, subscriptions)

---

## Performance Targets

| Operation | Target | Current | Status |
|-----------|--------|---------|--------|
| Decision evaluation | < 100ms | - | Phase 24 benchmark |
| Snapshot creation | < 500ms | - | Phase 24 benchmark |
| Dashboard render | < 1s | - | Phase 20+ measure |
| File watcher | 10k+ files | - | Phase 24 scale test |
| Memory baseline | < 50MB | - | Phase 24 profile |

---

## Security Considerations

### 1. WebView CSP (Content Security Policy)
- Restrict inline scripts (use external)
- Limit resource origins
- Prevent command injection

### 2. State Validation
- Validate all user input from WebView
- Validate configuration values
- Validate file paths

### 3. Secret Storage
- Use `context.secrets` for API keys
- Never store in plaintext state
- Never log sensitive data

### 4. Permissions
- Respect file system permissions
- Validate workspace access
- Check folder-level settings scope

### 5. Error Messages
- Don't expose stack traces to users
- Sanitize file paths in messages
- Log full errors server-side

---

## Deployment Checklist

- [ ] All 400+ tests passing
- [ ] TypeScript strict mode enabled
- [ ] Security scan completed (secrets, XSS)
- [ ] Performance benchmarks met
- [ ] Documentation complete
- [ ] VS Code 1.70+ compatibility
- [ ] Extension size < 5MB
- [ ] No external dependencies (only @snapback/*)
- [ ] Error handling for all paths
- [ ] Graceful degradation (feature flags)

---

## Future Enhancements (Post-v1.0)

1. **AI-powered risk analysis** - ML models for threat detection
2. **IDE integration** - JetBrains, Sublime support
3. **Mobile companion** - View snapshots on phone
4. **Git integration** - Automatic snapshots on commits
5. **Custom rules** - User-defined risk patterns
6. **Slack notifications** - Team-level alerts
7. **Recovery suggestions** - AI recommends best snapshot
8. **Plugin marketplace** - Community extensions

---

## References

- [VS Code Extension API](https://code.visualstudio.com/api)
- `LIBRARY_INTEGRATION_GUIDE.md` - Detailed API usage
- `IMPLEMENTATION_ROADMAP_PHASES_21-24.md` - Final phases
- `RESEARCH_SUMMARY.md` - Research findings
