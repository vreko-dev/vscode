---
apply: always
---

# Error Handling Pattern

## Core Principle
Use Result<T,E> for type-safe errors. Log technical details, show user-friendly UI messages. All async operations show progress.

## Result Type Pattern
```typescript
// Type definition (src/types/result.ts)
export type Result<T, E> = Ok<T> | Err<E>;
export interface Ok<T> { success: true; value: T; }
export interface Err<E> { success: false; error: E; }

export function Ok<T>(value: T): Ok<T> { return { success: true, value }; }
export function Err<E>(error: E): Err<E> { return { success: false, error }; }

export function isOk<T, E>(result: Result<T, E>): result is Ok<T> {
  return result.success === true;
}
```

## Usage Pattern
```typescript
// Define specific error types
export type FileError =
  | { type: 'NotFound'; path: string }
  | { type: 'PermissionDenied'; path: string }
  | { type: 'InvalidFormat'; path: string; reason: string };

// Function returns Result
async function readFile(path: string): Promise<Result<string, FileError>> {
  try {
    const content = await fs.readFile(path, 'utf-8');
    return Ok(content);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return Err({ type: 'NotFound', path });
    }
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      return Err({ type: 'PermissionDenied', path });
    }
    return Err({ type: 'InvalidFormat', path, reason: String(error) });
  }
}

// Consumer handles errors explicitly
const result = await readFile('/path/to/file');
if (isOk(result)) {
  processContent(result.value);
} else {
  handleFileError(result.error);
}
```

## UI Error Handling
**Pattern:** Log first, then show user message
```typescript
try {
  await createSnapshot(files);
} catch (error) {
  // 1. Log technical details with context
  logger.error('Snapshot creation failed', error as Error, {
    fileCount: files.length,
    workspaceRoot
  });

  // 2. Show user-friendly message
  vscode.window.showErrorMessage(
    'Could not create snapshot. Please check that files are not locked.'
  );
}
```

## Progress Notifications
```typescript
await vscode.window.withProgress({
  location: vscode.ProgressLocation.Notification,
  title: "Creating snapshot...",
  cancellable: true
}, async (progress, token) => {
  if (token.isCancellationRequested) return;

  progress.report({ message: 'Analyzing files...', increment: 33 });
  const files = await analyzeFiles();

  if (token.isCancellationRequested) return;

  progress.report({ message: 'Saving...', increment: 67 });
  await storage.save(files);
});
```

## Message Guidelines
**✅ User-Friendly:**
- 'Could not save snapshot. The file may be locked.'
- 'Snapshot limit reached. Delete old snapshots to continue.'
- 'Git repository not found. Initialize git to enable snapshot naming.'

**❌ Technical:**
- 'EACCES: permission denied, open \'/path/to/file\''
- 'Operation failed with exit code 128'
- 'SQLITE_CORRUPT'

## Result Type Integration
```typescript
async function createSnapshot(files: FileInput[]): Promise<Result<RichSnapshot, SnapshotError>> {
  // Validation
  if (files.length === 0) {
    return Err({ type: 'NoFiles', message: 'No files to snapshot' });
  }

  // Operation
  try {
    const snapshot = await storage.create(files);
    return Ok(snapshot);
  } catch (error) {
    logger.error('Snapshot creation failed', error as Error);
    return Err({ type: 'StorageFailed', message: String(error) });
  }
}

// Usage
const result = await createSnapshot(files);
if (isOk(result)) {
  vscode.window.showInformationMessage(`Snapshot created: ${result.value.name}`);
} else {
  switch (result.error.type) {
    case 'NoFiles':
      vscode.window.showWarningMessage('No files selected');
      break;
    case 'StorageFull':
      vscode.window.showErrorMessage('Storage limit exceeded');
      break;
  }
}
```

## Requirements
✅ Return Result<T,E> for all fallible operations
✅ Define specific error types (discriminated unions)
✅ Log errors BEFORE showing user messages
✅ Use `vscode.window.withProgress()` for async ops >1s
✅ Handle CancellationToken in long operations
✅ Show actionable error messages
✅ Use appropriate notification levels (info/warning/error)

## Anti-Patterns
❌ try-catch for expected failures (use Result instead)
❌ Returning null/undefined to indicate errors
❌ Generic error types: `Err<string>`
❌ Showing technical error messages to users
❌ Not logging errors before showing messages
❌ Swallowing errors without logging
❌ Using `any` for error types
