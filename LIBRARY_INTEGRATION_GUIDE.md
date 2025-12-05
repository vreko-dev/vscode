# SnapBack VS Code Extension - Library Integration Guide

## Overview

This guide explains how all SnapBack components work together using VS Code extension APIs. Architecture focuses on:
- **Lazy activation** (load only when needed)
- **Event-driven updates** (reactive state changes)
- **Bi-directional WebView messaging** (extension ↔ WebView)
- **Persistent state** (survive VS Code reload)

---

## 1. Extension Lifecycle & Activation

### Activation Model

```typescript
// package.json
"activationEvents": [
  "onCommand:snapback.createSnapshot",
  "onCommand:snapback.showDashboard",
  "onView:snapback-snapshots",      // When tree view expanded
  "onStartupFinished"                // Fallback: load at startup if needed
],

// extension.ts - Activation
export async function activate(context: vscode.ExtensionContext) {
  // Extension loads ONLY when user triggers activation event
  // Minimize initialization work here

  const integration = new AutoDecisionIntegration(
    snapshotManager,
    notificationManager,
    config,
    context  // Pass context for state management
  );

  await integration.activate();

  // Register disposal cleanup
  context.subscriptions.push(integration);
}

export async function deactivate() {
  // Cleanup: dispose watchers, save state
  // Must return Promise if async
}
```

### Subscription Management

```typescript
// CRITICAL: Use context.subscriptions for lifecycle management
context.subscriptions.push(
  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration('snapback')) {
      // Handle config change
    }
  }),

  vscode.workspace.onDidSaveTextDocument((doc) => {
    // Handle save
  }),

  vscode.commands.registerCommand('snapback.showDashboard', () => {
    // Command handler
  }),

  statusBar,     // StatusBarItem implements Disposable
  dashboard      // WebviewPanel implements Disposable
);

// ✅ Automatic cleanup on deactivation
// ❌ Never call .dispose() manually if added to context.subscriptions
```

---

## 2. State Management Layers

### Layer 1: Workspace State (Per-Folder)
**Use**: File-specific snapshots, folder-level settings
**Scope**: Single workspace folder
**Persistence**: Survives VS Code reload
```typescript
// Load snapshot metadata for current folder
const snapshotMetadata = context.workspaceState.get<SnapshotMetadata[]>(
  `snapback:snapshots`
);

// Save snapshot when created
await context.workspaceState.update(
  `snapback:snapshots`,
  [...(snapshotMetadata || []), newSnapshot]
);
```

### Layer 2: Global State (Cross-Workspace)
**Use**: User preferences, recent activity, statistics
**Scope**: All VS Code sessions
**Persistence**: Survives reload AND sync across machines
```typescript
// Load user's default settings
const riskThreshold = context.globalState.get<number>(
  'snapback:riskThreshold',
  60  // default
);

// Update (synced via VS Code settings sync)
await context.globalState.update('snapback:riskThreshold', 75);

// Mark for sync across machines
context.globalState.setKeysForSync(['snapback:riskThreshold']);
```

### Layer 3: Secrets Storage (Encrypted)
**Use**: API keys, authentication tokens
**Scope**: Machine-local, encrypted
**Persistence**: NOT synced (security)
```typescript
// Store API key securely
await context.secrets.store('snapback:apiKey', apiKeyValue);

// Retrieve secret
const apiKey = await context.secrets.get('snapback:apiKey');

// Delete secret
await context.secrets.delete('snapback:apiKey');
```

### Layer 4: Workspace Configuration
**Use**: VS Code built-in settings
**Scope**: Per-workspace (can be folder-specific)
**Source**: package.json "configuration" section
```typescript
// Read workspace setting
const config = vscode.workspace.getConfiguration('snapback');
const riskThreshold = config.get<number>('autoDecision.riskThreshold', 60);

// Update workspace setting
await config.update(
  'autoDecision.riskThreshold',
  75,
  vscode.ConfigurationTarget.Workspace
);

// Listen for changes
vscode.workspace.onDidChangeConfiguration((e) => {
  if (e.affectsConfiguration('snapback.autoDecision')) {
    console.log('Settings changed!');
  }
});
```

---

## 3. Event Architecture

### Event Flow Pattern

```
User Action (save file, keystroke, command)
  ↓
VS Code Event (onDidSaveTextDocument, onDidChangeTextDocument)
  ↓
SnapBack Event Handler (debounced, filtered)
  ↓
SaveContextBuilder (extract metadata)
  ↓
AutoDecisionIntegration.onFileChange()
  ↓
AutoDecisionEngine (evaluate risk)
  ↓
Decision (create snapshot? notify? restore?)
  ↓
EventEmitter.fire() → SnapshotManager, NotificationManager
  ↓
Dashboard updates via WebView message
  ↓
StatusBar items update
  ↓
User sees real-time feedback
```

### Debouncing Pattern
```typescript
// Problem: onDidChangeTextDocument fires for every character
// Solution: Debounce to batch changes

class AutoDecisionIntegration {
  private changeDebounce: NodeJS.Timeout | null = null;
  private readonly DEBOUNCE_MS = 300;

  private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    // Clear previous timer
    if (this.changeDebounce) {
      clearTimeout(this.changeDebounce);
    }

    // Collect changes, process once after user stops typing
    this.changeDebounce = setTimeout(() => {
      this.processBatch([event]);
      this.changeDebounce = null;
    }, this.DEBOUNCE_MS);
  }
}
```

### EventEmitter Pattern
```typescript
// Create domain events
class AutoDecisionEngine {
  private onDecisionMade = new vscode.EventEmitter<Decision>();
  readonly onDecision = this.onDecisionMade.event;

  async evaluate(context: SaveContext): Promise<Decision> {
    const decision = { /* ... */ };

    // Notify subscribers
    this.onDecisionMade.fire(decision);

    return decision;
  }
}

// Listen in another component
engine.onDecision((decision) => {
  if (decision.shouldCreateSnapshot) {
    snapshotManager.create(decision.snapshot);
  }
});
```

---

## 4. WebView Integration

### Panel Lifecycle

```typescript
class DashboardProvider {
  private panel: vscode.WebviewPanel | undefined;

  openDashboard(context: vscode.ExtensionContext) {
    // Reuse if open
    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    // Create panel with security + persistence options
    this.panel = vscode.window.createWebviewPanel(
      'snapback-dashboard',
      'SnapBack Dashboard',
      vscode.ViewColumn.One,
      {
        enableScripts: true,                  // Allow JavaScript
        retainContextWhenHidden: true,        // Keep state when hidden
        localResourceRoots: [context.extensionUri],  // Security: restrict resources
        enableCommandUris: true                // Allow command: URIs
      }
    );

    // Set HTML content (with CSP)
    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    // Handle cleanup
    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // Handle messages from WebView
    this.panel.webview.onDidReceiveMessage((message) => {
      this.handleWebViewMessage(message);
    });

    // Listen for engine updates → send to WebView
    engine.onDecision((decision) => {
      this.panel?.webview.postMessage({
        command: 'updateStats',
        data: { risk: decision.riskScore, threats: decision.threats }
      });
    });
  }

  private getWebviewContent(webview: vscode.Webview): string {
    // Content Security Policy (CSP)
    const cspSource = webview.cspSource;

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none';
      img-src https: ${cspSource};
      script-src ${cspSource};
      style-src ${cspSource};">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SnapBack Dashboard</title>
</head>
<body>
  <div id="app"></div>

  <script>
    const vscode = acquireVsCodeApi(); // Get VS Code API in WebView

    // Restore previous state if WebView was hidden
    const state = vscode.getState() || { stats: {} };

    // Listen for messages from extension
    window.addEventListener('message', event => {
      const message = event.data;
      switch (message.command) {
        case 'updateStats':
          state.stats = message.data;
          renderDashboard(state.stats);
          vscode.setState(state);  // Persist state
          break;
      }
    });

    // Send message to extension
    function requestStats() {
      vscode.postMessage({ command: 'getData' });
    }
  </script>
</body>
</html>`;
  }

  private handleWebViewMessage(message: any) {
    switch (message.command) {
      case 'getData':
        // Send current state to WebView
        const stats = this.getStats();
        this.panel?.webview.postMessage({
          command: 'updateStats',
          data: stats
        });
        break;
    }
  }
}
```

### Message Protocol

```typescript
// Extension → WebView (push updates)
panel.webview.postMessage({
  command: 'updateStats',
  data: {
    totalSnapshots: 15,
    protectedFiles: 8,
    avgRiskScore: 62,
    threats: [/* ... */]
  }
});

// WebView → Extension (user actions)
window.addEventListener('message', (event) => {
  const message = event.data;

  if (message.command === 'restoreSnapshot') {
    // Execute restore command in extension
    vscode.commands.executeCommand('snapback.restoreSnapshot', message.snapshotId);
  }
});

// OR: WebView sends command directly
vscode.postMessage({
  command: 'action',
  action: 'restoreSnapshot',
  snapshotId: 'snap-123'
});
```

---

## 5. StatusBar Integration

### StatusBar Items Pattern

```typescript
class StatusBarProvider {
  private items: Map<string, vscode.StatusBarItem> = new Map();

  activate(context: vscode.ExtensionContext) {
    // Main status item
    const mainItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100  // Priority
    );
    mainItem.text = '$(shield) SnapBack';
    mainItem.tooltip = 'SnapBack: Protection Active';
    mainItem.command = 'snapback.showDashboard';
    mainItem.show();
    this.items.set('main', mainItem);

    // Threat counter
    const threatItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      99   // Slightly lower priority
    );
    threatItem.text = '$(warning) 0';
    threatItem.tooltip = 'No active threats';
    threatItem.command = 'snapback.viewThreats';
    threatItem.show();
    this.items.set('threats', threatItem);

    // Register for cleanup
    context.subscriptions.push(...Array.from(this.items.values()));

    // Update on engine decisions
    engine.onDecision((decision) => {
      this.updateItems(decision);
    });
  }

  private updateItems(decision: Decision) {
    // Update threat count
    const threatItem = this.items.get('threats');
    if (threatItem) {
      const count = decision.threats.length;
      threatItem.text = count > 0
        ? `$(error) ${count} Threat${count > 1 ? 's' : ''}`
        : '$(shield) Safe';
      threatItem.tooltip = `Risk Score: ${decision.riskScore}%`;
    }

    // Update main status
    const mainItem = this.items.get('main');
    if (mainItem) {
      mainItem.text = decision.riskScore > 70
        ? '$(warning) SnapBack: Alert'
        : '$(shield) SnapBack: Protected';
    }
  }
}
```

---

## 6. Command Registration

### Command Hierarchy

```typescript
export function activate(context: vscode.ExtensionContext) {
  // User-facing commands (in Command Palette)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'snapback.createSnapshot',
      () => snapshotManager.create()
    ),

    vscode.commands.registerCommand(
      'snapback.showDashboard',
      () => dashboardProvider.openDashboard()
    ),

    vscode.commands.registerCommand(
      'snapback.restoreSnapshot',
      (snapshotId: string) => snapshotManager.restore(snapshotId)
    )
  );

  // Internal commands (for WebView/StatusBar)
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'snapback.viewThreats',
      (decision: Decision) => dashboardProvider.highlightThreats(decision)
    )
  );
}

// Execute command programmatically
await vscode.commands.executeCommand('snapback.restoreSnapshot', 'snap-123');

// Command URI in WebView/Markdown
const commandUri = vscode.Uri.parse('command:snapback.showDashboard');
```

---

## 7. File Watchers

### Efficient Watching Pattern

```typescript
class FileWatcherManager {
  private watchers: vscode.FileSystemWatcher[] = [];

  activate(context: vscode.ExtensionContext) {
    // Watch TypeScript/JavaScript files only
    const watcher = vscode.workspace.createFileSystemWatcher(
      '**/*.{ts,tsx,js,jsx}',
      false,  // includeCreateEvents (we care about creates)
      false,  // includeChangeEvents (we care about changes)
      true    // includeDeleteEvents (we don't care about deletes)
    );

    // Handle file changes
    watcher.onDidChange((uri) => {
      this.onFileChange(uri);
    });

    watcher.onDidCreate((uri) => {
      this.onFileCreate(uri);
    });

    // Cleanup
    context.subscriptions.push(watcher);
    this.watchers.push(watcher);
  }

  private onFileChange(uri: vscode.Uri) {
    // Filter: ignore node_modules, dist, etc.
    if (this.shouldIgnore(uri)) {
      return;
    }

    // Emit event (will be debounced by caller)
    this.changeEmitter.fire(uri);
  }

  private shouldIgnore(uri: vscode.Uri): boolean {
    const path = uri.fsPath.toLowerCase();
    return /node_modules|\.git|dist|build/.test(path);
  }
}
```

---

## 8. Configuration Management

### Settings Flow

```typescript
// package.json
"configuration": {
  "title": "SnapBack Auto-Decision Engine",
  "properties": {
    "snapback.autoDecision.riskThreshold": {
      "type": "number",
      "minimum": 0,
      "maximum": 100,
      "default": 60,
      "scope": "resource",
      "markdownDescription": "Risk score threshold for automatic snapshots..."
    }
  }
}

// In SettingsLoader
class SettingsLoader {
  private onSettingsChangeEmitter = new vscode.EventEmitter<AllSettings>();
  readonly onSettingsChange = this.onSettingsChangeEmitter.event;

  loadAutoDecisionSettings(): AutoDecisionSettings {
    const config = vscode.workspace.getConfiguration('snapback.autoDecision');

    return {
      riskThreshold: Math.max(0, Math.min(100, config.get('riskThreshold', 60))),
      notifyThreshold: config.get('notifyThreshold', 40),
      // ... validate relationships
    };
  }

  constructor(private context: vscode.ExtensionContext) {
    // Listen for config changes
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('snapback')) {
        const settings = this.loadAutoDecisionSettings();
        this.onSettingsChangeEmitter.fire({ autoDecision: settings });
      }
    });
  }
}

// In AutoDecisionIntegration
constructor(
  private snapshotManager: SnapshotManager,
  private notificationManager: NotificationManager,
  config?: Partial<AutoDecisionConfig>,
  private context?: vscode.ExtensionContext
) {
  // Load settings at startup
  if (context) {
    this.settingsLoader = new SettingsLoader(context);
    const settings = this.settingsLoader.loadAutoDecisionSettings();

    // Update engine with loaded settings
    this.engine.updateConfig({
      riskThreshold: settings.riskThreshold,
      notifyThreshold: settings.notifyThreshold
    });

    // React to settings changes
    this.settingsLoader.onSettingsChange((settings) => {
      this.engine.updateConfig({
        riskThreshold: settings.autoDecision.riskThreshold
      });
    });
  }
}
```

---

## 9. Full Integration Example

### Activation → Decision → Update Flow

```typescript
// 1. ACTIVATION
export async function activate(context: vscode.ExtensionContext) {
  // Initialize managers
  const storage = new GlobalStateStorageAdapter(context.globalState);
  const snapshotOrchestrator = new SnapshotOrchestrator(storage);
  const snapshotManager = new SnapshotManager(snapshotOrchestrator);
  const notificationManager = new NotificationManager();

  // Initialize integration (wires everything)
  const integration = new AutoDecisionIntegration(
    snapshotManager,
    notificationManager,
    undefined,
    context
  );

  // 2. FILE CHANGE → DECISION
  integration.onFileChange.then(() => {
    // SaveContextBuilder extracts metadata
    const context = new SaveContextBuilder(uri, editor).build();

    // AutoDecisionEngine evaluates risk
    const decision = integration.engine.evaluate(context);

    // 3. DECISION → ACTION
    if (decision.shouldCreateSnapshot) {
      snapshotManager.create(decision.snapshot);
    }

    if (decision.shouldNotify) {
      notificationManager.show(decision.notification);
    }
  });

  // 4. UPDATE → UI
  integration.engine.onDecision((decision) => {
    // Dashboard receives update
    dashboardProvider.updateStats({
      riskScore: decision.riskScore,
      threats: decision.threats
    });

    // StatusBar updates
    statusBar.update({
      text: decision.threats.length > 0 ? '$(error) Alert' : '$(shield) Safe',
      tooltip: `Risk: ${decision.riskScore}%`
    });
  });

  // 5. PERSISTENCE
  // SettingsLoader watches for config changes
  settingsLoader.onSettingsChange((settings) => {
    integration.engine.updateConfig(settings);
  });

  // Snapshot state saved to globalState automatically
  await integration.activate();
  context.subscriptions.push(integration);
}
```

---

## 10. Best Practices Checklist

### ✅ DO

- [ ] Use `context.subscriptions` for all disposables
- [ ] Debounce high-frequency events (onDidChange)
- [ ] Use `retainContextWhenHidden` for WebView persistence
- [ ] Set CSP policy in WebView HTML
- [ ] Cache expensive computations (file parsing, metadata extraction)
- [ ] Use `onDidChangeConfiguration` for reactive settings
- [ ] Mark secrets for sync with `setKeysForSync()`
- [ ] Fire events to notify subscribers of state changes
- [ ] Validate user input from WebView messages
- [ ] Handle errors gracefully (user-facing messages)

### ❌ DON'T

- [ ] Call `.dispose()` on items in `context.subscriptions`
- [ ] Use `*` activation event unless necessary
- [ ] Store secrets in `globalState` or `workspaceState`
- [ ] Make WebView HTML by string concatenation (use template literals + validation)
- [ ] Fire high-frequency events without debouncing
- [ ] Block activation with long-running operations
- [ ] Forget to dispose file watchers and event listeners
- [ ] Send unvalidated data from extension to WebView
- [ ] Store sensitive data in plain text

---

## References

- [VS Code API Reference](https://code.visualstudio.com/api/references/vscode-api)
- [Extension Guidelines](https://code.visualstudio.com/api/extension-guides)
- [When Clause Contexts](https://code.visualstudio.com/api/references/when-clause-contexts)
- [Activation Events](https://code.visualstudio.com/api/references/activation-events)
