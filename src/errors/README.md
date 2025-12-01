# Error Handling Infrastructure

Comprehensive error type system for the SnapBack VS Code Extension.

## Overview

This module provides a hierarchical error type system with proper error chaining, unique error codes, and type guards for robust error handling throughout the extension.

## Features

- **Hierarchical error classes** - All errors extend `SnapBackError` base class
- **Error codes** - Unique codes for programmatic error handling
- **Error chaining** - Track error causes for better debugging
- **Type guards** - Type-safe error checking with TypeScript
- **Severity levels** - Automatic severity classification
- **Error utilities** - Helper functions for error conversion and handling

## Error Hierarchy

```
SnapBackError (base)
├── StorageError
│   ├── DatabaseConnectionError
│   ├── DatabaseInitializationError
│   ├── DatabaseQueryError
│   ├── DatabaseTransactionError
│   └── StorageCorruptionError
├── SnapshotError
│   ├── SnapshotNotFoundError
│   ├── SnapshotCreationError
│   ├── SnapshotRestorationError
│   ├── SnapshotValidationError
│   └── SnapshotDeduplicationError
├── SessionError
│   ├── SessionNotFoundError
│   ├── SessionCreationError
│   ├── SessionFinalizationError
│   └── SessionRestorationError
├── ProtectionError
│   ├── ProtectionBlockedError
│   ├── InvalidProtectionLevelError
│   └── PolicyEvaluationError
├── ValidationError
│   └── SchemaValidationError
├── ConfigurationError
│   ├── ConfigurationFileNotFoundError
│   └── ConfigurationParseError
├── FileSystemError
│   ├── FileNotFoundError
│   ├── FileReadError
│   ├── FileWriteError
│   └── FilePermissionError
└── EventBusError
    ├── EventBusConnectionError
    └── EventPublishError
```

## Usage Examples

### Throwing Errors

```typescript
import { SnapshotNotFoundError, SnapshotCreationError } from '../errors';

// Simple error
throw new SnapshotNotFoundError('snap-123');

// Error with cause chaining
try {
  await database.save(snapshot);
} catch (err) {
  throw new SnapshotCreationError(
    'Failed to save snapshot to database',
    filePath,
    err instanceof Error ? err : new Error(String(err))
  );
}
```

### Catching and Handling Errors

```typescript
import { isSnapshotError, isStorageError, toError } from '../errors';

try {
  await snapshotManager.create(filePath);
} catch (error) {
  if (isSnapshotError(error)) {
    // Handle snapshot-specific errors
    logger.error('Snapshot operation failed', {
      code: error.code,
      message: error.message,
      snapshotId: error instanceof SnapshotNotFoundError ? error.snapshotId : undefined
    });
  } else if (isStorageError(error)) {
    // Handle storage errors
    logger.error('Storage error', { code: error.code });
    showErrorNotification('Database error occurred');
  } else {
    // Handle unknown errors
    const err = toError(error);
    logger.error('Unknown error', { message: err.message });
  }
}
```

### Error Conversion

```typescript
import { toError, ensureSnapBackError } from '../errors';

// Convert unknown error to Error
catch (error: unknown) {
  const err = toError(error); // Always returns Error instance
  logger.error(err.message);
}

// Wrap error in SnapBackError
catch (error: unknown) {
  const snapbackError = ensureSnapBackError(error, 'OPERATION_FAILED');
  throw snapbackError;
}
```

### Error Severity

```typescript
import { getErrorSeverity, ErrorSeverity } from '../errors';

try {
  await operation();
} catch (error) {
  const severity = getErrorSeverity(error);

  switch (severity) {
    case ErrorSeverity.CRITICAL:
      // System failure - show modal, disable extension
      showCriticalErrorModal(error);
      break;
    case ErrorSeverity.HIGH:
      // Important failure - show persistent notification
      showErrorNotification(error);
      break;
    case ErrorSeverity.MEDIUM:
      // Degraded functionality - show warning
      showWarningNotification(error);
      break;
    case ErrorSeverity.LOW:
      // Expected behavior - log only
      logger.info('Operation blocked', { error });
      break;
  }
}
```

### Full Error Chain

```typescript
import { SnapBackError } from '../errors';

const error = new SnapshotCreationError(
  'Failed to create snapshot',
  filePath,
  new DatabaseConnectionError(
    'Database connection lost',
    new Error('ECONNREFUSED')
  )
);

// Get full error chain
console.log(error.getFullMessage());
// Output:
// Failed to create snapshot
// Caused by: Database connection lost
// Caused by: ECONNREFUSED
```

## Type Guards

All error types have corresponding type guard functions:

```typescript
import {
  isSnapBackError,
  isStorageError,
  isSnapshotError,
  isSessionError,
  isProtectionError,
  isValidationError,
  isConfigurationError,
  isFileSystemError
} from '../errors';

if (isSnapshotError(error)) {
  // TypeScript knows error is SnapshotError
  console.log(error.code); // Available
}
```

## Error Codes

All errors have unique codes for programmatic handling:

| Error Class | Code |
|-------------|------|
| DatabaseConnectionError | `DATABASE_CONNECTION_ERROR` |
| DatabaseInitializationError | `DATABASE_INITIALIZATION_ERROR` |
| DatabaseQueryError | `DATABASE_QUERY_ERROR` |
| DatabaseTransactionError | `DATABASE_TRANSACTION_ERROR` |
| StorageCorruptionError | `STORAGE_CORRUPTION_ERROR` |
| SnapshotNotFoundError | `SNAPSHOT_NOT_FOUND` |
| SnapshotCreationError | `SNAPSHOT_CREATION_ERROR` |
| SnapshotRestorationError | `SNAPSHOT_RESTORATION_ERROR` |
| SnapshotValidationError | `SNAPSHOT_VALIDATION_ERROR` |
| SnapshotDeduplicationError | `SNAPSHOT_DEDUPLICATION_ERROR` |
| SessionNotFoundError | `SESSION_NOT_FOUND` |
| SessionCreationError | `SESSION_CREATION_ERROR` |
| SessionFinalizationError | `SESSION_FINALIZATION_ERROR` |
| SessionRestorationError | `SESSION_RESTORATION_ERROR` |
| ProtectionBlockedError | `PROTECTION_BLOCKED` |
| InvalidProtectionLevelError | `INVALID_PROTECTION_LEVEL` |
| PolicyEvaluationError | `POLICY_EVALUATION_ERROR` |
| ValidationError | `VALIDATION_ERROR` |
| SchemaValidationError | `SCHEMA_VALIDATION_ERROR` |
| ConfigurationError | `CONFIGURATION_ERROR` |
| ConfigurationFileNotFoundError | `CONFIGURATION_FILE_NOT_FOUND` |
| ConfigurationParseError | `CONFIGURATION_PARSE_ERROR` |
| FileNotFoundError | `FILE_NOT_FOUND` |
| FileReadError | `FILE_READ_ERROR` |
| FileWriteError | `FILE_WRITE_ERROR` |
| FilePermissionError | `FILE_PERMISSION_ERROR` |
| EventBusConnectionError | `EVENT_BUS_CONNECTION_ERROR` |
| EventPublishError | `EVENT_PUBLISH_ERROR` |

## Best Practices

### 1. Always Chain Errors

```typescript
// Good ✅
try {
  await lowLevelOperation();
} catch (err) {
  throw new HighLevelError('Operation failed', toError(err));
}

// Bad ❌
try {
  await lowLevelOperation();
} catch (err) {
  throw new HighLevelError('Operation failed'); // Lost context
}
```

### 2. Use Specific Error Types

```typescript
// Good ✅
throw new SnapshotNotFoundError(snapshotId);

// Bad ❌
throw new Error('Snapshot not found: ' + snapshotId);
```

### 3. Handle Unknown Errors Safely

```typescript
// Good ✅
catch (error: unknown) {
  const err = toError(error);
  logger.error(err.message);
}

// Bad ❌
catch (error: any) {
  logger.error(error.message); // Unsafe
}
```

### 4. Use Type Guards

```typescript
// Good ✅
if (isSnapshotError(error)) {
  // TypeScript knows the type
  handleSnapshotError(error);
}

// Bad ❌
if (error instanceof SnapshotError) {
  // Works, but type guards are more flexible
}
```

### 5. Include Contextual Information

```typescript
// Good ✅
throw new FileReadError(
  filePath,
  new Error(`Permission denied: ${filePath}`)
);

// Bad ❌
throw new FileReadError(filePath);
```

## Integration with Result Type

The error system works seamlessly with the `Result<T, E>` type:

```typescript
import { Result, Err, Ok } from '../types/result';
import { SnapshotCreationError, toError } from '../errors';

async function createSnapshot(filePath: string): Promise<Result<Snapshot, SnapshotCreationError>> {
  try {
    const snapshot = await doCreate(filePath);
    return Ok(snapshot);
  } catch (error) {
    return Err(new SnapshotCreationError(
      'Failed to create snapshot',
      filePath,
      toError(error)
    ));
  }
}
```

## Testing Error Handling

```typescript
import { describe, it, expect } from 'vitest';
import { SnapshotNotFoundError, isSnapshotError } from '../errors';

describe('Error Handling', () => {
  it('should throw specific error type', async () => {
    await expect(
      snapshotManager.restore('nonexistent')
    ).rejects.toThrow(SnapshotNotFoundError);
  });

  it('should chain errors correctly', async () => {
    try {
      await operation();
    } catch (error) {
      expect(isSnapshotError(error)).toBe(true);
      expect(error.cause).toBeDefined();
      expect(error.getFullMessage()).toContain('Caused by');
    }
  });

  it('should have correct error code', () => {
    const error = new SnapshotNotFoundError('snap-123');
    expect(error.code).toBe('SNAPSHOT_NOT_FOUND');
  });
});
```

## Related Documentation

- [Result Type System](../types/result.ts) - Type-safe error handling pattern
- [Strict Mode Analysis](../../STRICT_MODE_ANALYSIS.md) - TypeScript strict mode compliance
- [VS Code Extension Guide](../../CLAUDE.md) - Extension architecture overview
