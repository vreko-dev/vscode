# SnapBack Features Documentation

This document describes the enhanced features added to the SnapBack VS Code extension.

## New Features

### 1. Snap Back Command

The new "Snap Back" command allows users to restore their workspace to a previous snapshot state. This feature provides the core functionality for reverting changes when needed.

**Command**: `snapback.snapBack`
**Title**: "Snap Back"
**Location**: Available in the command palette and context menus

**Functionality**:

-   Shows a selection of available snapshots
-   Confirms restoration with the user
-   Executes the restoration process
-   Updates all UI views to reflect the restored state
-   Provides enhanced notifications during the process

### 2. Automatic Snapshot Creation on File Save

SnapBack now monitors file save events and automatically creates snapshots when certain conditions are met:

**Trigger Conditions**:

-   Modification of sensitive files (`.env`, `package.json`, config files)
-   Large file modifications (files with >1000 lines)

**Behavior**:

-   Creates automatic snapshots for sensitive file changes
-   Shows enhanced security alerts for sensitive file modifications
-   Shows enhanced large change notifications for significant modifications

### 3. Enhanced Notifications

All new features use the enhanced notification system with detailed information and actionable buttons.

## Command Integration

### Context Menu Integration

The "Snap Back" command has been added to the explorer context menu, making it easily accessible when right-clicking in the file explorer.

### Command Palette

All SnapBack commands are available through the command palette:

-   `SnapBack: Create Snapshot`
-   `SnapBack: Snap Back`
-   `SnapBack: Show SnapBack Status`
-   `SnapBack: Show Protection Status`
-   `SnapBack: Protect Current File`
-   `SnapBack: Analyze Risk`
-   `SnapBack: Auto-Snapshot Branch`
-   `SnapBack: Refresh SnapBack Views`
-   `SnapBack: Apply Workflow Suggestion`
-   `SnapBack: Auto-Apply Suggestions`
-   `SnapBack: Toggle AI Monitoring`
-   `SnapBack: Show AI Monitoring Status`

## Implementation Details

### File Save Event Integration

The extension now listens to VS Code's `onWillSaveTextDocument` event to monitor file changes in real-time. This allows for proactive protection by detecting risky changes as they happen.

### Automatic Snapshot Creation

When sensitive files are modified, SnapBack automatically:

1. Creates a snapshot to preserve the current state
2. Shows a security alert with detailed information
3. Provides recovery options through enhanced notifications

### Snap Back Functionality

The Snap Back feature:

1. Shows a list of available snapshots
2. Confirms the restoration action with the user
3. Executes the restoration process
4. Updates all UI components to reflect the restored state
5. Handles errors gracefully with enhanced failure recovery notifications

## Benefits

### Improved User Experience

-   **One-click restoration**: Users can easily revert to safe states with the "Snap Back" command
-   **Proactive protection**: Automatic snapshot creation prevents data loss
-   **Clear notifications**: Enhanced notifications provide detailed information and actionable options

### Enhanced Safety

-   **Sensitive file protection**: Automatic snapshots for critical files
-   **Large change monitoring**: Detection of significant modifications that might be risky
-   **Error recovery**: Comprehensive error handling with recovery options

### Better Integration

-   **Context menu access**: Easy access to key features through right-click menus
-   **Command palette integration**: All commands available through the standard VS Code interface
-   **Real-time monitoring**: Continuous protection through file save event integration
