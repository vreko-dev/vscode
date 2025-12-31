# SnapBack MCP Auto-Configuration Audit Report

**Date**: 2025-12-30
**Auditor**: Claude Code
**Scope**: MCP auto-configuration flow from UI button to config file write

---

## Executive Summary

**STATUS**: 🟡 PARTIAL - Config writes work, but trust verification is broken

**Critical Finding**: The code DOES write config files correctly, but provides **ZERO proof** to users that anything happened. The `validateConfig()` function exists but is **never called**. All MCP logging is DEBUG level (invisible by default). Users have no way to verify configuration succeeded.

---

## The Flow (Verified)

```
DashboardPanel.ts:276-278
    │ Receives "configureMCP" message
    │ Calls injectSystemPrompt()
    ▼
DashboardPanel.ts:310-313
    │ Executes command: snapback.mcp.configure
    ▼
auto-configure.ts:198-239
    │ registerCommand("snapback.mcp.configure")
    │ 1. detectAIClients() → from @snapback/mcp-config
    │ 2. Build quick pick items with hasSnapback check
    │ 3. Show quick pick (pre-selects unconfigured clients)
    ▼
auto-configure.ts:227-234
    │ For each selected client:
    │   result = writeClientConfig(client, mcpConfig)
    │   if (result.success) → showInformationMessage
    │   else → showErrorMessage
    ▼
packages/mcp-config/src/write.ts:141-181
    │ writeClientConfig()
    │ 1. mkdirSync(configDir, { recursive: true })
    │ 2. Read existing config (or empty {})
    │ 3. Create backup if content exists
    │ 4. mergeConfig() → add snapback to mcpServers
    │ 5. writeFileSync(client.configPath, JSON.stringify(...))
    │ 6. return { success: true }
    ▼
User sees notification: "✓ SnapBack enabled for [names]"
```

---

## Critical Issues (Must Fix Before Ship)

### 1. 🔴 No Post-Write Validation
**Location**: `auto-configure.ts:227-234`
**Problem**: `validateConfig()` exists in `write.ts:309-345` but is **NEVER CALLED** after writing.

**Evidence**:
```typescript
// auto-configure.ts:227-234
for (const item of selected) {
    const result = writeClientConfig(item.client, mcpConfig);
    if (result.success) {
        vscode.window.showInformationMessage(`✓ Configured ${item.client.displayName}`);
    }
    // NO CALL TO validateConfig()!
}
```

**Impact**: Success message shown based on `writeFileSync` not throwing, not on actual verification that config is correct.

**Fix**: Add validation after write:
```typescript
const result = writeClientConfig(item.client, mcpConfig);
if (result.success) {
    const valid = validateConfig(item.client);
    if (valid) {
        logger.info(`[MCP] Configured ${item.client.displayName} at ${item.client.configPath}`);
        vscode.window.showInformationMessage(`✓ Configured ${item.client.displayName}`);
    } else {
        logger.error(`[MCP] Config written but validation failed for ${item.client.displayName}`);
        vscode.window.showWarningMessage(`Config written but may be invalid for ${item.client.displayName}`);
    }
}
```

---

### 2. 🔴 Zero Logging of Write Operations
**Location**: `auto-configure.ts:126-174` (configureClients function)
**Problem**: The entire `configureClients()` function has **ZERO logging**.

**Evidence**:
```typescript
// auto-configure.ts:126-174
async function configureClients(clients: AIClientConfig[], context: vscode.ExtensionContext): Promise<void> {
    // ... 48 lines of code
    // NOT A SINGLE logger.info() or logger.debug() call!
}
```

**Impact**: User has **NO way** to verify what path was written to or what content was written.

**Missing Log Points**:
| Event | Currently Logged | Should Log |
|-------|-----------------|------------|
| Write starting | NO | "Writing config to ~/.cursor/mcp.json..." |
| Write completed | NO | "Config written successfully to ~/.cursor/mcp.json" |
| Config content | NO | JSON content being written |
| Backup created | NO | "Backup saved to ~/.cursor/mcp.json.backup.123456" |

**Fix**: Add comprehensive logging:
```typescript
for (const client of clients) {
    logger.info(`[MCP] Configuring ${client.displayName} at ${client.configPath}`);
    logger.debug(`[MCP] Config content:`, JSON.stringify(mcpConfig, null, 2));

    const result = writeClientConfig(client, mcpConfig);

    if (result.success) {
        logger.info(`[MCP] ✓ Successfully wrote config to ${client.configPath}`);
        if (result.backup) {
            logger.info(`[MCP] Backup saved to ${result.backup}`);
        }
    } else {
        logger.error(`[MCP] ✗ Failed to write config: ${result.error}`);
    }
}
```

---

### 3. 🔴 All MCP Logs Are DEBUG Level (Invisible by Default)
**Location**: `auto-configure.ts:58,65,75,82,331,342,346`
**Problem**: All existing MCP logs use `logger.debug()`. Default log level is INFO.

**Evidence**:
```typescript
logger.debug("[MCP] Auto-configure disabled in settings");  // line 58
logger.debug("[MCP] Already configured, skipping...");      // line 65
logger.debug("[MCP] No AI clients detected");               // line 75
logger.debug("[MCP] All detected clients already have...");  // line 82
```

**Impact**: Users cannot see any MCP-related logs unless they manually change `snapback.logLevel` to "debug".

**Fix**: Change critical logs to INFO level:
```typescript
logger.info("[MCP] Starting configuration...");
logger.info("[MCP] Detected clients: Cursor, Claude Desktop");
logger.info("[MCP] Config written to ~/.cursor/mcp.json");
```

---

### 4. 🟡 Silent Error Swallowing in Detection
**Location**: `packages/mcp-config/src/detect.ts:112-114`
**Problem**: Empty catch block treats read errors as "not configured".

**Evidence**:
```typescript
// detect.ts:112-114
} catch {
    // Invalid JSON/YAML or read error - treat as no snapback
}
```

**Impact**: If file exists but is unreadable (permissions), user sees "Not configured" which is misleading.

**Fix**: Log the actual error:
```typescript
} catch (error) {
    // Log but treat as not configured for safety
    console.debug(`[MCP] Could not read ${configPath}: ${error}`);
}
```

---

### 5. 🟡 Silent Error Swallowing in Write
**Location**: `packages/mcp-config/src/write.ts:156-158`
**Problem**: Empty catch block on JSON parse.

**Evidence**:
```typescript
// write.ts:156-158
} catch {
    // Invalid JSON, will overwrite
}
```

**Impact**: If existing config is malformed, it gets silently overwritten with no warning.

---

## The "Already Configured" Problem

**Current behavior**: Detection reads config file and checks for `mcpServers.snapback`.

**Root cause of false positives**:
1. User configured via CLI previously
2. Another tool added a `snapback` entry
3. User manually added config

**Root cause of false negatives**:
1. File exists but read fails (permissions) → shows "Not configured"
2. File has invalid JSON → shows "Not configured"

**Detection Logic** (`detect.ts:99-115`):
```typescript
const exists = existsSync(configPath);
let hasSnapback = false;

if (exists) {
    try {
        const content = readFileSync(configPath, "utf-8");
        const parsed = JSON.parse(content);
        hasSnapback = checkForSnapback(parsed, name);
    } catch {
        // Silent failure - hasSnapback stays false
    }
}
```

**This detection is CORRECT but error reporting is silent.**

---

## The "Success But Nothing Happened" Problem

**Current behavior**: Success message shown immediately after `writeFileSync` returns without error.

**Root cause**: No post-write verification. The `validateConfig()` function exists but is never called.

**What SUCCESS means currently**:
- `writeFileSync` did not throw an exception
- That's it. No verification that:
  - File actually exists after write
  - JSON is valid
  - `mcpServers.snapback` entry exists
  - Command and args are correct

**Fix**: Call `validateConfig()` after every write.

---

## File Write Verification

**Does config actually get written?**

✅ **Yes - Verified at `packages/mcp-config/src/write.ts:172`**

```typescript
// write.ts:172
writeFileSync(client.configPath, JSON.stringify(newConfig, null, 2));
```

The write IS synchronous and DOES happen. The problem is **zero proof** is provided to the user.

---

## Config Content Verification

**What gets written**:
```json
{
  "mcpServers": {
    "snapback": {
      "command": "npx",
      "args": ["-y", "@snapback/cli", "mcp", "--stdio", "--tier", "free"]
    }
  }
}
```

With API key:
```json
{
  "mcpServers": {
    "snapback": {
      "command": "npx",
      "args": ["-y", "@snapback/cli", "mcp", "--stdio", "--tier", "pro"],
      "env": {
        "SNAPBACK_API_KEY": "sk_..."
      }
    }
  }
}
```

**Server URL**: Uses `npx @snapback/cli` (auto-updates) by default.
**Correct?** ✅ Yes - follows MCP spec.

---

## Error Handling Gaps

| Scenario | Handled | User Notified | Logged |
|----------|---------|---------------|--------|
| Config directory doesn't exist | ✅ mkdirSync | ✅ | ❌ |
| Config file is read-only | ✅ try/catch | ✅ showErrorMessage | ❌ |
| Config file has invalid JSON | ✅ (overwrites) | ❌ | ❌ |
| Write permission denied | ✅ try/catch | ✅ showErrorMessage | ❌ |
| Disk full | ✅ try/catch | ✅ showErrorMessage | ❌ |
| Path resolution fails | ❌ | ❌ | ❌ |

---

## Missing Logging

| Log Point | Exists | Location | Level |
|-----------|--------|----------|-------|
| IDE detection start | ❌ | - | - |
| IDE detection result | ❌ | - | - |
| Config path resolved | ❌ | - | - |
| Write starting | ❌ | - | - |
| Write completed | ❌ | - | - |
| Write failed | ❌ | - | - |
| Backup created | ❌ | - | - |
| Validation result | ❌ | - | - |

---

## Test Coverage Analysis

**Existing Tests** (`packages/mcp-config/src/__tests__/`):
- ✅ `detect.test.ts`: 17 test cases - comprehensive
- ✅ `write.test.ts`: 18 test cases - comprehensive
- ✅ `validateConfig` tested but function never used in production

**Missing Tests**:
- ❌ Integration test for full flow (button → file write)
- ❌ Test that `validateConfig` is called after write (because it isn't)
- ❌ E2E test verifying file actually written to disk

---

## Recommended Fixes (Priority Order)

### P0 - Ship Blockers

1. **Add `validateConfig()` call after every write**
   - File: `auto-configure.ts:228-233`
   - Also update `configureClients()` function
   - Import `validateConfig` from `@snapback/mcp-config`

2. **Add INFO-level logging for all write operations**
   - File: `auto-configure.ts:126-174`
   - Log: path, success/failure, backup location

3. **Include file path in success message**
   - Current: `"✓ Configured Cursor"`
   - Better: `"✓ Configured Cursor at ~/.cursor/mcp.json"`

### P1 - Important

4. **Change critical MCP logs from DEBUG to INFO**
   - File: `auto-configure.ts:58,65,75,82`
   - Users should see MCP operations by default

5. **Log errors in silent catch blocks**
   - File: `packages/mcp-config/src/detect.ts:112-114`
   - File: `packages/mcp-config/src/write.ts:156-158`

6. **Add "View Logs" button to success notification**
   - Helps users verify what happened

### P2 - Nice to Have

7. **Show config content in Output channel after write**
8. **Add command to re-validate all configured clients**
9. **Differentiate project-level vs global Cursor configs in UI**

---

## Verification Steps (For After Fix)

To confirm the fix works:

1. Delete existing MCP config files:
   ```bash
   rm ~/.cursor/mcp.json
   rm ~/Library/Application\ Support/Claude/claude_desktop_config.json
   ```

2. Open VS Code with SnapBack extension

3. Open Output panel → Select "SnapBack"

4. Click "Configure for IDE" in dashboard

5. Select Cursor, click Configure

6. **Verify in Output panel**:
   - See: `[MCP] Configuring Cursor at ~/.cursor/mcp.json`
   - See: `[MCP] ✓ Successfully wrote config`
   - See: `[MCP] Validation passed`

7. **Verify file exists**:
   ```bash
   cat ~/.cursor/mcp.json
   # Should show mcpServers.snapback entry
   ```

8. Restart Cursor

9. Verify SnapBack tools appear in Cursor's MCP list

---

## Code References

| Component | File | Lines |
|-----------|------|-------|
| Webview handler | `DashboardPanel.ts` | 276-278, 310-313 |
| Command registration | `auto-configure.ts` | 198-239 |
| Multi-client config | `auto-configure.ts` | 126-174 |
| Detection logic | `mcp-config/detect.ts` | 85-132 |
| Write logic | `mcp-config/write.ts` | 141-181 |
| Validate (unused) | `mcp-config/write.ts` | 309-345 |
| Logger | `utils/logger.ts` | 1-346 |

---

## Conclusion

The MCP auto-configuration **does work correctly** - files are written with proper content. However, the **trust experience is broken**:

1. Zero logging means users can't verify anything happened
2. No post-write validation means "success" isn't actually verified
3. Debug-level logs are invisible by default
4. Success messages don't include file paths

This is a **presentation problem, not a functionality problem**. The fix is straightforward: add logging, call `validateConfig()`, and include paths in messages.

**Estimated Fix Time**: 2-3 hours for P0 items.
