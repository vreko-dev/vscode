# SnapBack VS Code Extension Development Guide

This guide provides comprehensive documentation for developing and maintaining the SnapBack VS Code extension, covering the current implementation approach, architecture, and best practices.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Package Manifest Structure](#package-manifest-structure)
4. [Extension Code Structure](#extension-code-structure)
5. [Key Features Implementation](#key-features-implementation)
6. [Development Workflow](#development-workflow)
7. [Testing](#testing)
8. [Best Practices](#best-practices)

## Overview

SnapBack is a VS Code extension that provides AI-powered code protection through automatic snapshots, file monitoring, and risk detection. The extension follows a modular architecture with clear separation of concerns.

## Architecture

### Modular Design Principles

The extension follows these key architectural principles:

1. **Separation of Concerns**: Different functionalities are separated into distinct modules
2. **Single Responsibility**: Each module has a single, well-defined purpose
3. **Dependency Injection**: Components receive their dependencies rather than creating them
4. **Event-Driven**: Uses VS Code's event system for loose coupling
5. **Extensibility**: Designed to easily add new features

### Core Components

1. **Service Layer**: Core business logic and external service integration
2. **UI Layer**: Visual components and user interactions
3. **Command Layer**: User-initiated actions and operations
4. **Data Layer**: Storage and data management

## Package Manifest Structure

### Modular Package.json

The package manifest is organized into modular files:

```
apps/vscode/
├── package.base.json              # Core metadata
├── package-contributes/           # Modular contribution files
│   ├── snapshot-commands.json     # Snapshot-related commands
│   ├── protection-commands.json   # File protection commands
│   ├── mcp-commands.json          # MCP/AI-related commands
│   ├── view-commands.json         # View/UI commands
│   ├── snapshot-creation-commands.json # Snapshot creation commands
│   ├── views.json                 # View definitions
│   ├── explorer-menus.json        # Explorer context menus
│   ├── editor-menus.json          # Editor context menus
│   ├── view-menus.json            # Custom view menus
│   ├── configuration.json         # Configuration properties
│   ├── keybindings.json           # Keyboard shortcuts
│   └── walkthroughs.json          # Welcome walkthroughs
└── scripts/build-package-json.mjs # Build script
```

### Build Process

The build script (`scripts/build-package-json.mjs`) combines all modular files into a single `package.json`:

1. Starts with `package.base.json` as the foundation
2. Merges all files from `package-contributes/` directory
3. Arrays are concatenated (commands, keybindings)
4. Objects are merged (configuration, views)
5. Special handling for nested menu objects

### Activation Events

The extension uses these activation events:

-   `onStartupFinished`: Activate when VS Code starts
-   `onCommand:snapback.*`: Activate when any SnapBack command is invoked
-   `onView:snapback.*`: Activate when any SnapBack view is accessed

## Extension Code Structure

### Main Entry Point

The main entry point is `src/extension.ts`, which follows a phased initialization approach:

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

Commands are organized into functional modules in the `src/commands/` directory:

-   `snapshotCommands.ts`: Snapshot management (delete, rename, protect)
-   `protectionCommands.ts`: File protection (protect/unprotect, set levels)
-   `mcpCommands.ts`: AI/MCP features (analysis, monitoring)
-   `viewCommands.ts`: UI commands (refresh, show status)
-   `snapshotCreationCommands.ts`: Snapshot creation and restoration

All commands are registered through `commands/index.ts`.

### Service Modules

Key service modules include:

-   `services/`: Core data services

    -   `protectedFileRegistry.ts`: Tracks protected files
    -   `snapshotSummaryProvider.ts`: Provides snapshot data

-   `protection/`: File protection services

    -   `ProtectionConfigManager.ts`: Manages protection configuration
    -   `FileSystemWatcher.ts`: Monitors file system changes

-   `snapshot/`: Snapshot management services

    -   `SnapshotManager.ts`: Core snapshot operations
    -   `SnapshotStorageAdapter.ts`: Storage interface abstraction

-   `handlers/`: Event handlers

    -   `SaveHandler.ts`: Monitors file save events

-   `ui/`: UI components
    -   `ProtectionDecorationProvider.ts`: File decoration provider
    -   `SnapBackStatusBar.ts`: Status bar component

## Key Features Implementation

### Tree View Implementation

The extension provides a custom tree view with two sections:

1. **Snapshots**: Recent snapshot history
2. **Protected Files**: Currently protected files

Implementation details:

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

## Development Workflow

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

### Documentation

1. **Inline Comments**: Add comments for complex logic
2. **JSDoc**: Use JSDoc for function and class documentation
3. **README Updates**: Keep README.md updated with new features
4. **Code Examples**: Include examples for complex APIs

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

This guide should provide developers with the information needed to understand, maintain, and extend the SnapBack VS Code extension.
