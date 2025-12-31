# SnapBack Notification & Messaging UX Audit Report

**Date**: 2025-12-30
**Auditor**: Claude Code
**Scope**: VS Code Extension + MCP Package

---

## Executive Summary

| Metric | Count |
|--------|-------|
| **Total notification sources** | 185+ |
| showInformationMessage calls (src/) | ~95 |
| showWarningMessage calls (src/) | ~55 |
| showErrorMessage calls (src/) | ~85 |
| Status bar messages | ~15 |
| MCP branding messages | ~45 |
| **Premature notifications** (before action) | 8 |
| **Missing debounce** | 12 |
| **Missing user preference controls** | 7 |
| **Terminology inconsistencies** | 14 |
| **Extension ↔ MCP mismatches** | 6 |

**Verdict**: The notification system has good foundations (centralized branding in MCP, debounce in several places) but suffers from inconsistent terminology, missing user controls, and scattered notification sources without central coordination.

---

## Critical Issues

### 1. Premature "Creating..." Notifications
**Severity**: High
**Principle Violated**: "Don't tell what you're doing → Tell what you did"

| File | Line | Current Message | Status |
|------|------|-----------------|--------|
| `commands/snapshotCreationCommands.ts` | 38 | `"Creating snapshot..."` | ✅ **FIXED** - Removed, now shows `🧢 SnapBack: Snapshot "..." created.` on completion |
| `activation/pioneer.ts` | 140 | Tells user about Pioneer before action | Pending |
| `mcp/auto-configure.ts` | 92 | `"SnapBack detected..."` | Pending |

### 2. Potential "No Changes" After Action Messages
**Severity**: Medium
**Principle Violated**: "Check before you speak"

| Location | Issue |
|----------|-------|
| `commands/updateConfiguration.ts:251` | `"No files requiring protection were found"` - Shows after user initiates action |
| `commands/sessionCommands.ts:83` | `"No sessions found"` - Could check before showing picker |
| `ui/SnapshotRestoreUI.ts:107` | `"No snapshots available to restore"` - Late check |

### 3. Duplicate/Redundant Notifications
**Severity**: Medium
**Principle Violated**: "One message per event"

| Flow | Duplication |
|------|-------------|
| Protection level change | Both `ProtectionLevelSelector.ts:137` AND `protectionCommands.ts:204` can fire |
| Snapshot creation | `snapshotCreationCommands.ts` shows "Creating..." then "Created successfully" |
| AI detection | `AIDetectionToast.ts` + `AIWarningManager.ts` can overlap |

### 4. Missing Dismiss/Snooze Options
**Severity**: Medium
**Principle Violated**: "Respect user attention"

| Notification Type | Issue |
|-------------------|-------|
| AI Detection Toast | Has snooze buttons but individual cooldowns only |
| Protection notifications | No global snooze option |
| Onboarding nudges | No "Don't show again" for some |

---

## Notification Inventory

### Information Messages (showInformationMessage)

| Category | File | Message Pattern | Debounced | User Control |
|----------|------|-----------------|-----------|--------------|
| **Snapshot Created** | `snapshotCreationCommands.ts:47` | `Snapshot "${displayName}" created successfully` | No | `showAutoSnapshotNotifications` |
| **Protection Set** | `ProtectionLevelSelector.ts:137` | `${icon} Protection set to ${label}` | No | No |
| **Restore Success** | `viewCommands.ts:98` | `Snap Back completed successfully` | No | No |
| **Session Restored** | `sessionCommands.ts:186` | `Session "${id}" restored successfully` | No | No |
| **Config Reload** | `issue-005-notification-dismiss.test.ts` | Should use status bar (per regression test) | N/A | N/A |
| **AI Detection** | `AIDetectionToast.ts:85` | `🤖 Detected ${tool} edit` | Yes (5min) | `aiDetection.enabled` |
| **MCP Configured** | `mcp/auto-configure.ts:159` | `✓ SnapBack enabled for ${names}` | No | No |
| **Auth Success** | `authCommands.ts:39` | `Signed in to SnapBack as ${label}` | No | No |
| **Offline Mode** | `extension.ts:437` | `SnapBack is running in offline mode` | No | No |
| **Tutorial Steps** | `InteractiveTutorial.ts` | Various step confirmations | No | Tutorial-gated |
| **Feedback Thanks** | `FeedbackManager.ts:171` | `Thanks for your feedback!` | No | No |

### Warning Messages (showWarningMessage)

| Category | File | Message Pattern | Blocking | User Control |
|----------|------|-----------------|----------|--------------|
| **Warn-Level Save** | `ProtectionLevelSelector.ts:66` | Confirmation dialog | Yes (modal) | Protection level |
| **Block Override** | `BlockModalHandler.ts:185` | Requires note | Yes (modal) | Protection level |
| **File Not Selected** | `protectionCommands.ts:159` | `No file selected` | No | No |
| **MCP Not Available** | `mcpCommands.ts:51` | `MCP Tools not available` | No | No |
| **Storage Quota** | `StorageQuotaMonitor.ts:272` | Quota warning | No | No |
| **Memory Pressure** | `MemoryMonitor.ts:228` | Memory warning | No | No |
| **AI Copilot Intercept** | `ai/copilot/intercept.ts:210` | Intercept warning | Yes (modal) | `guardian.enabled` |
| **Restore Confirm** | `snapshotSelector.ts:146` | Restore confirmation | Yes (modal) | No |
| **Session Restore** | `sessionCommands.ts:172` | Overwrite warning | Yes (modal) | No |

### Error Messages (showErrorMessage)

| Category | File | Message Pattern | Recoverable |
|----------|------|-----------------|-------------|
| **Auth Failed** | `authCommands.ts:46` | `Sign in failed: ${message}` | Yes |
| **Snapshot Failed** | `snapshotCommands.ts:110` | `Failed to delete snapshot: ${message}` | No |
| **Storage Error** | `phase2-storage.ts:278` | Storage failure dialog | Yes (options) |
| **Conflict Resolution** | `conflictResolver.ts:187` | `No workspace folder open` | No |
| **API Key Invalid** | `ManualAuthFlow.ts:126` | `Invalid API key format` | Yes |
| **Vitals Panel** | `VitalsDashboardPanel.ts:125` | `Failed to open vitals dashboard` | No |
| **File Restore** | `SnapshotRestoreUI.ts:404` | `Failed to restore snapshot` | No |
| **Diff Open** | `diffCommands.ts:162` | `Failed to open diff: ${message}` | No |

### Status Bar Messages

| Location | Message | Duration |
|----------|---------|----------|
| `SnapBackCodeLensProvider.ts:142` | Save allowed message | 3s |
| `SnapBackCodeLensProvider.ts:177` | False positive marked | 3s |
| `StatusBarManager.ts` | Health/session status | Persistent |
| `cooldownIndicator.ts` | Cooldown count | Persistent |

---

## Terminology Audit

### Inconsistent Terms

| Concept | Variations Found | Recommendation |
|---------|------------------|----------------|
| **Checkpoint vs Snapshot** | "Checkpoint" (MCP), "Snapshot" (Extension UI) | Standardize on "Snapshot" for Extension |
| **Protect vs Watch/Warn/Block** | Mixed usage | Use "Protection Level" consistently |
| **Session vs Manifest** | Internal vs user-facing | Hide "Manifest" from users |
| **Undo vs Restore vs Revert** | All three used | Standardize on "Restore" |
| **AI Edit vs AI Change** | Both used | Standardize on "AI change" |

### MCP Branding vs Extension Messages

| MCP (packages/mcp/src/branding) | Extension Equivalent | Match? |
|---------------------------------|---------------------|--------|
| `🧢 SnapBack: Checkpoint created.` | `Snapshot "${name}" created successfully` | No |
| `🧢 SnapBack: Restored \`file\` to ${time}.` | `Snap Back completed successfully` | No |
| `🧢 SnapBack: Creating a checkpoint first—${reason}.` | `Creating snapshot...` | Partial |
| `🧢 SnapBack: No checkpoint found...` | `No snapshots found for this file` | Partial |

---

## Notification Flow Analysis

### Flow 1: Snapshot Creation (Watch Level)

```
User saves file →
  SaveHandler.handleWatchLevel() →
    SnapshotManager.create() →
      ✅ setStatusBarMessage (per regression test)
      ❌ Previously: showInformationMessage (fixed)

Current: Good (uses status bar)
```

### Flow 2: AI Detection

```
AI edit detected →
  AIPresenceDetector.detect() →
    AIDetectionToast.show() →
      showInformationMessage with buttons →
        [5 minute cooldown per assistant type]

Issues:
- Cooldown per assistant, not global
- Can stack multiple toasts if switching tools
```

### Flow 3: Protection Level Change

```
User sets protection →
  setProtectionLevel command →
    ProtectionLevelSelector.ts (dialog) →
      protectionCommands.ts (confirmation) →
        ❌ DUPLICATE: Both can show success message
```

### Flow 4: Restore Operation

```
User clicks restore →
  viewCommands.restoreSnapshot →
    SnapshotRestoreUI.restoreSnapshot() →
      showWarningMessage (confirm) →
        [restore files] →
          showInformationMessage (success) OR
          showErrorMessage (failure)

Issues:
- No pre-check for empty snapshots
- Can show "No files in snapshot" after opening dialog
```

---

## Debounce & Rate Limiting Audit

### Has Debounce/Cooldown

| Component | Mechanism | Duration |
|-----------|-----------|----------|
| `ProtectionDecorationProvider` | debounceTimer | 150ms |
| `FileHeatDecorationProvider` | debounceTimer | 100ms |
| `AIDetectionToast` | Per-assistant cooldown | 5 min |
| `SnapshotRecommendationUI` | NOTIFICATION_COOLDOWNS | urgency-based |
| `ProgressiveDisclosureController` | HINT_COOLDOWN_MS | 60s |
| `VitalsUIIntegration` | AUTO_SNAPSHOT_COOLDOWN | 60s |
| `CooldownIndicator` | File-level cooldown | Configurable |

### Missing Debounce (Needs Addition)

| Component | Issue | Recommendation |
|-----------|-------|----------------|
| `ProtectionLevelSelector` | No debounce on rapid level changes | Add 500ms debounce |
| `authCommands` | No debounce on auth messages | Add session debounce |
| `mcpCommands` | Task start/end messages rapid | Add 2s debounce |
| `configurationManager` | Reload messages | Add 3s cooldown |
| `Pioneer notifications` | Multiple welcome messages | Session-based |

---

## User Preference Controls Audit

### Existing Controls

| Setting | Path | Controls |
|---------|------|----------|
| `snapback.showAutoSnapshotNotifications` | package.json | Auto-snapshot toasts |
| `snapback.aiDetection.enabled` | package.json | AI detection notifications |
| `snapback.guardian.enabled` | package.json | Guardian intercept dialogs |
| `snapback.notifications.duration` | package.json (not found) | Should exist |

### Missing Controls

| Notification Type | Recommended Setting |
|-------------------|---------------------|
| Protection level change confirmations | `snapback.notifications.showProtectionChanges` |
| Restore success messages | `snapback.notifications.showRestoreSuccess` |
| MCP configuration messages | `snapback.notifications.showMcpSetup` |
| Tutorial/onboarding nudges | `snapback.onboarding.showHints` |
| Session restore confirmations | `snapback.notifications.confirmSessionRestore` |
| Auth status messages | `snapback.notifications.showAuthStatus` |
| Feedback acknowledgments | `snapback.notifications.showFeedbackThanks` |

### Command for Reset

✅ Exists: `snapback.resetNotificationPreferences` (`protectionCommands.ts:688`)

---

## Extension ↔ MCP Consistency Table

| Operation | Extension Message | MCP Message | Consistent? |
|-----------|-------------------|-------------|-------------|
| Checkpoint created | `Snapshot "${name}" created successfully` | `🧢 SnapBack: Checkpoint created.` | ❌ No |
| Restore complete | `Snap Back completed successfully` | `🧢 SnapBack: Restored \`file\` to ${time}.` | ❌ No |
| Validation passed | `✓ No pattern violations found` | `🧢 All good—checks pass.` | ❌ No |
| Task started | `Task started: ${taskId}` | Wire format only | ✅ OK |
| No sessions | `No sessions found.` | N/A | N/A |
| AI detected | `🤖 Detected ${tool} edit` | Wire format | ✅ OK |

---

## Recommended Fix Order

### P0 - Critical (Fix Immediately)

1. ~~**Remove "Creating snapshot..." premature message**~~ ✅ **FIXED** (`snapshotCreationCommands.ts:38`)
2. **Deduplicate protection level change notifications** (consolidate in one location)
3. **Add pre-checks before "No X found" messages** (check before opening dialogs)

### P1 - High Priority (This Week)

4. **Standardize terminology**: "Snapshot" for Extension, add `🧢 SnapBack:` prefix
5. **Align Extension messages with MCP branding** (use `🧢 SnapBack:` prefix)
6. **Add missing user preference controls** for notification types
7. **Add global "quiet mode"** setting to suppress non-critical notifications

### P2 - Medium Priority (Next Sprint)

8. **Add debounce to protection level changes**
9. **Consolidate AI detection notifications** (global cooldown, not per-assistant)
10. **Add "Don't show again" to applicable messages**
11. **Create NotificationCoordinator service** to prevent stacking

### P3 - Nice to Have

12. **Implement notification categories** (can filter by type)
13. **Add notification history panel** (VS Code output channel)
14. **Create notification testing framework** (mock-based assertions)

---

## Glossary

| Term | Definition | Usage Context |
|------|------------|---------------|
| Checkpoint | Point-in-time file backup | MCP primary term |
| Snapshot | Legacy term for checkpoint | Extension UI (deprecated) |
| Protection Level | Watch/Warn/Block severity | User-facing |
| Cooldown | Debounce period after action | Internal |
| Toast | Non-modal notification | VS Code showInformationMessage |
| Modal | Blocking dialog | VS Code showWarningMessage with modal:true |
| Wire Format | Token-efficient MCP response | Internal to agent |

---

## Appendix: Files Touched by Notifications

### High-Impact Files (>5 notification calls)

- `apps/vscode/src/commands/protectionCommands.ts` - 18 calls
- `apps/vscode/src/commands/snapshotCommands.ts` - 14 calls
- `apps/vscode/src/commands/sessionCommands.ts` - 12 calls
- `apps/vscode/src/commands/mcpCommands.ts` - 11 calls
- `apps/vscode/src/commands/viewCommands.ts` - 10 calls
- `apps/vscode/src/handlers/ProtectionLevelHandler.ts` - 9 calls
- `apps/vscode/src/commands/authCommands.ts` - 8 calls
- `apps/vscode/src/commands/diffCommands.ts` - 7 calls
- `apps/vscode/src/ui/ProgressiveDisclosureController.ts` - 7 calls

### Notification Infrastructure

- `apps/vscode/src/notificationManager.ts` - Central manager (lines 727-782)
- `apps/vscode/src/notifications/AIDetectionToast.ts` - AI toast handler
- `apps/vscode/src/notifications/protectionNotifications.ts` - Protection notifications
- `apps/vscode/src/notifications/RecoveryUXNotification.ts` - Restore UX
- `apps/vscode/src/utils/notifications.ts` - Utility functions
- `packages/mcp/src/branding/index.ts` - MCP branding system

---

*Report generated by comprehensive codebase audit. Statistics are approximate based on grep analysis.*
