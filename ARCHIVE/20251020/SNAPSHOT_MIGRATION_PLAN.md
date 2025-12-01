# SnapBack Snapshot Migration Plan

## 🎯 Objective

Complete the migration from "checkpoint" terminology and architecture to "snapshot" terminology and architecture across the entire codebase.

## 📊 Current Status

-   ✅ Emoji migration completed (hat emojis → color emojis)
-   ✅ Critical service implementation completed (SnapshotService, SnapshotsTreeProvider)
-   ✅ File renaming completed (SqliteCheckpointStorage → SqliteSnapshotStorage)
-   ❌ Method and class renaming incomplete
-   ❌ UI and command updates incomplete
-   ❌ Documentation updates incomplete

## 📋 Implementation Plan

### Phase 1: Critical Service Implementation (COMPLETED)

Implemented the missing critical services identified in the surgical cleanup plan.

#### 1.1 SnapshotService ✅

**File:** `src/services/SnapshotService.ts`
**Purpose:** Central service for snapshot operations
**Dependencies:** Storage layer, event system

#### 1.2 SnapshotsTreeProvider ✅

**File:** `src/views/SnapshotsTreeProvider.ts`
**Purpose:** VS Code tree view provider for snapshots
**Dependencies:** SnapshotService

#### 1.3 Storage Layer Renaming ✅

-   `src/storage/SqliteCheckpointStorage.ts` → `src/storage/SqliteSnapshotStorage.ts`
-   Updated class name from `SqliteCheckpointStorage` to `SqliteSnapshotStorage`
-   Added compatibility methods

### Phase 2: Method and Class Renaming (2-3 hours)

Systematic renaming of all checkpoint-related methods and classes.

#### 2.1 Method Names

-   `createCheckpoint` → `createSnapshot`
-   `getCheckpoint` → `getSnapshot`
-   `listCheckpoints` → `listSnapshots`
-   `deleteCheckpoint` → `deleteSnapshot`
-   `restoreCheckpoint` → `restoreSnapshot`
-   etc.

#### 2.2 Class Names

-   `CheckpointStorage` → `SnapshotStorage`
-   `CheckpointManager` → `SnapshotManager`
-   etc.

#### 2.3 Variable Names

-   `checkpointId` → `snapshotId`
-   `checkpointData` → `snapshotData`
-   etc.

### Phase 3: UI and Command Updates (1-2 hours)

Update all user-facing elements to use consistent snapshot terminology.

#### 3.1 Package.json Commands

-   Verify all commands use "snapshot" terminology
-   Update command titles and descriptions

#### 3.2 UI Components

-   Update all UI text, labels, and tooltips
-   Update quick pick options

### Phase 4: Documentation Updates (1 hour)

Update all documentation to reflect the new architecture.

#### 4.1 Markdown Files

-   Update all markdown documentation
-   Update comments in code files

#### 4.2 Type Definitions

-   Update all type definitions and interfaces

## 🕰️ Timeline

Total estimated time: 4-7 hours

## 🧪 Testing Strategy

1. Unit tests for new services
2. Integration tests for storage layer
3. UI tests for tree providers
4. End-to-end tests for command execution
5. Regression tests to ensure no functionality is broken

## ✅ Success Criteria

1. No "checkpoint" references in codebase (except where technically necessary)
2. All services implemented and functional
3. All tests passing
4. UI consistently using "snapshot" terminology
5. Extension compiles without errors
6. Extension functions correctly in VS Code

## 🚧 Risk Mitigation

1. Work in small, testable increments
2. Commit frequently with descriptive messages
3. Maintain backward compatibility where possible
4. Test after each major change
5. Keep detailed documentation of changes

## 📝 Detailed Task List

### Task 1: Rename createCheckpoint methods (1 hour)

-   `src/handlers/SaveHandler.ts` - `createCheckpointForFile` → `createSnapshotForFile`
-   `src/snapshot/SnapshotManager.ts` - Update comments and examples
-   `src/storage/SqliteSnapshotStorage.ts` - Keep both methods for compatibility

### Task 2: Rename getCheckpoint methods (30 minutes)

-   `src/storage/SqliteSnapshotStorage.ts` - Keep both methods for compatibility

### Task 3: Rename listCheckpoints methods (30 minutes)

-   `src/storage/SqliteSnapshotStorage.ts` - Keep both methods for compatibility

### Task 4: Update UI and Command References (1 hour)

-   Update package.json commands
-   Update UI text and labels
-   Update notification messages

### Task 5: Update Documentation (30 minutes)

-   Update comments in code files
-   Update markdown documentation
-   Update type definitions
