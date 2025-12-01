# TypeScript Strict Mode Analysis Report
## SnapBack VS Code Extension

**Generated**: 2025-11-08
**Total Errors**: 92
**Files Affected**: 37

---

## Executive Summary

After enabling strict TypeScript mode with all strict flags and additional checks (`noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`), the VS Code extension has **92 type errors** across **37 files**.

The errors are categorized primarily into:
- **Type safety issues** (argument/assignment mismatches)
- **Unused variable violations** (from new noUnused flags)
- **Null/undefined safety** (strictNullChecks)
- **Property access issues**
- **Module/import problems**

---

## Error Breakdown by Type

### 1. TS2345: Argument Type Mismatch (27 errors - 29%)
**Description**: Argument type is not assignable to parameter type

**Common patterns**:
- `unknown` type being passed where `Error | undefined` expected
- Type incompatibility in function calls
- Void returned where object expected

**Examples**:
```typescript
// src/extension.ts:228 - Void not assignable to Disposable
context.subscriptions.push(void);

// src/services/SnapshotService.ts:101 - unknown to Error
throw new SnapshotCreationError('Failed', unknown_error);
```

**Fix Strategy**: Add type guards and error conversion utilities

---

### 2. TS6133: Unused Variables (14 errors - 15%)
**Description**: Variables declared but never read (noUnusedLocals/Parameters)

**Affected files**:
- `src/config/secureChildProcess.ts` (3 unused constants)
- `src/storage/SqliteSnapshotStorage.ts` (2 unused size calculations)
- `src/commands/compareWithSnapshot.ts`, `src/commands/updateConfiguration.ts`
- `src/telemetry.ts`, `src/utils/SessionTagger.ts`

**Examples**:
```typescript
// src/config/secureChildProcess.ts:4-5
const _SANDBOX_TIMEOUT_MS = 5000;  // Never used
const _SANDBOX_HEAP_LIMIT_MB = 100; // Never used

// src/storage/SqliteSnapshotStorage.ts:623
const _contentSize = content.length; // Never used
```

**Fix Strategy**:
- Remove if truly unused
- Rename with `_` prefix if intentionally unused
- Use `// @ts-expect-error` with justification if needed for future use

---

### 3. TS2339: Property Does Not Exist (14 errors - 15%)
**Description**: Property access on types that don't have those properties

**Affected files**:
- `src/ui/SnapBackCodeLensProvider.ts` - Missing `codeLenses` property
- `src/ui/status-bar.ts`, `src/ui/statusBar.ts` - Missing `lastUpdateTime` property
- `src/views/SnapshotsTreeProvider.ts` - Missing `map` on `{}`
- `src/workspaceMemory.ts` - Missing `storage` property
- `src/workflowIntegration.ts` - Missing `operationCoordinator` property
- `src/welcomeView.ts` - Missing `_view` property
- `src/suppressions/manager.ts` - Missing `fsPath` and `path` properties

**Examples**:
```typescript
// src/ui/SnapBackCodeLensProvider.ts:87
this.codeLenses.push(lens); // Property doesn't exist on type

// src/views/SnapshotsTreeProvider.ts:68
snapshots.map(s => ...); // {} doesn't have .map()
```

**Fix Strategy**: Add missing properties to class/interface definitions or fix type annotations

---

### 4. TS2341: Private Property Access (10 errors - 11%)
**Description**: Attempting to access private class members from outside

**Affected files**:
- `src/services/cooldownManager.ts` (10 errors - all accessing `StorageBroker.db`)

**Examples**:
```typescript
// src/services/cooldownManager.ts:120
this.storageBroker.db.prepare(...); // db is private
```

**Fix Strategy**: Add public accessor methods or change visibility modifier

---

### 5. TS2322: Type Assignment Mismatch (7 errors - 8%)
**Description**: Type is not assignable to target type

**Examples**:
```typescript
// src/operationCoordinator.ts:722
complexityScore = 0.7; // number not assignable to { score: number; reasons: string[] }

// src/views/SnapshotsTreeProvider.ts:12
this.filter = unknown; // unknown not assignable to string | boolean | undefined

// src/telemetry.ts:135
this.enabled = Promise<boolean>; // Promise not assignable to boolean
```

**Fix Strategy**: Fix type annotations or await async operations

---

### 6. TS18048: Possibly Undefined (4 errors - 4%)
**Description**: Variable is possibly undefined (strictNullChecks)

**Examples**:
```typescript
// src/policy/PolicyManager.ts:172
return indexB - indexA; // Both possibly undefined

// src/storage/SqliteSnapshotStorage.ts:1160
stmt.finalize(); // stmt possibly undefined
```

**Fix Strategy**: Add null/undefined checks before use

---

### 7. TS2540: Read-only Property Assignment (3 errors - 3%)
**Description**: Cannot assign to read-only property

**Affected files**:
- `src/errors/index.ts` (3 errors - trying to reassign `code` property)

**Examples**:
```typescript
// src/errors/index.ts:355
this.code = 'SCHEMA_VALIDATION_ERROR'; // code is readonly
```

**Fix Strategy**: Pass `code` to parent constructor instead of reassigning

---

### 8. TS2749: Value Used as Type (2 errors - 2%)
**Description**: Using a value where a type is expected

**Examples**:
```typescript
// src/commands/mcpCommands.ts:37
const service: ServiceFederation = ...; // Should be typeof ServiceFederation

// src/editorDecorations.ts:6
const analyzer: RiskAnalyzer = ...; // Should be typeof RiskAnalyzer
```

**Fix Strategy**: Add `typeof` or import proper type

---

### 9. Other Errors (8 errors - 9%)
- **TS18046**: Unknown type issues (2 errors)
- **TS2554**: Argument count mismatch (2 errors)
- **TS2304**: Cannot find name (2 errors)
- **TS2488**: Missing iterator method (1 error)
- **TS2353**: Unknown property (1 error)
- **TS2307**: Module not found (1 error)
- **TS2305**: No exported member (1 error)
- **TS7030**: Not all code paths return (1 error)

---

## Top 10 Files by Error Count

| Rank | File | Errors | Primary Issues |
|------|------|--------|----------------|
| 1 | `src/services/cooldownManager.ts` | 10 | Private property access (`StorageBroker.db`) |
| 2 | `src/services/SnapshotService.ts` | 7 | Unknown → Error conversions, type mismatches |
| 3 | `src/semanticNamer.ts` | 6 | Missing `modifiedFiles` property in ChangeAnalysis |
| 4 | `src/operationCoordinator.ts` | 6 | Type mismatches, missing properties, unused vars |
| 5 | `src/extension.ts` | 6 | Void → Disposable, EventBus missing dispose |
| 6 | `src/storage/SqliteSnapshotStorage.ts` | 4 | Unused vars, possibly undefined |
| 7 | `src/services/telemetry-proxy.ts` | 4 | Unknown types, missing property |
| 8 | `src/suppressions/manager.ts` | 3 | Unknown → boolean, missing properties |
| 9 | `src/sdk-adapter.ts` | 3 | Module import errors, unknown properties |
| 10 | `src/rules/SnapbackAPI.ts` | 3 | Unknown types, missing PolicyBundle |

---

## Recommended Fix Order (Priority)

### Priority 1: Critical Infrastructure (Days 1-2)
Fix errors that break core functionality and affect multiple systems.

**Files to fix first**:
1. **`src/errors/index.ts`** (3 errors) - Fix readonly property assignments in error classes
   - Impact: Our new error infrastructure won't work correctly
   - Fix: Use `super(message, code, cause)` pattern consistently

2. **`src/extension.ts`** (6 errors) - Fix Disposable issues and EventBus integration
   - Impact: Extension may not activate/deactivate properly
   - Fix: Return Disposable objects, add dispose() to EventBus

3. **`src/sdk-adapter.ts`** (3 errors) - Fix module imports
   - Impact: SDK integration broken
   - Fix: Update imports to match SDK exports

### Priority 2: Storage & Persistence (Days 3-4)
Fix storage layer to ensure data integrity.

**Files to fix**:
4. **`src/services/cooldownManager.ts`** (10 errors) - Fix private property access
   - Impact: Cooldown functionality broken
   - Fix: Add public `getDatabase()` method to StorageBroker

5. **`src/storage/SqliteSnapshotStorage.ts`** (4 errors) - Fix undefined checks and unused vars
   - Impact: Database operations may fail
   - Fix: Add null checks, remove unused variables

6. **`src/services/SnapshotService.ts`** (7 errors) - Fix error handling
   - Impact: Snapshot creation/restoration unreliable
   - Fix: Use `toError()` utility for unknown → Error conversion

### Priority 3: Type Safety & Correctness (Days 5-6)
Improve type safety without breaking functionality.

**Files to fix**:
7. **`src/operationCoordinator.ts`** (6 errors) - Fix type mismatches
8. **`src/semanticNamer.ts`** (6 errors) - Add missing `modifiedFiles` property
9. **`src/policy/PolicyManager.ts`** (2 errors) - Add undefined checks
10. **`src/rules/SnapbackAPI.ts`** (3 errors) - Fix PolicyBundle imports

### Priority 4: UI & User Experience (Days 7-8)
Fix UI-related errors to ensure proper display.

**Files to fix**:
11. **`src/ui/SnapBackCodeLensProvider.ts`** (2 errors) - Add missing `codeLenses` property
12. **`src/ui/status-bar.ts` + `src/ui/statusBar.ts`** (2 errors) - Add `lastUpdateTime` property
13. **`src/views/SnapshotsTreeProvider.ts`** (2 errors) - Fix type annotations
14. **`src/welcomeView.ts`** (2 errors) - Add missing `_view` property

### Priority 5: Cleanup & Optimization (Days 9-10)
Remove unused code and clean up warnings.

**Files to fix**:
15. All files with **TS6133** errors (14 total) - Remove unused variables
    - `src/config/secureChildProcess.ts`
    - `src/telemetry.ts`
    - `src/utils/SessionTagger.ts`
    - etc.

---

## Files That May Need @ts-expect-error

Some errors may be intentional or require significant refactoring. Consider using `@ts-expect-error` with justification:

### 1. `src/config/secureChildProcess.ts` (lines 4-5)
```typescript
// @ts-expect-error Reserved for future sandbox implementation
const _SANDBOX_TIMEOUT_MS = 5000;
// @ts-expect-error Reserved for future sandbox implementation
const _SANDBOX_HEAP_LIMIT_MB = 100;
```
**Justification**: Configuration constants reserved for future security features.

### 2. `src/test/suite/index.ts` (line 19)
```typescript
// @ts-expect-error Mocha type definitions mismatch with VS Code test runner
mocha.run(failures => { ... });
```
**Justification**: VS Code test runner has different signature than standard Mocha.

### 3. `src/utils/SessionTagger.ts` (line 17)
```typescript
// @ts-expect-error Configuration for future AI tagging enhancements
const _TAGGING_CONFIG = { ... };
```
**Justification**: Pre-configured for future AI detection improvements.

---

## Implementation Guidelines

### Error Conversion Pattern
Use the new error utilities for unknown → Error conversion:

```typescript
// Before
throw new SnapshotCreationError('Failed', err); // TS2345 error

// After
import { toError } from '../errors';
throw new SnapshotCreationError('Failed', undefined, toError(err));
```

### Null/Undefined Safety Pattern
Always check before accessing potentially undefined values:

```typescript
// Before
stmt.finalize(); // TS18048 error

// After
if (stmt) {
  stmt.finalize();
}
// Or use optional chaining
stmt?.finalize();
```

### Unused Variables Pattern
```typescript
// Option 1: Remove if truly unused
// const unusedVar = value; // DELETE

// Option 2: Use underscore prefix for intentionally unused
const _reservedForFuture = value;

// Option 3: Mark with comment and @ts-expect-error
// @ts-expect-error Keeping for future feature X
const _plannedFeature = value;
```

### Private Property Access Pattern
```typescript
// Before
this.broker.db.prepare(...); // TS2341 error

// After - Add public accessor
class StorageBroker {
  private db: Database;

  public getDatabase(): Database {
    return this.db;
  }
}
this.broker.getDatabase().prepare(...);
```

---

## Testing Strategy

After fixing each priority group:

1. **Run type check**: `pnpm run check-types`
2. **Run unit tests**: `pnpm test`
3. **Run extension in debug**: Press F5 in VS Code
4. **Test affected features**: Manual testing of related functionality
5. **Commit with message**: `fix(vscode): resolve strict mode errors in [component]`

---

## Success Metrics

- ✅ **Zero TypeScript errors** after all fixes
- ✅ **All existing tests passing**
- ✅ **Extension activates without errors**
- ✅ **Core features working**: Snapshot create/restore, protection levels, sessions
- ✅ **No new runtime errors** introduced by fixes

---

## Additional Notes

### Error Infrastructure Issues
Our new error system (`src/errors/index.ts`) has issues with readonly properties. This must be fixed first as it's foundational.

### EventBus Disposability
The `SnapBackEventBus` class needs a `dispose()` method to be compatible with VS Code's Disposable pattern.

### Type vs Value Confusion
Several files import classes but try to use them as types. Need to review import patterns.

### Storage Broker Encapsulation
The `StorageBroker` class has private `db` property but `cooldownManager.ts` needs direct access. Need to add proper accessor methods.

---

## Next Steps

1. ✅ Enable strict mode in tsconfig.json
2. ✅ Create error type system
3. ✅ Create Result type utilities
4. ✅ Document all errors
5. ⏭️ Fix Priority 1 errors (error infrastructure + extension activation)
6. ⏭️ Fix Priority 2 errors (storage layer)
7. ⏭️ Fix Priority 3 errors (type safety)
8. ⏭️ Fix Priority 4 errors (UI layer)
9. ⏭️ Fix Priority 5 errors (cleanup)
10. ⏭️ Final verification and testing

---

**Report End**
