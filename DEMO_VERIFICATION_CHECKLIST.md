# SnapBack YC Demo Manual Verification Checklist

**Date:** `_________`
**Tester:** `_________`
**Build:** `_________`
**Environment:** `_________`

This checklist must be completed before the YC demo. All items must pass.

---

## ✅ Pre-Demo Setup (5 minutes)

- [ ] **Fresh VS Code instance launched** (no other extensions)
- [ ] **Extension installed from VSIX** (not from dev mode)
- [ ] **Test workspace created** with sample files
- [ ] **No previous .snapback data** in workspace
- [ ] **Extension activated successfully** within 2 seconds
- [ ] **Welcome screen displayed** on first activation
- [ ] **Status bar item visible** with SnapBack icon

---

## ✅ Demo Flow 1: Protection Levels (3 minutes)

### WATCH Level (Silent Auto-Snapshot)

- [ ] **Create test.ts file** with initial content
- [ ] **Right-click → Set Protection: Watch (Silent) 🟢**
- [ ] **Green indicator appears** in file explorer
- [ ] **Edit file** - add 5 lines of code
- [ ] **Save file** (Cmd+S / Ctrl+S)
- [ ] **Save completes in <100ms** (no noticeable delay)
- [ ] **No dialog shown** (silent operation confirmed)
- [ ] **Snapshot created** (visible in SnapBack tree view)

**Performance Check:**
- [ ] Save overhead: `___ms` (must be <100ms)

### WARN Level (Confirmation Dialog)

- [ ] **Change protection to WARN** (yellow indicator)
- [ ] **Edit file** - add more code
- [ ] **Save file**
- [ ] **Dialog appears** within 300ms
- [ ] **Click "Create Snapshot & Continue"**
- [ ] **File saves successfully**
- [ ] **Snapshot created** with WARN marker

**Performance Check:**
- [ ] Dialog appearance: `___ms` (must be <300ms)

### BLOCK Level (Required Note)

- [ ] **Change protection to BLOCK** (red indicator)
- [ ] **Edit file** - add critical code
- [ ] **Save file**
- [ ] **Dialog with note field appears**
- [ ] **Enter justification:** "Testing API key rotation"
- [ ] **Click "Create Snapshot & Continue"**
- [ ] **Snapshot created with note** visible in UI

**Performance Check:**
- [ ] Total block flow: `___ms` (must be <300ms)

---

## ✅ Demo Flow 2: Snapshot & Restore (2 minutes)

### Create Multiple Snapshots

- [ ] **Make 3 distinct edits** to test.ts
- [ ] **Save after each edit** (3 snapshots total)
- [ ] **All snapshots visible** in tree view
- [ ] **Snapshots show correct timestamps**
- [ ] **Snapshots show file diffs** on hover

### Restore Previous Snapshot

- [ ] **Right-click snapshot** from 2 edits ago
- [ ] **Click "Restore This Snapshot"**
- [ ] **Diff view opens** showing changes
- [ ] **Click "Restore"** in diff view
- [ ] **File reverts to previous state** instantly
- [ ] **Current content matches** snapshot exactly

**Performance Check:**
- [ ] Restore time: `___ms` (must be <200ms)

---

## ✅ Demo Flow 3: AI Detection (2 minutes)

### AI Presence Detection

- [ ] **Open Extensions panel**
- [ ] **Check for GitHub Copilot** (or any AI assistant)
- [ ] **SnapBack detects AI presence** (visible in status bar)
- [ ] **Create new file** ai-test.ts
- [ ] **Trigger AI completion** (if available)
- [ ] **Accept AI suggestion**
- [ ] **Save file**
- [ ] **Snapshot marked with AI indicator** 🤖

### Burst Pattern Detection

- [ ] **Rapidly insert 5 lines** (simulate AI burst)
- [ ] **Timing: <500ms between insertions**
- [ ] **SnapBack detects burst pattern**
- [ ] **Session marked as AI-assisted**

**Performance Check:**
- [ ] AI detection overhead: `___ms` (must be <10ms)

---

## ✅ Demo Flow 4: Session Tracking (2 minutes)

### Multi-File Session

- [ ] **Create 3 files:** auth.ts, api.ts, types.ts
- [ ] **Set all to WATCH level**
- [ ] **Edit all 3 files** within 2 minutes
- [ ] **Save all files**
- [ ] **Wait 2 minutes** (session timeout)
- [ ] **Session finalized** automatically
- [ ] **Session appears in Session tree view**
- [ ] **Session shows all 3 files**
- [ ] **Click session** → shows all files in diff view

**Performance Check:**
- [ ] Session finalization: `___ms` (must be <100ms avg)

---

## ✅ Demo Flow 5: Team Configuration (1 minute)

### .snapbackrc File

- [ ] **Create .snapbackrc** in workspace root
- [ ] **Add rule:** `**/*.env` → BLOCK level
- [ ] **Create .env file**
- [ ] **File automatically protected** with BLOCK level
- [ ] **Red indicator appears** instantly
- [ ] **Edit .env file** → requires justification note

**Config Example:**
```json
{
  "version": "1.0",
  "protectionRules": [
    {
      "pattern": "**/*.env",
      "level": "block",
      "reason": "Environment files contain secrets"
    }
  ]
}
```

---

## ✅ Edge Cases & Error Handling (2 minutes)

### Large File Handling

- [ ] **Create 10KB file** (long-file.ts)
- [ ] **Set WATCH protection**
- [ ] **Save file**
- [ ] **Snapshot created in <200ms**

### Rapid Protection Changes

- [ ] **Toggle protection levels** 10 times rapidly
- [ ] **No UI lag or freezing**
- [ ] **All changes apply correctly**

### Missing Dependencies

- [ ] **Check if better-sqlite3 available**
- [ ] **If missing:** Extension falls back gracefully
- [ ] **Filesystem storage works** as backup

### Network Offline

- [ ] **Disable network**
- [ ] **Extension continues working** (offline mode)
- [ ] **All local operations function** normally

---

## ✅ Performance Budgets (Overall)

All performance budgets must pass:

| Operation | Budget | Actual | Status |
|-----------|--------|--------|--------|
| Extension activation | <2000ms | `___ms` | ☐ |
| First snapshot | <500ms | `___ms` | ☐ |
| WATCH save overhead | <100ms | `___ms` | ☐ |
| WARN dialog | <300ms | `___ms` | ☐ |
| BLOCK flow | <300ms | `___ms` | ☐ |
| Snapshot restore | <200ms | `___ms` | ☐ |
| AI detection | <10ms | `___ms` | ☐ |
| Session finalization | <100ms | `___ms` | ☐ |
| Tree refresh | <100ms | `___ms` | ☐ |

---

## ✅ UI/UX Validation

### Visual Elements

- [ ] **All icons render correctly** (🟢🟡🔴)
- [ ] **Status bar shows correct state**
- [ ] **Tree views populate** with data
- [ ] **Diff views display** file changes
- [ ] **Notifications appear** appropriately
- [ ] **No console errors** (check DevTools)

### Accessibility

- [ ] **Commands have clear titles**
- [ ] **Keyboard shortcuts work**
- [ ] **Screen reader compatible** (if applicable)

---

## ✅ Demo Presentation Checks

### Setup

- [ ] **Screen recording ready**
- [ ] **Demo workspace prepared**
- [ ] **Extensions panel closed** (focus on SnapBack)
- [ ] **No distracting notifications**
- [ ] **Font size readable** (at least 16pt)

### Narrative Flow

- [ ] **Opening hook prepared** ("Code breaks. SnapBack.")
- [ ] **Protection levels demo** rehearsed
- [ ] **AI detection demo** rehearsed
- [ ] **Restore flow** rehearsed
- [ ] **Closing pitch** prepared

### Timing

- [ ] **Total demo length:** 2-3 minutes
- [ ] **No awkward pauses**
- [ ] **Smooth transitions**

---

## ✅ Risk Mitigation

### Backup Plans

- [ ] **Backup VSIX available** (in case of installation issues)
- [ ] **Demo video recorded** (as fallback)
- [ ] **Screenshots prepared** (for slides)
- [ ] **Test workspace backed up**

### Known Issues

List any known issues and workarounds:

1. `_______________________________`
2. `_______________________________`
3. `_______________________________`

---

## ✅ Final Sign-Off

**All items above verified:** ☐ YES ☐ NO

**Issues found:** `_______________________________`

**Demo confidence level:**
- ☐ 98%+ (Ready for demo)
- ☐ 90-97% (Minor tweaks needed)
- ☐ <90% (Not ready, needs work)

**Tester signature:** `_______________________`

**Date/Time:** `_______________________`

---

## 📝 Notes

Use this space for any additional observations:

```
_____________________________________________
_____________________________________________
_____________________________________________
_____________________________________________
```

---

**Once all items pass, proceed to demo recording preparation.**
