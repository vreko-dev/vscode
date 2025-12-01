# apps/vscode - SnapBack VS Code Extension

**Purpose**: Smart snapshot manager with Watch/Warn/Block protection
**Tagline**: "Code Breaks. SnapBack."

## Architecture Overview

### Activation Flow (`extension.ts`)
**5-phase initialization** for reliability:

1. **Phase 1** (`activation/phase1-services.ts`): Core services (logger, context)
2. **Phase 2** (`activation/phase2-storage.ts`): Storage + ProtectedFileRegistry
3. **Phase 3** (`activation/phase3-managers.ts`): Business logic (SnapshotManager, SessionCoordinator)
4. **Phase 4** (`activation/phase4-providers.ts`): UI providers (tree views, decorations)
5. **Phase 5** (`activation/phase5-registration.ts`): Command registration + event listeners

### Core Components

#### Snapshot Management (`snapshot/`)
- `SnapshotManager.ts`: Create/restore/list snapshots
- `SessionCoordinator.ts`: Multi-file session tracking (session-aware snapshots)
  - Triggers: idle (105s), blur, commit, task, max-duration (1h)
  - Output: `SessionManifest` with file references
- `SnapshotNamingStrategy.ts`: Git-aware semantic names
- `SnapshotDeduplicator.ts`: Hash-based dedup (>90% space savings)
- `EncryptionService.ts`: Optional AES-256 encryption

#### Protection System (`protection/`)
**3-level protection**:
- 🟢 **Watch**: Silent auto-snapshot on save
- 🟡 **Warn**: Confirmation dialog before save
- 🔴 **Block**: Required note before save

Components:
- `ProtectedFileRegistry.ts`: In-memory + persistent registry
- `PolicyEngine.ts`: `.snapbackrc` rule evaluation (glob patterns)
- `FileSystemWatcher.ts`: File change detection

#### Storage Layer (`storage/`)
- `SqliteStorageAdapter.ts`: Main storage orchestrator
  - Wraps `SqliteSnapshotStorage` (snapshots) + session manifests
  - WAL mode for concurrent reads
- `SqliteSnapshotStorage.ts`: Low-level SQLite operations
  - Tables: `snapshots`, `session_manifests`, `session_files`
  - Indexes: `idx_filepath`, `idx_timestamp`, `idx_hash`

#### Command Handlers (`commands/`)
Organized by domain:
- `snapshotCommands.ts`: create, restore, delete, rename, compare
- `protectionCommands.ts`: protect, unprotect, setLevel (watch/warn/block)
- `sessionCommands.ts`: restoreSession, previewRestoreSession
- `configCommands.ts`: updateConfiguration, createPolicyOverride

#### UI Layer (`ui/`, `views/`)
- `SessionsTreeProvider.ts`: Timeline view of sessions
- `ProtectedFilesTreeProvider.ts`: Explorer sidebar integration
- `SnapshotRestoreUI.ts`: Multi-diff comparison for session restore
- `ProtectionDecorationProvider.ts`: File badges (🟢🟡🔴)
- `SnapBackCodeLensProvider.ts`: Inline "Snap Back" actions
- `notifications.ts`: Non-blocking toast system

#### AI Awareness (`utils/`)
- `AIPresenceDetector.ts`: Detects Copilot/Claude/Tabnine/etc. (9 assistants)
- `BurstHeuristicsDetector.ts`: Rapid multi-file changes (>5 files <10s)
- `SessionTagger.ts`: Tags sessions with `ai-burst`, `copilot-like`
- `AIOptInManager.ts`: One-time "checkpoint bursts?" nudge
- `AdaptiveHintManager.ts`: Experience-tiered hints (explorer/intermediate/power)

#### Event Integration
- Publishes to `@snapback/events` bus: `SNAPSHOT_CREATED`, `PROTECTION_CHANGED`
- Subscribes for: Remote protection updates from web app

### Performance Monitoring (`performance/`)
- `sessionPerfMonitor.ts`: Budgets for session finalization
  - Avg <50ms, P95 <100ms enforced in tests
- Operation tracking: `startOperation()` → `endOperation()` → metrics

### Configuration (`.snapbackrc`)
**Team-wide protection policies**:
```json
{
  "protectionRules": [
    {
      "pattern": "package.json",
      "level": "block",
      "reason": "Critical dependency file"
    },
    {
      "pattern": "**/*.env",
      "level": "block"
    }
  ]
}
```

Loaded silently on workspace open → syncs to all team members.

## Data Flow

### Snapshot Creation
```
File Save (SaveHandler)
  ↓
Check Protection Level
  ↓
[Watch] → Auto-create snapshot
[Warn] → Show dialog → create if confirmed
[Block] → Require note → create with note
  ↓
SnapshotManager.create()
  ↓
Deduplicator (hash check)
  ↓
Storage.save() + EventBus.publish(SNAPSHOT_CREATED)
  ↓
SessionCoordinator.addCandidate()
  ↓
[On idle/blur/commit] → SessionCoordinator.finalizeSession()
```

### Session Restore
```
User clicks "Restore Session" in tree view
  ↓
sessionCommands.previewRestoreSession()
  ↓
Open multi-diff view for all files
  ↓
User confirms
  ↓
sessionCommands.restoreSessionFiles()
  ↓
For each file: Storage.restore() (atomic temp+rename)
```

## Key Features

### Session-Aware Snapshots (85% complete)
- ✅ SessionCoordinator with all triggers
- ✅ Session storage (storeSessionManifest, getSessionManifest, listSessionManifests)
- ✅ Restore commands (preview + execute)
- ⚠️ Tree UI (provider exists but needs `listSessionManifests()` wiring)
- ❌ Enhanced summaries (basic metadata-only, needs AST identifier extraction)

### AI Detection Integration (75% complete)
- ✅ Presence detection (9 assistants)
- ✅ Burst heuristics
- ✅ Session tagging
- ❌ MCP Guardian integration (Guardian exists in core, not yet wired to extension)

### Telemetry & Privacy
- `telemetry.ts`: Posthog client with strict whitelist
- Contract tests enforce: NO file paths, NO content, ONLY hashes
- Performance budgets: avg session finalization <50ms

## Testing

**Test pyramid**:
- **Unit** (`.test.ts`): 200+ tests (snapshot, protection, session logic)
- **Integration** (`.integration.test.ts`): Storage, config loading, session persistence
- **E2E** (WDIO): Full extension workflows (not yet implemented, planned)

Test commands:
- `pnpm test`: Vitest unit + integration
- `pnpm test:coverage`: Coverage report (target >90%)

## Performance Budgets

- Snapshot creation: <200ms (includes dedup + storage)
- Session finalization: Avg <50ms, P95 <100ms
- Protection check: <10ms (in-memory registry)
- UI update: <16ms (60fps)

## Dependencies

**Core**:
- `@snapback/core`: Detection engine (not yet integrated)
- `@snapback/events`: Event bus client
- `@snapback/sdk`: Local storage + clients

**Storage**:
- `better-sqlite3`: Embedded database
- `hasha`: Fast SHA-256 hashing

**VS Code**:
- `vscode` API (Engine: ^1.99.0)
- Native providers (TreeDataProvider, FileDecorationProvider, CodeLensProvider)

## Commands Reference

All commands prefixed with `snapback.`:

**Snapshots**:
- `createSnapshot`: Manual snapshot with note
- `snapBack`: Restore from snapshot picker
- `compareWithSnapshot`: Side-by-side diff
- `deleteSnapshot`, `renameSnapshot`, `protectSnapshot`

**Protection**:
- `protectFile`, `unprotectFile`
- `setWatchLevel`, `setWarnLevel`, `setBlockLevel`
- `showProtectedFiles`: Open protected files view

**Sessions**:
- `restoreSession`: Restore all files from session
- `previewRestoreSession`: Multi-diff before restore

**Config**:
- `updateConfiguration`: Reload `.snapbackrc`
- `createPolicyOverride`: Quick add protection rule

## Configuration Settings

Namespaced under `snapback.*`:

**Protection**:
- `protectionLevels.defaultLevel`: 'watch'|'warn'|'block'
- `protectionLevels.showLevelBadges`: true

**Snapshots**:
- `snapshot.naming.useGit`: true (semantic names from git context)
- `snapshot.deduplication.enabled`: true

**Notifications**:
- `notifications.showSnapshotCreated`: true (Watch level only)
- `notifications.duration`: 3000ms

**Privacy**:
- `offlineMode.enabled`: false (disable all network calls)

## Related Docs
- Core Detection: [packages/core/CLAUDE.md](../../packages/core/CLAUDE.md)
- Event Bus: [packages/events/CLAUDE.md](../../packages/events/CLAUDE.md)
- SDK: [packages/sdk/CLAUDE.md](../../packages/sdk/CLAUDE.md)
- MCP Server: [apps/mcp-server/CLAUDE.md](../mcp-server/CLAUDE.md)

## Extension Points

### Add Custom Protection Rules
Edit `.snapbackrc` in workspace root:
```json
{
  "protectionRules": [
    { "pattern": "src/**/*.critical.ts", "level": "block" }
  ]
}
```

### Extend Session Triggers
Modify `SessionCoordinator.ts` to add triggers:
```ts
// Example: Finalize on debug session end
vscode.debug.onDidTerminateDebugSession(() => {
  sessionCoordinator.finalizeSession('debug-end');
});
```

### Custom Snapshot Naming
Implement `SnapshotNamingStrategy` interface.
