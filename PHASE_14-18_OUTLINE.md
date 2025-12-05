# Phase 14-18: AutoDecisionEngine Integration Outline

## Executive Summary
Integrate 308 passing domain tests into VS Code extension lifecycle. Wire file watchers → SaveContext → AutoDecisionEngine → ProtectionDecision → Action (snapshot/notification).

**Parallel Execution Path:** AutoDecisionIntegration runs alongside existing SaveHandler (no replacement).

---

## Context7 Research Results

### ✅ Completed Investigations

| Need | Library | Snippets | Reputation | Notes |
|------|---------|----------|-----------|-------|
| VS Code Extension API | `/websites/code_visualstudio_api` | 629 | High | onDidChangeTextDocument, FileSystemWatcher patterns verified |
| Design Patterns | Codebase has examples | - | High | SaveHandler, ConfigurationManager, PreSnapshotService patterns extracted |
| Debounce Patterns | Decision log + codebase | - | High | 300ms debounce confirmed for file events |

**Conclusion:** No additional Context7 lookups needed. Patterns are clear.

---

## Phase Architecture

```
┌─────────────────────────────────────────────────────────────┐
│ PHASE 14: Extension Entry Point Integration                 │
│ File watchers → SaveContextBuilder → AutoDecisionEngine    │
├─────────────────────────────────────────────────────────────┤
│ PHASE 15: File Watchers & Debounce                         │
│ onDidChangeTextDocument + onDidSaveTextDocument            │
├─────────────────────────────────────────────────────────────┤
│ PHASE 16: Storage & Persistence                            │
│ Snapshot storage, recovery mechanisms, expiration          │
├─────────────────────────────────────────────────────────────┤
│ PHASE 17: Recovery UI                                      │
│ Snapshot list panel, restore workflow, diff viewer         │
├─────────────────────────────────────────────────────────────┤
│ PHASE 18: Settings & Config UI                             │
│ User preferences, AI toggle, rate limit config             │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 14: Extension Entry Point (2-3 hours)

### Goal
Wire AutoDecisionEngine into activation lifecycle. Create integration layer that connects VS Code events to domain logic.

### Current State
- ✅ AutoDecisionEngine, SaveContextBuilder, NotificationAdapter, SnapshotOrchestrator all exist
- ❌ Not instantiated in extension.ts
- ✅ SaveHandler exists (file-by-file protection)
- ❌ No session-level orchestration

### Deliverables

#### 14.1: Create AutoDecisionIntegration.ts
**File:** `apps/vscode/src/integration/AutoDecisionIntegration.ts`

Structure:
```typescript
export class AutoDecisionIntegration {
  private engine: AutoDecisionEngine;
  private builder: SaveContextBuilder;
  private adapter: NotificationAdapter;
  private orchestrator: SnapshotOrchestrator;

  constructor(
    snapshotManager: SnapshotManager,
    notificationManager: NotificationManager,
    config?: AutoDecisionConfig
  )

  activate(): void  // Start listening to file events
  deactivate(): void  // Stop & cleanup

  private onFileChange(event: FileChangeEvent): void  // Queue
  private processBatch(): Promise<void>  // Build → Engine → Adapt → Execute
}
```

Key Methods:
- `activate()`: Register vscode.workspace.onDidChangeTextDocument listener
- `onFileChange(event)`: Buffer events, debounce with 300ms timer
- `processBatch()`:
  1. Collect buffered events into SaveContext
  2. Run AutoDecisionEngine.makeDecision()
  3. Adapt ProtectionDecision via NotificationAdapter
  4. Execute: snapshot creation + user notification
- `deactivate()`: Cancel pending timers, dispose listeners

**Integration Points:**
- Takes SnapshotManager (to create snapshots)
- Takes NotificationManager (to show user messages)
- Uses SaveContextBuilder (to aggregate file events)
- Uses AutoDecisionEngine (domain decision logic)

#### 14.2: Update extension.ts activation
**File:** `apps/vscode/src/extension.ts`

Changes (after Phase 5 registration, before return):
```typescript
// Line ~320 (after phase5Registration)

// Instantiate AutoDecisionIntegration
const autoDecisionIntegration = new AutoDecisionIntegration(
  phase3Result.snapshotManager,
  phase3Result.notificationManager,
  {
    riskThreshold: config.get<number>("snapback.autoDecision.riskThreshold", 60),
    notifyThreshold: config.get<number>("snapback.autoDecision.notifyThreshold", 40),
    minFilesForBurst: config.get<number>("snapback.autoDecision.minFilesForBurst", 3),
    maxSnapshotsPerMinute: config.get<number>("snapback.autoDecision.maxSnapshotsPerMinute", 4),
  }
);

autoDecisionIntegration.activate();
context.subscriptions.push({
  dispose: () => autoDecisionIntegration.deactivate()
});
```

#### 14.3: Test AutoDecisionIntegration
**File:** `apps/vscode/test/unit/integration/autoDecisionIntegration.test.ts`

Tests (TDD: write first):
1. ✅ activate() registers file change listener
2. ✅ onFileChange() buffers events with debounce
3. ✅ processBatch() builds SaveContext from buffered events
4. ✅ processBatch() runs AutoDecisionEngine
5. ✅ processBatch() adapts decision to notification
6. ✅ processBatch() creates snapshot on ProtectionDecision.createSnapshot
7. ✅ processBatch() shows notification on ProtectionDecision.showNotification
8. ✅ deactivate() cancels pending timers

**Coverage Target:** 100% (40+ tests)

### Risk Analysis
- **Risk:** SaveContextBuilder needs file content from VS Code editor
  - **Mitigation:** Use vscode.workspace.openTextDocument() to read content
- **Risk:** Multiple concurrent batches if debounce timer expires during processing
  - **Mitigation:** Set `isProcessing` flag, queue next batch

### Decision Points
1. **Debounce Time:** 300ms (confirmed from decision log)
2. **Auto-snapshot:** Yes, on high-risk decision (no user confirmation)
3. **Rate Limiting:** Use RateLimiter from domain (4 snapshots/minute)

---

## Phase 15: File Watchers & Events (1-2 hours)

### Goal
Connect VS Code file change events to SaveContextBuilder. Handle both text editor saves and file system changes.

### Deliverables

#### 15.1: Implement onDidChangeTextDocument handler
**File:** `apps/vscode/src/integration/AutoDecisionIntegration.ts` (extend 14.1)

Logic:
```typescript
private registerTextDocumentListener(): void {
  this.disposables.push(
    vscode.workspace.onDidChangeTextDocument((event) => {
      const { document } = event;

      // Skip if file is not in workspace
      if (!vscode.workspace.getWorkspaceFolder(document.uri)) return;

      // Skip binary files, node_modules, etc.
      if (this.shouldIgnoreFile(document.uri.fsPath)) return;

      this.onFileChange({
        type: 'change',
        filePath: document.uri.fsPath,
        content: document.getText(),
        timestamp: Date.now()
      });
    })
  );
}

private shouldIgnoreFile(filePath: string): boolean {
  const ignorePatterns = [
    'node_modules/**',
    'dist/**',
    '.git/**',
    '*.lock',
    '*.log'
  ];
  // Use minimatch or similar
  return ignorePatterns.some(pattern => filePath.includes(pattern));
}
```

#### 15.2: Implement onDidSaveTextDocument handler
**File:** `apps/vscode/src/integration/AutoDecisionIntegration.ts`

Logic:
```typescript
private registerSaveListener(): void {
  this.disposables.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      // Trigger save analysis
      this.onFileChange({
        type: 'save',
        filePath: document.uri.fsPath,
        content: document.getText(),
        timestamp: Date.now()
      });
    })
  );
}
```

#### 15.3: Extract file metadata for SaveContext
**File:** Extend SaveContextBuilder

Add method:
```typescript
async extractFileInfo(filePath: string, content: string): Promise<FileInfo> {
  return {
    path: vscode.workspace.asRelativePath(filePath),
    extension: path.extname(filePath),
    sizeBytes: Buffer.byteLength(content, 'utf-8'),
    isNew: !(await fileExists(filePath)), // Use extension storage
    isBinary: this.isBinary(content, path.extname(filePath)),
    nextHash: crypto.createHash('sha256').update(content).digest('hex'),
  };
}
```

#### 15.4: Test file watcher handlers
**File:** `apps/vscode/test/unit/integration/fileWatcherHandlers.test.ts`

Tests:
1. ✅ onDidChangeTextDocument fires for each keystroke
2. ✅ Debounce prevents excessive processing
3. ✅ onDidSaveTextDocument fires on save
4. ✅ Binary files are ignored
5. ✅ node_modules are ignored
6. ✅ File metadata extracted correctly

### Risk Analysis
- **Risk:** onDidChangeTextDocument fires on every keystroke (expensive)
  - **Mitigation:** Buffer + debounce (300ms)
- **Risk:** Content from unsaved documents may not match disk
  - **Mitigation:** Use document.getText() (editor content), not disk

---

## Phase 16: Storage & Persistence (2-3 hours)

### Goal
Persist snapshots, implement recovery mechanism, handle expiration.

### Deliverables

#### 16.1: Extend SnapshotOrchestrator for disk storage
**File:** Extend `apps/vscode/src/domain/snapshotOrchestrator.ts`

Add:
```typescript
async persistSnapshot(intent: SnapshotIntent): Promise<PersistedSnapshot> {
  // 1. Create snapshot object
  const snapshot = {
    id: intent.id,
    timestamp: Date.now(),
    files: intent.files,
    metadata: intent.metadata
  };

  // 2. Serialize to JSON
  // 3. Store in extension storage (context.globalState or SQLite)
  // 4. Return PersistedSnapshot
}

async listSnapshots(): Promise<PersistedSnapshot[]> {
  // Load all snapshots from storage
  // Filter by age (optional expiration)
}

async restoreSnapshot(id: string, targetFiles: Set<string>): Promise<void> {
  // 1. Load snapshot by ID
  // 2. Write files back to disk
  // 3. Emit SNAPSHOT_RESTORED event
}
```

#### 16.2: Choose storage backend (Decision Point)
Options:
1. **VS Code globalState** (Pros: simple, no extra deps)
2. **SQLite** (Pros: queryable, supports filtering)
3. **JSON files** (Pros: human-readable, git-friendly)

**Recommendation:** globalState for Phase 16 (simplest), upgrade to SQLite in Phase 19.

#### 16.3: Implement snapshot metadata indexing
Metadata to track:
- Snapshot ID
- Created timestamp
- File count
- Risk score
- AI detected: yes/no
- Recoverable: yes/no (inverse of readonly)

#### 16.4: Test persistence
**File:** `apps/vscode/test/unit/domain/snapshotPersistence.test.ts`

Tests:
1. ✅ persistSnapshot() creates snapshot file
2. ✅ listSnapshots() returns all stored snapshots
3. ✅ restoreSnapshot() writes files back to disk
4. ✅ Snapshots survive extension reload
5. ✅ Old snapshots can be cleaned up (10+ day rule)

---

## Phase 17: Recovery UI (2-3 hours)

### Goal
Show user snapshot list, enable restore workflow with file diffing.

### Deliverables

#### 17.1: Create SnapshotListProvider (TreeView)
**File:** `apps/vscode/src/providers/SnapshotListProvider.ts`

Extend existing SnapshotNavigatorProvider or create new:
```typescript
export class SnapshotListProvider implements vscode.TreeDataProvider<SnapshotItem> {
  private snapshots: PersistedSnapshot[] = [];

  async getChildren(element?: SnapshotItem): Promise<SnapshotItem[]> {
    if (!element) {
      // Root: list all snapshots (newest first)
      this.snapshots = await this.orchestrator.listSnapshots();
      return this.snapshots.map(s => new SnapshotItem(s));
    }

    // Expand snapshot to show files
    return element.snapshot.files.map(f => new SnapshotFileItem(f));
  }

  getTreeItem(element: SnapshotItem): vscode.TreeItem {
    return element;
  }
}
```

#### 17.2: Implement restore command with diff
**File:** `apps/vscode/src/commands/snapshotCommands.ts` (extend)

Commands:
```typescript
// Show file diff before restore
registerCommand('snapback.snapshot.diff', async (snapshotId, filePath) => {
  const snapshot = await orchestrator.getSnapshot(snapshotId);
  const content = snapshot.files.get(filePath);

  // Show diff with current file
  const title = `Snapshot ${snapshotId} vs Current`;
  vscode.commands.executeCommand('vscode.diff',
    snapshotDocumentProvider.getUri(snapshotId, filePath),
    vscode.Uri.file(filePath),
    title
  );
});

// Restore snapshot
registerCommand('snapback.snapshot.restore', async (snapshotId) => {
  const result = await vscode.window.showWarningMessage(
    `Restore ${snapshotId}?`,
    'Restore', 'Cancel'
  );

  if (result === 'Restore') {
    await orchestrator.restoreSnapshot(snapshotId);
    vscode.window.showInformationMessage('Snapshot restored');
  }
});
```

#### 17.3: Test recovery workflow
**File:** `apps/vscode/test/unit/commands/snapshotRestore.test.ts`

Tests:
1. ✅ listSnapshots() shows all snapshots in tree
2. ✅ diff command opens side-by-side comparison
3. ✅ restore command confirms with user
4. ✅ restore command writes files back
5. ✅ Tree refreshes after restore

---

## Phase 18: Settings & Config UI (1-2 hours)

### Goal
Allow users to configure AutoDecisionEngine thresholds, enable/disable AI detection, set rate limits.

### Deliverables

#### 18.1: Define VS Code settings schema
**File:** `apps/vscode/package.json`

Add to `contributes.configuration`:
```json
"snapback.autoDecision.enabled": {
  "type": "boolean",
  "default": true,
  "description": "Enable AutoDecisionEngine for session-level protection"
},
"snapback.autoDecision.aiDetection.enabled": {
  "type": "boolean",
  "default": true,
  "description": "Detect AI-assisted edits (Copilot, Cursor, etc.)"
},
"snapback.autoDecision.riskThreshold": {
  "type": "number",
  "minimum": 0,
  "maximum": 100,
  "default": 60,
  "description": "Risk score (0-100) to trigger snapshot creation"
},
"snapback.autoDecision.notifyThreshold": {
  "type": "number",
  "minimum": 0,
  "maximum": 100,
  "default": 40,
  "description": "Risk score (0-100) to show notification without snapshot"
},
"snapback.autoDecision.minFilesForBurst": {
  "type": "number",
  "minimum": 1,
  "maximum": 20,
  "default": 3,
  "description": "Number of files to trigger burst detection"
},
"snapback.autoDecision.maxSnapshotsPerMinute": {
  "type": "number",
  "minimum": 1,
  "maximum": 10,
  "default": 4,
  "description": "Rate limit: max snapshots per minute"
}
```

#### 18.2: Create Settings Webview (optional UI)
**File:** `apps/vscode/src/ui/SettingsPanel.ts`

Simple approach: Use VS Code's built-in settings UI (contributes.configuration).
Advanced approach: Create Webview for interactive UI.

#### 18.3: Test settings
**File:** `apps/vscode/test/unit/settings/autoDecisionSettings.test.ts`

Tests:
1. ✅ Settings read from VS Code config
2. ✅ AutoDecisionEngine respects riskThreshold
3. ✅ Disabling AI detection skips AI signals
4. ✅ Rate limiter respects maxSnapshotsPerMinute

---

## Implementation Order & Dependencies

```
PHASE 14 (Foundation)
├─ 14.1 AutoDecisionIntegration.ts (CREATE)
├─ 14.2 Update extension.ts (MODIFY)
└─ 14.3 Tests for 14.1-14.2

PHASE 15 (File Events)
├─ 15.1 onDidChangeTextDocument handler (MODIFY 14.1)
├─ 15.2 onDidSaveTextDocument handler (MODIFY 14.1)
├─ 15.3 File metadata extraction (MODIFY SaveContextBuilder)
└─ 15.4 Tests

PHASE 16 (Persistence) ← Depends on Phase 15
├─ 16.1 SnapshotOrchestrator persistence (MODIFY)
├─ 16.2 Storage backend decision
├─ 16.3 Metadata indexing
└─ 16.4 Tests

PHASE 17 (UI) ← Depends on Phase 16
├─ 17.1 SnapshotListProvider (CREATE)
├─ 17.2 Restore commands (MODIFY snapshotCommands.ts)
└─ 17.3 Tests

PHASE 18 (Settings) ← Independent
├─ 18.1 Update package.json (MODIFY)
├─ 18.2 Settings webview (optional CREATE)
└─ 18.3 Tests
```

---

## File Changes Summary

| Phase | File | Action | Lines | Notes |
|-------|------|--------|-------|-------|
| 14 | AutoDecisionIntegration.ts | CREATE | 250-300 | New integration layer |
| 14 | extension.ts | MODIFY | +30 lines | Instantiate, activate, cleanup |
| 14 | **/test/** | CREATE | 200+ | Tests for 14.1-14.2 |
| 15 | AutoDecisionIntegration.ts | MODIFY | +100 lines | Add event handlers |
| 15 | SaveContextBuilder.ts | MODIFY | +50 lines | File info extraction |
| 15 | **/test/** | CREATE | 150+ | File watcher tests |
| 16 | snapshotOrchestrator.ts | MODIFY | +100 lines | Persistence methods |
| 16 | **/test/** | CREATE | 150+ | Persistence tests |
| 17 | SnapshotListProvider.ts | CREATE | 150-200 | Tree data provider |
| 17 | snapshotCommands.ts | MODIFY | +100 lines | Restore workflow |
| 17 | **/test/** | CREATE | 150+ | Recovery UI tests |
| 18 | package.json | MODIFY | +40 lines | Configuration schema |
| 18 | **/test/** | CREATE | 100+ | Settings tests |

---

## Success Metrics

| Phase | Metric | Target | Validation |
|-------|--------|--------|------------|
| 14 | AutoDecisionIntegration tests | 40+ passing | `npm test` reports 40+ |
| 15 | File event handlers | 100% integration | Debounce verified |
| 16 | Snapshot persistence | 100% recovery | Snapshots survive reload |
| 17 | UI functionality | All commands work | Manual testing |
| 18 | Settings validation | All settings read | Config respected in engine |
| End | Total test pass rate | 308 + 500+ new | `npm test` all passing |

---

## Risk Assessment & Mitigations

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| SaveContext building fails (missing file info) | HIGH | MEDIUM | Use vscode.workspace.openTextDocument() for content |
| Debounce timer overlap causes race conditions | HIGH | LOW | Set isProcessing flag, queue next batch |
| Snapshots not persisting across reloads | HIGH | LOW | Use globalState (guaranteed persistence) |
| Rate limiter allows >N snapshots | MEDIUM | LOW | RateLimiter domain class already tested |
| Settings not read properly | MEDIUM | MEDIUM | Test vscode.workspace.getConfiguration() |

---

## Next Steps (After Phase 18)

1. **Phase 19:** Performance optimization (snapshot compression, lazy loading)
2. **Phase 20:** Telemetry integration (track decisions, snapshots)
3. **Phase 21:** Team policy enforcement (.snapbackrc integration)
4. **Phase 22:** Recovery analytics (which snapshots restored most?)

---

## Notes

- **TDD Throughout:** Write tests before implementation
- **Parallel Path:** AutoDecisionIntegration runs alongside SaveHandler (no conflicts)
- **Incremental:** Each phase is independently verifiable (can pause/resume)
- **User Impact:** No breaking changes to existing functionality during implementation
