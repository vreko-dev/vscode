<!--
Consolidated from SNAPBACKRC_ARCHITECTURE_REVIEW.md
Last updated: 2025-10-14
-->

# SnapBack Architecture Overview

This document provides an overview of the SnapBack VS Code extension architecture, including key components, design decisions, and future considerations.

## Configuration System

### Unified Configuration (.snapbackrc)

The SnapBack extension is moving toward a unified configuration system using a `.snapbackrc` file that consolidates the functionality of `.snapbackprotected` and `.snapbackignore` files.

#### Current Status

The unified configuration system is partially implemented but not yet production-ready. Key components have been developed:

1. **Type Definitions** - Implemented in `src/types/snapbackrc.types.ts`
2. **Configuration Manager** - Implemented in `ConfigurationManager`
3. **Visual Distinction** - Implemented in `SnapBackRCDecorator`
4. **Auto-Protection** - Implemented in `AutoProtectConfig`
5. **Migration Command** - Implemented in `MigrationCommand`
6. **IntelliSense Support** - Implemented in `ConfigurationCompletionProvider`

#### Known Issues

Several critical issues remain that prevent this system from being production-ready:

1. **Security Vulnerabilities** - The hooks configuration allows arbitrary command execution without sanitization
2. **Performance Issues** - Caching and debouncing not yet implemented
3. **Architectural Flaws** - God object pattern and duplicate systems still exist
4. **Testing Gaps** - No actual tests have been implemented
5. **Integration Conflicts** - The new system runs in parallel with the existing `ProtectionConfigManager`, causing conflicts

#### Security Considerations

A critical security vulnerability exists in the hooks configuration system:

```typescript
export interface SnapBackHooks {
	beforeCheckpoint?: string; // ← ARBITRARY COMMAND
	afterCheckpoint?: string; // ← ARBITRARY COMMAND
	beforeRestore?: string;
	afterRestore?: string;
	onProtectedFileChange?: string;
}
```

This allows arbitrary command execution without sanitization, which could lead to:

-   Complete file system destruction
-   SSH keys and credentials exfiltration
-   Lateral movement to other systems
-   Persistent backdoor installation

**Recommendation**: Remove the hooks feature entirely until proper sandboxing can be implemented.

## Core Components

### Protection Levels

SnapBack implements three protection levels for files:

1. **👁️ Watch** - Silent auto-checkpointing with intelligent debouncing
2. **⚠️ Warn** - Confirmation prompt before save with checkpoint option
3. **🛑 Block** - Required checkpoint or explicit override with modal dialog

Each level provides different behavior when you save a protected file, giving fine-grained control over protection strategy.

### Checkpoint System

The checkpoint system provides automatic and manual snapshot capabilities:

1. **Automatic Checkpoint Creation** - Triggered on file save for sensitive files or large modifications
2. **Manual Checkpoint Creation** - User-initiated snapshots with semantic naming
3. **Storage Backend** - SQLite-backed storage with deduplication
4. **Timeline Integration** - VS Code Timeline view integration for checkpoint browsing

### Notification System

Enhanced notifications provide detailed information and actionable buttons for all SnapBack activities:

1. **Checkpoint Creation Notifications** - Inform users when snapshots are created
2. **Protection Level Notifications** - Alert users to protection level changes
3. **Risk Analysis Notifications** - Show AI-generated risk assessments
4. **Error Recovery Notifications** - Provide guidance when issues occur

## Extension Integration

### Command Palette Integration

All SnapBack commands are available through the VS Code command palette:

-   `SnapBack: Create Checkpoint` - Manually create a snapshot
-   `SnapBack: Snap Back` - Restore from a previous snapshot
-   `SnapBack: Show SnapBack Status` - View extension status
-   `SnapBack: Show Protection Status` - View protection status
-   And many more...

### Context Menu Integration

Key SnapBack features are accessible through context menus:

-   Right-click any file in the explorer to access SnapBack commands
-   Quick access to protection level changes
-   Easy access to snapshot operations

### View Integration

SnapBack integrates with VS Code's UI through several views:

1. **Activity Bar** - Snapshots tree, Protected Files list, and Getting Started walkthrough
2. **Explorer Decorations** - Watch/Warn/Block badges next to filenames
3. **Timeline View** - Integration with VS Code's built-in Timeline view
4. **Status Bar** - Protection level indicator and quick access controls

## Data Storage

### SQLite Backend

SnapBack uses SQLite for robust data storage:

1. **Checkpoint Storage** - File content, metadata, and semantic context
2. **Deduplication** - Skip storing duplicate file content when unchanged
3. **Protection Registry** - Track protected files and their protection levels
4. **Migration Support** - Transparent fallback to filesystem mode when required

### Filesystem Fallback

When SQLite is unavailable, SnapBack gracefully falls back to filesystem storage:

1. **Automatic Detection** - Detects SQLite issues and switches to filesystem mode
2. **Transparent Operation** - Users continue to work without interruption
3. **Error Reporting** - Clear error messages in the SnapBack output channel

## Future Considerations

### Performance Optimizations

Planned performance improvements include:

1. **Caching** - Implement caching for frequently accessed data
2. **Debouncing** - Better debouncing for file save events
3. **Background Processing** - Move heavy operations to background threads
4. **Memory Management** - Optimize memory usage for large workspaces

### Security Enhancements

Planned security improvements include:

1. **Hook Sandboxing** - Implement proper sandboxing for hook execution
2. **Input Validation** - Validate all user inputs and configuration files
3. **Access Controls** - Implement proper access controls for sensitive operations
4. **Audit Logging** - Comprehensive audit logging for all operations

### Feature Roadmap

Planned features include:

1. **Folder-level Protection** - Protect all files in a directory
2. **Bulk Protection Operations** - Apply protection to multiple files at once
3. **Protection Templates** - Pre-configured protection rules
4. **Export/Import Protection Configurations** - Share protection settings between teams
