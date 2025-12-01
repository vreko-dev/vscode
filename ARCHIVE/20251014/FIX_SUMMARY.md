# SnapBack VS Code Extension - Critical Bug Fixes Summary

This document summarizes the three major issues that were identified and fixed in the SnapBack VS Code extension.

## 1. PerformanceMonitor Memory Leak Fix

### Issue

The `PerformanceMonitor` class was retaining all timing and metric entries indefinitely, causing steady memory growth during long-running sessions or high-frequency operations.

### Root Cause

-   No mechanism to limit the number of stored timing entries in `this.timings` Map
-   No mechanism to limit the number of stored metric entries in `this.metrics` Array
-   Entries were only cleared by calling `reset()` method

### Solution

1. Added `maxTimings` and `maxMetrics` configuration options with sensible defaults (1000 each)
2. Implemented automatic FIFO eviction when limits are exceeded
3. Improved efficiency by removing multiple entries in a single operation when needed
4. Added warning logs when significant numbers of metrics are evicted

### Files Modified

-   `src/performance/PerformanceMonitor.ts` - Added configuration options and eviction logic
-   `test/unit/performance/PerformanceMonitorMemoryLeak.test.ts` - Tests demonstrating the original issue
-   `test/unit/performance/PerformanceMonitorMemoryLeakFixed.test.ts` - Tests verifying the fix

## 2. Brittle Adapter Detection Fix

### Issue

The code used `this.storage.create.length > 1` to detect `SqliteStorageAdapter`, which was unreliable and could break with:

-   Function parameter defaults
-   Code minification
-   Future interface changes

### Root Cause

-   Using function.length for capability detection is not a stable approach
-   Would silently fall back to full-content checkpoints if detection failed

### Solution

1. Added `isSqliteStorageAdapter` property to `SqliteStorageAdapter` class
2. Modified `operationCoordinator` to use this reliable detection method
3. Improved type safety by storing the cast reference in a variable

### Files Modified

-   `src/storage/SqliteStorageAdapter.ts` - Added `isSqliteStorageAdapter` property
-   `src/operationCoordinator.ts` - Changed detection logic
-   `test/unit/storage/AdapterDetection.test.ts` - Tests demonstrating the original issue
-   `test/unit/storage/AdapterDetectionFixed.test.ts` - Tests verifying the fix

## 3. SQLite Connection Closing Fix

### Issue

The `SqliteCheckpointStorage.close()` method existed but was never called during extension shutdown, causing:

-   "Database is locked" errors
-   Inability to cleanly teardown during reloads or unit tests
-   Resource leaks

### Root Cause

-   No mechanism to close SQLite connections during extension deactivation
-   `SqliteStorageAdapter` didn't expose the close method
-   Extension didn't call close during deactivation

### Solution

1. Added `close()` method to `SqliteStorageAdapter` that exposes the internal `SqliteCheckpointStorage.close()` method
2. Modified extension to properly close storage connection during deactivation
3. Added proper error handling in the close method

### Files Modified

-   `src/storage/SqliteStorageAdapter.ts` - Added `close()` method
-   `src/extension.ts` - Added storage cleanup during deactivation
-   `test/unit/storage/SqliteConnection.test.ts` - Tests demonstrating the original issue
-   `test/unit/storage/SqliteConnectionFixed.test.ts` - Tests verifying the fix

## Testing

All fixes have been thoroughly tested with:

-   Unit tests demonstrating the original issues
-   Unit tests verifying the fixes work correctly
-   Integration testing to ensure no regressions

## Impact

These fixes significantly improve the stability and performance of the SnapBack VS Code extension:

-   Prevents memory leaks during long-running sessions
-   Ensures reliable adapter detection that won't break with code transformations
-   Properly manages database connections to prevent file locking issues
-   Maintains backward compatibility with existing code

## Verification

Run the following command to verify all tests pass:

```bash
cd apps/vscode && npx vitest run
```
