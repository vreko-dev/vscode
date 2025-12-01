---
globs:
  - "src/types/**/*.ts"
---

# Type Definitions Patterns

## Core Principle
Type definitions are the interface contract. Define types BEFORE implementation. Use discriminated unions, avoid `any`, document with JSDoc.

## Type File Organization
```
src/types/
├── snapshot.ts       # Snapshot domain (Snapshot, FileState, RichSnapshot)
├── protection.ts     # Protection domain (ProtectionLevel, ProtectedFileEntry)
├── config.ts         # Configuration types
├── result.ts         # Result<T,E> error handling system
├── api.ts            # API contracts, event payloads
├── fileChanges.ts    # File operation types
├── policy.types.ts   # Policy engine types
└── README.md         # Type system documentation
```

## Discriminated Unions (SnapBack-Specific)
```typescript
// FileAction example
export type FileAction =
  | { type: 'add'; content: string }
  | { type: 'modify'; content: string; previousHash: string }
  | { type: 'delete' };
```

## Result Type (see always-error-handling.md for details)
```typescript
export type Result<T, E> = Ok<T> | Err<E>;
export type FileError = { type: 'NotFound'; path: string } | ...
```

## Interface Extension
```typescript
// Base interface
export interface Snapshot {
  id: string;
  timestamp: number;
  meta?: Record<string, unknown>;
}

// ✅ GOOD: Extend base interface
export interface RichSnapshot extends Snapshot {
  name: string;
  isProtected: boolean;
  icon: string;
  iconColor: string;
  [key: string]: unknown; // Allow index signature for compatibility
}

// ❌ BAD: Duplicate fields
export interface RichSnapshot {
  id: string;           // Duplicated from Snapshot
  timestamp: number;    // Duplicated from Snapshot
  name: string;
  isProtected: boolean;
}
```

## Readonly (when needed)
```typescript
export interface SnapshotMetadata {
  readonly createdAt: number;
  readonly fileCount: number;
}
```

## Type Guards (for external data)
```typescript
export function isSnapshot(data: unknown): data is Snapshot {
  return typeof data === 'object' && data !== null &&
    'id' in data && typeof (data as any).id === 'string';
}
```

## Branded Types (optional, for high-value type safety)
```typescript
export type SnapshotId = string & { readonly __brand: 'SnapshotId' };
// Use when preventing ID mixing is critical
```

## JSDoc Documentation
```typescript
/**
 * Represents a file's state at a specific snapshot.
 *
 * @remarks
 * Used for deduplication and snapshot reconstruction.
 * The hash is SHA-256 of the file content.
 *
 * @example
 * ```typescript
 * const fileState: FileState = {
 *   path: '/src/app.ts',
 *   content: 'console.log("hello")',
 *   hash: 'a1b2c3...',
 *   encrypted: { iv: '...', data: '...' }
 * };
 * ```
 */
export interface FileState {
  /** Absolute or workspace-relative file path */
  path: string;

  /** File content as UTF-8 string */
  content: string;

  /** SHA-256 hash of content (hex string) */
  hash: string;

  /** Optional encrypted data if encryption enabled */
  encrypted?: EncryptedData;
}
```

## Requirements
✅ Define types in `src/types/*.ts` BEFORE implementation
✅ Use discriminated unions for variant types
✅ Add JSDoc to exported types
✅ Use `unknown` instead of `any`
✅ Extend interfaces instead of duplicating

## Anti-Patterns
❌ Inline type definitions in implementation files
❌ Using `any` (use `unknown` + type guard)
❌ Duplicate type definitions across modules
❌ Type assertions without validation
