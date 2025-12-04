# SnapBack Phases Alignment with Gold Plating Spec

**Status**: Reconciliation of Phase 14-24 (Extension Implementation) with Phases 1-13 (Foundation from gold_plating/)

---

## Foundation Packages (Phases 1-13) → Gold Plating Spec

These packages are specified in `gold_plating/snapback_implementation_guide_1.md` and must be implemented first:

### @snapback/core (Foundation - CRITICAL PATH)

**File: `packages/core/src/types/`**
- `snapshot.ts` - SnapshotManifest, SnapshotFileRef, SnapshotTrigger, SnapshotWithContent
- `config.ts` - ProjectConfig, GlobalConfig, ProtectionLevel, ProtectionRule
- `auth.ts` - AuthContext, UserTier, StoredCredentials

**File: `packages/core/src/storage/`**
- `blob-store.ts` - BlobStore (content-addressable, SHA-256)
- `snapshot-store.ts` - SnapshotStore (lightweight manifests)
- `session-store.ts` - SessionStore (session tracking, files array)
- `cooldown-cache.ts` - CooldownCache (in-memory, ephemeral)
- `audit-log.ts` - AuditLog (JSONL append-only)
- `storage-manager.ts` - StorageManager (orchestrator)

**File: `packages/core/src/config/`**
- `loader.ts` - GlobalConfigManager, ProjectConfigManager, loadMergedConfig

**File: `packages/core/src/auth/`**
- `credentials.ts` - CredentialManager (keytar), AuthClient

**Tests**: All classes have TDD coverage (tests first)

---

### @snapback/cli (CLI - Phase 3+)

**File: `packages/cli/src/`**
- `index.ts` - Command registry
- `commands/init.ts` - Initialize project
- `commands/snapshot.ts` - Create snapshot
- `commands/list.ts` - List snapshots
- `commands/restore.ts` - Restore from snapshot
- `commands/login.ts` - Authenticate
- `commands/whoami.ts` - Check auth status
- `commands/validate.ts` - Validate snapshots
- `commands/config.ts` - Manage config

---

### @snapback/sdk (API Client - Phase 5+)

**File: `packages/sdk/src/`**
- `client.ts` - HTTP client with API key auth
- `types.ts` - API request/response types

---

## Extension Implementation (Phases 14-24) → Layers

### Layer 1: Foundation (Phases 14-16)

✅ **Phase 14: Entry Point** - COMPLETE
- `src/extension.ts` - Activation/deactivation
- `src/integration/AutoDecisionIntegration.ts` - Orchestration
- 40+ tests

✅ **Phase 15: File Watchers** - COMPLETE
- `src/context/SaveContextBuilder.ts` - Metadata extraction
- File change handlers with debounce (300ms)
- 20+ tests

✅ **Phase 16: Storage & Persistence** - NEEDS REBASING
- **Current (wrong)**: Uses globalState, WorkspaceStateStorageAdapter
- **Required (gold_plating spec)**: Uses file-based storage
  - Create `src/storage/StorageAdapter.ts` wrapping @snapback/core's StorageManager
  - Map VS Code `ExtensionContext.globalStorageUri` to storage base path
  - Use BlobStore + SnapshotStore from @snapback/core
  - Track sessions in SessionStore
  - Handle CooldownCache for throttling
  - Append to AuditLog for event tracking

**Action**: Update SnapshotOrchestrator to use StorageManager instead of globalState

### Layer 2: Business Logic (Phases 17-19)

✅ **Phase 17: Recovery UI** - COMPLETE (snapshot list + restore)
✅ **Phase 18: Settings** - COMPLETE (config loading + reactive)
✅ **Phase 19: Integration** - COMPLETE (settings wired to engine)

### Layer 3: User Experience (Phases 20-24)

✅ **Phase 20: Dashboard & StatusBar** - COMPLETE (59 tests)

🔄 **Phase 21: Notifications** - IN PROGRESS
- Rebase to use SessionStore from @snapback/core
- Track notification events in AuditLog
- Use CooldownCache for throttling

⏳ **Phase 22: Team Collaboration**
- Use AuditLog for audit trail
- Export audit events via SDK

⏳ **Phase 23: Analytics**
- Consume AuditLog (JSONL)
- Aggregate stored events
- Forward to PostHog

⏳ **Phase 24: Hardening**
- Error recovery from corrupted blobs
- Storage cleanup (old blobs)
- Performance on 10k+ files

---

## Storage Architecture Reconciliation

### Wrong Approach (Phase 16 initial)
```typescript
// Uses VS Code globalState (50KB limit)
context.globalState.update('snapback:snapshots', [...])
```

**Problems**:
- globalState has ~50KB practical limit
- Can't handle large files or many snapshots
- Syncs across machines (not desired for file contents)

### Correct Approach (Gold Plating Spec)
```typescript
// Uses file-based storage at ~/.config/Code/User/globalStorage/marcellelabs.snapback-vscode/
const storageUri = context.globalStorageUri;  // vscode-app://vscode-app/...

// StorageManager at storageUri handles:
// ├── blobs/ab/cd/abcd1234...  (SHA-256 content addressing)
// ├── snapshots/*.json          (lightweight manifests)
// ├── sessions/*.json           (session tracking)
// ├── audit.jsonl               (event log)
// └── storage.json              (metadata, cleanup policy)
```

**Implementation**:
```typescript
// src/storage/StorageAdapter.ts
import { StorageManager } from '@snapback/core';
import * as vscode from 'vscode';

export class VSCodeStorageAdapter {
  private manager: StorageManager;

  constructor(context: vscode.ExtensionContext) {
    // Map VS Code storage URI to file system path
    const storagePath = context.globalStorageUri.fsPath;
    this.manager = new StorageManager(storagePath);
  }

  // Delegate to manager
  async createSnapshot(files: Map<string, string>, options: CreateOptions) {
    return this.manager.snapshotStore.create(files, options);
  }

  async listSnapshots(options?: ListOptions) {
    return this.manager.snapshotStore.list(options);
  }

  async restoreSnapshot(id: string) {
    return this.manager.snapshotStore.getWithContent(id);
  }

  async trackSession(sessionId: string, files: string[]) {
    return this.manager.sessionStore.trackSession(sessionId, files);
  }

  async appendAuditEvent(event: AuditEvent) {
    return this.manager.auditLog.append(event);
  }

  async checkCooldown(key: string): Promise<boolean> {
    return this.manager.cooldownCache.check(key);
  }
}
```

---

## Phase 21 (Notifications) Alignment

### Before (wrong)
```typescript
// Notifications just disappeared - no persistence
class NotificationManager {
  async show(config: NotificationConfig): Promise<void> {
    vscode.window.showWarningMessage(config.message);
  }
}
```

### After (correct)
```typescript
// Notifications persisted to AuditLog
class NotificationManager {
  constructor(private storage: VSCodeStorageAdapter) {}

  async show(config: NotificationConfig, context?: NotificationContext): Promise<void> {
    // Show to user
    vscode.window.showWarningMessage(config.message);

    // Persist event for analytics
    await this.storage.appendAuditEvent({
      type: 'notification.shown',
      payload: { id: config.id, level: config.type, timestamp: Date.now(), ...context }
    });

    // Track throttle using CooldownCache
    await this.storage.checkCooldown(`notif:${config.id}`);
  }
}
```

---

## Dependency Graph

```
@snapback/core (foundation)
  ├── @snapback/contracts (types)
  └── @snapback/infrastructure (logger)

@snapback/cli
  └── @snapback/core

@snapback/sdk
  └── @snapback/core

apps/vscode (extension)
  ├── @snapback/core (storage)
  ├── @snapback/sdk (future: team features)
  └── @snapback/infrastructure (logger)

apps/mcp-server
  ├── @snapback/core
  └── @snapback/sdk (API calls)

apps/api (backend)
  └── Various (risk models, DB, etc.)
```

---

## Test Coverage Reconciliation

### Phases 1-13 (Foundation) - From Gold Plating
```
@snapback/core:
  - BlobStore (5+ tests: dedup, retrieve, exists)
  - SnapshotStore (7+ tests: create, list, get, delete)
  - SessionStore (5+ tests: tracking, finalize)
  - CooldownCache (3+ tests: check, expire)
  - AuditLog (3+ tests: append, read)
  - Config (5+ tests: load, merge, validation)
  - Auth (4+ tests: credentials, validation)

@snapback/cli:
  - Each command (3+ tests per command = 24+ tests)
```

### Phases 14-24 (Extension) - Already Done
```
Phase 14: 40+ tests ✅
Phase 15: 20+ tests ✅
Phase 16: 25+ tests (needs storage rebasing)
Phase 17: 20+ tests ✅
Phase 18: 29+ tests ✅
Phase 19: 23+ tests ✅
Phase 20: 59+ tests ✅
Phase 21: 34 tests (in progress, rebasing now)
Phase 22: 25+ tests (pending)
Phase 23: 28+ tests (pending)
Phase 24: 35+ tests (pending)
```

---

## Implementation Sequence (Corrected)

1. **Phases 1-13** (Foundation packages):
   - Implement @snapback/core from gold_plating spec (highest ROI)
   - Implement @snapback/cli from gold_plating spec
   - ~2 weeks TDD

2. **Phase 14-16** (Extension foundation):
   - Already have test structure
   - Rebase Phase 16 storage to use @snapback/core (1-2 days)
   - Update SnapshotOrchestrator to wrap StorageManager

3. **Phase 17-24** (Extension features):
   - Continue as planned, now with correct storage
   - Phase 21 rebased to use AuditLog + CooldownCache

---

## Current Task: Phase 21 Rebasing

✅ Alignment complete
🔄 Now implementing Phase 21 NotificationManager with:
- AuditLog persistence
- CooldownCache throttling
- StorageAdapter integration

**EST**: 2-3 hours to complete Phase 21 with correct storage implementation
