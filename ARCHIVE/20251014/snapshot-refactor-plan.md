# SnapBack Snapshot Refactor (Internal IDs & APIs)

This note outlines how we can follow up the branding string pass with a deeper refactor that renames the remaining “checkpoint” identifiers inside the extension codebase and public API surface. The intent is to keep user-visible terminology consistent (“Snap Back” / “Snapshot”) while avoiding destabilising changes during the current sprint.

## Objectives

-   Convert internal module/file/class names (`CheckpointManager`, `CheckpointStorageAdapter`, etc.) to their snapshot equivalents.
-   Rename VS Code command IDs, context keys, and configuration namespaces where they leak the term “checkpoint”.
-   Provide migration shims so existing settings, commands, and telemetry events continue to resolve during the transition.

## Migration Strategy

1. **Inventory & Mapping**

    - Generate a cross-reference of all symbols, command IDs, and configuration keys that still contain `checkpoint`.
    - Group them into buckets: runtime API (TypeScript classes/interfaces), VS Code contributions (command IDs / view IDs / context keys), and persistence (storage folders, SQLite tables, JSON keys).

2. **Internal TypeScript Renames**

    - Use TypeScript refactors to rename classes and interfaces (`CheckpointManager` → `SnapshotManager`, etc.).
    - Update import paths by moving directories (`src/checkpoint/…` → `src/snapshot/…`) and exporting re-export shims (`checkpoint/index.ts`) for one release cycle.

3. **Command & Context Keys**

    - Introduce new command IDs (e.g. `snapback.createSnapshot`) and register them alongside the existing `snapback.createCheckpoint` IDs.
    - Deprecate the old IDs by keeping handlers that emit a warning and forward to the new command.
    - Update `package.json` contributions to point at the new IDs while leaving hidden aliases for backward compatibility.

4. **Configuration & State**

    - Add new configuration keys (`snapback.snapshot.*`) and migrate settings from `snapback.checkpoint.*` on activation.
    - Update stored state (global/workspace mementos) by detecting old keys and rewriting them to the new schema.
    - Provide a cleanup script to remove the deprecated keys after a defined grace period.

5. **Storage Layer**

    - Rename the on-disk `.snapback` directories or tables only after adding migration logic that handles both names.
    - Ship data migration steps within `SqliteCheckpointStorage` to copy/rename tables atomically.

6. **Telemetry & Analytics**
    - Coordinate with telemetry consumers to accept dual payload fields during the migration.
    - Update dashboards once rollout reaches 100% so metrics continue under the new terminology.

## Compatibility & Rollout

-   Maintain the existing `checkpoint` symbols for at least one release behind feature flags or deprecation warnings.
-   Document the breaking changes and migration steps in the changelog and README.
-   Provide codemods/examples for customers who script against our command IDs.

## Testing Checklist

-   Unit: adjust snapshots/fixtures to reference the new naming scheme and ensure storage migrations are covered.
-   Integration: exercise the VS Code contributions to confirm both the new and legacy commands function.
-   Regression: verify manual “Snap Back” flows (context menus, timeline view, diff command) continue to operate after the ID swap.
-   Upgrade path: simulate upgrading from a version with only `checkpoint` IDs to the new release and assert settings/state are preserved.

Once this plan is approved we can schedule the work in phases so translators, docs, and telemetry partners have sufficient notice.
