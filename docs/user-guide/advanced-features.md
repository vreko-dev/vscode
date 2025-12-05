# Advanced Features

Explore SnapBack's advanced features to get the most out of your code protection.

## Table of Contents

-   [Timeline Integration](#timeline-integration)
-   [Snapshot Comparison](#snapshot-comparison)
-   [Snapshot Management](#snapshot-management)
-   [Keyboard Shortcuts](#keyboard-shortcuts)
-   [Command Palette](#command-palette)
-   [Performance Optimization](#performance-optimization)

## Timeline Integration

SnapBack integrates with VS Code's built-in Timeline view to show your snapshots alongside other timeline events.

### Accessing Timeline

1. Open the Timeline view:

    - `View` → `Open View...` → `Timeline`
    - Or use the command palette: `> Timeline: Focus on Timeline View`

2. Select a file in the Explorer to see its timeline

### Timeline Features

-   **Chronological View**: See all snapshots in order
-   **Quick Restore**: Click any snapshot to restore it
-   **Metadata Display**: View snapshot details and descriptions
-   **Integrated Experience**: Works alongside Git history and other timeline providers

## Snapshot Comparison

Compare files with their snapshots to see exactly what changed.

### Compare with Current Snapshot

1. Right-click a file in the Explorer
2. Select "SnapBack: Compare with Snapshot"
3. Choose which snapshot to compare with
4. VS Code's diff editor opens showing differences

### Compare Snapshots

1. In the SnapBack view, right-click a snapshot
2. Select "Compare with Current File" or "Compare with Another Snapshot"
3. View differences in the diff editor

### Understanding the Diff

The diff editor shows:

-   **Left side**: Snapshot version
-   **Right side**: Current version
-   **Colored highlights**: Added, removed, and modified lines
-   **Navigation**: Jump between changes with arrow buttons

## Snapshot Management

Manage your snapshots effectively with these features.

### Viewing Snapshots

Access snapshots through:

1. **SnapBack View**: Click the SnapBack icon in the Activity Bar
2. **Timeline View**: See snapshots in chronological context
3. **Command Palette**: `> SnapBack: Show All Snapshots`

### Snapshot Information

Each snapshot displays:

-   **Creation time**: When the snapshot was created
-   **Description**: Auto-generated or user-provided description
-   **File count**: How many files are included
-   **Size**: Approximate storage size

### Renaming Snapshots

1. In the SnapBack view, right-click a snapshot
2. Select "Rename Snapshot"
3. Enter a new name and description
4. Press Enter to save

### Deleting Snapshots

1. In the SnapBack view, right-click a snapshot
2. Select "Delete Snapshot"
3. Confirm deletion in the dialog
4. The snapshot is permanently removed

**Note**: Deleting snapshots cannot be undone.

### Bulk Operations

Select multiple snapshots for bulk operations:

1. **Ctrl/Cmd + Click** to select multiple snapshots
2. Right-click any selected snapshot
3. Choose from available bulk operations

## Keyboard Shortcuts

SnapBack provides keyboard shortcuts for common operations:

### Primary Shortcuts

| Shortcut                   | Command         | Description                                  |
| -------------------------- | --------------- | -------------------------------------------- |
| `Ctrl+Alt+S` / `Cmd+Alt+S` | Create Snapshot | Create a manual snapshot of the current file |
| `Ctrl+Alt+Z` / `Cmd+Alt+Z` | Snap Back       | Restore from the most recent snapshot        |
| `Ctrl+Alt+P` / `Cmd+Alt+P` | Protect File    | Protect the current file                     |

### Additional Shortcuts

| Shortcut | Command         | Description                                 |
| -------- | --------------- | ------------------------------------------- |
| `Delete` | Delete Snapshot | Delete selected snapshot (in SnapBack view) |
| `F2`     | Rename Snapshot | Rename selected snapshot (in SnapBack view) |

**Note**: Shortcuts work in the SnapBack view when snapshots are selected.

## Command Palette

Access all SnapBack features through the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`).

### Protection Commands

-   `SnapBack: Protect File` - Protect the current file
-   `SnapBack: Unprotect File` - Remove protection from a file
-   `SnapBack: Change Protection Level` - Change an existing file's protection level
-   `SnapBack: Show All Protected Files` - View all protected files

### Snapshot Commands

-   `SnapBack: Create Snapshot` - Create a manual snapshot
-   `SnapBack: Snap Back (Restore Snapshot)` - Restore from a snapshot
-   `SnapBack: Show All Snapshots` - View all snapshots
-   `SnapBack: Compare with Snapshot` - Compare file with a snapshot

### Utility Commands

-   `SnapBack: Initialize` - Initialize SnapBack in the current workspace
-   `SnapBack: Show Protection Status` - Show current protection status
-   `SnapBack: Refresh Views` - Refresh SnapBack views
-   `SnapBack: Open Walkthrough` - Open the getting started guide

## Performance Optimization

SnapBack is designed to be lightweight and efficient, but here are tips for optimal performance.

### Efficient Protection

1. **Limit Protected Files**: Protect only files that need protection

    - 5-20 files is typical for most projects
    - More than 100 files may impact performance

2. **Choose Appropriate Levels**:
    - Use Watched for frequently changed files
    - Use Warning for occasionally changed files
    - Use Protected sparingly for critical files only

### Snapshot Management

1. **Regular Cleanup**: Delete old snapshots you no longer need
2. **Deduplication**: Enable snapshot deduplication to save disk space
3. **Auto Cleanup**: Configure automatic cleanup of old snapshots

### Storage Optimization

SnapBack uses efficient storage mechanisms:

-   **SQLite Database**: Fast, reliable storage for snapshot metadata
-   **File System Storage**: Snapshots stored as compressed files
-   **Deduplication**: Identical snapshots share storage automatically

### Memory Usage

SnapBack is designed to minimize memory usage:

-   **Lazy Loading**: Components load only when needed
-   **Efficient Caching**: Smart caching without memory bloat
-   **Automatic Cleanup**: Resources released when not in use

## Debugging and Troubleshooting

### Enable Debug Logging

For troubleshooting issues:

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "snapback.logLevel"
3. Set to "debug"
4. Open Output panel and select "SnapBack"

### Common Issues

#### Snapshots Not Creating

Check:

1. File is protected
2. Protection level allows snapshots
3. No permission issues with `.snapback` directory
4. Sufficient disk space

#### Protection Not Working

Check:

1. File is actually protected (look for badges)
2. Correct protection level is set
3. No conflicting configurations
4. Extension is activated (check Output panel)

#### Performance Issues

Check:

1. Number of protected files (should be < 100)
2. Number of snapshots (clean up old ones)
3. Disk space and permissions
4. System resources

## Integration with Other Tools

### Git Workflow

SnapBack complements Git:

-   **SnapBack**: Micro-checkpoints before every significant save
-   **Git**: Macro-commits when features are complete

Workflow:

1. Edit files → SnapBack auto-checkpoints
2. Test changes → SnapBack notifies
3. Ready to commit → Git commit + push
4. Deploy to production → SnapBack blocks critical changes

### Other Extensions

SnapBack works well with other VS Code extensions:

-   **ESLint/Prettier**: No conflicts with code formatting
-   **GitLens**: Complementary version control features
-   **Copilot**: No interference with AI suggestions
-   **Remote Development**: Full support for SSH, Containers, WSL

## Need Help?

-   Check the [main README](../../README.md) for general information
-   Review the [CHANGELOG](../../CHANGELOG.md) for recent updates
-   Open an [issue](https://github.com/Marcelle-Labs/SnapBack/issues) for bug reports
-   Join the [discussion](https://github.com/Marcelle-Labs/SnapBack/discussions) for questions

Happy coding! 🧢
