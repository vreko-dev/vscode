# SnapBack Extension - Comprehensive Fix & Refactor

## 🎯 Mission

Fix all identified bugs AND refactor design tokens and terminology for consistency. Execute changes systematically across the codebase.

## 📋 Changes Overview

### Quick Visual Guide: Emoji Usage

**🧢 Blue Cap** = SnapBack Brand (Menu Items)

-   "🧢 Create Snapshot"
-   "🧢 Protect File"
-   "🧢 Snap Back"

**🟢 Green Circle** = Watch Level (Safe to proceed)

-   Least restrictive, just monitoring
-   "🟢 config.json (Watch)"

**🟡 Yellow Circle** = Warn Level (Caution)

-   Medium protection, warns before save
-   "🟡 package.json (Warn)"

**🔴 Red Circle** = Block Level (STOP)

-   Maximum protection, blocks saves
-   "🔴 .env (Block)"

---

### Changes Summary

### Critical Bug Fixes (2)

1. ~~Tree View Refresh Not Triggered~~
2. ~~Snapshot Data Retrieval Issue~~

### Refactoring (2)

3. Design Token Consolidation (Emoji → Colors)
4. Terminology Unification (Checkpoint → Snapshot)

### Polish (2)

5. Context Update for Welcome View
6. Remove Redundant Event Listeners

---

## 🔧 PHASE 1: Critical Bug Fixes (P0)

### ~~Fix #1: Add Tree View Refresh After Protection Changes~~

**File:** `src/extension.ts`
**Line:** ~175-195 (in the `onProtectionChanged` listener)

**Current Code:**
``typescript
const protectionChangeListener = phase2Result.protectedFileRegistry.onProtectionChanged(async (uris) => {
// Update the file protection context for the active editor
const activeEditor = vscode.window.activeTextEditor;
if (activeEditor) {
await updateFileProtectionContext(activeEditor.document.uri);
}
// Also update context manager for protection state changes
if (activeEditor) {
const activeFilePath = activeEditor.document.uri.fsPath;
if (uris.some(uri => uri.fsPath === activeFilePath)) {
await snapbackContextManager.onProtectionStateChanged(activeFilePath);
}
}
// MISSING: refreshViews() call
});

```

**Fixed Code:**
``typescript
const protectionChangeListener = phase2Result.protectedFileRegistry.onProtectionChanged(async (uris) => {
    // Update the file protection context for the active editor
    const activeEditor = vscode.window.activeTextEditor;
    if (activeEditor) {
        await updateFileProtectionContext(activeEditor.document.uri);
    }
    // Also update context manager for protection state changes
    if (activeEditor) {
        const activeFilePath = activeEditor.document.uri.fsPath;
        if (uris.some(uri => uri.fsPath === activeFilePath)) {
            await snapbackContextManager.onProtectionStateChanged(activeFilePath);
        }
    }

    // ✅ ADD THIS: Refresh all tree views when protection changes
    refreshViews();

    // ✅ ADD THIS: Update hasProtectedFiles context for welcome view
    await updateHasProtectedFilesContext();
});
```

**Action Steps:**

1. Open `src/extension.ts`
2. Find the `onProtectionChanged` listener (around line 175-195)
3. Add the two lines marked with ✅
4. Save file

---

### ~~Fix #2: Improve Snapshot File Extraction~~

**File:** `src/services/snapshotSummaryProvider.ts` (or similar)
**Method:** `extractFiles()`

**Current Code:**
``typescript
private extractFiles(checkpoint: Checkpoint): string[] {
const files = checkpoint.meta?.files;
if (Array.isArray(files)) {
return files.map((f) => f.toString());
}
return [];
}

```

**Fixed Code:**
``typescript
private extractFiles(snapshot: Snapshot): string[] {
    const files = snapshot.meta?.files;
    if (Array.isArray(files)) {
        // Ensure proper handling of file paths
        return files
            .map((f) => {
                // Handle both string and object file entries
                if (typeof f === 'string') {
                    return f;
                }
                // If file is an object with a path property
                if (f && typeof f === 'object' && 'path' in f) {
                    return String(f.path);
                }
                // Fallback to string conversion
                return String(f);
            })
            .filter(f => f.length > 0); // Remove empty strings
    }
    return [];
}
```

**Action Steps:**

1. Open `src/services/snapshotSummaryProvider.ts`
2. Find the `extractFiles()` method
3. Replace entire method with fixed version
4. Note: Also changed `checkpoint` parameter to `snapshot` (terminology fix)
5. Save file

---

## 🎨 PHASE 2: Design Token Refactor (Emojis)

### Emoji Mapping Strategy

**OLD (Hats for Protection Levels):**

-   🧢 (blue cap) = Watch
-   👷 (construction worker) = Warn
-   ⛑️ (rescue helmet) = Block

**NEW (Colors for Protection Levels):**

-   🟢 (green circle) = Watch (safe to proceed, least protective, monitoring only)
-   🟡 (yellow circle) = Warn (caution, medium protection, warns before save)
-   🔴 (red circle) = Block (STOP, maximum protection, blocks saves)

**NEW (Brand Identifier for Menus):**

-   🧢 (blue cap) = Use in **top-level menu items** to differentiate SnapBack commands from other extensions
    -   Example: "🧢 Create Snapshot", "🧢 Protect File", "🧢 View Protected Files"
    -   Makes SnapBack commands instantly recognizable in Command Palette and context menus
    -   NOT used for protection levels, only for command identification

**Extension Icon:**

-   Separate icon file for extension itself (already exists)
-   Used in Extensions panel, Activity Bar, etc.

### Files to Update (Systematic Search & Replace)

#### Step 1: Find All Emoji Usage

```bash
# Find all files with hat emojis
grep -rn "🧢\|👷\|⛑️" src/ --include="*.ts" --include="*.tsx"

# Expected files:
# - src/views/ProtectedFilesTreeProvider.ts
# - src/services/ProtectedFileRegistry.ts
# - src/handlers/SaveHandler.ts
# - Any UI notification messages
```

#### Step 2: Replace Emojis by Protection Level

**File:** `src/views/ProtectedFilesTreeProvider.ts`

**Find and Replace:**
``typescript
// OLD
getIcon(level: ProtectionLevel): string {
switch (level) {
case 'watch': return '🧢';
case 'warn': return '👷';
case 'block': return '⛑️';
default: return '🧢';
}
}

// NEW
getIcon(level: ProtectionLevel): string {
switch (level) {
case 'watch': return '🟢'; // Green = safe, go ahead
case 'warn': return '🟡'; // Yellow = caution
case 'block': return '🔴'; // Red = stop, blocked
default: return '🟢';
}
}

````

**File:** `src/handlers/SaveHandler.ts` (and other notification messages)

**Find all protection level notification messages and update:**
```typescript
// OLD (using hat emojis for protection levels)
vscode.window.showWarningMessage(`🧢 ${filename} is protected at WATCH level`);
vscode.window.showWarningMessage(`👷 ${filename} is protected at WARN level`);
vscode.window.showErrorMessage(`⛑️ ${filename} is protected at BLOCK level`);

// NEW (using color emojis for protection levels)
vscode.window.showInformationMessage(`🟢 ${filename} is protected at WATCH level`);
vscode.window.showWarningMessage(`🟡 ${filename} is protected at WARN level`);
vscode.window.showErrorMessage(`🔴 ${filename} is protected at BLOCK level`);
````

**For general SnapBack notifications (not protection-specific):**

```typescript
// Use 🧢 to brand general SnapBack actions
vscode.window.showInformationMessage(`🧢 Snapshot created successfully`);
vscode.window.showInformationMessage(`🧢 File protection updated`);

// But use colors for protection-specific messages
vscode.window.showWarningMessage(
	`🟡 This file is protected. Create snapshot before saving?`
);
```

**Rule of thumb:**

-   **Protection level status** = Use colors (🔴🟡🟢)
-   **General SnapBack actions** = Use 🧢 for brand recognition

**File:** `src/services/ProtectedFileRegistry.ts`

**Update any logging or status messages:**

```
// Find all occurrences of hat emojis and replace with colors
// Using the same mapping: 🧢 → 🔴, 👷 → 🟡, ⛑️ → 🟢
```

#### Step 3: Update Command Titles in package.json

**File:** `package.json`

**Protection Level Commands (use color emojis):**

```json
{
  "command": "snapback.setWatchLevel",
  "title": "Set to 🟢 Watch Level",
  "category": "SnapBack"
},
{
  "command": "snapback.setWarnLevel",
  "title": "Set to 🟡 Warn Level",
  "category": "SnapBack"
},
{
  "command": "snapback.setBlockLevel",
  "title": "Set to 🔴 Block Level",
  "category": "SnapBack"
}
```

**Top-Level Commands (use 🧢 for brand recognition):**

```json
{
  "command": "snapback.createSnapshot",
  "title": "🧢 Create Snapshot",
  "category": "SnapBack"
},
{
  "command": "snapback.protectFile",
  "title": "🧢 Protect File",
  "category": "SnapBack"
},
{
  "command": "snapback.snapBack",
  "title": "🧢 Snap Back",
  "category": "SnapBack"
},
{
  "command": "snapback.showAllProtectedFiles",
  "title": "🧢 Show Protected Files",
  "category": "SnapBack"
}
```

**Why this works:**

-   🧢 makes SnapBack commands instantly recognizable in Command Palette
-   Helps users differentiate SnapBack from other extensions in crowded menus
-   Colors (🔴🟡🟢) clearly communicate protection level hierarchy
-   Two-tier emoji system: Brand (🧢) + Status (🔴🟡🟢)

#### Step 4: Update Documentation Comments

**Search all files for emoji references in comments:**

```bash
grep -rn "🧢\|👷\|⛑️\|blue cap\|construction\|rescue helmet" src/ --include="*.ts"
```

**Replace all documentation:**

```typescript
// OLD
/**
 * Protection levels:
 * - 🧢 Watch: Monitor only
 * - 👷 Warn: Warn before save
 * - ⛑️ Block: Block save
 */

// NEW
/**
 * Protection levels (color-coded like traffic lights):
 * - 🟢 Watch: Monitor only (green = safe, go ahead)
 * - 🟡 Warn: Warn before save (yellow = caution, slow down)
 * - 🔴 Block: Block save (red = stop, protected)
 *
 * The 🧢 emoji is used for SnapBack command branding in menus.
 */
```

**Update command descriptions:**

```
// Example in command registration
vscode.commands.registerCommand('snapback.createSnapshot', async () => {
    // The 🧢 in the title (package.json) helps users identify SnapBack commands
    // in the Command Palette among many other extensions
});
```

---

## 📝 PHASE 3: Terminology Consolidation (Checkpoint → Snapshot)

### Strategy

Replace ALL instances of "checkpoint" with "snapshot" to create a single, consistent terminology path.

### Why This Matters

-   Prevents confusion between "checkpoint" and "snapshot"
-   Simplifies user mental model
-   Reduces duplicate code paths
-   Makes documentation clearer

### Files Requiring Terminology Changes

#### Step 1: Identify All Files with "Checkpoint"

```bash
# Find all TypeScript files containing "checkpoint" (case-insensitive)
grep -rni "checkpoint" src/ --include="*.ts" | cut -d: -f1 | sort -u

# Expected files (non-exhaustive):
# - src/services/CheckpointSummaryProvider.ts → SnapshotSummaryProvider.ts
# - src/services/CheckpointDocumentProvider.ts → SnapshotDocumentProvider.ts
# - src/types/Checkpoint.ts → Snapshot.ts
# - src/extension.ts (references)
# - Various command files
```

#### Step 2: Rename Files (Most Disruptive, Do First)

**File Renames:**

```bash
# Rename checkpoint files to snapshot files
mv src/services/CheckpointSummaryProvider.ts src/services/SnapshotSummaryProvider.ts
mv src/services/CheckpointDocumentProvider.ts src/services/SnapshotDocumentProvider.ts
mv src/types/Checkpoint.ts src/types/Snapshot.ts

# Update any test files
mv src/test/CheckpointSummaryProvider.test.ts src/test/SnapshotSummaryProvider.test.ts
```

#### Step 3: Update Type Definitions

**File:** `src/types/Snapshot.ts` (renamed from Checkpoint.ts)

```typescript
// OLD
export interface Checkpoint {
	id: string;
	timestamp: number;
	meta?: CheckpointMeta;
}

export interface CheckpointMeta {
	files: string[];
	description?: string;
}

// NEW
export interface Snapshot {
	id: string;
	timestamp: number;
	meta?: SnapshotMeta;
}

export interface SnapshotMeta {
	files: string[];
	description?: string;
}
```

#### Step 4: Update Class Names

**File:** `src/services/SnapshotSummaryProvider.ts`

```typescript
// OLD
export class CheckpointSummaryProvider {
	private checkpoints: Map<string, Checkpoint[]>;

	async getCheckpointsForFile(filePath: string): Promise<Checkpoint[]> {
		// ...
	}
}

// NEW
export class SnapshotSummaryProvider {
	private snapshots: Map<string, Snapshot[]>;

	async getSnapshotsForFile(filePath: string): Promise<Snapshot[]> {
		// ...
	}
}
```

#### Step 5: Update All Import Statements

**Search Pattern:**

```bash
# Find all imports of old checkpoint types
grep -rn "import.*Checkpoint" src/ --include="*.ts"
```

**Update imports:**

```typescript
// OLD
import { Checkpoint, CheckpointMeta } from "./types/Checkpoint";
import { CheckpointSummaryProvider } from "./services/CheckpointSummaryProvider";

// NEW
import { Snapshot, SnapshotMeta } from "./types/Snapshot";
import { SnapshotSummaryProvider } from "./services/SnapshotSummaryProvider";
```

#### Step 6: Update Command IDs

**File:** `package.json`

```json
// OLD
{
  "command": "snapback.createCheckpoint",
  "title": "Create Checkpoint",
  "category": "SnapBack"
}

// NEW
{
  "command": "snapback.createSnapshot",
  "title": "Create Snapshot",
  "category": "SnapBack"
}
```

**File:** `src/commands/*.ts`

```typescript
// Update all command registrations
vscode.commands.registerCommand("snapback.createSnapshot", async () => {
	// Previously: snapback.createCheckpoint
});
```

#### Step 7: Update User-Facing Messages

**Find all user-facing strings:**

```bash
grep -rn "checkpoint" src/ --include="*.ts" | grep -i "show.*message\|notification"
```

**Replace in notifications:**

```
// OLD
vscode.window.showInformationMessage('Checkpoint created successfully');
vscode.window.showInformationMessage('Create Checkpoint & Save');

// NEW
vscode.window.showInformationMessage('Snapshot created successfully');
vscode.window.showInformationMessage('Create Snapshot & Save');
```

#### Step 8: Update Comments and Documentation

**Search for checkpoint in comments:**

```bash
grep -rn "checkpoint" src/ --include="*.ts" | grep "//"
grep -rn "checkpoint" src/ --include="*.ts" | grep "/\*"
```

**Update all JSDoc and inline comments:**

```
// OLD
/**
 * Creates a checkpoint of the current file state
 * @returns Checkpoint ID
 */

// NEW
/**
 * Creates a snapshot of the current file state
 * @returns Snapshot ID
 */
```

#### Step 9: Update Variable Names

**Common variable name patterns to find and replace:**

```
// OLD
const checkpoint = await createCheckpoint(filePath);
const checkpointId = checkpoint.id;
const checkpoints = await getCheckpoints();
const latestCheckpoint = checkpoints[0];

// NEW
const snapshot = await createSnapshot(filePath);
const snapshotId = snapshot.id;
const snapshots = await getSnapshots();
const latestSnapshot = snapshots[0];
```

**Use regex search in VS Code:**

```regex
Search: checkpoint([A-Z][a-zA-Z]*|s)?
Replace: snapshot$1
```

#### Step 10: Update Storage/File Paths (If Needed)

**Check if checkpoint appears in file paths:**

```bash
# Look for checkpoint in path construction
grep -rn "checkpoint" src/ --include="*.ts" | grep -i "path\|dir\|folder"
```

**Example:**

```
// OLD
const checkpointPath = path.join(snapshotsDir, `checkpoint-${id}.json`);

// NEW
const snapshotPath = path.join(snapshotsDir, `snapshot-${id}.json`);
```

**IMPORTANT:** If you're already storing files as "checkpoint-\*.json", decide whether to:

1. **Migrate:** Rename existing files (requires migration script)
2. **Keep:** Leave existing files, only change new files
3. **Both:** Support both names for backward compatibility

**Recommendation:** Keep existing checkpoint files for backward compatibility, but use "snapshot" naming for new files.

---

## 🎨 PHASE 4: Polish & Context Updates

### Fix #3: Update hasProtectedFiles Context

This is already included in Fix #1, but verify it exists:

**File:** `src/extension.ts`

**Ensure this function exists:**

```
async function updateHasProtectedFilesContext(): Promise<void> {
    const protectedFiles = await phase2Result.protectedFileRegistry.getAllProtectedFiles();
    await vscode.commands.executeCommand(
        'setContext',
        'snapback.hasProtectedFiles',
        protectedFiles.length > 0
    );
}
```

**And it's called in the protection change listener (already in Fix #1).**

---

### Fix #4: Remove Redundant Event Listener (Optional)

**File:** `src/views/ProtectedFilesTreeProvider.ts`

**Current code:**

```typescript
constructor(private readonly protectedFiles: ProtectedFileRegistry) {
    // Subscribe to protection changes for automatic refresh
    this.protectedFiles.onDidChangeProtectedFiles(() => {
        this.refresh();
    });
}
```

**Analysis:** This listener is actually GOOD and should stay because:

1. It ensures the tree refreshes when protection changes
2. The extension-level listener handles context updates
3. These serve different purposes

**Decision:** KEEP this listener. It's not redundant, it's necessary for tree refresh.

---

## 🧪 PHASE 5: Testing & Verification

### Test Plan

#### 1. Protection Level Workflow

```
Test: Protect a file at WATCH level
Expected:
  ✓ File appears in Protected Files tree with 🟢 emoji
  ✓ Context menu shows "Change Protection Level" submenu
  ✓ Tree refreshes immediately without reload

Test: Change to WARN level
Expected:
  ✓ Emoji changes to 🟡 in tree
  ✓ File protection persists after VS Code reload

Test: Change to BLOCK level
Expected:
  ✓ Emoji changes to 🔴 in tree
  ✓ Attempting to save shows error with 🔴 emoji (blocked)
```

#### 2. Snapshot Workflow

```
Test: Create snapshot
Expected:
  ✓ Snapshot appears in Snapshots tree
  ✓ User-facing messages say "Snapshot" not "Checkpoint"
  ✓ Command palette shows "Create Snapshot"

Test: Expand snapshot in tree
Expected:
  ✓ Shows list of files in snapshot
  ✓ File count matches actual files

Test: Manual merge
Expected:
  ✓ Diff editor opens successfully
  ✓ No "untitled:" URI errors
```

#### 3. Terminology Consistency

```
Test: Search codebase for "checkpoint"
Expected:
  ✓ Only appears in comments about old system
  ✓ All user-facing text says "snapshot"
  ✓ All commands use "snapshot" naming

Test: UI consistency
Expected:
  ✓ All menus say "Snapshot"
  ✓ All notifications say "Snapshot"
  ✓ All tree views say "Snapshot"
```

#### 4. Emoji Consistency

```
Test: Visual inspection
Expected:
  ✓ No hat emojis (🧢 👷 ⛑️) in protection levels (except 🧢 for command branding)
  ✓ Only color emojis (🟢 🟡 🔴) for protection levels
  ✓ Colors match traffic light semantics:
    - 🟢 Green = Watch (go, safe to proceed, least restrictive)
    - 🟡 Yellow = Warn (caution, slow down)
    - 🔴 Red = Block (stop, blocked, maximum protection)
```

### Post-Fix Checklist

```bash
# 1. Compile and check for errors
pnpm run compile

# 2. Run tests (if you have them)
pnpm run test

# 3. Rebuild extension
pnpm run package

# 4. Uninstall old version
code --uninstall-extension MarcelleLabs.snapback-vscode

# 5. Install new version
code --install-extension snapback-vscode-*.vsix --force

# 6. Restart VS Code completely
# (Close all windows, reopen)

# 7. Test each workflow above
# 8. Check Output panel for errors
# 9. Check Developer Console for warnings
```

---

---

## 🎯 Why This Two-Tier Emoji System is Brilliant

**STRONG YES on this approach** - here's why it's the perfect solution:

### The System:

1. **🧢 Blue Cap = SnapBack Brand** (Command identification in menus)
2. **🔴🟡🟢 Traffic Lights = Protection Status** (State communication)

### Why This Two-Tier System Works:

#### 🧢 for Branding (Top-Level Commands)

-   **Menu Recognition**: Users instantly spot SnapBack commands in crowded Command Palette
-   **Brand Consistency**: Single emoji across all SnapBack commands creates visual unity
-   **Differentiation**: Stands out from other extensions using different emoji patterns
-   **Examples**: "🧢 Create Snapshot", "🧢 Protect File", "🧢 Snap Back"

#### 🔴🟡🟢 for Status (Protection Levels)

-   **Traffic Light Semantics** - Universal understanding:
    -   🟢 Green = Go/Safe (Watch - monitoring only, safe to proceed)
    -   🟡 Yellow = Caution/Slow (Warn - warning, proceed with caution)
    -   🔴 Red = Stop/Danger (Block - blocked, cannot proceed)
-   **Instant Recognition** - Brain processes color faster than symbols
-   **No Learning Curve** - Users already know what traffic lights mean
-   **Professional** - Standard for status indicators in dev tools
-   **Examples**: Tree items show "🟢 config.json (Watch)", notifications say "🔴 BLOCKED: Cannot save"

### Best Practices from Other Extensions:

-   **GitLens**: Uses ✨ emoji for branding in commands
-   **GitHub Copilot**: Uses emoji consistently across commands
-   **Live Share**: Uses colored status indicators for collaboration state

### The Complete Pattern:

```
Command Palette:
├── 🧢 Create Snapshot          ← Brand emoji for recognition
├── 🧢 Protect File            ← Brand emoji for recognition
└── 🧢 Show Protected Files    ← Brand emoji for recognition

Protected Files Tree:
├── 🟢 config.json (Watch)     ← Green = safe, go ahead
├── 🟡 package.json (Warn)     ← Yellow = caution
└── 🔴 .env (Block)            ← Red = stop, blocked

Submenus:
├── Set to 🟢 Watch Level      ← Green = least restrictive
├── Set to 🟡 Warn Level       ← Yellow = medium protection
└── Set to 🔴 Block Level      ← Red = maximum protection
```

### Why Old Hat System Failed:

-   Required mental mapping (which hat = which level?)
-   Cultural confusion potential
-   Less professional for enterprise
-   Harder to remember
-   Mixed branding with status (both used hats)

### This New System Wins Because:

✅ **Clear separation**: Branding (🧢) vs Status (🟢🟡🔴)  
✅ **Universal semantics**: Everyone knows traffic lights (green=go, yellow=caution, red=stop)  
✅ **Professional**: Industry-standard color coding  
✅ **Memorable**: Blue cap = SnapBack, traffic light colors = protection intensity  
✅ **Scalable**: Easy to add more commands without confusion

---

## 📊 Summary of Changes

| Category           | Changes                       | Files Affected | Time Est.   |
| ------------------ | ----------------------------- | -------------- | ----------- |
| **Critical Bugs**  | Tree refresh, file extraction | 2 files        | 1.5 hours   |
| **Emoji Refactor** | Hats → Colors everywhere      | 5-8 files      | 1 hour      |
| **Terminology**    | Checkpoint → Snapshot         | 15-20 files    | 2 hours     |
| **Polish**         | Context updates, optimization | 2 files        | 0.5 hours   |
| **Testing**        | Full workflow verification    | All            | 1 hour      |
| **TOTAL**          |                               | ~25 files      | **6 hours** |

---

## 🚀 Execution Order

**Do in this exact order to minimize breakage:**

1. **✅ Phase 1** - Fix critical bugs first (tree refresh, file extraction)
2. **✅ Phase 3** - Terminology consolidation (checkpoint → snapshot)
    - Do file renames first
    - Then update imports
    - Then update all references
3. **✅ Phase 2** - Emoji refactor (hats → colors)
4. **✅ Phase 4** - Polish (context updates)
5. **✅ Phase 5** - Test everything

**Why this order?**

-   Fix critical bugs first so features work
-   Terminology changes affect many files, do before emoji changes
-   Emoji changes are simpler and less likely to break things
-   Polish at the end
-   Test to verify everything works together

---

## 🔍 Automated Search & Replace Commands

### Quick Wins with Find/Replace in VS Code

**Open VS Code Search (Cmd+Shift+F on Mac, Ctrl+Shift+F on Windows)**

#### Replace Emojis (Be Careful with 🧢):

**IMPORTANT**: Don't blindly replace ALL 🧢 emojis! Only replace in protection level contexts.

```
# First, manually review where 🧢 is used:
Find: 🧢
Files to include: src/**/*.ts, package.json
# Review each occurrence - keep for commands, replace for protection levels
```

**For protection level icons/status (replace these):**

```
Find: case 'watch': return '🟢';
Replace: case 'watch': return '🟢';
Files to include: src/**/*.ts
```

**For command titles in package.json (KEEP these):**
``json
// KEEP THESE - 🧢 is for branding
"title": "🧢 Create Snapshot"
"title": "🧢 Protect File"

```

**Replace other hat emojis (safe to replace all):**
```

Find: 👷
Replace: 🟡
Files to include: src/\*_/_.ts

```

```

Find: ⛑️
Replace: 🔴
Files to include: src/\*_/_.ts

```

#### Replace Terminology (Use Regex):
```

Find: \bcheckpoint([A-Z][a-zA-Z]_)\b
Replace: snapshot$1
Files to include: src/\*\*/_.ts
Options: ✓ Use Regular Expression

```

```

Find: \bCheckpoint([A-Z][a-zA-Z]_)\b
Replace: Snapshot$1
Files to include: src/\*\*/_.ts
Options: ✓ Use Regular Expression

```

#### Replace Command IDs:
```

Find: snapback\.._checkpoint._
Replace: (manually review each and change to snapshot equivalent)
Files to include: src/\*_/_.ts, package.json
Options: ✓ Use Regular Expression

````

---

## ⚠️ CRITICAL WARNINGS

1. **Backup First**: Commit your current code before starting
2. **Test After Each Phase**: Don't do all changes at once without testing
3. **Update package.json Carefully**: Command ID changes require updating all registrations
4. **File Renames Break Imports**: Update imports immediately after renaming files
5. **User Data Migration**: If snapshot storage format changes, you may need migration

---

## 💡 Final Notes

**For Claude Code users:**
You can process this prompt section by section. After each phase, run:
```bash
pnpm run compile
````

To catch TypeScript errors immediately.

**For manual execution:**
Use VS Code's multi-file search and replace (Cmd/Ctrl+Shift+F) to batch update files.

**Version control:**
Consider creating a branch for this refactor:

```bash
git checkout -b refactor/emoji-and-terminology-consolidation
```

Then you can review all changes before merging.
