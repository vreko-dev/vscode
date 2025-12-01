# SnapBack VS Code Extension - Consolidated Documentation

This document provides a comprehensive overview of the SnapBack VS Code extension, consolidating all relevant information about its implementation, architecture, and usage.

## Table of Contents

1. [Introduction](#introduction)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Implementation Approach](#implementation-approach)
5. [Development Guide](#development-guide)
6. [Testing](#testing)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

## Introduction

SnapBack is a VS Code extension that provides AI-powered code protection through automatic snapshots, file monitoring, and risk detection. It helps developers protect their code from unintended changes and provides mechanisms for instant recovery when needed.

## Features

### Core Features

1. **Automatic Snapshots**: Create Git-based snapshots before risky changes
2. **AI Change Detection**: Monitor and analyze code changes for potential risks
3. **Real-time Protection**: Continuous monitoring of file changes
4. **Status Monitoring**: Visual feedback on protection status

### Protection Levels

The extension implements three protection levels:

-   **Watch (👁️)**: Silent auto-snapshot on save
-   **Warn (⚠️)**: Notification before save with options
-   **Block (🛑)**: Require snapshot or explicit override

### Key Commands

| Command                          | Description                              |
| -------------------------------- | ---------------------------------------- |
| `SnapBack: Create Snapshot`      | Manually create a protection snapshot    |
| `SnapBack: Snap Back`            | Restore workspace to a previous snapshot |
| `SnapBack: Show SnapBack Status` | View current protection status           |
| `SnapBack: Protect Current File` | Add protection to current file           |
| `SnapBack: Analyze Risk`         | Analyze risk level of current file       |
| `SnapBack: Toggle AI Monitoring` | Enable/disable AI change monitoring      |

## Architecture

### Modular Design

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

### Core Components

#### 1. Service Layer

-   `ServiceFederation`: MCP integration and service management
-   `SnapshotManager`: Core snapshot operations
-   `ProtectedFileRegistry`: File protection tracking
-   `OperationCoordinator`: Workflow management

#### 2. UI Layer

-   `SnapBackTreeProvider`: Tree view implementation
-   `ProtectionDecorationProvider`: File decorations
-   `SnapBackStatusBar`: Status bar integration
-   `WelcomeView`: Onboarding interface

#### 3. Command Layer

-   `snapshotCommands.ts`: Snapshot management
-   `protectionCommands.ts`: File protection
-   `mcpCommands.ts`: AI/MCP features
-   `viewCommands.ts`: UI commands

#### 4. Data Layer

-   `StorageSnapshotSummaryProvider`: Snapshot data access
-   `ProtectionConfigManager`: Configuration management
-   `FileSystemWatcher`: File system monitoring

## Implementation Approach

### Package Manifest Structure

The package manifest is modularized into the following files:

-   **package.base.json**: Core extension metadata
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

### Extension Activation

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

### Command Organization

Commands are organized into functional modules:

-   **snapshotCommands.ts**: Snapshot management (delete, rename, protect)
-   **protectionCommands.ts**: File protection (protect/unprotect, set levels)
-   **mcpCommands.ts**: AI/MCP features (analysis, monitoring)
-   **viewCommands.ts**: UI commands (refresh, show status)
-   **snapshotCreationCommands.ts**: Snapshot creation and restoration

All commands are registered through a central `registerAllCommands` function in `commands/index.ts`.

## Development Guide

### Prerequisites

-   Node.js 20+
-   VS Code
-   pnpm package manager

### Setup

1. Clone the repository
2. Run `pnpm install` to install dependencies
3. Open the project in VS Code
4. Press F5 to launch the extension in development mode

### Building

-   `pnpm run compile`: Compile TypeScript
-   `pnpm run package`: Build the extension
-   `pnpm run package-vsix`: Create VSIX package

### Development Commands

-   `pnpm run dev`: Package and install extension locally
-   `pnpm run watch`: Watch for changes and rebuild
-   `pnpm test`: Run unit tests

### Code Structure

```
apps/vscode/
├── src/
│   ├── commands/              # Command handlers
│   ├── handlers/              # Event handlers
│   ├── protection/            # File protection services
│   ├── services/              # Core services
│   ├── snapshot/              # Snapshot management
│   ├── ui/                    # UI components
│   ├── views/                 # View providers
│   ├── extension.ts           # Main entry point
│   └── ...
├── package-contributes/       # Modular package contributions
├── scripts/                   # Build and utility scripts
└── test/                      # Test files
```

## Testing

### Test Structure

Tests are organized in the `test/` directory:

```
test/
├── unit/           # Unit tests for individual components
├── integration/    # Integration tests for component interactions
├── performance/    # Performance benchmarks
├── regression/     # Regression tests for bug fixes
└── monitoring/     # Monitoring and observability tests
```

### Running Tests

-   `pnpm test`: Run all tests
-   `pnpm test:unit`: Run unit tests only
-   `pnpm test:watch`: Run tests in watch mode
-   `pnpm test:coverage`: Run tests with coverage report

### Test Patterns

1. **Path Aliases**: Use `@/*` for source imports and `@test/*` for test utilities
2. **Setup Pattern**: Use `beforeEach` and `afterEach` for test setup and cleanup
3. **Mocking**: Use `vi.spyOn` and `vi.fn` for mocking VS Code APIs and services
4. **Assertions**: Use descriptive assertions that clearly indicate what is being tested

## Best Practices

### Code Organization

1. **Modular Structure**: Keep files focused on single responsibilities
2. **Consistent Naming**: Use clear, descriptive names for functions and variables
3. **Type Safety**: Use TypeScript types and interfaces extensively
4. **Error Handling**: Implement proper error handling with user-friendly messages

### Performance

1. **Lazy Initialization**: Initialize heavy components only when needed
2. **Caching**: Cache expensive operations when appropriate
3. **Async Operations**: Use async/await for non-blocking operations
4. **Memory Management**: Register disposables with `context.subscriptions`

### User Experience

1. **Clear Feedback**: Provide immediate feedback for user actions
2. **Progress Indicators**: Show progress for long-running operations
3. **Error Recovery**: Offer recovery options when errors occur
4. **Consistent UI**: Maintain consistent UI patterns throughout the extension

### VS Code API Usage

1. **Context Values**: Use context values for conditional UI elements
2. **Activation Events**: Define appropriate activation events
3. **Commands**: Declare all commands in package.json
4. **Events**: Use VS Code's event system for loose coupling

## Troubleshooting

### Common Issues

1. **Commands Not Appearing**: Verify command declarations in package-contributes files
2. **Views Not Showing**: Check activation events and context values
3. **File Protection Not Working**: Verify save event handlers and configuration
4. **Build Failures**: Check for TypeScript errors and missing dependencies

### Debugging

1. **Output Channel**: Use the "SnapBack" output channel for diagnostic information
2. **Developer Tools**: Check VS Code developer tools for errors
3. **Console Logging**: Use console.log for debugging (remove before committing)
4. **Breakpoints**: Set breakpoints in the debugger for step-by-step execution

## Configuration

The extension provides several configuration options:

-   `snapback.showAutoCheckpointNotifications`: Show notifications for auto-snapshots
-   `snapback.snapshot.naming.useGit`: Use git context for snapshot naming
-   `snapback.snapshot.deletion.confirmDelete`: Confirm before deleting snapshots
-   `snapback.snapshot.deduplication.enabled`: Enable snapshot deduplication

## Conclusion

The SnapBack extension demonstrates a well-architected VS Code extension with:

-   Modular package manifest structure
-   Clean separation of concerns in code organization
-   Proper use of VS Code APIs
-   Comprehensive error handling
-   Good performance characteristics
-   Extensible design for future enhancements

This consolidated documentation should provide developers with the information needed to understand, maintain, and extend the SnapBack VS Code extension.
