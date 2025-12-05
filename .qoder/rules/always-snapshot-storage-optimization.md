---
apply: always
---

# Snapshot Storage Optimization

## Core Principle
Snapshots MUST use diff-based storage to minimize disk usage. Store diffs when smaller than full content, store full content when diff is larger. ALWAYS compare compressed sizes.

## Current Implementation (SqliteSnapshotStorage.ts)
```typescript
private determineOptimalStorageStrategy(
  parentContent: string,
  currentContent: string,
  filePath: string
): { useFullContent: true } | { useFullContent: false; diff: string } {
  // 1. Generate unified diff using git-like algorithm
  const diff = createPatch(filePath, parentContent, currentContent);

  // 2. Compress BOTH for accurate size comparison
  const compressedDiff = compress(diff);
  const compressedFullContent = compress(currentContent);

  // 3. Choose smaller option
  if (compressedFullContent.length <= compressedDiff.length) {
    return { useFullContent: true };
  }

  return { useFullContent: false, diff };
}
```

## Database Schema
```sql
CREATE TABLE file_changes (
  id INTEGER PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  file_path TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('add', 'modify', 'delete')),
  diff BLOB,            -- Compressed diff OR full content
  storage_type TEXT,    -- 'full' | 'diff'
  content_size INTEGER, -- Original size before compression
  FOREIGN KEY (snapshot_id) REFERENCES snapshots(id) ON DELETE CASCADE
);

CREATE INDEX idx_file_changes_snapshot ON file_changes(snapshot_id);
CREATE INDEX idx_file_changes_file_covering
  ON file_changes(file_path, snapshot_id) WHERE action != 'delete';
```

## Content Reconstruction
```typescript
// Retrieve snapshot with parent chain
async getSnapshot(id: string): Promise<SnapshotData> {
  const files = new Map<string, string>();
  const deletedFiles = new Set<string>();

  // Walk parent chain to build file state
  let currentId: string | null = id;
  while (currentId) {
    const changes = db.prepare('SELECT * FROM file_changes WHERE snapshot_id = ?')
      .all(currentId);

    for (const change of changes) {
      if (change.action === 'delete') {
        deletedFiles.add(change.file_path);
        files.delete(change.file_path);
      } else {
        const decompressed = decompress(change.diff);

        if (change.storage_type === 'full') {
          files.set(change.file_path, decompressed);
        } else {
          // Apply diff to current file state
          const current = files.get(change.file_path) || '';
          const patched = applyPatch(current, decompressed);
          files.set(change.file_path, patched);
        }
      }
    }

    currentId = getParentId(currentId);
  }

  return { files, deletedFiles };
}
```

## Deduplication (SnapshotDeduplicator.ts)
```typescript
// Hash-based duplicate detection - O(1) lookup
class SnapshotDeduplicator {
  private stateHashCache = new Map<string, string>(); // hash -> snapshotId

  findDuplicate(state: SnapshotState): string | null {
    // Generate deterministic hash from file contents
    const stateHash = this.generateStateHash(state);

    if (this.stateHashCache.has(stateHash)) {
      return this.stateHashCache.get(stateHash)!;
    }

    this.addToCache(stateHash, state.id);
    return null;
  }

  private generateStateHash(state: SnapshotState): string {
    // Sort files by path for deterministic ordering
    const sorted = [...state.files].sort((a, b) => a.path.localeCompare(b.path));
    const combined = sorted.map(f => f.hash).join(':');
    return createHash('sha256').update(combined).digest('hex');
  }
}
```

## Performance Requirements
- Snapshot creation: <100ms (target: <50ms achieved)
- Deduplication check: <5ms (current: <5ms ✅)
- Hash calculation: <10ms per file
- Storage size: 60-80% reduction via diff+compression
- Database queries: Use covering indexes for <10ms retrieval

## Requirements
✅ ALWAYS compress before size comparison (not raw sizes)
✅ Store `storage_type` metadata ('full' | 'diff')
✅ Use `createPatch()` from 'diff' library for unified diffs
✅ Handle identical content efficiently (skip storage, reference parent)
✅ Implement parent chain traversal for reconstruction
✅ Use SHA-256 for content hashing (deterministic, collision-resistant)
✅ Cache state hashes in memory (FIFO eviction at 500 entries)

## Anti-Patterns
❌ Comparing raw diff size vs raw content size (always compress first!)
❌ Storing full content when diff is smaller
❌ Not caching file hashes (recalculating on every deduplication check)
❌ Using MD5 or non-cryptographic hashes (risk of collisions)
❌ Forgetting to update storage_type metadata
❌ Not handling parent chain breakage gracefully
❌ Storing deleted files in database (use action='delete' marker)

## Monitoring
Log storage statistics on snapshot creation:
```typescript
logger.info('Snapshot created', {
  snapshotId,
  fileCount: files.size,
  storageStrategy: { full: fullCount, diff: diffCount },
  totalSize: compressedSize,
  compressionRatio: originalSize / compressedSize
});
```
