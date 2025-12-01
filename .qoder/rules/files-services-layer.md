---
trigger: manual
---
---
apply: always
---

# Shared Types Contract

## Core Principle
ALL cross-module type definitions MUST be centralized in `src/types/*.ts`. Types are the interface contract between components. NO duplicate type definitions.

## Source of Truth
- `src/types/snapshot.ts` - Snapshot, FileState, RichSnapshot, SnapshotState
- `src/types/protection.ts` - ProtectionLevel, ProtectedFileEntry
- `src/types/config.ts` - Configuration interfaces
- `src/types/result.ts` - Result<T, E> error handling type system
- `src/types/api.ts` - API contracts and event payloads
- `src/types/fileChanges.ts` - FileChange, FileInput types

## Critical Type Definitions

### Snapshot Types (snapshot.ts)
```typescript
// Base snapshot (matches @snapback/contracts)
export interface Snapshot {
  id: string;
  timestamp: number;
  meta?: Record<string, unknown>;
  files?: string[];
  fileContents?: Record<string, string>;
}

// File state for deduplication
export interface FileState {
  path: string;
  content: string;
  hash: string;
  encrypted?: EncryptedData;
}

// Complete snapshot state
export interface SnapshotState {
  id: string;
  timestamp: number;
  files: FileState[];
}

// Rich snapshot with UI metadata
export interface RichSnapshot extends Snapshot {
  name: string;
  fileStates?: FileState[];
  isProtected: boolean;
  icon: string;
  iconColor: string;
  [key: string]: unknown; // Allow index signature
}

// Input for snapshot creation
export interface FileInput {
  path: string;
  content: string;
  action: "add" | "modify" | "delete";
}
```

### Protection Types (protection.ts)
```typescript
export type ProtectionLevel = "Protected" | "Warning" | "Watched";

export interface ProtectedFileEntry {
  id: string;
  label: string;
  path: string;
  lastProtectedAt?: number;
  lastSnapshotId?: string;
  protectionLevel?: ProtectionLevel;
}

// Storage format (persisted to Memento)
export interface StoredProtectedFile {
  path: string;
  label: string;
  lastProtectedAt?: number;
  lastSnapshotId?: string;
  protectionLevel?: ProtectionLevel;
}
```

### Result Type (result.ts)
```typescript
// Success variant
export interface Ok<T> {
  success: true;
  value: T;
}

// Error variant
export interface Err<E> {
  success: false;
  error: E;
}

// Union type
export type Result<T, E> = Ok<T> | Err<E>;

// Constructor functions
export function Ok<T>(value: T): Ok<T> {
  return { success: true, value };
}

export function Err<E>(error: E): Err<E> {
  return { success: false, error };
}

// Type guards
export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.success === true;
}

export function isErr<T, E>(result: Result<T, E>): result is Err<E> {
  return result.success === false;
}
```

### Service Interfaces (snapshot.ts)
```typescript
// Storage abstraction
export interface IStorage {
  save(snapshot: RichSnapshot): Promise<void>;
  get(id: string): Promise<RichSnapshot | undefined>;
  getAll(): Promise<RichSnapshot[]>;
  delete(id: string): Promise<void>;
  update(id: string, updates: Partial<RichSnapshot>): Promise<void>;
}

// Event emitter
export interface IEventEmitter {
  emit(type: string, data: unknown): void;
}

// Confirmation service
export interface IConfirmationService {
  confirm(message: string, detail?: string): Promise<boolean>;
}
```

## Requirements
✅ Define types in `src/types/*.ts` before implementation
✅ Use JSDoc comments for all exported types
✅ Export all public interfaces (no internal-only types)
✅ Use branded types for semantically different strings (e.g., SnapshotId)
✅ Extend interfaces instead of duplicating fields
✅ Use discriminated unions for variant types (e.g., Result<T,E>)
✅ Make fields readonly when they shouldn't be mutated
✅ Use `unknown` instead of `any` for unknown data
✅ Document type purpose, not just field names

## Type Organization
```
src/types/
├── snapshot.ts       # Snapshot domain types
├── protection.ts     # Protection domain types
├── config.ts         # Configuration types
├── result.ts         # Result<T,E> error handling
├── api.ts            # API contracts, event payloads
├── fileChanges.ts    # File operation types
├── policy.types.ts   # Policy engine types
└── README.md         # Type system documentation
```

## Anti-Patterns
❌ Inline type definitions: `function foo(data: { id: string; name: string })`
❌ Duplicate types across modules
❌ Using `any` for cross-module data
❌ Type assertions without runtime validation: `data as MyType`
❌ Mixing domain types (e.g., Snapshot + ProtectionLevel in one type)
❌ Optional chaining without null checks in critical paths
❌ Mutable interfaces when immutability is expected

## Type Safety Best Practices
```typescript
// ✅ GOOD: Type guard with validation
function isValidSnapshot(data: unknown): data is Snapshot {
  return (
    typeof data === 'object' &&
    data !== null &&
    'id' in data &&
    typeof data.id === 'string' &&
    'timestamp' in data &&
    typeof data.timestamp === 'number'
  );
}

// ❌ BAD: Type assertion without validation
const snapshot = data as Snapshot;

// ✅ GOOD: Discriminated union
type FileAction =
  | { type: 'add'; content: string }
  | { type: 'modify'; content: string; previousHash: string }
  | { type: 'delete' };

// ❌ BAD: Optional fields for mutually exclusive states
interface FileAction {
  type: 'add' | 'modify' | 'delete';
  content?: string;
  previousHash?: string;
}
```
