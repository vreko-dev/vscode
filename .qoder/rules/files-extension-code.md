---
globs:
  - "src/extension/**/*.ts"
  - "src/commands/**/*.ts"
  - "src/handlers/**/*.ts"
---

# Extension Code Patterns

## Core Principle
Extension code runs in Node.js context with full VSCode API access. Extension and webview contexts NEVER share execution. Use Node.js modules, handle async operations properly, register all disposables.

## Architecture Boundaries
**Extension Context:** Node.js with VSCode API, filesystem, crypto, SQLite, git access
**Webview Context:** Sandboxed browser, uses `acquireVsCodeApi()`, NO direct imports from extension

**Communication:** postMessage ONLY
```typescript
// Extension receives messages
webviewView.webview.onDidReceiveMessage((data) => {
  switch (data.type) {
    case 'initialize': vscode.commands.executeCommand('snapback.initialize'); break;
  }
});

// Webview sends messages
const vscode = acquireVsCodeApi();
vscode.postMessage({ type: 'initialize' });
```

## Node.js APIs Available
```typescript
// Filesystem operations
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

// Cryptography
import { createHash, randomBytes } from 'node:crypto';

// Process management
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);
```

## Extension Lifecycle Pattern (extension.ts)
```typescript
export async function activate(context: vscode.ExtensionContext) {
  const startTime = Date.now();

  // 1. Initialize output channel and logger
  const outputChannel = vscode.window.createOutputChannel("SnapBack");
  context.subscriptions.push(outputChannel);
  logger.getInstance(outputChannel);

  // 2. Verify workspace exists
  if (!vscode.workspace.workspaceFolders) {
    vscode.window.showErrorMessage("SnapBack requires an open workspace");
    throw new Error("No workspace folder");
  }

  // 3. Check workspace trust
  if (!vscode.workspace.isTrusted) {
    logger.warn("Workspace not trusted - running in limited mode");
  }

  // 4. Initialize services in phases
  const phase1 = initializePhase1Services();
  const phase2 = await initializePhase2Storage(workspaceRoot, context);
  const phase3 = await initializePhase3Managers(phase2, workspaceRoot, context);
  const phase4 = await initializePhase4Providers(phase3, context);
  await initializePhase5Registration(phase4, context);

  // 5. Register commands
  registerAllCommands(context, phase4.services);

  logger.info(`Extension activated in ${Date.now() - startTime}ms`);
}

export async function deactivate() {
  // Cleanup: close database connections, flush buffers
  if (storage) {
    await storage.close();
  }
  if (eventBus) {
    await eventBus.dispose();
  }
}
```

## Command Registration Pattern
```typescript
// commands/index.ts
export function registerAllCommands(
  context: vscode.ExtensionContext,
  services: Services
): void {
  const commands = [
    vscode.commands.registerCommand('snapback.createSnapshot', async () => {
      await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Creating snapshot...",
        cancellable: true
      }, async (progress, token) => {
        if (token.isCancellationRequested) return;

        const result = await services.snapshotManager.create();

        if (isOk(result)) {
          vscode.window.showInformationMessage(
            `Snapshot created: ${result.value.name}`
          );
        } else {
          handleError(result.error);
        }
      });
    }),

    // Register more commands...
  ];

  // Add all to subscriptions for cleanup
  context.subscriptions.push(...commands);
}
```

## File Operations with Security
```typescript
// ALWAYS validate paths before filesystem operations
import { PathValidator } from '../utils/PathValidator';

async function saveSnapshot(filePath: string, content: string): Promise<void> {
  // 1. Validate path is within workspace
  const workspaceRoot = vscode.workspace.workspaceFolders![0].uri.fsPath;

  if (!PathValidator.isWithinWorkspace(filePath, workspaceRoot)) {
    throw new Error('Path outside workspace');
  }

  // 2. Ensure directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  // 3. Write file atomically
  const tempPath = `${filePath}.tmp`;
  await fs.writeFile(tempPath, content, 'utf-8');
  await fs.rename(tempPath, filePath);
}
```

## Git Operations with Timeout
```typescript
// handlers/SaveHandler.ts pattern
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

async function getGitDiff(workspaceRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-status'], {
      cwd: workspaceRoot,
      timeout: 5000, // ALWAYS set timeout (5s max)
      maxBuffer: 1024 * 1024 // 1MB max output
    });
    return stdout;
  } catch (error) {
    if ((error as Error & { killed?: boolean }).killed) {
      logger.warn('Git command timed out after 5s');
      return '';
    }
    throw error;
  }
}
```

## Event Emitters Pattern
```typescript
import * as vscode from 'vscode';

export class MyService implements vscode.Disposable {
  private _onDidChange = new vscode.EventEmitter<ChangeEvent>();
  public readonly onDidChange = this._onDidChange.event;

  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Setup
  }

  private notifyChange(event: ChangeEvent): void {
    this._onDidChange.fire(event);
  }

  dispose(): void {
    this._onDidChange.dispose();
    this.disposables.forEach(d => d.dispose());
  }
}

// Usage
const service = new MyService();
const subscription = service.onDidChange((event) => {
  console.log('Service changed:', event);
});

context.subscriptions.push(service, subscription);
```

## Context Variables Pattern
```typescript
// Update context for when clauses in package.json
async function updateContextVariables(context: ExtensionContext): Promise<void> {
  const protectedFiles = await protectedFileRegistry.list();

  await vscode.commands.executeCommand(
    'setContext',
    'snapback.hasProtectedFiles',
    protectedFiles.length > 0
  );

  await vscode.commands.executeCommand(
    'setContext',
    'snapback.workspaceTrusted',
    vscode.workspace.isTrusted
  );
}
```

## Requirements
✅ Register ALL disposables in `context.subscriptions`
✅ Implement `vscode.Disposable` for services with cleanup
✅ Use `vscode.window.withProgress()` for async operations
✅ Validate paths with `PathValidator.isWithinWorkspace()`
✅ Set 5s timeout on ALL git commands
✅ Use `fs/promises` (async) not sync filesystem operations
✅ Handle `CancellationToken` in long-running operations
✅ Log errors before showing user messages
✅ Use EventEmitter for inter-component communication

## Git Operations Security
**CRITICAL:** ALL git commands MUST have 5s timeout, validated paths, use execFileAsync:
```typescript
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execFileAsync = promisify(execFile);

async function gitDiff(workspaceRoot: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['diff', '--name-status'], {
      cwd: workspaceRoot,
      timeout: 5000,  // ALWAYS 5s max
      maxBuffer: 1024 * 1024
    });
    return stdout;
  } catch (error) {
    if ((error as any).killed) {
      logger.warn('Git timed out after 5s');
      return '';
    }
    return ''; // Graceful fallback
  }
}
```

**Security:**
✅ Use `execFileAsync` (NOT `exec` - prevents shell injection)
✅ Validate `cwd` with `PathValidator.isWithinWorkspace()`
✅ NEVER pass user input as command name
✅ Set `maxBuffer` to prevent memory exhaustion
❌ NEVER use shell: true
❌ NEVER arbitrary working directories

## Anti-Patterns
❌ Forgetting to dispose EventEmitters (memory leak)
❌ Synchronous filesystem operations (`fs.readFileSync`)
❌ Git commands without timeout or path validation
❌ Not validating paths before filesystem access
❌ Swallowing errors without logging
❌ Not handling cancellation tokens
❌ Direct filesystem state storage (use Memento API)
❌ Global variables instead of dependency injection
❌ Direct imports between extension/webview contexts

## Error Handling
```typescript
// Extension context error handling
try {
  await riskyOperation();
} catch (error) {
  // 1. Log technical details
  logger.error('Operation failed', error as Error, { context });

  // 2. Show user-friendly message
  vscode.window.showErrorMessage(
    'Could not complete operation. See output for details.'
  );

  // 3. Update UI state if needed
  statusBar.hide();
}
```
