# SnapBack Surgical Cleanup Plan - Based on Audit Results

## 📊 Current State (From Audit)

**Implementation Completion: ~55% (11/20 features)**

**Critical Issues:**

-   🔴 **891 checkpoint references** across 46 files
-   🔴 **4 checkpoint commands** in package.json
-   🔴 **46 lowercase protection levels** across 9 files
-   🔴 **0 capitalized protection levels** (need to create)

**Missing Critical Components:**

-   ProtectionConfigManager
-   SnapshotService
-   SnapshotsTreeProvider
-   SnapBackStatusBar
-   OperationCoordinator
-   ConflictResolver
-   Test Suite
-   Storage System

---

## 🎯 Strategic Decision: Clean vs Rebuild

Given 891 checkpoint references and only 55% completion, you have two paths:

### Option A: SURGICAL CLEANUP (Recommended - 8 hours)

Fix what exists, keep working code

-   Remove 891 checkpoint references
-   Fix 46 protection level references
-   Keep 11 working features
-   Fill in 9 missing features

### Option B: TARGETED REBUILD (Nuclear - 16 hours)

Start fresh with clean architecture

-   Delete contaminated files
-   Rebuild from working snapshot-based design
-   Implement all 20 features cleanly

**I recommend Option A** - your core systems work, just need cleanup.

---

## 🔥 PHASE 1: Emergency Checkpoint Elimination (2 hours)

### Priority: Kill the Top 10 Contaminated Files

These files have the most checkpoint references and are core to functionality:

#### 1. `src/operationCoordinator.ts` - THE COORDINATOR

``bash

# Open file

code src/operationCoordinator.ts

# MANUAL ACTIONS REQUIRED:

# 1. Find all methods with "checkpoint" in name

# 2. Delete checkpoint aliases entirely OR rename to snapshot

# 3. Update all method calls throughout file

```

**Example transformation:**
``typescript
// BEFORE
async coordinateCheckpointCreation(files: string[]) {
    // ... implementation
}

async coordinateSnapshotCreation(files: string[]) {
    return this.coordinateCheckpointCreation(files); // BAD - alias
}

// AFTER (DELETE checkpoint method entirely)
async coordinateSnapshotCreation(files: string[]) {
    // ... implementation moved here
}
```

#### 2. `src/handlers/SaveHandler.ts` - SAVE INTERCEPTION

```bash
code src/handlers/SaveHandler.ts

# FIND patterns like:
# - "create checkpoint" → "create snapshot"
# - variable names: checkpoint → snapshot
# - Comments: checkpoint → snapshot
```

**Key areas:**
``typescript
// BEFORE
const action = await vscode.window.showWarningMessage(
    `Create checkpoint before saving?`,
'Create Checkpoint',
'Skip'
);

if (action === 'Create Checkpoint') {
await this.createCheckpoint(file);
}

// AFTER
const action = await vscode.window.showWarningMessage(
`Create snapshot before saving?`,
'Create Snapshot',
'Skip'
);

if (action === 'Create Snapshot') {
await this.createSnapshot(file);
}

````

#### 3. Storage Files - DATABASE/PERSISTENCE

**Files to update:**
- `src/storage/SqliteCheckpointStorage.ts` → **RENAME** to `SqliteSnapshotStorage.ts`
- `src/storage/SqliteStorageAdapter.ts`
- `src/storage/StorageErrors.ts`

```bash
# Rename the file
mv src/storage/SqliteCheckpointStorage.ts src/storage/SqliteSnapshotStorage.ts

# Open and update class name
code src/storage/SqliteSnapshotStorage.ts
````

**Update class:**
``typescript
// BEFORE
export class SqliteCheckpointStorage {
async saveCheckpoint(checkpoint: any) { }
async getCheckpoint(id: string) { }
}

// AFTER
export class SqliteSnapshotStorage {
async saveSnapshot(snapshot: any) { }
async getSnapshot(id: string) { }
}

````

#### 4. UI Components - USER-FACING

**Files:**
- `src/ui/ProtectionLevelSelector.ts`
- `src/ui/SnapshotRestoreUI.ts`

```typescript
// BEFORE (src/ui/ProtectionLevelSelector.ts)
): Promise<'checkpoint' | 'override' | 'cancel'> {
    // User can choose to create checkpoint
    const action = await vscode.window.showWarningMessage(
        'File requires checkpoint before save',
        'Create Checkpoint'
    );
    return action === 'Create Checkpoint' ? 'checkpoint' : 'cancel';
}

// AFTER
): Promise<'snapshot' | 'override' | 'cancel'> {
    // User can choose to create snapshot
    const action = await vscode.window.showWarningMessage(
        'File requires snapshot before save',
        'Create Snapshot'
    );
    return action === 'Create Snapshot' ? 'snapshot' : 'cancel';
}
````

#### 5. Package.json - COMMAND DEFINITIONS

```bash
# Open package.json
code package.json

# FIND the 4 checkpoint commands:
grep -n "checkpoint" package.json
```

**Expected results (DELETE these):**
``json
// FIND and DELETE blocks like:
{
"command": "snapback.createCheckpoint",
"title": "🧢 Create Checkpoint",
"category": "SnapBack"
}

// ENSURE these exist instead:
{
"command": "snapback.createSnapshot",
"title": "🧢 Create Snapshot",
"category": "SnapBack"
}

```

#### 6-10. Rapid Search & Replace for Remaining Files

For the other 41 files, use VS Code's multi-file search and replace:

**Open VS Code Search (Cmd/Ctrl + Shift + F)**

**Replace #1: Variable names**
```

Find: \bcheckpoint([A-Z][a-zA-Z]+)\b
Replace: snapshot$1
Files: src/\*_/_.ts
Use regex: ✓

```

**Replace #2: Method names**
```

Find: ([a-z]+)Checkpoint([A-Z])
Replace: $1Snapshot$2
Files: src/\*_/_.ts
Use regex: ✓

```

**Replace #3: User-facing strings**
```

Find: [Cc]heckpoint
Replace: Snapshot
Files: src/\*_/_.ts

```

**Replace #4: Comments**
```

Find: // ._checkpoint
Replace: (manually review each)
Files: src/\*\*/_.ts

````

### Verification After Phase 1

```bash
# Count remaining checkpoint references
grep -ri "checkpoint" src/ --include="*.ts" | wc -l
# Target: 0

# Verify no checkpoint commands
grep "checkpoint" package.json
# Target: 0 results
````

---

## 🔤 PHASE 2: Protection Level Capitalization (1 hour)

You have 46 references across 9 files. Let's fix them systematically.

### Step 1: Update Type Definition

**File:** `src/types/protection.ts`

```typescript
// BEFORE (if it looks like this)
export type ProtectionLevel = "watch" | "warn" | "block";

// AFTER
export type ProtectionLevel = "Watched" | "Warning" | "Protected";
```

### Step 2: Update Design Tokens

**File:** `src/styles/designTokens.ts`

```typescript
// BEFORE
export const protectionLevels = {
	watch: {
		icon: "🟢",
		color: "#00ff00",
	},
	warn: {
		icon: "🟡",
		color: "#ffff00",
	},
	block: {
		icon: "🔴",
		color: "#ff0000",
	},
};

// AFTER
export const protectionLevels = {
	Watched: {
		icon: "🟢",
		color: "#00ff00",
		label: "Watched",
	},
	Warning: {
		icon: "🟡",
		color: "#ffff00",
		label: "Warning",
	},
	Protected: {
		icon: "🔴",
		color: "#ff0000",
		label: "Protected",
	},
};
```

### Step 3: Update Config Defaults

**File:** `src/config/defaults.ts`

```typescript
// BEFORE
defaultProtectionLevel: 'watch',
levels: {
    watch: { enabled: true },
    warn: { enabled: true },
    block: { enabled: true }
}

// AFTER
defaultProtectionLevel: 'Watched',
levels: {
    Watched: { enabled: true },
    Warning: { enabled: true },
    Protected: { enabled: true }
}
```

### Step 4: Update SaveHandler Logic

**File:** `src/handlers/SaveHandler.ts`

```typescript
// BEFORE
switch (level) {
	case "watch":
		// Just log
		break;
	case "warn":
		// Show warning
		break;
	case "block":
		// Block save
		throw new vscode.CancellationError();
}

// AFTER
switch (level) {
	case "Watched":
		// Just log, allow save
		break;
	case "Warning":
		// Show warning dialog
		const action = await vscode.window.showWarningMessage(
			`🟡 ${filename} is protected at Warning level`,
			{ modal: true },
			"Create Snapshot & Save",
			"Save Anyway",
			"Cancel"
		);
		if (action === "Create Snapshot & Save") {
			await this.createSnapshot(filePath);
		} else if (!action || action === "Cancel") {
			throw new vscode.CancellationError();
		}
		break;
	case "Protected":
		// Block save completely
		const blockAction = await vscode.window.showErrorMessage(
			`🔴 ${filename} is protected at Protected level`,
			{ modal: true },
			"Create Snapshot & Save",
			"Cancel"
		);
		if (blockAction === "Create Snapshot & Save") {
			await this.createSnapshot(filePath);
		} else {
			throw new vscode.CancellationError();
		}
		break;
}
```

### Step 5: Automated Replacement for Other Files

**VS Code Multi-File Search & Replace:**

```
Find: 'watch'
Replace: 'Watched'
Files: src/config/merge.ts, src/extension.ts, src/utils/logger.ts, src/views/types.ts, src/ui/ProtectionDecorationProvider.ts
Verify each manually before replacing!
```

```
Find: 'warn'
Replace: 'Warning'
Files: (same files as above)
```

```
Find: 'block'
Replace: 'Protected'
Files: (same files as above)
```

### Verification After Phase 2

```bash
# Should find 0
grep -r "'watch'\|'warn'\|'block'" src/ --include="*.ts" | wc -l

# Should find 46+
grep -r "'Watched'\|'Warning'\|'Protected'" src/ --include="*.ts" | wc -l
```

---

## 🏗️ PHASE 3: Implement Missing Critical Services (3 hours)

You're missing 9 features. Let's implement the most critical ones:

### 1. ProtectionConfigManager (30 min)

**Create:** `src/services/ProtectionConfigManager.ts`

```typescript
import * as vscode from "vscode";
import { ProtectionLevel } from "../types/protection";

export class ProtectionConfigManager {
	private config: vscode.WorkspaceConfiguration;

	constructor() {
		this.config = vscode.workspace.getConfiguration("snapback");
	}

	async getProtectionLevel(
		filePath: string
	): Promise<ProtectionLevel | undefined> {
		const protectedFiles = this.config.get<Record<string, ProtectionLevel>>(
			"protectedFiles",
			{}
		);
		return protectedFiles[filePath];
	}

	async setProtectionLevel(
		filePath: string,
		level: ProtectionLevel
	): Promise<void> {
		const protectedFiles = this.config.get<Record<string, ProtectionLevel>>(
			"protectedFiles",
			{}
		);
		protectedFiles[filePath] = level;
		await this.config.update(
			"protectedFiles",
			protectedFiles,
			vscode.ConfigurationTarget.Workspace
		);
	}

	async removeProtection(filePath: string): Promise<void> {
		const protectedFiles = this.config.get<Record<string, ProtectionLevel>>(
			"protectedFiles",
			{}
		);
		delete protectedFiles[filePath];
		await this.config.update(
			"protectedFiles",
			protectedFiles,
			vscode.ConfigurationTarget.Workspace
		);
	}

	getDefaultLevel(): ProtectionLevel {
		return this.config.get<ProtectionLevel>(
			"defaultProtectionLevel",
			"Watched"
		);
	}
}
```

### 2. SnapshotService (45 min)

**Create:** `src/services/SnapshotService.ts`

```typescript
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs/promises";
import { Snapshot } from "../types/Snapshot";

export class SnapshotService {
	private snapshotsDir: string;
	private _onSnapshotCreated = new vscode.EventEmitter<Snapshot>();
	public readonly onSnapshotCreated = this._onSnapshotCreated.event;

	constructor(workspaceRoot: string) {
		this.snapshotsDir = path.join(workspaceRoot, ".snapback", "snapshots");
	}

	async initialize(): Promise<void> {
		await fs.mkdir(this.snapshotsDir, { recursive: true });
	}

	async createSnapshot(
		files: string[],
		description?: string
	): Promise<Snapshot> {
		const id = this.generateId();
		const timestamp = Date.now();

		const snapshot: Snapshot = {
			id,
			timestamp,
			meta: {
				files: files,
				description,
			},
		};

		// Save snapshot data
		await this.saveSnapshotData(snapshot, files);

		// Save metadata
		await this.saveSnapshotMetadata(snapshot);

		this._onSnapshotCreated.fire(snapshot);

		return snapshot;
	}

	async restoreSnapshot(snapshotId: string): Promise<void> {
		const snapshot = await this.getSnapshot(snapshotId);
		if (!snapshot) {
			throw new Error(`Snapshot ${snapshotId} not found`);
		}

		// Restore each file
		for (const file of snapshot.meta?.files || []) {
			await this.restoreFile(snapshotId, file);
		}
	}

	async listSnapshots(filePath?: string): Promise<Snapshot[]> {
		const files = await fs.readdir(this.snapshotsDir);
		const snapshots: Snapshot[] = [];

		for (const file of files) {
			if (file.endsWith(".json")) {
				const content = await fs.readFile(
					path.join(this.snapshotsDir, file),
					"utf-8"
				);
				const snapshot = JSON.parse(content) as Snapshot;

				if (!filePath || snapshot.meta?.files.includes(filePath)) {
					snapshots.push(snapshot);
				}
			}
		}

		return snapshots.sort((a, b) => b.timestamp - a.timestamp);
	}

	private async getSnapshot(id: string): Promise<Snapshot | null> {
		try {
			const metaPath = path.join(this.snapshotsDir, `${id}.json`);
			const content = await fs.readFile(metaPath, "utf-8");
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	private async saveSnapshotData(
		snapshot: Snapshot,
		files: string[]
	): Promise<void> {
		for (const file of files) {
			const content = await fs.readFile(file, "utf-8");
			const snapshotPath = path.join(
				this.snapshotsDir,
				`${snapshot.id}-${path.basename(file)}`
			);
			await fs.writeFile(snapshotPath, content, "utf-8");
		}
	}

	private async saveSnapshotMetadata(snapshot: Snapshot): Promise<void> {
		const metaPath = path.join(this.snapshotsDir, `${snapshot.id}.json`);
		await fs.writeFile(
			metaPath,
			JSON.stringify(snapshot, null, 2),
			"utf-8"
		);
	}

	private async restoreFile(
		snapshotId: string,
		filePath: string
	): Promise<void> {
		const snapshotPath = path.join(
			this.snapshotsDir,
			`${snapshotId}-${path.basename(filePath)}`
		);
		const content = await fs.readFile(snapshotPath, "utf-8");
		await fs.writeFile(filePath, content, "utf-8");
	}

	private generateId(): string {
		return `snapshot-${Date.now()}-${Math.random()
			.toString(36)
			.substr(2, 9)}`;
	}
}
```

### 3. SnapshotsTreeProvider (30 min)

**Create:** `src/views/SnapshotsTreeProvider.ts`

``typescript
import \* as vscode from 'vscode';
import { SnapshotService } from '../services/SnapshotService';
import { Snapshot } from '../types/Snapshot';

class SnapshotTreeItem extends vscode.TreeItem {
constructor(
public readonly snapshot: Snapshot,
public readonly collapsibleState: vscode.TreeItemCollapsibleState
) {
super(
new Date(snapshot.timestamp).toLocaleString(),
collapsibleState
);

        this.description = snapshot.meta?.description;
        this.tooltip = `Snapshot ID: ${snapshot.id}`;
        this.contextValue = 'snapshot';
    }

}

class FileTreeItem extends vscode.TreeItem {
constructor(public readonly filePath: string) {
super(filePath, vscode.TreeItemCollapsibleState.None);
this.contextValue = 'snapshotFile';
}
}

export class SnapshotsTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
private \_onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
readonly onDidChangeTreeData = this.\_onDidChangeTreeData.event;

    constructor(private snapshotService: SnapshotService) {
        // Listen for new snapshots
        this.snapshotService.onSnapshotCreated(() => {
            this.refresh();
        });
    }

    refresh(): void {
        this._onDidChangeTreeData.fire(undefined);
    }

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: vscode.TreeItem): Promise<vscode.TreeItem[]> {
        if (!element) {
            // Root level - show snapshots
            const snapshots = await this.snapshotService.listSnapshots();
            return snapshots.map(s => new SnapshotTreeItem(s, vscode.TreeItemCollapsibleState.Collapsed));
        }

        if (element instanceof SnapshotTreeItem) {
            // Show files in snapshot
            const files = element.snapshot.meta?.files || [];
            return files.map(f => new FileTreeItem(f));
        }

        return [];
    }

}

```

### 4. SnapBackStatusBar (20 min)

**Create:** `src/services/SnapBackStatusBar.ts`

``typescript
import * as vscode from 'vscode';

export class SnapBackStatusBar {
    private statusBarItem: vscode.StatusBarItem;
    private protectedFileCount = 0;
    private snapshotCount = 0;

    constructor() {
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'snapback.showStatus';
        this.update();
        this.statusBarItem.show();
    }

    setProtectedFileCount(count: number): void {
        this.protectedFileCount = count;
        this.update();
    }

    setSnapshotCount(count: number): void {
        this.snapshotCount = count;
        this.update();
    }

    incrementProtectedFiles(): void {
        this.protectedFileCount++;
        this.update();
    }

    decrementProtectedFiles(): void {
        this.protectedFileCount--;
        this.update();
    }

    private update(): void {
        this.statusBarItem.text = `🧢 ${this.protectedFileCount} protected | ${this.snapshotCount} snapshots`;
        this.statusBarItem.tooltip = 'SnapBack Status - Click for details';
    }

    dispose(): void {
        this.statusBarItem.dispose();
    }
}
```

### 5. Create Snapshot Type (if missing)

**Create:** `src/types/Snapshot.ts`

``typescript
export interface Snapshot {
id: string;
timestamp: number;
meta?: SnapshotMeta;
}

export interface SnapshotMeta {
files: string[];
description?: string;
author?: string;
tags?: string[];
}

```

---

## ✅ PHASE 4: Integration & Testing (2 hours)

### Step 1: Wire Up New Services in extension.ts

**File:** `src/extension.ts`

```

// Add imports
import { ProtectionConfigManager } from './services/ProtectionConfigManager';
import { SnapshotService } from './services/SnapshotService';
import { SnapshotsTreeProvider } from './views/SnapshotsTreeProvider';
import { SnapBackStatusBar } from './services/SnapBackStatusBar';

// In activate() function:
export async function activate(context: vscode.ExtensionContext) {
// Initialize services
const workspaceRoot = vscode.workspace.workspaceFolders?.[0].uri.fsPath;
if (!workspaceRoot) {
return;
}

    // Create new services
    const protectionConfigManager = new ProtectionConfigManager();
    const snapshotService = new SnapshotService(workspaceRoot);
    await snapshotService.initialize();

    const statusBar = new SnapBackStatusBar();

    // Register tree providers
    const snapshotsTreeProvider = new SnapshotsTreeProvider(snapshotService);
    vscode.window.registerTreeDataProvider('snapbackSnapshots', snapshotsTreeProvider);

    // Update status bar
    const protectedFiles = await protectedFileRegistry.getAllProtectedFiles();
    statusBar.setProtectedFileCount(protectedFiles.length);

    const snapshots = await snapshotService.listSnapshots();
    statusBar.setSnapshotCount(snapshots.length);

    // ... rest of activation

}

```

### Step 2: Manual Testing Checklist

```

[ ] Extension activates without errors
[ ] Command Palette shows snapshot commands (not checkpoint)
[ ] Protect a file → Shows in Protected Files tree with correct emoji
[ ] Change protection level → Emoji updates (🟢 Watched, 🟡 Warning, 🔴 Protected)
[ ] Create snapshot → Appears in Snapshots tree
[ ] Expand snapshot → Shows file list
[ ] Restore snapshot → Files restore correctly
[ ] Status bar shows counts
[ ] Try to save Protected file → Blocks correctly
[ ] Try to save Warning file → Shows warning dialog
[ ] Save Watched file → Allows save, just logs

````

### Step 3: Verify No Checkpoint References

```bash
# Final check - should be 0
grep -ri "checkpoint" src/ --include="*.ts" | wc -l
grep "checkpoint" package.json | wc -l

# Should be all capitalized
grep -r "'Watched'\|'Warning'\|'Protected'" src/ --include="*.ts" | wc -l
````

---

## 📈 Success Metrics

After all phases complete:

**Checkpoint Elimination:**

-   ✅ 0 checkpoint references in src/ (was 891)
-   ✅ 0 checkpoint commands in package.json (was 4)
-   ✅ 100% snapshot terminology

**Protection Levels:**

-   ✅ 0 lowercase protection levels (was 46)
-   ✅ 46+ capitalized protection levels
-   ✅ All UI shows Watched/Warning/Protected

**Implementation:**

-   ✅ 16/20 features complete (was 11/20)
-   ✅ 80% completion (was 55%)
-   ✅ All critical services exist
-   ✅ Extension fully functional

---

## 🚀 Execution Order

**Do in this exact order:**

1. **PHASE 1** (2 hours) - Eliminate checkpoints

    - Start with top 10 files
    - Then automated search/replace
    - Verify 0 checkpoint refs

2. **PHASE 2** (1 hour) - Capitalize protection levels

    - Update type definitions
    - Update all 9 files
    - Verify all capitalized

3. **PHASE 3** (3 hours) - Implement missing services

    - Create 5 critical services
    - Keep code simple and focused
    - Don't over-engineer

4. **PHASE 4** (2 hours) - Integration & testing
    - Wire everything up
    - Test thoroughly
    - Fix any issues

**Total Time: 8 hours**

**Save progress:** Commit after each phase

---

## 💡 Quick Start Commands

```bash
# Create a cleanup branch
git checkout -b cleanup/eliminate-checkpoint-and-standardize

# Phase 1: Start with automated replacements
code src/operationCoordinator.ts
code src/handlers/SaveHandler.ts
code package.json

# Use VS Code Search & Replace (Cmd+Shift+F)
# Follow the patterns in PHASE 1

# After each file: Compile and check
pnpm run compile

# After Phase 1: Verify
grep -ri "checkpoint" src/ --include="*.ts" | wc -l

# Continue to Phase 2...
```
