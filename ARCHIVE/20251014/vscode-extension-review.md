# VS Code Extension Review & Fix Plan

## Current Gaps

### 1. ProtectedFileRegistry cleanup & state consistency

-   `clearAll()` is synchronous and never waits for the async `write()` call.
-   `protectedPathsIndex` remains populated after clearing, so `isProtected()` may return `true` even though storage is empty.
-   `onProtectionChanged` fires before state is actually persisted, leading to stale decorations.
-   Need async `clearAll`, await `write`, reset index; freeze tests should assert `await registry.clearAll()` removes storage entries and `isProtected()` returns `false`.

### 2. Decoration events missing for removal/update

-   `remove()` and `updateProtectionLevel()` fire `_onProtectionChanged` but rely on `setTimeout` in tests.
-   Tests should wait on event (`waitForEvent`) rather than arbitrary sleep.
-   Ensure removal includes removing entries from `protectedPathsIndex`.

### 3. No command to unprotect files

-   Registry exposes `remove`, but there’s no command/wiring for the command palette / tree context.
-   Need command in `extension.ts` and context menu item (e.g. `snapback.unprotectFile`).

### 4. Blocking save logic doesn’t roll back properly

-   If a user cancels the checkpoint/save dialog for a block-level file, the save should be canceled and existing content restored.
-   Manual test showed the save goes through; signals the `SaveHandler` path isn’t rolling back or protected registry logic isn’t consulted.
-   Seek tests covering this scenario (e.g. `integration/saveHandler.real.integration.test.ts`) and add missing coverage.

### 5. Stale tests for timeline/tree UI

-   `CheckpointTimelineProvider` now uses hat icons & theme colors from `PROTECTION_LEVELS`; tests still expect default values.
-   `SnapBackTreeProvider` displays hat icons & updated descriptions; tests should assert on new behavior.
-   Replace old magic strings with `DesignTokens` references to avoid drift.

### 6. Clipboard tests require event helpers

-   Several tests rely on `setTimeout` to wait for events (`onProtectionChanged`, `onDidChangeTreeData`). Should implement a reusable `waitForEvent` promise helper to keep tests deterministic.

### 7. Storage adapter metadata passthrough

-   Adapter spreads `raw.meta` on the returned object; tests should assert custom metadata fields persist.
-   Add coverage for `updateProtectionLevel`, `getProtectionLevel`.

### 8. Regression/integration tests require VS Code API

-   Suites under `test/regression` & `test/integration` use real `workspace.workspaceFolders`. When running outside VS Code host they fail.
-   Wrap with guards or provide mocks to ensure they skip or inject workspace folders when necessary.

## Action Plan

1. Make `ProtectedFileRegistry.clearAll()` async, await `write`, clear `protectedPathsIndex`, and update tests.
2. Add `waitForEvent` helper in tests; refactor decoration/timeline/tree tests to await events deterministically.
3. Update timeline & tree provider tests for hat icons, theme colors, `Uri` command arguments.
4. Implement `Unprotect` command in `extension.ts`, register it, and add context menu entry.
5. Investigate `SaveHandler` for block-level files; ensure canceling shows rollback and add tests covering cancel scenario.
6. Verify `ProtectedFileRegistry.remove` & `updateProtectionLevel` drop entries from index and fire change events.
7. Augment storage adapter tests to ensure meta passthrough.
8. Guard integration/regression tests with workspace mocks to prevent false failures.
