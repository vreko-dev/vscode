---
globs:
  - "src/storage/**/*.ts"
---

# Storage Layer Patterns

## Core Principle
Storage layer handles persistence with SQLite, implements diff-based optimization, ensures data integrity. All operations are async and transactional.

## Database Schema
See `always-snapshot-storage-optimization.md` for complete schema. Key tables:
- `snapshots`: id, name, timestamp, parent_id, metadata
- `file_changes`: snapshot_id, file_path, action, diff (BLOB), storage_type, content_size
- Indexes: timestamp DESC, snapshot_id, file_path covering index

## Initialization Pattern
```typescript
export class SqliteSnapshotStorage implements vscode.Disposable {
  private db: Database | null = null;
  private dbPath: string;
  private lock = new AsyncLock();

  constructor(storagePath: string) {
    this.dbPath = path.join(storagePath, 'snapshots.db');
  }

  async initialize(): Promise<void> {
    await this.lock.acquire('init', async () => {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.dbPath), { recursive: true });

      // Open database (creates if not exists)
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better concurrency
      this.db.pragma('journal_mode = WAL');
      this.db.pragma('foreign_keys = ON');

      // Create tables and indexes
      this.createSchema();

      logger.info('SQLite storage initialized', { dbPath: this.dbPath });
    });
  }

  private createSchema(): void {
    if (!this.db) throw new Error('Database not initialized');

    // Create tables (SQL from above)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS snapshots (...);
      CREATE TABLE IF NOT EXISTS file_changes (...);
      CREATE INDEX IF NOT EXISTS idx_snapshots_timestamp ...;
      CREATE INDEX IF NOT EXISTS idx_file_changes_snapshot ...;
      CREATE INDEX IF NOT EXISTS idx_file_changes_file_covering ...;
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  dispose(): void {
    if (this.db) {
      this.db.close();
    }
  }
}
```

## Transaction Pattern
```typescript
async createSnapshot(
  name: string,
  files: Map<string, string>,
  metadata?: Record<string, unknown>,
  parentId?: string
): Promise<{ id: string; timestamp: number }> {
  await this.lock.acquire('write', async () => {
    if (!this.db) throw new DatabaseError('Database not initialized');

    const id = randomUUID();
    const timestamp = Date.now();

    try {
      // Begin transaction
      const insert = this.db.transaction(() => {
        // Insert snapshot record
        this.db!.prepare(`
          INSERT INTO snapshots (id, name, timestamp, parent_id, metadata)
          VALUES (?, ?, ?, ?, ?)
        `).run(
          id,
          name,
          timestamp,
          parentId || null,
          JSON.stringify({ fileCount: files.size, ...metadata })
        );

        // Insert file changes
        const insertChange = this.db!.prepare(`
          INSERT INTO file_changes
          (snapshot_id, file_path, action, diff, storage_type, content_size)
          VALUES (?, ?, ?, ?, ?, ?)
        `);

        for (const [filePath, content] of files.entries()) {
          const strategy = this.determineOptimalStorageStrategy(
            parentContent,
            content,
            filePath
          );

          const compressed = compress(
            strategy.useFullContent ? content : strategy.diff
          );

          insertChange.run(
            id,
            filePath,
            'add',
            compressed,
            strategy.useFullContent ? 'full' : 'diff',
            content.length
          );
        }
      });

      // Execute transaction atomically
      insert();

      return { id, timestamp };

    } catch (error) {
      logger.error('Failed to create snapshot', error as Error);
      throw new DatabaseError('Snapshot creation failed', { cause: error });
    }
  });
}
```

## Compression & Diff
```typescript
// Use gzipSync/gunzipSync with level 6
import { gzipSync, gunzipSync } from 'zlib';
import { createPatch, applyPatch } from 'diff';

// Compress before storing (see storage optimization rule for strategy)
const compressed = gzipSync(content, { level: 6 });
const decompressed = gunzipSync(compressed).toString('utf-8');

// Reconstruct: apply diffs in chronological order or use full content
```

## Error Handling
```typescript
// Custom error types for storage layer
export class DatabaseError extends Error {
  constructor(message: string, public readonly metadata?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

export class CorruptedDataError extends Error {
  constructor(
    message: string,
    public readonly snapshotId: string,
    public readonly filePath: string
  ) {
    super(message);
    this.name = 'CorruptedDataError';
  }
}

// Usage in storage methods
async getSnapshot(id: string): Promise<SnapshotData> {
  if (!this.db) {
    throw new DatabaseError('Database not initialized');
  }

  const snapshot = this.db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id);

  if (!snapshot) {
    throw new DatabaseError(`Snapshot not found: ${id}`);
  }

  try {
    const files = this.reconstructFiles(id);
    return { id, files };
  } catch (error) {
    throw new CorruptedDataError(
      'Failed to reconstruct snapshot files',
      id,
      'unknown'
    );
  }
}
```

## Requirements
✅ Use better-sqlite3 for synchronous operations
✅ Wrap all writes in transactions
✅ Use AsyncLock for serializing writes
✅ Enable WAL mode: `db.pragma('journal_mode = WAL')`
✅ Enable foreign keys: `db.pragma('foreign_keys = ON')`
✅ Create covering indexes for common queries
✅ Compress all stored content with gzip (level 6)
✅ Store metadata as JSON TEXT (not separate columns)
✅ Use prepared statements (prevent SQL injection)
✅ Close database in dispose()

## Anti-Patterns
❌ Not using transactions (risk of partial writes)
❌ Concurrent writes without locking
❌ Storing uncompressed content
❌ Not validating foreign key constraints
❌ Inline SQL without prepared statements
❌ Not handling database corruption
❌ Forgetting to close database on deactivate
❌ Synchronous compression (blocks event loop)
❌ Not creating indexes for query patterns

## Testing Storage Layer
```typescript
describe('SqliteSnapshotStorage', () => {
  let storage: SqliteSnapshotStorage;
  const testDir = path.join(__dirname, '.test-storage');

  beforeEach(async () => {
    await fs.mkdir(testDir, { recursive: true });
    storage = new SqliteSnapshotStorage(testDir);
    await storage.initialize();
  });

  afterEach(async () => {
    await storage.close();
    await rimraf(testDir);
  });

  it('should use diff when smaller than full content', async () => {
    const original = 'line1\nline2\nline3\n';
    const modified = 'line1\nmodified\nline3\n';

    const strategy = (storage as any).determineOptimalStorageStrategy(
      original,
      modified,
      'test.txt'
    );

    expect(strategy.useFullContent).toBe(false);
    expect(strategy.diff).toBeDefined();
  });
});
```
