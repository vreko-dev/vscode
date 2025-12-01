---
apply: model-decision
---

# Testing Strategy

## Core Principle
Achieve 70%+ test coverage with unit tests, integration tests, and E2E tests. Mock VSCode API, test business logic in isolation, use real extension tests for integration.

## Test Organization
- `test/unit/` - Isolated business logic
- `test/integration/` - Component integration
- `test/e2e/` - Full extension tests
- `test/helpers/vscodeHelpers.ts` - VSCode API mocks

## Unit Testing Pattern
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SnapshotDeduplicator } from '../../../src/snapshot/SnapshotDeduplicator';

describe('SnapshotDeduplicator', () => {
  let deduplicator: SnapshotDeduplicator;

  beforeEach(() => {
    deduplicator = new SnapshotDeduplicator(500); // max cache size
  });

  it('should detect duplicate snapshots', () => {
    const state1: SnapshotState = {
      id: 'snapshot-1',
      timestamp: Date.now(),
      files: [
        { path: '/app.ts', content: 'code', hash: 'abc123' }
      ]
    };

    const state2: SnapshotState = {
      id: 'snapshot-2',
      timestamp: Date.now() + 1000,
      files: [
        { path: '/app.ts', content: 'code', hash: 'abc123' } // Same content
      ]
    };

    // First snapshot - no duplicate
    expect(deduplicator.findDuplicate(state1)).toBeNull();

    // Second snapshot - duplicate detected
    expect(deduplicator.findDuplicate(state2)).toBe('snapshot-1');
  });

  it('should handle undefined entries gracefully', () => {
    const state: SnapshotState = {
      id: 'snapshot-1',
      timestamp: Date.now(),
      files: []  // Empty files
    };

    expect(() => deduplicator.findDuplicate(state)).not.toThrow();
  });
});
```

## Mocking VSCode API
```typescript
import { vi } from 'vitest';
const mockMemento = {
  get: vi.fn(),
  update: vi.fn(),
  keys: vi.fn()
};
// See test/helpers/vscodeHelpers.ts for VSCodeMockFactory
```

## Integration Testing Pattern
```typescript
describe('Storage Integration', () => {
  let storage: SqliteSnapshotStorage;

  beforeEach(async () => {
    // Setup test storage
  });

  afterEach(async () => {
    await storage.close();
    await rimraf(testDir);
  });
});
```

## E2E Testing
```typescript
import * as vscode from 'vscode';

suite('Extension Activation', () => {
  test('Extension should activate', async () => {
    const ext = vscode.extensions.getExtension('snapback.snapback');
    await ext?.activate();
    assert.ok(ext?.isActive);
  });
});
```

## Test Coverage Targets
- **Overall**: 70%+ (project standard)
- **Critical paths**: 90%+ (snapshot creation, protection, restoration)
- **Edge cases**: 80%+ (error handling, invalid data)
- **Tree providers**: 85%+ (defensive programming validation)

## Missing Test Scenarios (from codebase analysis)
```typescript
// Tree Provider Tests - Missing edge cases
describe('ProtectedFilesTreeProvider Edge Cases', () => {
  it('should filter undefined entries', async () => {
    // Test that undefined entries are filtered without crashing
  });

  it('should filter entries with missing labels', async () => {
    // Test that entries without labels are filtered
  });

  it('should handle storage corruption gracefully', async () => {
    // Test that corrupted Memento data doesn't crash tree
  });

  it('should maintain filtering in production builds', async () => {
    // Test that defensive checks aren't optimized away
  });
});

// Storage Tests - Missing scenarios
describe('Storage Corruption Scenarios', () => {
  it('should handle corrupted database gracefully', async () => {
    // Test recovery from SQLite corruption
  });

  it('should rebuild cache after filtering invalid entries', async () => {
    // Test that protectedPathsIndex is correctly rebuilt
  });
});

// Race Condition Tests
describe('Concurrent Operations', () => {
  it('should handle concurrent add() and list() calls', async () => {
    // Test that filtering remains consistent during concurrent ops
  });

  it('should handle rapid refresh() calls', async () => {
    // Test that tree doesn't crash with rapid updates
  });
});
```

## Requirements
✅ Use Vitest for unit and integration tests
✅ Mock VSCode API with `test/helpers/vscodeHelpers.ts`
✅ Use VSCode Extension Test Runner for E2E tests
✅ Test defensive programming (undefined, null, empty data)
✅ Test error paths, not just happy paths
✅ Clean up test resources in `afterEach`
✅ Use descriptive test names: `should [expected behavior] when [condition]`
✅ Mark demo-critical tests with `[DEMO]` prefix
✅ Achieve 70%+ overall coverage

## Anti-Patterns
❌ Not testing error cases
❌ Not cleaning up test resources (database files, temp dirs)
❌ Testing implementation details instead of behavior
❌ Not mocking external dependencies (VSCode API, filesystem)
❌ Skipping tests without explanation
❌ Not testing edge cases (empty arrays, undefined, null)
❌ Assuming production build behavior matches dev
❌ Not testing async error handling

## Running Tests
```bash
# Unit tests
pnpm test:unit

# Integration tests
pnpm test:integration

# E2E tests (requires VSCode)
pnpm test:e2e

# Coverage report
pnpm test:coverage

# Watch mode
pnpm test:watch
```
