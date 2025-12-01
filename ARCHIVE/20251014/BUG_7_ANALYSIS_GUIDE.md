# Bug #7 Analysis Guide

## Quick Reference: How to Diagnose the Protection State Bug

---

## 🎯 What to Look For

When you run the manual test and Bug #7 fails, you'll see console output like this. Use this guide to diagnose the root cause.

---

## Scenario 1: State Changes During Update

### Console Output Pattern:

```
=== DEBUG: setProtectionLevelQuick START ===
[DEBUG] Target file: /path/to/fileB.txt
[DEBUG] Requested level: block
[DEBUG] Current protected files: [
  {
    "path": "/path/to/fileA.txt",
    "level": "block"  ← fileA is Block
  }
]

[DEBUG] Before updateProtectionLevel: undefined
[DEBUG] After updateProtectionLevel: block

[DEBUG] All protected files after update: [
  {
    "path": "/path/to/fileA.txt",
    "level": "watch"  ← fileA changed to Watch! 🚨
  },
  {
    "path": "/path/to/fileB.txt",
    "level": "block"
  }
]
```

### Root Cause:

`updateProtectionLevel()` is corrupting OTHER files' states.

### Likely Issue:

-   Registry reload is resetting all files
-   Cache invalidation happening at wrong time
-   Storage write/read race condition

### Where to Look:

`src/services/protectedFileRegistry.ts` → `updateProtectionLevel()` method

### Recommended Fix:

```typescript
// Don't reload entire registry, just update single file
async updateProtectionLevel(filePath: string, level: ProtectionLevel) {
  // ❌ BAD: this.loadFilesFromStorage();  // Reloads ALL files

  // ✅ GOOD: Update just this file
  const existingFile = this.protectedFiles.get(filePath);
  if (existingFile) {
    existingFile.protectionLevel = level;
    await this.saveToStorage();  // Save updated state
  }
}
```

---

## Scenario 2: State Changes During Refresh

### Console Output Pattern:

```
[DEBUG] All protected files after update: [
  {
    "path": "/path/to/fileA.txt",
    "level": "block"  ← Still Block here
  },
  {
    "path": "/path/to/fileB.txt",
    "level": "block"
  }
]
=== DEBUG: setProtectionLevelQuick END ===

// Then in UI, fileA shows as Watch 🚨
```

### Root Cause:

`snapBackTreeProvider.refresh()` is reloading registry and corrupting state.

### Likely Issue:

-   TreeProvider refresh triggers registry reload
-   Race condition between storage write and UI read
-   Cache coherency problem

### Where to Look:

`src/extension.ts` → Order of operations in `setProtectionLevelQuick`

### Recommended Fix:

```typescript
// Ensure state propagates before refresh
await protectedFileRegistry.updateProtectionLevel(fileUri.fsPath, level);

// Add small delay to ensure storage write completes
await new Promise((resolve) => setTimeout(resolve, 50));

// NOW refresh UI
snapBackTreeProvider.refresh();
```

---

## Scenario 3: Fresh File Corruption

### Console Output Pattern:

```
// Setting fileC (never protected before)
=== DEBUG: setProtectionLevelQuick START ===
[DEBUG] File already protected: false
[DEBUG] File protection added

[DEBUG] All protected files after update: [
  {
    "path": "/path/to/fileA.txt",
    "level": "watch"  ← fileA corrupted when adding fileC! 🚨
  },
  {
    "path": "/path/to/fileB.txt",
    "level": "watch"  ← fileB also corrupted! 🚨
  },
  {
    "path": "/path/to/fileC.txt",
    "level": "block"
  }
]
```

### Root Cause:

`handleProtectFile()` is reloading registry with default levels.

### Likely Issue:

-   Adding new file triggers full registry reload
-   Default level (watch) being applied to ALL files
-   Storage merge conflict

### Where to Look:

`src/protection/ProtectionConfigManager.ts` → `handleProtectFile()` method

### Recommended Fix:

```typescript
async handleProtectFile(filePath: string) {
  // Don't reload registry, just add this file
  await this.configManager.addToConfig('protected', filePath);

  // Add to registry without reloading
  await this.protectedFileRegistry.addFile(filePath);
  // Don't call: await this.loadAndApplyProtection(); // This reloads ALL
}
```

---

## Scenario 4: Rapid Changes Cause Corruption

### Console Output Pattern:

```
// First file: OK
[DEBUG] All protected files: [{"path": "rapid1.txt", "level": "block"}]

// Second file: OK
[DEBUG] All protected files: [
  {"path": "rapid1.txt", "level": "block"},
  {"path": "rapid2.txt", "level": "block"}
]

// Third file: CORRUPTION 🚨
[DEBUG] All protected files: [
  {"path": "rapid1.txt", "level": "watch"},  ← Corrupted!
  {"path": "rapid2.txt", "level": "watch"},  ← Corrupted!
  {"path": "rapid3.txt", "level": "block"}
]
```

### Root Cause:

Async operations interleaving, race condition.

### Likely Issue:

-   Multiple `updateProtectionLevel()` calls running concurrently
-   Storage writes happening out of order
-   No locking mechanism

### Where to Look:

`src/services/protectedFileRegistry.ts` → Check for async/await issues

### Recommended Fix:

```typescript
private updateLock = Promise.resolve();

async updateProtectionLevel(filePath: string, level: ProtectionLevel) {
  // Serialize updates to prevent race conditions
  this.updateLock = this.updateLock.then(async () => {
    // Actual update logic here
    const file = this.protectedFiles.get(filePath);
    if (file) {
      file.protectionLevel = level;
      await this.saveToStorage();
    }
  });

  return this.updateLock;
}
```

---

## 🔍 Quick Diagnosis Checklist

Run the manual test, then check console logs:

**Question 1:** Does state corrupt DURING `updateProtectionLevel()`?

-   [ ] YES → **Scenario 1**: Registry update bug
-   [ ] NO → Go to Question 2

**Question 2:** Does state corrupt AFTER update but visible in UI?

-   [ ] YES → **Scenario 2**: Refresh race condition
-   [ ] NO → Go to Question 3

**Question 3:** Does corruption happen when adding NEW files?

-   [ ] YES → **Scenario 3**: handleProtectFile reload bug
-   [ ] NO → Go to Question 4

**Question 4:** Does corruption happen with rapid sequential changes?

-   [ ] YES → **Scenario 4**: Async race condition
-   [ ] NO → Unknown root cause (deeper investigation needed)

---

## 🛠️ Next Steps After Diagnosis

1. **Identify scenario** from console logs
2. **Apply recommended fix** for that scenario
3. **Re-run Bug #7 test** from manual suite
4. **Verify fix** with rapid changes test (Test 7C)
5. **Remove debug logging** (or comment out 🐛 lines)
6. **Ship v1.0**

---

## 📊 Expected Console Output (When Fixed)

```
=== DEBUG: setProtectionLevelQuick START ===
[DEBUG] Target file: /path/to/fileB.txt
[DEBUG] Requested level: block
[DEBUG] Current protected files: [
  {"path": "/path/to/fileA.txt", "level": "block"}
]

[DEBUG] File already protected: false
[DEBUG] File protection added
[DEBUG] Before updateProtectionLevel: undefined
[DEBUG] After updateProtectionLevel: block

[DEBUG] All protected files after update: [
  {"path": "/path/to/fileA.txt", "level": "block"},  ← Still Block ✅
  {"path": "/path/to/fileB.txt", "level": "block"}   ← New file Block ✅
]
=== DEBUG: setProtectionLevelQuick END ===

// UI shows both files at Block level ✅
```

---

## 📞 If You Need Help

If Bug #7 fails and the console output doesn't match any scenario above:

1. **Copy full console output** to a file
2. **Take screenshot** of SnapBack sidebar showing wrong protection levels
3. **Document steps** that triggered the corruption
4. **Create GitHub issue** with all above information

The debug logging should give us enough information to identify and fix the root cause.
