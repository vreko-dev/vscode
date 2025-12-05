# SnapBack VS Code Extension - Internal Commands

**Purpose:** This document catalogs internal commands that are registered but not exposed in `package.json`. These commands are invoked programmatically by the extension's internal systems and should not be directly used by end users.

**Last Updated:** 2025-12-04  
**Extension Version:** 1.2.9

---

## Why Internal Commands?

Internal commands are registered with VS Code's command system but are **not declared** in `package.json` for the following reasons:

1. **Programmatic Invocation Only** - Called by extension code, not users
2. **Prevent UI Clutter** - Keep Command Palette clean
3. **Signature Complexity** - Require specific parameters that users can't provide manually
4. **Internal State Management** - Access private extension state
5. **Debug/Development Tools** - Not intended for production use

---

## Detection Commands (5 commands)

**Module:** [detectionCommands.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/detectionCommands.ts)

These commands are invoked by the **Guardian** system when AI-generated code is detected.

### `snapback.reviewSecurityIssues`

**Line:** 84  
**Signature:** `async (uri: Uri, analysisResult: AnalysisResult) => void`

**Purpose:** Shows security issue details in a modal dialog

**Invoked By:** Guardian when risk analysis detects security concerns

**Parameters:**
- `uri` - File URI with security issues
- `analysisResult` - Detailed analysis results including:
  - Risk factors detected
  - Severity scores
  - Suggested mitigations

**User Experience:** Modal dialog with:
- List of detected security issues
- Risk score breakdown
- "Review" and "Dismiss" actions

---

### `snapback.blockSave`

**Line:** 129  
**Signature:** `async (uri: Uri, analysisResult: AnalysisResult) => void`

**Purpose:** Blocks file save when critical threats detected

**Invoked By:** Guardian when risk score exceeds block threshold

**Parameters:**
- `uri` - File URI being saved
- `analysisResult` - Critical threat details

**User Experience:** Error modal with:
- "Critical threat detected, save blocked"
- Specific threat details
- "Override" option (requires confirmation)

**Error Handling:** Throws error to prevent save completion

---

### `snapback.removeSecret`

**Line:** 171  
**Signature:** `async (uri: Uri, factor: string) => void`

**Purpose:** Prompts user to manually remove detected secrets

**Invoked By:** Guardian's secret detection plugin

**Parameters:**
- `uri` - File containing secret
- `factor` - Secret type (e.g., "AWS_ACCESS_KEY", "GITHUB_TOKEN")

**User Experience:** Modal prompt:
- "Detected secret: {factor}"
- "Please remove manually before saving"
- Opens file at detection location

---

### `snapback.removeMock`

**Line:** 214  
**Signature:** `async (uri: Uri, factor: string) => void`

**Purpose:** Alerts user to remove mock data/implementations

**Invoked By:** Guardian's mock replacement detection plugin

**Parameters:**
- `uri` - File with mock code
- `factor` - Mock type detected

**User Experience:** Warning dialog:
- "Mock code detected in production file"
- Highlights mock sections
- "Review" action

---

### `snapback.addDependency`

**Line:** 255  
**Signature:** `async (uri: Uri, factor: string) => void`

**Purpose:** Prompts to add missing phantom dependencies

**Invoked By:** Guardian's phantom dependency plugin

**Parameters:**
- `uri` - File with phantom dependency
- `factor` - Missing dependency name

**User Experience:** Action dialog:
- "Missing dependency: {factor}"
- "Add to package.json" button
- "Ignore" button

---

## Session Commands (2 commands)

**Module:** [sessionCommands.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/sessionCommands.ts)

These commands manage AI coding session restoration.

### `snapback.previewRestoreSession`

**Line:** 94  
**Signature:** `async (item?: SessionTreeItem) => void`

**Purpose:** Show diff preview before restoring session

**Invoked By:** User clicking "Preview Restore" in Sessions TreeView

**Parameters:**
- `item` - SessionTreeItem from tree (contains sessionId, timestamp, fileCount)

**User Experience:**
- Opens diff editors for each file in session
- Shows before/after comparison
- "Confirm Restore" button appears after preview

**Error Handling:**
- Validates session exists
- Shows error if session not found
- Try/catch with user-friendly error messages

**Test Coverage:** ✅ [session-tracking.e2e.test.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/test/e2e/critical-paths/session-tracking.e2e.test.ts)

---

### `snapback.restoreSession`

**Line:** 237  
**Signature:** `async (item?: SessionTreeItem) => void`

**Purpose:** Restore all files from AI coding session

**Invoked By:**
- `previewRestoreSession` after confirmation
- User clicking "Restore Session" in tree

**Parameters:**
- `item` - SessionTreeItem with sessionId

**User Experience:**
- Confirmation dialog with file count
- Progress notification during restore
- Success message with restored file count

**Error Handling:**
- Validates all files before restore
- Atomic operation (all or nothing)
- Rollback on failure

**Test Coverage:** ✅ [sessionRestore.e2e.test.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/test/e2e/sessionRestore.e2e.test.ts)

---

## Snapshot UI Commands (2 commands)

**Module:** [viewCommands.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/viewCommands.ts)

Internal commands for snapshot restore workflow.

### `snapback.confirmRestoreFromPreview`

**Line:** 204  
**Signature:** `() => void`

**Purpose:** Confirm restore after preview (delegates to SnapshotRestoreUI)

**Invoked By:** "Confirm" button in snapshot preview UI

**Parameters:** None (accesses SnapshotRestoreUI internal state)

**User Experience:**
- Triggered by user clicking "Confirm Restore"
- Closes preview UI
- Executes restore operation

**Implementation:** Thin wrapper around `SnapshotRestoreUI.confirmRestore()`

---

### `snapback.restoreSnapshot`

**Line:** 96  
**Signature:** `async (snapshotId: string) => void`

**Purpose:** Restore specific snapshot by ID

**Invoked By:**
- SnapshotRestoreUI workflow
- Internal restoration logic

**Parameters:**
- `snapshotId` - Unique snapshot identifier

**User Experience:**
- Confirmation dialog with snapshot details
- Progress notification
- Success/failure message

**Error Handling:**
- Validates snapshot exists
- Try/catch with rollback
- User-friendly error messages

**Test Coverage:** ✅ [snapshot-workflow.e2e.test.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/test/e2e/critical-paths/snapshot-workflow.e2e.test.ts)

---

### `snapback.openSnapshotFileDiff`

**Line:** 209  
**Signature:** `async (node: SnapshotFileNode) => void`

**Purpose:** Open diff editor for specific file in snapshot

**Invoked By:** User clicking file node in snapshot tree

**Parameters:**
- `node` - SnapshotFileNode with filePath, snapshotId, content

**User Experience:**
- Opens VS Code diff editor
- Left: Current file content
- Right: Snapshot content
- Cleanup listener for disposal

**Error Handling:**
- Try/catch with error messages
- Validates file exists

**Test Coverage:** ⚠️ Partial (covered in e2e workflow tests)

---

## Progressive Disclosure Command (1 command)

**Module:** [ProgressiveDisclosureController.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/ui/ProgressiveDisclosureController.ts)

### `snapback.showAllFeatures`

**Line:** 80  
**Signature:** `async () => void`

**Purpose:** Show full feature list after onboarding

**Invoked By:** "Show All Features" button in onboarding UI

**Parameters:** None

**User Experience:**
- QuickPick dialog with all extension features
- Categorized by feature type
- Links to documentation

**Error Handling:** Try/catch with logging

**Test Coverage:** ❌ No dedicated tests

---

## MCP/Debug Commands (4 commands)

**Module:** [mcpCommands.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/mcpCommands.ts) + [utilityCommands.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/utilityCommands.ts)

**⚠️ WARNING:** These commands are for **development/debugging only** and should not be used in production.

### `snapback.helloWorld`

**Line:** [utilityCommands.ts:12](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/utilityCommands.ts#L12)  
**Signature:** `() => void`

**Purpose:** Test command registration (debug only)

**Invoked By:** Manual testing during development

**User Experience:** Shows "Hello World from SnapBack!" message

**Status:** ⚠️ **Should be removed before production** (P2 recommendation)

---

### `snapback.testMCPFederation`

**Line:** [mcpCommands.ts:46](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/mcpCommands.ts#L46)  
**Signature:** `async () => void`

**Purpose:** Test MCP server connectivity

**Invoked By:** Developer testing MCP integration

**User Experience:**
- Tests connection to MCP server
- Shows timeout after 5 seconds
- Logs detailed connection info

**Status:** **Debug tool** - Useful for troubleshooting MCP issues

---

### `snapback.analyzeRisk`

**Line:** [mcpCommands.ts:139](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/mcpCommands.ts#L139)  
**Signature:** `async () => void`

**Purpose:** Manually trigger risk analysis on active file

**Invoked By:** Developer testing Guardian

**User Experience:**
- Analyzes currently open file
- Shows risk score in modal
- Displays detected factors

**Status:** **Debug tool** - Helps test Guardian detection

---

### `snapback.toggleAIMonitoring`

**Line:** [mcpCommands.ts:157](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/mcpCommands.ts#L157)  
**Signature:** `async () => void`

**Purpose:** Toggle AI detection on/off

**Invoked By:** Developer testing

**User Experience:**
- Toggles `aiDetection.enabled` setting
- Updates config globally
- Shows notification

**Status:** **Debug tool** - Quick toggle for testing

---

## Best Practices for Internal Commands

### 1. **Naming Convention**
- Use descriptive names that indicate internal use
- Avoid generic names that might conflict
- Example: `snapback.restoreSnapshot` (specific) vs `snapback.restore` (too generic)

### 2. **Registration Location**
- Register in same file as handler implementation
- Group related commands together
- Example: All detection commands in `detectionCommands.ts`

### 3. **Parameter Validation**
- Always validate parameters at entry point
- Provide helpful error messages
- Example:
  ```typescript
  if (!item || !item.id) {
    vscode.window.showErrorMessage("Invalid snapshot selected");
    return;
  }
  ```

### 4. **Error Handling**
- Use try/catch blocks
- Show user-friendly error messages
- Log errors for debugging

### 5. **Documentation**
- Document in this file when adding new internal commands
- Include invocation context
- Note test coverage status

---

## When to Make a Command Internal

**Make a command INTERNAL if:**
- ✅ Requires complex parameters users can't provide
- ✅ Part of multi-step workflow (not standalone)
- ✅ Accesses private extension state
- ✅ Debug/development tool
- ✅ Programmatically invoked by other commands

**Make a command PUBLIC if:**
- ✅ Users need direct access via Command Palette
- ✅ Standalone functionality
- ✅ Keybinding-friendly
- ✅ Menu item in context menus
- ✅ Common user action

---

## Maintenance Checklist

When modifying internal commands:

- [ ] Update this documentation file
- [ ] Verify invocation points still work
- [ ] Check test coverage
- [ ] Update error messages if signature changes
- [ ] Document breaking changes in CHANGELOG
- [ ] Review if command should be made public/removed

---

## Related Documentation

- **Command Lifecycle Audit:** [COMMAND_LIFECYCLE_AUDIT.md](file:///Users/user1/WebstormProjects/SnapBack-Site/COMMAND_LIFECYCLE_AUDIT.md)
- **Command Registration:** [commands/index.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/commands/index.ts)
- **Command Constants:** [constants/commands.ts](file:///Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src/constants/commands.ts)

---

## Summary

| Category | Count | Purpose |
|----------|-------|---------|
| Detection | 5 | Guardian threat handling |
| Session | 2 | AI session restoration |
| Snapshot UI | 3 | Restore workflow |
| Progressive Disclosure | 1 | Feature discovery |
| Debug/MCP | 4 | Development tools |
| **Total** | **15** | Internal use only |

**Test Coverage:** 3/15 commands (20%) have dedicated tests. Most are covered indirectly through workflow e2e tests.

**Recommendation:** Debug commands (`helloWorld`, MCP test commands) should be removed before production deployment (see P2 recommendations in [COMMAND_LIFECYCLE_AUDIT.md](file:///Users/user1/WebstormProjects/SnapBack-Site/COMMAND_LIFECYCLE_AUDIT.md)).
