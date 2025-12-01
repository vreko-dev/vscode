# SnapBack v1.0 - Manual Test Suite

**Tester:** **********\_\_\_**********
**Date:** **********\_\_\_**********
**Build:** Latest with Bug #7 debug logging

---

## Test Environment Setup

1. Uninstall extension: `code --uninstall-extension MarcelleLabs.snapback-vscode --force`
2. Clean install: `code --install-extension snapback-vscode-*.vsix --force`
3. Reload VS Code
4. Open Developer Console: **Help → Toggle Developer Tools → Console tab**

---

## Bug #1: Invalid Command ✅

**Expected:** No error when viewing checkpoint

**Steps:**

1. Create any file (e.g., `test.txt`)
2. Open Command Palette (Cmd+Shift+P / Ctrl+Shift+P)
3. Run "SnapBack: View Checkpoint"
4. Check console for errors containing "workbench.action.focusTimeline"

**Result:** [ ] PASS (no error) / [ ] FAIL (error in console)
**Notes:** **********\_\_\_**********

---

## Bug #2: Duplicate View ✅

**Expected:** Single "Protected Files" section in sidebar

**Steps:**

1. Open SnapBack sidebar (click SnapBack icon in Activity Bar)
2. Count how many "Protected Files" sections appear
3. Should see exactly ONE "Protected Files" section

**Result:** [ ] PASS (1 section) / [ ] FAIL (2+ sections)
**Notes:** **********\_\_\_**********

---

## Bug #3: Dialog Branding ✅

**Expected:** Restore button says "SnapBack" (capital B), not "Restore"

**Steps:**

1. Create a checkpoint (any file)
2. Modify the file
3. Right-click checkpoint in timeline → "Restore Checkpoint"
4. Check restore confirmation dialog button text

**Result:** [ ] PASS (says "SnapBack") / [ ] FAIL (says "Restore" or other)
**Notes:** **********\_\_\_**********

---

## Bug #4: Restore URI Construction 🧪 CRITICAL

**Expected:** Diff editor opens without FileSystemError

**Steps:**

1. Create file: `test.txt` with content "Hello World"
2. Create checkpoint (Cmd+Shift+P → "SnapBack: Create Checkpoint")
3. Change content to "Goodbye World"
4. Save file
5. Right-click checkpoint in timeline → "View Diff"
6. Check for FileSystemError about "untitled:" or "Unable to resolve filesystem provider"

**Result:** [ ] PASS (diff opens) / [ ] FAIL (FileSystemError)
**Error (if any):** **********\_\_\_**********
**Screenshot (if fails):** **********\_\_\_**********

---

## Bug #5: Non-Dismissing Notification 🧪 CRITICAL

**Expected:** Notification auto-dismisses after 3 seconds

**Steps:**

1. Open `.snapbackprotected` in workspace root (create if doesn't exist)
2. Add a line: `test.txt`
3. Save file (Cmd+S / Ctrl+S)
4. Watch **status bar** (bottom of VS Code window)
5. Start counting: "One thousand one, one thousand two, one thousand three"
6. Check if notification disappeared

**Result:** [ ] PASS (disappeared after ~3 sec) / [ ] FAIL (still visible or requires click)
**Notes:** **********\_\_\_**********

---

## Bug #6: Excessive Reload Notifications ✅

**Expected:** Single notification for rapid changes (debounced)

**Steps:**

1. Open `.snapbackprotected`
2. Rapidly save 5 times in quick succession (Cmd+S x5, rapid fire)
3. Count how many "Protection settings reloaded" notifications appear
4. Should see 1-2 notifications max (not 5)

**Result:** [ ] PASS (1-2 notifications) / [ ] FAIL (5 notifications)
**Notes:** **********\_\_\_**********

---

## Bug #7: Protection State Corruption 🚨 CRITICAL

**Expected:** All files maintain their Block level (no state corruption)

### Test 7A: Basic State Persistence

**Steps:**

1. Create 3 test files:

    - `fileA.txt` (content: "File A")
    - `fileB.txt` (content: "File B")
    - `fileC.txt` (content: "File C")

2. **Set fileA to Block:**

    - Right-click `fileA.txt` in Explorer
    - SnapBack Protection → Block (Required)
    - **WAIT 2 SECONDS**
    - **Check Developer Console** for debug logs
    - Note the output

3. **Set fileB to Block:**

    - Right-click `fileB.txt` in Explorer
    - SnapBack Protection → Block (Required)
    - **Check Developer Console** for debug logs
    - Look for any changes to fileA's state

4. **Verify in UI:**
    - Open SnapBack sidebar → Protected Files section
    - Check protection icons for fileA and fileB
    - Both should show 🛡️ (Block icon)

**Console Logs to Capture:**

```
=== DEBUG: setProtectionLevelQuick START ===
[DEBUG] Target file: ...
[DEBUG] Current protected files: ...
[DEBUG] All protected files after update: ...
=== DEBUG: setProtectionLevelQuick END ===
```

**Result:**

-   [ ] PASS: Both fileA and fileB show Block level in UI
-   [ ] FAIL: fileA reverted to Watch (👁️) or Warn (⚠️) level

**Console Logs (paste here):**

```
[Paste console output from both operations]
```

### Test 7B: Fresh File Edge Case

**Steps:** 5. **Set fileC to Block** (fresh file, never protected before):

-   Right-click `fileC.txt` in Explorer
-   SnapBack Protection → Block (Required)
-   **Check Developer Console**

6. **Verify all three files:**
    - Check SnapBack sidebar → Protected Files
    - All three files should be at Block level
    - Look for any state changes in console logs

**Result:** [ ] PASS (all 3 at Block) / [ ] FAIL (fileA or fileB changed)
**Notes:** **********\_\_\_**********

### Test 7C: Rapid Sequential Changes

**Steps:** 7. Create 5 more files: `rapid1.txt` through `rapid5.txt` 8. Rapidly set all 5 to Block level (no waiting between) 9. Check if all 5 maintain Block level 10. Check if original fileA, fileB, fileC still at Block

**Result:** [ ] PASS (all 8 files at Block) / [ ] FAIL (some reverted)
**Notes:** **********\_\_\_**********

---

## Summary

**Passing Tests:** **_ / 7
**Failing Tests:** _** / 7

### Critical Failures (blockers for v1.0 release):

-   [ ] Bug #4 (Restore/Diff broken - prevents core functionality)
-   [ ] Bug #5 (Persistent notification - poor UX)
-   [ ] Bug #7 (Data corruption - protection state unreliable)

### Recommendation:

-   [ ] ✅ **SHIP v1.0** (7/7 passing, all critical bugs fixed)
-   [ ] ⚠️ **SHIP WITH KNOWN ISSUES** (6/7 passing, document failures in release notes)
-   [ ] ❌ **DO NOT SHIP** (critical bugs failing, need fixes first)

**Rationale:** **********\_\_\_**********

---

## Debug Analysis (Bug #7 Only)

If Bug #7 failed, analyze the console logs:

### Questions to Answer:

1. **Does the state change happen during `updateProtectionLevel`?**

    - Compare "Before updateProtectionLevel" vs "After updateProtectionLevel"

2. **Does the state change happen during `refresh()`?**

    - Compare "After updateProtectionLevel" vs final state in UI

3. **Are protection levels stored correctly in registry?**

    - Check "All protected files after update" JSON output

4. **Is there a timing/race condition?**
    - Do rapid changes cause more corruption than slow changes?

### Paste Full Console Output Here:

```
[Full console output from failed Bug #7 test]
```

### Root Cause Hypothesis:

---

### Recommended Fix:

---

---

## Sign-off

**Tester Signature:** **********\_\_\_**********
**Date:** **********\_\_\_**********
**Ready for Production:** [ ] YES / [ ] NO

---

## Appendix: Quick Commands

**Uninstall extension:**

```bash
code --uninstall-extension MarcelleLabs.snapback-vscode --force
```

**Package extension:**

```bash
npm run package
# or
vsce package
```

**Install local VSIX:**

```bash
code --install-extension snapback-vscode-1.0.0.vsix --force
```

**View logs in real-time:**

1. Help → Toggle Developer Tools
2. Console tab
3. Filter: "DEBUG" or "SnapBack"
