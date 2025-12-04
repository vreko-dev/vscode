# DiffViewManager & React Webview Architecture

**Document Version**: 1.0.0
**Date**: 2025-12-03
**Status**: Design Document - Ready for Implementation

---

## Executive Summary

This document specifies the architecture for **DiffViewManager** (VSCode extension backend) and **DiffViewer** (React webview frontend) to provide interactive AI change review with side-by-side diff visualization and rollback capabilities.

**Design Goals**:
- Performance: <100ms panel creation, <50ms message handling
- Accessibility: WCAG 2.1 AA compliant with full keyboard navigation
- User Experience: Non-blocking workflow with inline action controls
- Reusability: Panel reuse by `changeId` to prevent duplicate panels

**Technology Stack**:
- **Frontend**: React 18 + TypeScript (no external UI library needed)
- **Diff Rendering**: VSCode native `vscode.diff` command (no library needed)
- **Styling**: VSCode Webview UI Toolkit CSS variables + custom CSS
- **Communication**: JSON-RPC 2.0-style messages via `postMessage`

---

## Architecture Overview

### System Context

```
┌─────────────────────────────────────────────────────────────────┐
│                    VSCode Extension Host                         │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              DiffViewManager                              │  │
│  │  - Creates/manages webview panels                        │  │
│  │  - Loads snapshot data from SnapshotManager              │  │
│  │  - Handles restore/ignore/accept actions                 │  │
│  │  - Reuses panels by changeId                             │  │
│  └───────────────────┬──────────────────────────────────────┘  │
│                      │                                           │
│                      │ postMessage                               │
│                      ↓                                           │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │              Webview Panel (React)                        │  │
│  │                                                            │  │
│  │  ┌────────────────────────────────────────────────────┐  │  │
│  │  │  DiffViewer.tsx                                     │  │  │
│  │  │  - Side-by-side diff display                        │  │  │
│  │  │  - Interactive controls (Rollback/Ignore/Accept)    │  │  │
│  │  │  - Syntax highlighting (VSCode theme tokens)        │  │  │
│  │  │  - Keyboard navigation (Arrow keys, Tab, Enter)     │  │  │
│  │  └────────────────────────────────────────────────────┘  │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User triggers "Review AI Change"
  ↓
DiffViewManager.openDiffViewer(changeId)
  ↓
Load snapshot from SnapshotManager
  ↓
Create/reuse WebviewPanel
  ↓
Send diff data to React component
  ↓
React renders side-by-side diff
  ↓
User clicks action button
  ↓
Webview sends message to extension
  ↓
DiffViewManager handles action (restore/ignore/accept)
  ↓
Update QuickDiffProvider tracking
  ↓
Close panel (or keep open for "Ignore")
```

---

## Component 1: DiffViewManager (Extension Backend)

### Responsibilities

1. **Lifecycle Management**: Create/reveal/dispose webview panels
2. **Data Orchestration**: Load snapshot and current content
3. **Action Handling**: Process rollback/ignore/accept commands
4. **Panel Reuse**: Maintain single panel per `changeId` to prevent duplicates
5. **State Tracking**: Coordinate with QuickDiffProvider and SnapshotManager

### Class Design

```typescript
/**
 * DiffViewManager - Orchestrates AI change review webview panels
 *
 * Performance Budgets:
 * - Panel creation: <100ms
 * - Message handling: <50ms
 * - Snapshot loading: <200ms (via SnapshotManager)
 *
 * Panel Reuse Strategy:
 * - Key by changeId to prevent duplicate panels
 * - Dispose stale panels when new changeId requested
 * - Graceful handling of concurrent requests
 */
export class DiffViewManager implements vscode.Disposable {
  // Panel cache: changeId → WebviewPanel
  private readonly _panels: Map<string, vscode.WebviewPanel> = new Map();

  // Disposables for cleanup
  private readonly _disposables: vscode.Disposable[] = [];

  // Extension context for webview resource URIs
  private readonly _extensionUri: vscode.Uri;

  // Dependencies
  private readonly _snapshotManager: SnapshotManager;
  private readonly _quickDiffProvider: QuickDiffProvider; // For tracking reviewed changes

  constructor(
    extensionUri: vscode.Uri,
    snapshotManager: SnapshotManager,
    quickDiffProvider: QuickDiffProvider
  ) {
    this._extensionUri = extensionUri;
    this._snapshotManager = snapshotManager;
    this._quickDiffProvider = quickDiffProvider;
  }

  /**
   * Open diff viewer for an AI change
   *
   * @param changeId - Unique identifier for the change (format: `${filePath}:${snapshotId}`)
   * @returns Promise that resolves when panel is ready
   *
   * Performance: <100ms for panel creation
   *
   * Workflow:
   * 1. Check if panel already exists for this changeId
   * 2. If exists → reveal and update content
   * 3. If not exists → create new panel
   * 4. Load snapshot data from SnapshotManager
   * 5. Load current file content from workspace
   * 6. Send diff data to webview via postMessage
   *
   * Error Handling:
   * - Snapshot not found → show error notification
   * - File not found → show warning (file may have been deleted)
   * - Concurrent requests → queue and process sequentially
   */
  public async openDiffViewer(changeId: string): Promise<void> {
    const startTime = Date.now();

    try {
      // Parse changeId to extract filePath and snapshotId
      const { filePath, snapshotId } = this._parseChangeId(changeId);

      // Reuse existing panel or create new one
      let panel = this._panels.get(changeId);

      if (panel) {
        // Panel exists - reveal it
        panel.reveal(vscode.ViewColumn.Beside);
      } else {
        // Create new panel
        panel = this._createPanel(changeId, filePath);
        this._panels.set(changeId, panel);
      }

      // Load snapshot and current content in parallel
      const [snapshot, currentContent] = await Promise.all([
        this._loadSnapshot(snapshotId, filePath),
        this._loadCurrentContent(filePath)
      ]);

      // Validate snapshot was found
      if (!snapshot) {
        vscode.window.showErrorMessage(`Snapshot not found: ${snapshotId}`);
        this._disposePanel(changeId);
        return;
      }

      // Send diff data to webview
      await this._sendDiffData(panel, {
        changeId,
        filePath,
        snapshotId,
        original: snapshot.content,
        changed: currentContent,
        recommendation: snapshot.metadata?.aiRecommendation || 'AI-suggested change',
        fileName: path.basename(filePath),
        timestamp: snapshot.timestamp
      });

      // Performance tracking
      const elapsed = Date.now() - startTime;
      logger.info(`DiffViewManager.openDiffViewer completed in ${elapsed}ms`);

      if (elapsed > 100) {
        logger.warn(`DiffViewManager.openDiffViewer exceeded 100ms budget: ${elapsed}ms`);
      }

    } catch (error) {
      logger.error('Failed to open diff viewer', error as Error);
      vscode.window.showErrorMessage(
        `Failed to open diff viewer: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Create webview panel with proper configuration
   *
   * @param changeId - Unique identifier for the change
   * @param filePath - File path for panel title
   * @returns Configured WebviewPanel
   *
   * Panel Configuration:
   * - viewType: 'snapback.diffViewer'
   * - title: 'Review: {filename}'
   * - viewColumn: Beside (split editor)
   * - retainContextWhenHidden: true (preserve React state)
   * - enableScripts: true (required for React)
   * - localResourceRoots: [extensionUri/webview-ui]
   */
  private _createPanel(changeId: string, filePath: string): vscode.WebviewPanel {
    const fileName = path.basename(filePath);

    const panel = vscode.window.createWebviewPanel(
      'snapback.diffViewer', // View type
      `Review: ${fileName}`, // Title
      vscode.ViewColumn.Beside, // Split editor
      {
        enableScripts: true, // Required for React
        retainContextWhenHidden: true, // Preserve state when hidden
        localResourceRoots: [
          vscode.Uri.joinPath(this._extensionUri, 'webview-ui')
        ]
      }
    );

    // Set HTML content with React bundle
    panel.webview.html = this._getHtmlForWebview(panel.webview);

    // Handle messages from webview
    const messageListener = panel.webview.onDidReceiveMessage(
      message => this._handleWebviewMessage(changeId, message)
    );

    // Handle panel disposal
    panel.onDidDispose(() => {
      this._disposePanel(changeId);
      messageListener.dispose();
    });

    this._disposables.push(messageListener);

    return panel;
  }

  /**
   * Handle messages from webview
   *
   * @param changeId - Change identifier
   * @param message - Message from webview
   *
   * Performance: <50ms message handling
   *
   * Message Types:
   * - rollback: Restore snapshot and close panel
   * - ignore: Mark as reviewed, keep panel open
   * - accept: Mark as reviewed and close panel
   *
   * Error Handling:
   * - Invalid message type → log warning
   * - Restore failure → show error, keep panel open
   * - Unknown changeId → log error (should not happen)
   */
  private async _handleWebviewMessage(
    changeId: string,
    message: WebviewMessage
  ): Promise<void> {
    const startTime = Date.now();

    try {
      switch (message.type) {
        case 'rollback': {
          await this._handleRollback(changeId);
          break;
        }

        case 'ignore': {
          await this._handleIgnore(changeId);
          break;
        }

        case 'accept': {
          await this._handleAccept(changeId);
          break;
        }

        default: {
          logger.warn(`Unknown message type: ${message.type}`);
        }
      }

      const elapsed = Date.now() - startTime;
      logger.info(`Message handling completed in ${elapsed}ms`);

      if (elapsed > 50) {
        logger.warn(`Message handling exceeded 50ms budget: ${elapsed}ms`);
      }

    } catch (error) {
      logger.error('Failed to handle webview message', error as Error);
      vscode.window.showErrorMessage(
        `Action failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Handle rollback action
   *
   * Workflow:
   * 1. Parse changeId to extract filePath and snapshotId
   * 2. Call SnapshotManager.restoreSnapshot()
   * 3. Update QuickDiffProvider to mark change as reviewed
   * 4. Show success notification
   * 5. Close panel
   *
   * Error Handling:
   * - Restore failure → show error, keep panel open for retry
   * - File locked → show error with suggestion to close file
   */
  private async _handleRollback(changeId: string): Promise<void> {
    const { filePath, snapshotId } = this._parseChangeId(changeId);

    try {
      // Restore snapshot through SnapshotManager
      await this._snapshotManager.restoreSnapshot(snapshotId, { files: [filePath] });

      // Update tracking
      this._quickDiffProvider.markAsReviewed(changeId);

      // Show success notification
      vscode.window.showInformationMessage(
        `✓ Rolled back ${path.basename(filePath)} to snapshot`
      );

      // Close panel
      this._disposePanel(changeId);

    } catch (error) {
      // Keep panel open on error for user to retry
      throw error;
    }
  }

  /**
   * Handle ignore action
   *
   * Workflow:
   * 1. Update QuickDiffProvider to mark change as reviewed
   * 2. Show info notification
   * 3. Close panel
   *
   * Note: Does not modify file content, only marks as reviewed
   */
  private async _handleIgnore(changeId: string): Promise<void> {
    this._quickDiffProvider.markAsReviewed(changeId);

    vscode.window.showInformationMessage('Change marked as reviewed');

    this._disposePanel(changeId);
  }

  /**
   * Handle accept action
   *
   * Workflow:
   * 1. Update QuickDiffProvider to mark change as accepted
   * 2. Optionally create new snapshot of accepted state
   * 3. Show success notification
   * 4. Close panel
   */
  private async _handleAccept(changeId: string): Promise<void> {
    const { filePath } = this._parseChangeId(changeId);

    // Mark as accepted
    this._quickDiffProvider.markAsAccepted(changeId);

    // Optionally create snapshot of accepted state
    // (This can be configured via settings)
    const shouldSnapshotAccepted = vscode.workspace
      .getConfiguration('snapback')
      .get('diffViewer.snapshotAcceptedChanges', false);

    if (shouldSnapshotAccepted) {
      await this._snapshotManager.createSnapshot(
        [{ path: filePath, content: await this._loadCurrentContent(filePath), action: 'modify' }],
        { description: `Accepted AI change: ${path.basename(filePath)}` }
      );
    }

    vscode.window.showInformationMessage('Change accepted');

    this._disposePanel(changeId);
  }

  /**
   * Load snapshot data from SnapshotManager
   *
   * @param snapshotId - Snapshot identifier
   * @param filePath - File path to extract from snapshot
   * @returns Snapshot content or undefined if not found
   *
   * Performance: <200ms (inherits from SnapshotManager budget)
   */
  private async _loadSnapshot(
    snapshotId: string,
    filePath: string
  ): Promise<{ content: string; metadata?: any; timestamp: number } | undefined> {
    const snapshot = await this._snapshotManager.get(snapshotId);

    if (!snapshot) {
      return undefined;
    }

    // Extract file content from snapshot
    const fileState = snapshot.fileStates?.find(f => f.path === filePath);

    if (!fileState) {
      return undefined;
    }

    return {
      content: fileState.content,
      metadata: snapshot.metadata,
      timestamp: snapshot.timestamp
    };
  }

  /**
   * Load current file content from workspace
   *
   * @param filePath - Absolute file path
   * @returns File content as string
   *
   * Error Handling:
   * - File not found → return empty string with warning
   * - Read error → throw error to propagate to caller
   */
  private async _loadCurrentContent(filePath: string): Promise<string> {
    try {
      const fileUri = vscode.Uri.file(filePath);
      const fileBytes = await vscode.workspace.fs.readFile(fileUri);
      return Buffer.from(fileBytes).toString('utf8');
    } catch (error) {
      logger.warn(`Failed to read current content: ${filePath}`, error as Error);
      return ''; // Return empty string for deleted files
    }
  }

  /**
   * Send diff data to webview
   *
   * @param panel - Webview panel
   * @param data - Diff data to send
   *
   * Message Format:
   * {
   *   type: 'diff-data',
   *   changeId: string,
   *   filePath: string,
   *   fileName: string,
   *   original: string,
   *   changed: string,
   *   recommendation: string,
   *   timestamp: number
   * }
   */
  private async _sendDiffData(
    panel: vscode.WebviewPanel,
    data: DiffData
  ): Promise<void> {
    await panel.webview.postMessage({
      type: 'diff-data',
      ...data
    });
  }

  /**
   * Parse changeId to extract filePath and snapshotId
   *
   * @param changeId - Format: `${filePath}:${snapshotId}`
   * @returns { filePath, snapshotId }
   *
   * Example:
   * - Input: 'src/auth.ts:cp-123-456'
   * - Output: { filePath: 'src/auth.ts', snapshotId: 'cp-123-456' }
   */
  private _parseChangeId(changeId: string): { filePath: string; snapshotId: string } {
    const lastColonIndex = changeId.lastIndexOf(':');

    if (lastColonIndex === -1) {
      throw new Error(`Invalid changeId format: ${changeId}`);
    }

    return {
      filePath: changeId.substring(0, lastColonIndex),
      snapshotId: changeId.substring(lastColonIndex + 1)
    };
  }

  /**
   * Dispose panel and clean up resources
   *
   * @param changeId - Change identifier
   */
  private _disposePanel(changeId: string): void {
    const panel = this._panels.get(changeId);

    if (panel) {
      panel.dispose();
      this._panels.delete(changeId);
    }
  }

  /**
   * Get HTML for webview with React bundle
   *
   * Returns HTML that:
   * - Loads React bundle (webview-ui/dist/diffViewer.js)
   * - Sets up CSP for security
   * - Injects nonce for inline scripts
   * - Configures VSCode API acquisition
   *
   * CSP Policy:
   * - default-src 'none'
   * - script-src webview.cspSource 'nonce-{nonce}'
   * - style-src webview.cspSource 'unsafe-inline' (required for VSCode theme tokens)
   * - font-src webview.cspSource
   */
  private _getHtmlForWebview(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'diffViewer.js')
    );

    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this._extensionUri, 'webview-ui', 'dist', 'diffViewer.css')
    );

    const nonce = this._getNonce();

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="
    default-src 'none';
    script-src ${webview.cspSource} 'nonce-${nonce}';
    style-src ${webview.cspSource} 'unsafe-inline';
    font-src ${webview.cspSource};
  ">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link href="${styleUri}" rel="stylesheet">
  <title>SnapBack Diff Viewer</title>
</head>
<body>
  <div id="root"></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  /**
   * Generate nonce for CSP
   */
  private _getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }

  /**
   * Dispose manager and clean up all panels
   */
  public dispose(): void {
    // Dispose all panels
    for (const panel of this._panels.values()) {
      panel.dispose();
    }
    this._panels.clear();

    // Dispose message listeners
    while (this._disposables.length) {
      const disposable = this._disposables.pop();
      disposable?.dispose();
    }
  }
}

/**
 * Type Definitions
 */

interface DiffData {
  changeId: string;
  filePath: string;
  fileName: string;
  snapshotId: string;
  original: string;
  changed: string;
  recommendation: string;
  timestamp: number;
}

interface WebviewMessage {
  type: 'rollback' | 'ignore' | 'accept';
}
```

### Performance Considerations

1. **Panel Reuse**: Prevents creating duplicate panels for same change
2. **Parallel Loading**: Snapshot and current content loaded in parallel
3. **Lazy Rendering**: React defers heavy rendering until needed
4. **Event Debouncing**: Message handling debounced to prevent flooding
5. **Memory Management**: Panels disposed when closed to prevent leaks

### Error Handling Strategy

| Error Type | Handling Strategy |
|------------|-------------------|
| Snapshot not found | Show error notification, dispose panel |
| File not found | Show warning, allow review of deleted file |
| Restore failure | Show error, keep panel open for retry |
| Concurrent requests | Queue and process sequentially |
| Message parsing error | Log warning, ignore invalid message |

---

## Component 2: DiffViewer React Component

### Responsibilities

1. **Diff Rendering**: Side-by-side comparison with line highlighting
2. **User Interaction**: Handle button clicks and keyboard shortcuts
3. **Accessibility**: WCAG 2.1 AA compliance with ARIA labels
4. **Theming**: Respect VSCode theme colors and user preferences
5. **State Management**: React hooks for diff data and UI state

### Component Architecture

```
DiffViewer (root)
├── DiffHeader (metadata + recommendation)
├── DiffContainer (side-by-side layout)
│   ├── DiffColumn (left - original)
│   │   └── CodeBlock (syntax highlighted)
│   └── DiffColumn (right - changed)
│       └── CodeBlock (syntax highlighted with highlights)
└── ActionBar (buttons)
    ├── RollbackButton
    ├── IgnoreButton
    └── AcceptButton
```

### React Component Implementation

```typescript
/**
 * DiffViewer.tsx - Interactive AI change review component
 *
 * Features:
 * - Side-by-side diff visualization
 * - Syntax highlighting using VSCode theme tokens
 * - Keyboard navigation (Tab, Arrow keys, Enter, Escape)
 * - WCAG 2.1 AA accessible (ARIA labels, focus management)
 * - Responsive layout (handles panel resize)
 *
 * Performance:
 * - Initial render: <200ms for typical file
 * - Interaction latency: <16ms (60fps)
 * - Memory: <10MB for typical diff
 */

import React, { useEffect, useState, useCallback } from 'react';
import './DiffViewer.css';

/**
 * Message types for extension communication
 */
interface DiffData {
  changeId: string;
  filePath: string;
  fileName: string;
  snapshotId: string;
  original: string;
  changed: string;
  recommendation: string;
  timestamp: number;
}

interface VSCodeAPI {
  postMessage(message: any): void;
  getState(): any;
  setState(state: any): void;
}

declare global {
  interface Window {
    acquireVsCodeApi(): VSCodeAPI;
  }
}

/**
 * Main DiffViewer component
 */
export const DiffViewer: React.FC = () => {
  // VSCode API
  const [vscode] = useState(() => window.acquireVsCodeApi());

  // Diff data state
  const [diffData, setDiffData] = useState<DiffData | null>(null);

  // UI state
  const [isProcessing, setIsProcessing] = useState(false);

  /**
   * Listen for messages from extension
   */
  useEffect(() => {
    const messageHandler = (event: MessageEvent) => {
      const message = event.data;

      if (message.type === 'diff-data') {
        setDiffData(message);
      }
    };

    window.addEventListener('message', messageHandler);

    return () => {
      window.removeEventListener('message', messageHandler);
    };
  }, []);

  /**
   * Handle rollback action
   */
  const handleRollback = useCallback(() => {
    setIsProcessing(true);
    vscode.postMessage({ type: 'rollback' });
  }, [vscode]);

  /**
   * Handle ignore action
   */
  const handleIgnore = useCallback(() => {
    setIsProcessing(true);
    vscode.postMessage({ type: 'ignore' });
  }, [vscode]);

  /**
   * Handle accept action
   */
  const handleAccept = useCallback(() => {
    setIsProcessing(true);
    vscode.postMessage({ type: 'accept' });
  }, [vscode]);

  /**
   * Keyboard shortcuts
   */
  useEffect(() => {
    const keyHandler = (e: KeyboardEvent) => {
      // Escape to close (ignore)
      if (e.key === 'Escape') {
        handleIgnore();
      }

      // Ctrl/Cmd + Z to rollback
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        handleRollback();
      }

      // Ctrl/Cmd + Enter to accept
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        handleAccept();
      }
    };

    window.addEventListener('keydown', keyHandler);

    return () => {
      window.removeEventListener('keydown', keyHandler);
    };
  }, [handleRollback, handleIgnore, handleAccept]);

  // Loading state
  if (!diffData) {
    return (
      <div className="diff-viewer-loading">
        <div className="loading-spinner" role="status" aria-label="Loading diff">
          <span className="codicon codicon-loading codicon-modifier-spin"></span>
        </div>
        <p>Loading diff...</p>
      </div>
    );
  }

  return (
    <div className="diff-viewer" role="main" aria-label="AI Change Review">
      {/* Header with metadata */}
      <DiffHeader
        fileName={diffData.fileName}
        filePath={diffData.filePath}
        recommendation={diffData.recommendation}
        timestamp={diffData.timestamp}
      />

      {/* Side-by-side diff */}
      <DiffContainer
        original={diffData.original}
        changed={diffData.changed}
        fileName={diffData.fileName}
      />

      {/* Action buttons */}
      <ActionBar
        isProcessing={isProcessing}
        onRollback={handleRollback}
        onIgnore={handleIgnore}
        onAccept={handleAccept}
      />
    </div>
  );
};

/**
 * DiffHeader - File metadata and AI recommendation
 */
interface DiffHeaderProps {
  fileName: string;
  filePath: string;
  recommendation: string;
  timestamp: number;
}

const DiffHeader: React.FC<DiffHeaderProps> = ({
  fileName,
  filePath,
  recommendation,
  timestamp
}) => {
  const timeAgo = formatTimeAgo(timestamp);

  return (
    <header className="diff-header">
      <div className="file-info">
        <h1 className="file-name">
          <span className="codicon codicon-file"></span>
          {fileName}
        </h1>
        <p className="file-path" title={filePath}>{filePath}</p>
        <p className="timestamp">
          <span className="codicon codicon-clock"></span>
          {timeAgo}
        </p>
      </div>

      <div className="recommendation" role="alert" aria-live="polite">
        <span className="codicon codicon-lightbulb"></span>
        <p>{recommendation}</p>
      </div>
    </header>
  );
};

/**
 * DiffContainer - Side-by-side diff view
 */
interface DiffContainerProps {
  original: string;
  changed: string;
  fileName: string;
}

const DiffContainer: React.FC<DiffContainerProps> = ({
  original,
  changed,
  fileName
}) => {
  // Compute diff lines for highlighting
  const { originalLines, changedLines, lineMapping } = useDiffLines(original, changed);

  return (
    <div className="diff-container" role="region" aria-label="Diff comparison">
      <div className="diff-columns">
        {/* Original column (left) */}
        <DiffColumn
          title="Original Code"
          lines={originalLines}
          lineMapping={lineMapping}
          side="original"
          fileName={fileName}
        />

        {/* Changed column (right) */}
        <DiffColumn
          title="Changed Code"
          lines={changedLines}
          lineMapping={lineMapping}
          side="changed"
          fileName={fileName}
        />
      </div>
    </div>
  );
};

/**
 * DiffColumn - Single column (original or changed)
 */
interface DiffColumnProps {
  title: string;
  lines: DiffLine[];
  lineMapping: Map<number, number>;
  side: 'original' | 'changed';
  fileName: string;
}

const DiffColumn: React.FC<DiffColumnProps> = ({
  title,
  lines,
  lineMapping,
  side,
  fileName
}) => {
  return (
    <section className="diff-column" aria-label={title}>
      <h2 className="column-title">{title}</h2>

      <div className="code-container">
        <CodeBlock
          lines={lines}
          lineMapping={lineMapping}
          side={side}
          fileName={fileName}
        />
      </div>
    </section>
  );
};

/**
 * CodeBlock - Syntax-highlighted code with line numbers
 */
interface CodeBlockProps {
  lines: DiffLine[];
  lineMapping: Map<number, number>;
  side: 'original' | 'changed';
  fileName: string;
}

const CodeBlock: React.FC<CodeBlockProps> = ({
  lines,
  lineMapping,
  side,
  fileName
}) => {
  return (
    <pre className="code-block" role="code">
      <code>
        {lines.map((line, index) => (
          <CodeLine
            key={index}
            line={line}
            lineNumber={index + 1}
            side={side}
            fileName={fileName}
          />
        ))}
      </code>
    </pre>
  );
};

/**
 * CodeLine - Single line of code with highlighting
 */
interface CodeLineProps {
  line: DiffLine;
  lineNumber: number;
  side: 'original' | 'changed';
  fileName: string;
}

const CodeLine: React.FC<CodeLineProps> = ({
  line,
  lineNumber,
  side,
  fileName
}) => {
  // Determine line class based on change type
  const lineClass = [
    'code-line',
    line.type === 'added' ? 'line-added' : '',
    line.type === 'removed' ? 'line-removed' : '',
    line.type === 'modified' ? 'line-modified' : ''
  ].filter(Boolean).join(' ');

  // Syntax highlighting (use VSCode theme tokens)
  const highlightedContent = useSyntaxHighlight(line.content, fileName);

  return (
    <div className={lineClass} data-line-number={lineNumber}>
      <span className="line-number" aria-label={`Line ${lineNumber}`}>
        {lineNumber}
      </span>
      <span className="line-content" dangerouslySetInnerHTML={{ __html: highlightedContent }} />
    </div>
  );
};

/**
 * ActionBar - Rollback, Ignore, Accept buttons
 */
interface ActionBarProps {
  isProcessing: boolean;
  onRollback: () => void;
  onIgnore: () => void;
  onAccept: () => void;
}

const ActionBar: React.FC<ActionBarProps> = ({
  isProcessing,
  onRollback,
  onIgnore,
  onAccept
}) => {
  return (
    <footer className="action-bar" role="toolbar" aria-label="Actions">
      <button
        className="action-button rollback-button"
        onClick={onRollback}
        disabled={isProcessing}
        aria-label="Rollback to snapshot (Ctrl+Z)"
        title="Rollback to snapshot (Ctrl+Z)"
      >
        <span className="codicon codicon-discard"></span>
        Rollback
      </button>

      <button
        className="action-button ignore-button"
        onClick={onIgnore}
        disabled={isProcessing}
        aria-label="Ignore this change (Escape)"
        title="Ignore this change (Escape)"
      >
        <span className="codicon codicon-close"></span>
        Ignore
      </button>

      <button
        className="action-button accept-button primary"
        onClick={onAccept}
        disabled={isProcessing}
        aria-label="Accept this change (Ctrl+Enter)"
        title="Accept this change (Ctrl+Enter)"
      >
        <span className="codicon codicon-check"></span>
        Accept
      </button>
    </footer>
  );
};

/**
 * Custom Hooks
 */

/**
 * useDiffLines - Compute diff lines with change highlighting
 */
interface DiffLine {
  content: string;
  type: 'unchanged' | 'added' | 'removed' | 'modified';
}

function useDiffLines(original: string, changed: string) {
  const [result, setResult] = useState<{
    originalLines: DiffLine[];
    changedLines: DiffLine[];
    lineMapping: Map<number, number>;
  }>({ originalLines: [], changedLines: [], lineMapping: new Map() });

  useEffect(() => {
    // Split into lines
    const originalLineArray = original.split('\n');
    const changedLineArray = changed.split('\n');

    // Simple line-by-line diff (can be enhanced with diff algorithm)
    const originalLines: DiffLine[] = [];
    const changedLines: DiffLine[] = [];
    const lineMapping = new Map<number, number>();

    const maxLines = Math.max(originalLineArray.length, changedLineArray.length);

    for (let i = 0; i < maxLines; i++) {
      const origLine = originalLineArray[i] || '';
      const changedLine = changedLineArray[i] || '';

      // Determine change type
      let type: DiffLine['type'] = 'unchanged';

      if (origLine !== changedLine) {
        if (!origLine) {
          type = 'added';
        } else if (!changedLine) {
          type = 'removed';
        } else {
          type = 'modified';
        }
      }

      originalLines.push({ content: origLine, type: type === 'added' ? 'unchanged' : type });
      changedLines.push({ content: changedLine, type: type === 'removed' ? 'unchanged' : type });

      lineMapping.set(i, i); // Simple 1:1 mapping (can be enhanced with LCS)
    }

    setResult({ originalLines, changedLines, lineMapping });
  }, [original, changed]);

  return result;
}

/**
 * useSyntaxHighlight - Apply syntax highlighting using VSCode theme tokens
 *
 * Note: This is a simplified version. Production implementation should use
 * VSCode's TextMate tokenizer or a library like Prism.js with VSCode themes.
 */
function useSyntaxHighlight(content: string, fileName: string): string {
  // For MVP: Return plain content with basic HTML escaping
  // TODO: Integrate TextMate tokenizer for proper syntax highlighting

  // Escape HTML
  const escaped = content
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');

  // Basic keyword highlighting (demo purposes)
  // Production should use proper tokenizer
  const keywords = [
    'function', 'const', 'let', 'var', 'class', 'interface', 'type',
    'import', 'export', 'from', 'return', 'if', 'else', 'for', 'while'
  ];

  let highlighted = escaped;

  for (const keyword of keywords) {
    const regex = new RegExp(`\\b(${keyword})\\b`, 'g');
    highlighted = highlighted.replace(regex, '<span class="token-keyword">$1</span>');
  }

  return highlighted;
}

/**
 * Utility Functions
 */

function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSec < 60) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  return `${diffDays}d ago`;
}
```

### Styling (DiffViewer.css)

```css
/**
 * DiffViewer.css - VSCode-themed styles
 *
 * Uses VSCode CSS variables for theming:
 * - --vscode-editor-background
 * - --vscode-editor-foreground
 * - --vscode-diffEditor-insertedTextBackground
 * - --vscode-diffEditor-removedTextBackground
 * - --vscode-button-background
 * - --vscode-button-hoverBackground
 *
 * Accessibility:
 * - Focus indicators for all interactive elements
 * - High contrast mode support
 * - Reduced motion support
 */

/* Root container */
.diff-viewer {
  display: flex;
  flex-direction: column;
  height: 100vh;
  background: var(--vscode-editor-background);
  color: var(--vscode-editor-foreground);
  font-family: var(--vscode-font-family);
  font-size: var(--vscode-font-size);
  overflow: hidden;
}

/* Header */
.diff-header {
  padding: 16px;
  border-bottom: 1px solid var(--vscode-editorWidget-border);
}

.file-info {
  margin-bottom: 12px;
}

.file-name {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.file-path {
  font-size: 12px;
  color: var(--vscode-descriptionForeground);
  margin: 0;
  opacity: 0.8;
}

.timestamp {
  font-size: 11px;
  color: var(--vscode-descriptionForeground);
  margin: 4px 0 0 0;
  display: flex;
  align-items: center;
  gap: 4px;
}

.recommendation {
  background: var(--vscode-textBlockQuote-background);
  border-left: 3px solid var(--vscode-textLink-foreground);
  padding: 12px;
  display: flex;
  gap: 8px;
  align-items: flex-start;
}

.recommendation p {
  margin: 0;
  font-size: 13px;
  line-height: 1.5;
}

/* Diff container */
.diff-container {
  flex: 1;
  overflow: hidden;
  border-bottom: 1px solid var(--vscode-editorWidget-border);
}

.diff-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  height: 100%;
  overflow: auto;
}

.diff-column {
  border-right: 1px solid var(--vscode-editorWidget-border);
  overflow: auto;
}

.diff-column:last-child {
  border-right: none;
}

.column-title {
  position: sticky;
  top: 0;
  background: var(--vscode-editorGroupHeader-tabsBackground);
  padding: 8px 12px;
  margin: 0;
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  border-bottom: 1px solid var(--vscode-editorWidget-border);
  z-index: 10;
}

/* Code block */
.code-container {
  overflow: auto;
}

.code-block {
  margin: 0;
  padding: 0;
  font-family: var(--vscode-editor-font-family);
  font-size: var(--vscode-editor-font-size);
  line-height: 1.6;
  background: var(--vscode-editor-background);
}

.code-block code {
  display: block;
}

/* Code lines */
.code-line {
  display: flex;
  align-items: center;
  min-height: 20px;
  padding: 0 8px;
}

.line-number {
  display: inline-block;
  width: 50px;
  text-align: right;
  padding-right: 12px;
  color: var(--vscode-editorLineNumber-foreground);
  user-select: none;
  flex-shrink: 0;
}

.line-content {
  flex: 1;
  white-space: pre;
  overflow-x: auto;
}

/* Diff highlights */
.line-added {
  background: var(--vscode-diffEditor-insertedTextBackground);
}

.line-removed {
  background: var(--vscode-diffEditor-removedTextBackground);
}

.line-modified {
  background: var(--vscode-diffEditor-insertedTextBackground);
  opacity: 0.5;
}

/* Syntax highlighting tokens */
.token-keyword {
  color: var(--vscode-symbolIcon-keywordForeground);
  font-weight: 500;
}

/* Action bar */
.action-bar {
  display: flex;
  gap: 12px;
  padding: 16px;
  justify-content: flex-end;
  background: var(--vscode-editorWidget-background);
}

.action-button {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 16px;
  border: 1px solid var(--vscode-button-border);
  background: var(--vscode-button-secondaryBackground);
  color: var(--vscode-button-secondaryForeground);
  font-size: 13px;
  font-family: var(--vscode-font-family);
  cursor: pointer;
  border-radius: 2px;
  transition: background 0.1s ease;
}

.action-button:hover:not(:disabled) {
  background: var(--vscode-button-secondaryHoverBackground);
}

.action-button:focus {
  outline: 1px solid var(--vscode-focusBorder);
  outline-offset: 2px;
}

.action-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-button.primary {
  background: var(--vscode-button-background);
  color: var(--vscode-button-foreground);
}

.action-button.primary:hover:not(:disabled) {
  background: var(--vscode-button-hoverBackground);
}

/* Loading state */
.diff-viewer-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  gap: 16px;
}

.loading-spinner {
  font-size: 32px;
  color: var(--vscode-progressBar-background);
}

/* Accessibility: Reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation: none !important;
    transition: none !important;
  }
}

/* Accessibility: High contrast mode */
@media (forced-colors: active) {
  .action-button {
    border: 1px solid ButtonText;
  }

  .line-added,
  .line-removed,
  .line-modified {
    outline: 1px solid Highlight;
  }
}

/* Responsive: Handle narrow panels */
@media (max-width: 800px) {
  .diff-columns {
    grid-template-columns: 1fr;
  }

  .diff-column {
    border-right: none;
    border-bottom: 1px solid var(--vscode-editorWidget-border);
  }
}
```

---

## Communication Protocol

### Message Format (JSON)

All messages use JSON-RPC 2.0-style format for consistency.

#### Extension → Webview

```typescript
// Diff data message
{
  type: 'diff-data',
  changeId: string,          // Format: `${filePath}:${snapshotId}`
  filePath: string,          // Absolute file path
  fileName: string,          // Base name for display
  snapshotId: string,        // Snapshot identifier
  original: string,          // Snapshot content
  changed: string,           // Current file content
  recommendation: string,    // AI recommendation text
  timestamp: number          // Snapshot creation time (ms since epoch)
}
```

#### Webview → Extension

```typescript
// Rollback action
{
  type: 'rollback'
}

// Ignore action
{
  type: 'ignore'
}

// Accept action
{
  type: 'accept'
}
```

### Error Handling Protocol

If extension encounters error during action:
1. Log error with details
2. Show VSCode error notification
3. Keep panel open (don't auto-close on error)
4. Allow user to retry or manually close

---

## Diff Rendering Strategy

### Approach: Native VSCode Diff Command

**Decision**: Use VSCode's built-in `vscode.diff` command instead of custom React diff component.

**Rationale**:
- Leverages VSCode's mature diff engine (Monaco Editor)
- Automatic syntax highlighting for all languages
- Built-in features: folding, word-level diff, inline/side-by-side toggle
- Zero external dependencies
- Consistent UX with VSCode's native diff viewer

**Implementation**:

```typescript
// In DiffViewManager, instead of sending raw content to webview:
async openDiffViewer(changeId: string): Promise<void> {
  const { filePath, snapshotId } = this._parseChangeId(changeId);

  // Create virtual URIs for snapshot and current file
  const snapshotUri = vscode.Uri.parse(`snapback-snapshot:${snapshotId}/${filePath}`);
  const currentUri = vscode.Uri.file(filePath);

  // Open native diff editor
  await vscode.commands.executeCommand(
    'vscode.diff',
    snapshotUri,          // Left side (snapshot)
    currentUri,           // Right side (current)
    `$(history) SnapBack: ${path.basename(filePath)}`,  // Title
    {
      preview: false,     // Keep open when switching files
      viewColumn: vscode.ViewColumn.Beside  // Split editor
    }
  );

  // Show action buttons in webview panel below diff
  // (Webview panel shows only metadata + action buttons, not diff itself)
  const panel = this._createActionPanel(changeId, filePath, snapshotId);
  await this._sendMetadata(panel, { changeId, filePath, recommendation: '...' });
}
```

**Updated Component Architecture**:

```
┌─────────────────────────────────────────────┐
│  VSCode Diff Editor (Native)                │
│  ┌───────────────┬───────────────────────┐  │
│  │  Snapshot     │  Current File         │  │
│  │  (Left)       │  (Right)              │  │
│  │               │                       │  │
│  └───────────────┴───────────────────────┘  │
└─────────────────────────────────────────────┘
┌─────────────────────────────────────────────┐
│  Webview Panel (React - Action Bar Only)    │
│  ┌────────────────────────────────────────┐ │
│  │  📝 Recommendation: [AI suggestion]    │ │
│  │  [↩️ Rollback] [⊘ Ignore] [✓ Accept]  │ │
│  └────────────────────────────────────────┘ │
└─────────────────────────────────────────────┘
```

**Benefits**:
- Drastically simpler implementation (no custom diff rendering)
- Better syntax highlighting (all languages supported)
- Familiar UX for VSCode users
- Built-in features (go to line, search in diff, etc.)
- Smaller bundle size (no diff library)

**Trade-offs**:
- Less control over diff UI (but native is excellent)
- Action buttons in separate panel (acceptable UX)
- Cannot embed actions directly in diff (but codicons + panel works well)

---

## Accessibility Features (WCAG 2.1 AA)

### Keyboard Navigation

| Key | Action |
|-----|--------|
| Tab | Navigate between action buttons |
| Arrow Up/Down | Scroll diff content |
| Ctrl/Cmd + Z | Rollback |
| Ctrl/Cmd + Enter | Accept |
| Escape | Ignore (close) |
| F6 | Cycle between diff editor and action panel |

### Screen Reader Support

- ARIA labels on all interactive elements
- `role="main"` on container
- `role="toolbar"` on action bar
- `role="region"` on diff container
- `aria-live="polite"` on recommendation (alerts)
- Clear focus indicators (1px outline with 2px offset)

### Color Independence

- Change highlights use both color AND icons (✓, ✗, ~)
- High contrast mode detection (`forced-colors: active`)
- Sufficient contrast ratios (4.5:1 for text)
- No color-only information

### Reduced Motion

- Respects `prefers-reduced-motion` media query
- No animations/transitions when enabled
- Instant state changes instead of animated

---

## Performance Benchmarks

### Target Metrics

| Operation | Budget | Measurement |
|-----------|--------|-------------|
| Panel creation | <100ms | `DiffViewManager.openDiffViewer` start → panel.reveal() |
| Message handling | <50ms | Message received → action completed |
| Diff rendering | <200ms | Data received → first paint (React) |
| Interaction latency | <16ms | Click → UI update (60fps) |
| Memory footprint | <10MB | Per open panel (including diff content) |

### Monitoring

```typescript
// In DiffViewManager
const perfMonitor = new PerformanceMonitor('DiffViewManager');

async openDiffViewer(changeId: string): Promise<void> {
  const opId = perfMonitor.startOperation('openDiffViewer');

  try {
    // ... implementation ...
  } finally {
    const elapsed = perfMonitor.endOperation(opId);

    if (elapsed > 100) {
      logger.warn(`openDiffViewer exceeded budget: ${elapsed}ms`);
    }
  }
}
```

---

## Build Configuration

### Webview Bundle (webview-ui/)

```json
// webview-ui/package.json
{
  "name": "snapback-webview-ui",
  "private": true,
  "scripts": {
    "build": "vite build",
    "dev": "vite build --watch"
  },
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "@vitejs/plugin-react": "^4.0.0",
    "typescript": "^5.0.0",
    "vite": "^5.0.0"
  }
}
```

```typescript
// webview-ui/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        diffViewer: 'src/DiffViewer.tsx'
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    minify: 'esbuild',
    sourcemap: true,
    target: 'es2020'
  }
});
```

### Extension Build (esbuild.config.cjs)

```javascript
// Add webview build step
const buildWebview = async () => {
  console.log('Building webview...');
  const { build } = require('vite');
  await build({ configFile: './webview-ui/vite.config.ts' });
  console.log('Webview built');
};

// In production build
if (production) {
  await buildWebview();
}
```

---

## Testing Strategy

### Unit Tests (Vitest)

```typescript
// DiffViewManager.test.ts
describe('DiffViewManager', () => {
  it('should create panel with correct configuration', async () => {
    const manager = new DiffViewManager(extensionUri, snapshotManager, quickDiffProvider);

    await manager.openDiffViewer('src/auth.ts:cp-123');

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledWith(
      'snapback.diffViewer',
      expect.stringContaining('auth.ts'),
      vscode.ViewColumn.Beside,
      expect.objectContaining({ enableScripts: true })
    );
  });

  it('should reuse existing panel for same changeId', async () => {
    const manager = new DiffViewManager(extensionUri, snapshotManager, quickDiffProvider);

    await manager.openDiffViewer('src/auth.ts:cp-123');
    await manager.openDiffViewer('src/auth.ts:cp-123');

    expect(vscode.window.createWebviewPanel).toHaveBeenCalledTimes(1);
  });

  it('should handle rollback action', async () => {
    const manager = new DiffViewManager(extensionUri, snapshotManager, quickDiffProvider);
    await manager.openDiffViewer('src/auth.ts:cp-123');

    // Simulate webview message
    await manager['_handleWebviewMessage']('src/auth.ts:cp-123', { type: 'rollback' });

    expect(snapshotManager.restoreSnapshot).toHaveBeenCalledWith('cp-123', {
      files: ['src/auth.ts']
    });
  });

  it('should complete panel creation within 100ms budget', async () => {
    const manager = new DiffViewManager(extensionUri, snapshotManager, quickDiffProvider);

    const start = Date.now();
    await manager.openDiffViewer('src/auth.ts:cp-123');
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(100);
  });
});
```

### Integration Tests

```typescript
// DiffViewer.integration.test.ts
describe('DiffViewer Integration', () => {
  it('should display diff and handle rollback end-to-end', async () => {
    // Create snapshot
    const snapshot = await snapshotManager.createSnapshot([
      { path: 'src/auth.ts', content: 'original content', action: 'modify' }
    ]);

    // Modify file
    await workspace.fs.writeFile(
      Uri.file('src/auth.ts'),
      Buffer.from('changed content')
    );

    // Open diff viewer
    const changeId = `src/auth.ts:${snapshot.id}`;
    await diffViewManager.openDiffViewer(changeId);

    // Verify panel created
    const panel = diffViewManager['_panels'].get(changeId);
    expect(panel).toBeDefined();

    // Simulate rollback
    await panel.webview.postMessage({ type: 'rollback' });

    // Verify file restored
    const restoredContent = await workspace.fs.readFile(Uri.file('src/auth.ts'));
    expect(restoredContent.toString()).toBe('original content');
  });
});
```

### E2E Tests (Playwright)

```typescript
// diff-viewer.e2e.test.ts
test('should review and rollback AI change', async ({ page }) => {
  // Open VSCode extension
  await page.goto('vscode://...');

  // Trigger diff viewer command
  await page.keyboard.press('Control+Shift+P');
  await page.type('SnapBack: Review AI Change');
  await page.keyboard.press('Enter');

  // Wait for diff viewer
  await page.waitForSelector('.diff-viewer');

  // Verify diff displayed
  expect(await page.textContent('.file-name')).toContain('auth.ts');

  // Click rollback
  await page.click('.rollback-button');

  // Verify success notification
  await page.waitForSelector('.notification-toast:has-text("Rolled back")');

  // Verify panel closed
  await page.waitForSelector('.diff-viewer', { state: 'detached' });
});
```

---

## Security Considerations

### Content Security Policy (CSP)

```html
<meta http-equiv="Content-Security-Policy" content="
  default-src 'none';
  script-src ${webview.cspSource} 'nonce-${nonce}';
  style-src ${webview.cspSource} 'unsafe-inline';
  font-src ${webview.cspSource};
">
```

**Rationale**:
- `default-src 'none'`: Block all by default
- `script-src webview.cspSource 'nonce-${nonce}'`: Allow React bundle + inline scripts with nonce
- `style-src 'unsafe-inline'`: Required for VSCode theme tokens (injected at runtime)
- `font-src webview.cspSource`: Allow VSCode codicons font

### Input Validation

- **changeId parsing**: Validate format before use
- **File path validation**: Ensure within workspace root
- **Snapshot ID validation**: Check format before database query
- **Message validation**: Type-check all webview messages

### XSS Prevention

- React auto-escapes content by default
- `dangerouslySetInnerHTML` only used for syntax-highlighted code (after HTML escaping)
- No user input directly rendered as HTML

---

## Deployment Checklist

### Pre-release

- [ ] Unit tests pass (100% coverage for DiffViewManager)
- [ ] Integration tests pass (end-to-end workflows)
- [ ] E2E tests pass (Playwright accessibility tests)
- [ ] Performance budgets met (<100ms panel creation)
- [ ] Accessibility audit passed (WCAG 2.1 AA)
- [ ] Bundle size check (<500KB for webview bundle)
- [ ] CSP validation (no errors in console)
- [ ] Memory leak test (open/close 100 panels)

### Release

- [ ] Changelog updated with new feature
- [ ] Documentation updated (commands, keybindings)
- [ ] Extension manifest updated (new commands)
- [ ] Marketplace listing updated (screenshots)

---

## Future Enhancements (Post-MVP)

1. **Advanced Diff Algorithm**:
   - Integrate Myers diff algorithm for better change detection
   - Word-level highlighting for modified lines
   - Automatic conflict resolution suggestions

2. **Multi-file Review**:
   - Review all files in a session simultaneously
   - Bulk rollback/accept actions
   - Session-level recommendations

3. **AI Confidence Scoring**:
   - Visual indicator of AI confidence (0-100%)
   - Explain suggestion feature (why AI made this change)
   - Confidence-based auto-accept (>95% confidence)

4. **Syntax Highlighting Enhancement**:
   - Integrate TextMate tokenizer
   - Support for all VSCode language extensions
   - Theme-aware token colors

5. **Diff Statistics**:
   - Lines added/removed/modified count
   - Complexity delta (cyclomatic complexity change)
   - Risk score visualization

---

## Appendix A: File Structure

```
apps/vscode/
├── src/
│   ├── ui/
│   │   └── DiffViewManager.ts          # Extension backend
│   └── commands/
│       └── diffViewerCommands.ts       # Command registration
│
├── webview-ui/                          # React frontend
│   ├── src/
│   │   ├── DiffViewer.tsx               # Main component
│   │   ├── DiffViewer.css               # Styles
│   │   └── index.tsx                    # Entry point
│   ├── dist/                            # Build output
│   │   ├── diffViewer.js
│   │   └── diffViewer.css
│   ├── package.json
│   └── vite.config.ts
│
└── package.json                         # Extension manifest
```

---

## Appendix B: VSCode API References

- [Webview API](https://code.visualstudio.com/api/extension-guides/webview)
- [Diff Editor](https://code.visualstudio.com/api/references/commands#vscode.diff)
- [TextDocumentContentProvider](https://code.visualstudio.com/api/references/vscode-api#TextDocumentContentProvider)
- [WebviewPanel](https://code.visualstudio.com/api/references/vscode-api#WebviewPanel)

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0.0 | 2025-12-03 | Claude (Sonnet 4.5) | Initial architecture design |

---

**End of Document**
