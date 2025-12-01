# SnapBack VS Code Extension Implementation Guide

This document provides a consolidated overview of the SnapBack VS Code extension implementation, focusing on the modularization approach and key architectural decisions.

## Overview

SnapBack is a VS Code extension that provides AI-powered code protection through automatic snapshots, file monitoring, and risk detection. The extension has been modularized to improve maintainability and developer experience.

## Architecture

### Modular Structure

The extension follows a modular architecture with clear separation of concerns:

1. **Package Manifest Modularization**

    - Base package.json with core metadata
    - Modular contribution files in `package-contributes/` directory
    - Build script that combines modular files into final package.json

2. **Extension Code Modularization**
    - Main extension.ts file with activation function
    - Command handlers organized by functionality
    - Service modules for specific features
    - UI components separated into dedicated modules

### Key Components

#### 1. Package Manifest Structure

The package manifest is modularized into the following files:

-   **package.base.json**: Core extension metadata (name, version, dependencies, etc.)
-   **package-contributes/**: Directory containing modular contribution files:
    -   `snapshot-commands.json`: Snapshot-related commands
    -   `protection-commands.json`: File protection commands
    -   `mcp-commands.json`: MCP/AI-related commands
    -   `view-commands.json`: View and UI commands
    -   `snapshot-creation-commands.json`: Snapshot creation commands
    -   `views.json`: View container and view definitions
    -   `explorer-menus.json`: Explorer context menus
    -   `editor-menus.json`: Editor context menus
    -   `view-menus.json`: Custom view context menus
    -   `configuration.json`: Extension configuration properties
    -   `keybindings.json`: Keyboard shortcuts
    -   `walkthroughs.json`: Welcome walkthroughs

The build process combines these files using `scripts/build-package-json.mjs`.

#### 2. Extension Activation

The extension activation follows a phased approach:

1. **Core Services Initialization**

    - ServiceFederation for MCP integration
    - NotificationManager for event coordination

2. **Foundation Components**

    - StatusBar for visual feedback
    - WelcomeView for onboarding
    - ProtectedFileRegistry for file protection tracking

3. **Business Logic Services**

    - SnapshotManager for snapshot operations
    - OperationCoordinator for workflow management
    - ProtectionConfigManager for configuration handling

4. **UI Integration**
    - Tree view providers for snapshot/protected file display
    - Webview providers for welcome interface
    - Decoration providers for file icons
    - Command registration

#### 3. Command Organization

Commands are organized into functional modules:

-   **snapshotCommands.ts**: Snapshot management (delete, rename, protect)
-   **protectionCommands.ts**: File protection (protect/unprotect, set levels)
-   **mcpCommands.ts**: AI/MCP features (analysis, monitoring)
-   **viewCommands.ts**: UI commands (refresh, show status)
-   **snapshotCreationCommands.ts**: Snapshot creation and restoration

All commands are registered through a central `registerAllCommands` function in `commands/index.ts`.

## Implementation Details

### Tree View Implementation

The extension provides a custom tree view with two sections:

1. **Snapshots**: Recent snapshot history
2. **Protected Files**: Currently protected files

Key implementation details:

-   Uses `SnapBackTreeProvider` implementing `vscode.TreeDataProvider`
-   Context values for tree items: `snapshot` and `protectedFile`
-   Refresh mechanism using `onDidChangeTreeData` event
-   Pagination for large datasets (shows 5 items with "Show more" option)

### File Protection System

The protection system implements three levels:

-   **Watch (👁️)**: Silent auto-snapshot on save
-   **Warn (⚠️)**: Notification before save with options
-   **Block (🛑)**: Require snapshot or explicit override

Implementation components:

-   `ProtectedFileRegistry`: Tracks protected files
-   `ProtectionConfigManager`: Manages protection configuration
-   `ProtectionDecorationProvider`: Shows file protection status in explorer
-   `SaveHandler`: Monitors file save events

### Snapshot Management

Snapshot functionality is implemented through:

-   `SnapshotManager`: Core snapshot operations
-   `SnapshotStorageAdapter`: Storage interface abstraction
-   `StorageSnapshotSummaryProvider`: Snapshot data access

Features include:

-   Automatic snapshot creation for sensitive files
-   Snapshot deduplication
-   Bulk snapshot operations
-   Snapshot protection

### MCP Integration

The extension integrates with MCP (Model Context Protocol) services:

-   `ServiceFederation`: Service discovery and management
-   AI-powered change detection
-   Workflow suggestions
-   Risk analysis

## Key Features

### 1. Automatic Protection

-   Monitors file save events
-   Automatically creates snapshots for sensitive files
-   Shows notifications for large changes

### 2. Protection Levels

-   Three-tier protection system (Watch, Warn, Block)
-   Visual indicators in file explorer
-   Context menu options for setting levels

### 3. Snapshot Management

-   Create, restore, delete snapshots
-   Rename and protect snapshots
-   Bulk operations for older snapshots

### 4. AI Integration

-   Risk analysis for code changes
-   Workflow suggestions
-   AI monitoring toggle

## Development Workflow

### Building the Extension

1. Run `npm run compile` to compile TypeScript
2. Run `npm run package` to build the extension
3. Run `npm run package-vsix` to create a VSIX package

### Development Commands

-   `npm run dev`: Package and install extension locally
-   `npm run watch`: Watch for changes and rebuild
-   `npm test`: Run unit tests

### Testing

-   Unit tests in `test/unit/` directory
-   Integration tests in `test/integration/` directory
-   End-to-end tests using VS Code test framework

## Configuration

The extension provides several configuration options:

-   `snapback.showAutoCheckpointNotifications`: Show notifications for auto-snapshots
-   `snapback.snapshot.naming.useGit`: Use git context for snapshot naming
-   `snapback.snapshot.deletion.confirmDelete`: Confirm before deleting snapshots
-   `snapback.snapshot.deduplication.enabled`: Enable snapshot deduplication

## Troubleshooting

### Common Issues

1. **Commands not appearing**: Check that commands are declared in package-contributes files
2. **Views not showing**: Verify activation events and context values
3. **File protection not working**: Check save event handlers and configuration

### Debugging

-   Use the "SnapBack" output channel for diagnostic information
-   Enable verbose logging in development mode
-   Check VS Code developer tools for errors

## Future Enhancements

### Planned Features

1. Enhanced AI analysis capabilities
2. Improved performance for large repositories
3. Additional protection level options
4. Better integration with version control systems

### Architecture Improvements

1. Dependency injection container
2. Enhanced error handling patterns
3. Improved test coverage
4. Performance optimizations

## Conclusion

The SnapBack extension demonstrates a well-architected VS Code extension with:

-   Modular package manifest structure
-   Clean separation of concerns in code organization
-   Proper use of VS Code APIs
-   Comprehensive error handling
-   Good performance characteristics
-   Extensible design for future enhancements

The modularization approach has successfully improved maintainability while preserving all existing functionality.
