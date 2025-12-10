# Manual Verification Checklist

**Purpose:** Verify P0 telemetry events are emitted correctly in real VS Code environment
**Last Updated:** 2025-12-10
**Status:** Ready for manual testing

---

## 🧪 Pre-Test Setup

### 1. Clean State
```bash
# Clear VS Code global state (optional - to simulate first-time user)
# macOS:
rm -rf ~/Library/Application\ Support/Code/User/globalStorage/snapback-oss.snapback-vscode

# Linux:
rm -rf ~/.config/Code/User/globalStorage/snapback-oss.snapback-vscode

# Windows:
# Delete: %APPDATA%\Code\User\globalStorage\snapback-oss.snapback-vscode
```

### 2. Build Extension
```bash
cd /Users/user1/WebstormProjects/SnapBack-Site
pnpm --filter snapback-vscode build
```

### 3. Open VS Code Extension Development Host
- Press F5 in VS Code
- Or: Run > Start Debugging

---

## ✅ Test Case 1: Auth Completion Tracking

### Expected Event: `auth.flow_completed`

**Steps:**
1. Open Extension Development Host
2. Open Command Palette (`Cmd+Shift+P`)
3. Run: `SnapBack: Sign In`
4. Complete authentication flow

**Expected Telemetry Event:**
```json
{
  "event": "auth.flow_completed",
  "properties": {
    "provider": "oauth",
    "user_id": "<your-user-id>",
    "total_duration_ms": <number>,
    "is_first_auth": true
  },
  "timestamp": <unix-timestamp>
}
```

**Verification:**
- [ ] Event appears in PostHog dashboard
- [ ] `is_first_auth` is `true` for first auth
- [ ] `user_id` matches authenticated user
- [ ] `total_duration_ms` is reasonable (2-10 seconds)

**Where to Check:**
- VS Code Developer Tools Console: `Help > Toggle Developer Tools`
- Look for: `✅ Auth completion telemetry tracked`
- PostHog Dashboard: Filter by `event = "auth.flow_completed"`

---

## ✅ Test Case 2: First Snapshot Milestone

### Expected Event: `milestone.first_snapshot`

**Steps:**
1. Ensure you're authenticated (Test Case 1)
2. Create a new file or open existing file: `test.ts`
3. Add file to protection: `SnapBack: Add Current File to Protection`
4. Make an edit and save (Cmd+S)

**Expected Telemetry Event:**
```json
{
  "event": "milestone.first_snapshot",
  "properties": {
    "time_since_activation_ms": <number>,
    "trigger": "auto",  // or "manual" for warn/block levels
    "file_type": ".ts",
    "protection_level": "watch"
  },
  "timestamp": <unix-timestamp>
}
```

**Verification:**
- [ ] Event appears in PostHog dashboard
- [ ] `time_since_activation_ms` is reasonable (<60000 for testing)
- [ ] `trigger` matches protection level (watch=auto, warn/block=manual)
- [ ] `file_type` matches file extension
- [ ] Event only emitted ONCE (check GlobalState flag)

**Where to Check:**
- VS Code Developer Tools Console
- Look for: `✅ First snapshot milestone tracked`
- PostHog Dashboard: Filter by `event = "milestone.first_snapshot"`

---

## ✅ Test Case 3: Returning User (No Duplicate Milestones)

### Expected: Auth event emitted, but NO first snapshot milestone

**Steps:**
1. Complete Test Cases 1 and 2
2. Reload VS Code window (`Cmd+R` in Extension Development Host)
3. Create another snapshot

**Expected Behavior:**
- [ ] NO `milestone.first_snapshot` event emitted (already tracked)
- [ ] GlobalState flag `snapback.hasCreatedFirstSnapshot` is `true`

**Verification:**
```javascript
// In VS Code Developer Tools Console:
const globalState = vscode.extensions.getExtension('snapback-oss.snapback-vscode').exports.context.globalState;
globalState.get('snapback.hasCreatedFirstSnapshot'); // Should be true
```

---

## ✅ Test Case 4: Error Boundary (Fail-Open)

### Expected: Save proceeds even if SnapBack errors

**Steps:**
1. Add a protected file
2. Intentionally cause an error (e.g., disconnect network, corrupt storage)
3. Make an edit and save

**Expected Behavior:**
- [ ] Warning message shown: "SnapBack encountered an error but your save will proceed"
- [ ] File save completes successfully (fail-open strategy)
- [ ] Error logged in Developer Tools Console
- [ ] No `CancellationError` thrown (unless user explicitly cancels)

**Where to Check:**
- VS Code Developer Tools Console
- Look for: `Unexpected error in protected file save handler`

---

## 📊 PostHog Dashboard Verification

### Dashboard Filters to Use

**1. Activation Funnel:**
```
Events:
1. extension.activated
2. auth.flow_completed
3. milestone.first_snapshot

Filters:
- Time range: Last 24 hours
- User property: is_first_auth = true
```

**2. Time To First Value (TTFV):**
```
Event: milestone.first_snapshot
Property: time_since_activation_ms
Aggregation: Average
```

**3. Protection Level Distribution:**
```
Event: milestone.first_snapshot
Property: protection_level
Breakdown: By value (watch/warn/block)
```

---

## 🐛 Known Issues / Limitations

### 1. VS Code Extension Development Host
- GlobalState is isolated per Extension Development Host
- Use actual installed extension for realistic testing

### 2. PostHog Event Delay
- Events may take 1-5 minutes to appear in dashboard
- Check `Realtime` view in PostHog for immediate feedback

### 3. User ID Propagation
- User ID is added by TelemetryProxy automatically
- Some events may not have user_id until after auth completes

---

## ✅ Success Criteria

All tests pass if:
- [ ] `auth.flow_completed` event appears in PostHog after authentication
- [ ] `milestone.first_snapshot` event appears after first snapshot creation
- [ ] `is_first_auth` correctly tracks first-time vs returning users
- [ ] Milestone events only emit ONCE per user (duplicate prevention works)
- [ ] Error boundary allows save to proceed on errors
- [ ] All event properties match schema definitions

---

## 🚀 Next Steps After Verification

1. **Update Dashboard:** Configure PostHog dashboard with activation funnel
2. **Set Alerts:** Monitor activation rate drops or error spikes
3. **Document Findings:** Update this checklist with any issues found
4. **Deploy:** Ship extension to production if all tests pass

---

*Generated as part of TDD workflow - Phase 2 Integration Testing*
