# Manual Test for Bug #3: Checkpoint Timing

## Test Objective

Verify that checkpoints capture PRE-save content (old version), not POST-save content (new version).

## Test Setup

1. Open VSCode with SnapBack extension loaded
2. Create a new file: `test-checkpoint-timing.txt`
3. Add initial content: `VERSION_1`
4. Save the file (Cmd/Ctrl+S)

## Test Execution

### Step 1: Protect the file

-   Right-click file in explorer
-   Select "Set Protection Level" → "Watch"
-   Verify file appears in SnapBack tree view with 🧢 icon

### Step 2: Edit and save

-   Open `test-checkpoint-timing.txt`
-   Change content from `VERSION_1` to `VERSION_2`
-   **DO NOT SAVE YET**
-   Note: At this point, disk has "VERSION_1", document has "VERSION_2"

### Step 3: Save and observe checkpoint creation

-   Press Cmd/Ctrl+S to save
-   You should see brief notification: "🧢 Checkpoint: test-checkpoint-timing.txt"
-   Wait 2 seconds for checkpoint to complete

### Step 4: Verify checkpoint captured PRE-save content

This is the CRITICAL test.

**Method A: Check checkpoint storage directly**

```bash
# Navigate to checkpoint storage
cd .snapback/checkpoints/

# List checkpoints (sorted by time)
ls -lt

# View the most recent checkpoint
# (It should be a file or folder with timestamp)
# Examine its contents - should contain "VERSION_1"
```

**Method B: Restore and verify**

-   Edit file to `VERSION_3`
-   Save file
-   In SnapBack view, click "Restore" (SnapBack button)
-   Select the checkpoint you created
-   After restore, file should contain `VERSION_2`, NOT `VERSION_3`

## Expected Results

✅ **PASS Criteria:**

1. Checkpoint notification appears immediately on save
2. Checkpoint storage contains `VERSION_1` (pre-save content)
3. After editing to `VERSION_3` and restoring, file has `VERSION_2`

❌ **FAIL Criteria:**

1. Checkpoint contains `VERSION_2` (post-save content)
2. After editing to `VERSION_3` and restoring, file has `VERSION_3`
3. No checkpoint created at all

## Code Flow Verification

During the test, you can add console logging to verify:

```typescript
// In operationCoordinator.ts, line 619, add:
console.log("[CHECKPOINT DEBUG] Reading from disk:", batchFile.file);
const content = await readFile(batchFile.file, "utf-8");
console.log("[CHECKPOINT DEBUG] Content captured:", content.substring(0, 50));
```

This should show it's reading "VERSION_1" from disk when you save "VERSION_2".

## Root Cause Analysis

**Why the old code failed:**

```typescript
// OLD CODE (BROKEN):
setTimeout(async () => {
	await createCheckpointForFile(filePath, filename);
}, 300); // ← 300ms delay!

// This allowed the save to complete first:
// 1. onWillSaveTextDocument fires
// 2. setTimeout schedules checkpoint for 300ms later
// 3. Save completes immediately, writes "VERSION_2" to disk
// 4. 300ms later, checkpoint reads from disk
// 5. Disk now has "VERSION_2" ← WRONG!
```

**Why the new code works:**

```typescript
// NEW CODE (FIXED):
await createCheckpointForFile(filePath, filename);
// No setTimeout!

// This blocks the save:
// 1. onWillSaveTextDocument fires
// 2. event.waitUntil() blocks save
// 3. Checkpoint reads from disk IMMEDIATELY
// 4. Disk still has "VERSION_1" ← CORRECT!
// 5. Checkpoint completes
// 6. Save proceeds, writes "VERSION_2" to disk
```

## Test Results

**Date Tested**: ********\_********
**Tester**: ********\_********

**Result**: ☐ PASS ☐ FAIL

**Notes**:

---

---

---

**Checkpoint Content Captured**: ********\_********
**Expected**: VERSION_1
**Actual**: ********\_********

**Restore Test Result**: ********\_********
**Expected**: VERSION_2 (after editing to VERSION_3)
**Actual**: ********\_********
