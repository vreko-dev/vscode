# Getting Started with SnapBack

Welcome to SnapBack, your code safety net for VS Code! This guide will help you get started with protecting your files and creating snapshots.

## Table of Contents

-   [What is SnapBack?](#what-is-snapback)
-   [Installation](#installation)
-   [Quick Start](#quick-start)
-   [Core Concepts](#core-concepts)
-   [First Protection](#first-protection)
-   [Creating Snapshots](#creating-snapshots)
-   [Restoring from Snapshots](#restoring-from-snapshots)

## What is SnapBack?

SnapBack is a smart snapshot manager that helps protect your code by automatically capturing file states based on configurable protection levels. With SnapBack, you'll never lose important work again.

Key features include:

-   **Three Protection Levels**: Watched, Warning, and Protected
-   **Smart Snapshots**: Automatic and manual snapshot creation
-   **Timeline Integration**: View snapshots in VS Code's built-in Timeline
-   **Team Configuration**: Share protection policies with `.snapbackrc` files

## Installation

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
2. Reload VS Code
3. Open a workspace folder
4. Run `SnapBack: Initialize` from the Command Palette (optional)

## Quick Start

The fastest way to start using SnapBack:

1. **Protect a file**:

    - Right-click any file in the Explorer
    - Select "SnapBack: Protect File"
    - Choose your protection level

2. **Create a snapshot**:

    - Use `Ctrl+Alt+S` (or `Cmd+Alt+S` on Mac)
    - Or right-click a file and select "SnapBack: Create Snapshot"

3. **Restore from a snapshot**:
    - Use `Ctrl+Alt+Z` (or `Cmd+Alt+Z` on Mac)
    - Or right-click a file and select "SnapBack: Snap Back (Restore Snapshot)"

## Core Concepts

### Protection Levels

SnapBack uses three protection levels to determine how files are handled:

-   **🟢 Watched**: Silent auto-snapshot on save (no interruptions)
-   **🟡 Warning**: Notify before save with options
-   **🔴 Protected**: Require snapshot or explicit override

### Snapshots

Snapshots are point-in-time captures of your file's content. They can be:

-   Created automatically based on protection levels
-   Created manually at any time
-   Restored to revert file changes
-   Compared to see differences

### SnapBack Views

SnapBack provides two views in the Explorer:

-   **SnapBack Protected Files**: Shows all protected files
-   **SnapBack Snapshots**: Shows all snapshots

## First Protection

Let's protect your first file:

1. In the Explorer, right-click any file
2. Select "SnapBack: Protect File"
3. Choose a protection level:
    - 🟢 Watch (Silent) for files you edit frequently
    - 🟡 Warn (Notify) for important files
    - 🔴 Block (Required) for critical files

The file will now show a badge indicating its protection level.

## Creating Snapshots

### Automatic Snapshots

Based on your protection level:

-   **Watched**: Snapshots created silently on save
-   **Warning**: Snapshots created with notification on save
-   **Protected**: Snapshots required before saving

### Manual Snapshots

Create snapshots manually at any time:

1. **Using Keyboard Shortcut**: `Ctrl+Alt+S` (or `Cmd+Alt+S` on Mac)
2. **Context Menu**: Right-click a file → "SnapBack: Create Snapshot"
3. **Command Palette**: `Ctrl+Shift+P` → "SnapBack: Create Snapshot"

### Multiple File Snapshots

Select multiple files and create a snapshot of all:

1. Select multiple files in the Explorer (Ctrl/Cmd + Click)
2. Right-click and select "SnapBack: Create Snapshot"
3. All selected files will be included in the snapshot

## Restoring from Snapshots

### Using Keyboard Shortcut

Press `Ctrl+Alt+Z` (or `Cmd+Alt+Z` on Mac) to restore the most recent snapshot of the current file.

### Using Context Menu

1. Right-click a file in the Explorer
2. Select "SnapBack: Snap Back (Restore Snapshot)"
3. Choose which snapshot to restore from

### Using the SnapBack View

1. Click the SnapBack icon in the Activity Bar
2. Browse snapshots in the "SnapBack" view
3. Right-click a snapshot and select "Restore Snapshot"

### Timeline Integration

View your SnapBack snapshots directly in VS Code's built-in Timeline view:

1. Open the Timeline view (View → Open View… → Timeline)
2. See your SnapBack snapshots alongside other timeline events
3. Click any snapshot to restore it

## Next Steps

-   Learn about [Protection Levels](protection-levels.md) in detail
-   Configure SnapBack through [Settings](settings.md)
-   Explore [Team Configuration](team-configuration.md) options
-   Check out [Advanced Features](advanced-features.md)

## Need Help?

-   Check the [main README](../../README.md) for general information
-   Review the [CHANGELOG](../../CHANGELOG.md) for recent updates
-   Open an [issue](https://github.com/Marcelle-Labs/SnapBack/issues) for bug reports
-   Join the [discussion](https://github.com/Marcelle-Labs/SnapBack/discussions) for questions

Happy coding! 🧢
