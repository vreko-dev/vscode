# Result Type System

Type-safe error handling without exceptions, inspired by Rust's `Result<T, E>` type.

## Overview

The Result type provides an explicit, type-safe way to handle operations that can fail. Instead of throwing exceptions, functions return a `Result<T, E>` that contains either a successful value (`Ok`) or an error (`Err`).

## Benefits

- **Type-safe error handling** - Compiler enforces error handling
- **Explicit error flows** - No hidden control flow from exceptions
- **Composable** - Chain operations with `map`, `andThen`, etc.
- **No try-catch** - Cleaner, more functional code
- **Better for concurrent operations** - No exception propagation issues

## Basic Usage

### Creating Results

```typescript
import { Ok, Err, Result } from './result';

function divide(a: number, b: number): Result<number, string> {
  if (b === 0) {
    return Err('Division by zero');
  }
  return Ok(a / b);
}

// Success case
const success = divide(10, 2);
// success: { success: true, value: 5 }

// Error case
const failure = divide(10, 0);
// failure: { success: false, error: 'Division by zero' }
```

### Checking Results

```typescript
import { isOk, isErr } from './result';

const result = divide(10, 2);

// Type guard approach
if (isOk(result)) {
  console.log('Result:', result.value); // TypeScript knows .value exists
} else {
  console.error('Error:', result.error); // TypeScript knows .error exists
}

// Direct check
if (result.success) {
  console.log('Result:', result.value);
} else {
  console.log('Error:', result.error);
}
```

## Advanced Usage

### Unwrapping Results

```typescript
import { unwrap, unwrapOr, unwrapOrElse } from './result';

const result = divide(10, 2);

// Unwrap or throw
const value = unwrap(result); // 5 (or throws if Err)

// Unwrap with default
const safe = unwrapOr(result, 0); // 5

// Unwrap with function
const computed = unwrapOrElse(result, (error) => {
  console.error('Error occurred:', error);
  return 0;
}); // 5
```

### Transforming Results

```typescript
import { map, mapErr } from './result';

const result = divide(10, 2);

// Transform success value
const doubled = map(result, (value) => value * 2);
// doubled: Ok(10)

// Transform error
const wrappedError = mapErr(result, (err) => new Error(err));
// wrappedError: Ok(5) (no change if Ok)
```

### Chaining Operations

```typescript
import { andThen } from './result';

function parseNumber(str: string): Result<number, string> {
  const num = parseInt(str, 10);
  if (isNaN(num)) {
    return Err('Not a number');
  }
  return Ok(num);
}

function squareRoot(num: number): Result<number, string> {
  if (num < 0) {
    return Err('Cannot take square root of negative number');
  }
  return Ok(Math.sqrt(num));
}

// Chain operations
const result = andThen(
  parseNumber('16'),
  (num) => squareRoot(num)
);
// result: Ok(4)

const failed = andThen(
  parseNumber('abc'),
  (num) => squareRoot(num)
);
// failed: Err('Not a number') - squareRoot never called
```

### Working with Promises

```typescript
import { fromPromise, toPromise } from './result';

// Convert Promise to Result
const result = await fromPromise(
  fetch('https://api.example.com/data')
);

if (isOk(result)) {
  const data = await result.value.json();
} else {
  console.error('Fetch failed:', result.error);
}

// Convert Result to Promise
const promise = toPromise(divide(10, 2));
const value = await promise; // 5

const failedPromise = toPromise(divide(10, 0));
await failedPromise; // Rejects with error
```

### Combining Multiple Results

```typescript
import { all, allOrErrors } from './result';

const results = [
  divide(10, 2),  // Ok(5)
  divide(20, 4),  // Ok(5)
  divide(30, 6),  // Ok(5)
];

// Get all values or first error
const combined = all(results);
// combined: Ok([5, 5, 5])

const mixedResults = [
  divide(10, 2),  // Ok(5)
  divide(10, 0),  // Err('Division by zero')
  divide(30, 6),  // Ok(5)
];

const failed = all(mixedResults);
// failed: Err('Division by zero')

// Collect all errors
const withErrors = allOrErrors(mixedResults);
// withErrors: Err(['Division by zero'])
```

### Try-Catch Wrappers

```typescript
import { tryCatch, tryCatchAsync } from './result';

// Wrap synchronous function
const safeParse = tryCatch((str: string) => {
  return JSON.parse(str);
});

const result = safeParse('{"valid": "json"}');
// result: Ok({valid: 'json'})

const failed = safeParse('invalid json');
// failed: Err(SyntaxError(...))

// Wrap async function
const safeFetch = tryCatchAsync(async (url: string) => {
  const response = await fetch(url);
  return await response.json();
});

const data = await safeFetch('https://api.example.com/data');
if (isOk(data)) {
  console.log('Data:', data.value);
}
```

## Real-World Examples

### Snapshot Creation

```typescript
import { Result, Ok, Err, fromPromise } from '../types/result';
import { SnapshotCreationError, toError } from '../errors';
import type { Snapshot } from '../types/snapshot';

class SnapshotManager {
  async create(filePath: string): Promise<Result<Snapshot, SnapshotCreationError>> {
    // Read file content
    const contentResult = await fromPromise(
      fs.promises.readFile(filePath, 'utf-8')
    );

    if (isErr(contentResult)) {
      return Err(new SnapshotCreationError(
        'Failed to read file',
        filePath,
        contentResult.error
      ));
    }

    // Create snapshot
    const snapshot = {
      id: generateId(),
      filePath,
      content: contentResult.value,
      timestamp: Date.now()
    };

    // Save to storage
    const saveResult = await fromPromise(
      this.storage.save(snapshot)
    );

    if (isErr(saveResult)) {
      return Err(new SnapshotCreationError(
        'Failed to save snapshot',
        filePath,
        saveResult.error
      ));
    }

    return Ok(snapshot);
  }
}
```

### Using the Snapshot Manager

```typescript
const manager = new SnapshotManager();
const result = await manager.create('/path/to/file.ts');

if (isOk(result)) {
  const snapshot = result.value;
  showNotification(`Snapshot created: ${snapshot.id}`);
  eventBus.publish('SNAPSHOT_CREATED', snapshot);
} else {
  const error = result.error;
  logger.error('Snapshot creation failed', {
    code: error.code,
    message: error.getFullMessage()
  });
  showErrorNotification('Failed to create snapshot');
}
```

### Chaining Multiple Operations

```typescript
import { andThen, map } from '../types/result';

async function processSnapshot(filePath: string): Promise<Result<string, Error>> {
  // Chain: create → validate → deduplicate → store → return ID
  return andThen(
    await createSnapshot(filePath),
    (snapshot) => andThen(
      validateSnapshot(snapshot),
      (validated) => andThen(
        deduplicateSnapshot(validated),
        (deduplicated) => andThen(
          storeSnapshot(deduplicated),
          (stored) => Ok(stored.id)
        )
      )
    )
  );
}

// Usage
const result = await processSnapshot('/path/to/file.ts');
const snapshotId = unwrapOr(result, 'unknown');
```

### Configuration Loading

```typescript
async function loadConfig(): Promise<Result<Config, ConfigurationError>> {
  const configPath = path.join(workspaceRoot, '.snapbackrc');

  // Check if file exists
  const existsResult = await fromPromise(
    fs.promises.access(configPath, fs.constants.R_OK)
  );

  if (isErr(existsResult)) {
    return Err(new ConfigurationFileNotFoundError(configPath));
  }

  // Read file
  const contentResult = await fromPromise(
    fs.promises.readFile(configPath, 'utf-8')
  );

  if (isErr(contentResult)) {
    return Err(new ConfigurationError(
      'Failed to read configuration',
      configPath,
      contentResult.error
    ));
  }

  // Parse JSON
  const parseResult = tryCatch((content: string) => JSON.parse(content));
  const jsonResult = parseResult(contentResult.value);

  if (isErr(jsonResult)) {
    return Err(new ConfigurationParseError(configPath, jsonResult.error));
  }

  // Validate schema
  const validateResult = validateConfigSchema(jsonResult.value);

  if (isErr(validateResult)) {
    return Err(new ConfigurationError(
      'Invalid configuration schema',
      configPath,
      validateResult.error
    ));
  }

  return Ok(validateResult.value);
}
```

## Pattern Comparison

### Before (Exceptions)

```typescript
async function createSnapshot(filePath: string): Promise<Snapshot> {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8');
    const snapshot = { id: generateId(), filePath, content, timestamp: Date.now() };
    await this.storage.save(snapshot);
    return snapshot;
  } catch (error) {
    // What type is error? Need runtime check
    if (error instanceof StorageError) {
      logger.error('Storage failed', error);
    } else if (error instanceof FileSystemError) {
      logger.error('File read failed', error);
    } else {
      logger.error('Unknown error', error);
    }
    throw new SnapshotCreationError('Failed', filePath, toError(error));
  }
}

// Usage - no type safety
try {
  const snapshot = await createSnapshot('/path/to/file.ts');
  // Use snapshot
} catch (error) {
  // Again, need runtime checks
  if (error instanceof SnapshotCreationError) {
    // Handle
  }
}
```

### After (Result Type)

```typescript
async function createSnapshot(filePath: string): Promise<Result<Snapshot, SnapshotCreationError>> {
  const contentResult = await fromPromise(fs.promises.readFile(filePath, 'utf-8'));
  if (isErr(contentResult)) {
    return Err(new SnapshotCreationError('Failed to read', filePath, contentResult.error));
  }

  const snapshot = { id: generateId(), filePath, content: contentResult.value, timestamp: Date.now() };

  const saveResult = await fromPromise(this.storage.save(snapshot));
  if (isErr(saveResult)) {
    return Err(new SnapshotCreationError('Failed to save', filePath, saveResult.error));
  }

  return Ok(snapshot);
}

// Usage - type safe!
const result = await createSnapshot('/path/to/file.ts');
if (isOk(result)) {
  // TypeScript knows result.value is Snapshot
  const snapshot = result.value;
} else {
  // TypeScript knows result.error is SnapshotCreationError
  const error = result.error;
  logger.error(error.code, error.message);
}
```

## Best Practices

### 1. Use Result for Expected Errors

```typescript
// Good ✅ - Error is expected part of API
function findSnapshot(id: string): Result<Snapshot, SnapshotNotFoundError>

// Bad ❌ - Throwing hides error in type signature
function findSnapshot(id: string): Snapshot
```

### 2. Keep Exceptions for Unexpected Errors

```typescript
// Unexpected programming errors should still throw
if (!this.initialized) {
  throw new Error('SnapshotManager not initialized');
}

// Expected errors should use Result
if (!snapshot) {
  return Err(new SnapshotNotFoundError(id));
}
```

### 3. Use Type Guards

```typescript
// Good ✅
if (isOk(result)) {
  // TypeScript knows result.value exists
}

// Okay
if (result.success) {
  // Works, but less idiomatic
}
```

### 4. Chain Operations

```typescript
// Good ✅ - Functional composition
const result = await andThen(
  loadConfig(),
  (config) => andThen(
    validateConfig(config),
    (valid) => applyConfig(valid)
  )
);

// Bad ❌ - Imperative style defeats the purpose
const configResult = await loadConfig();
if (isErr(configResult)) return configResult;
const validateResult = await validateConfig(configResult.value);
if (isErr(validateResult)) return validateResult;
// ...
```

### 5. Document Error Types

```typescript
/**
 * Creates a snapshot of the given file
 *
 * @param filePath - Absolute path to file
 * @returns Result containing Snapshot or SnapshotCreationError
 *
 * Error cases:
 * - File not found or not readable
 * - Storage save failed
 * - Invalid file content
 */
function create(filePath: string): Promise<Result<Snapshot, SnapshotCreationError>>
```

## Migration Guide

### Gradual Adoption

1. **Start with new code** - Use Result for all new functions
2. **Wrap existing code** - Use `tryCatch` and `fromPromise` to wrap legacy functions
3. **Convert critical paths** - Migrate high-value error paths first
4. **Update tests** - Test both Ok and Err cases

### Converting Existing Functions

```typescript
// Before
async function oldFunction(): Promise<Data> {
  const result = await riskyOperation();
  return result;
}

// After - wrap with fromPromise
async function newFunction(): Promise<Result<Data, Error>> {
  return fromPromise(oldFunction());
}

// Eventually - rewrite for full type safety
async function betterFunction(): Promise<Result<Data, SpecificError>> {
  const result = await fromPromise(riskyOperation());
  if (isErr(result)) {
    return Err(new SpecificError('Operation failed', result.error));
  }
  return Ok(result.value);
}
```

## Testing

```typescript
import { describe, it, expect } from 'vitest';
import { Ok, Err, isOk, isErr } from './result';

describe('Result Type', () => {
  describe('divide function', () => {
    it('should return Ok for valid division', () => {
      const result = divide(10, 2);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(5);
      }
    });

    it('should return Err for division by zero', () => {
      const result = divide(10, 0);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe('Division by zero');
      }
    });
  });

  describe('map', () => {
    it('should transform Ok value', () => {
      const result = map(Ok(5), (x) => x * 2);
      expect(result).toEqual(Ok(10));
    });

    it('should pass through Err', () => {
      const result = map(Err('error'), (x: number) => x * 2);
      expect(result).toEqual(Err('error'));
    });
  });
});
```

## Related Documentation

- [Error System](../errors/README.md) - Hierarchical error types
- [Strict Mode Analysis](../../STRICT_MODE_ANALYSIS.md) - TypeScript compliance report
- [VS Code Extension](../../CLAUDE.md) - Extension architecture
