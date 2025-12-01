# Protection Levels Guide

This guide explains how to use SnapBack's Protection Levels feature effectively in your development workflow.

## Table of Contents

-   [Introduction](#introduction)
-   [Understanding Protection Levels](#understanding-protection-levels)
-   [How to Protect Files](#how-to-protect-files)
-   [Changing Protection Levels](#changing-protection-levels)
-   [Best Practices](#best-practices)

## Introduction

Protection Levels allow you to define how SnapBack handles file saves based on the criticality and change frequency of your files. Think of it as three different "modes" of protection:

-   **🟢 Watched**: Silent auto-snapshot on save
-   **🟡 Warning**: Notify before save with options
-   **🔴 Protected**: Require snapshot or explicit override

The right protection level depends on two factors:

1. **How critical is the file?** (impacts production, affects multiple systems, etc.)
2. **How frequently do you edit it?** (constantly changing vs. occasional updates)

## Understanding Protection Levels

### 🟢 Watched Level

**When to use**: Files you edit frequently where you want protection but no interruptions.

**Behavior**:

-   Automatic snapshots created silently on save
-   Brief status bar notification
-   No prompts or dialogs
-   Perfect for active development

**Examples**:

-   Files you're actively developing
-   Test files
-   Documentation files
-   Personal configuration files

### 🟡 Warning Level

**When to use**: Important files that you edit occasionally where you want to be notified of changes.

**Behavior**:

-   Automatic snapshot created on save
-   Notification with option to restore
-   Non-blocking workflow
-   Good for business logic files

**Examples**:

-   API route handlers
-   Database query files
-   Shared utility functions
-   Component libraries

### 🔴 Protected Level

**When to use**: Critical files where mistakes could have serious consequences.

**Behavior**:

-   Required snapshot creation before saving
-   Modal dialog that must be acknowledged
-   Strict enforcement with no exceptions
-   Maximum protection

**Examples**:

-   Production environment configuration
-   Security-sensitive files
-   Database schema definitions
-   CI/CD pipeline definitions

## How to Protect Files

### Method 1: Context Menu (Explorer)

1. Right-click any file in the Explorer
2. Select "SnapBack: Protect File"
3. Choose your protection level from the quick pick menu

### Method 2: Command Palette

1. Open the Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`)
2. Type "SnapBack: Protect File"
3. Select the command
4. Choose your protection level

### Method 3: Quick Set Commands

For faster protection, use the quick set commands:

1. Right-click a file in the Explorer
2. Hover over "SnapBack: Protect File"
3. Select one of the quick options:
    - "Set Protection: Watch (Silent)" 🟢
    - "Set Protection: Warn (Notify)" 🟡
    - "Set Protection: Block (Required)" 🔴

## Changing Protection Levels

You can change the protection level of any protected file:

1. Right-click a protected file in the Explorer
2. Select "SnapBack: Change Protection Level"
3. Choose the new protection level from the quick pick menu

Alternatively, you can use the Command Palette:

1. Open the Command Palette
2. Type "SnapBack: Change Protection Level"
3. Select the command
4. Choose the new protection level

## Unprotecting Files

To remove protection from a file:

1. Right-click a protected file in the Explorer
2. Select "SnapBack: Unprotect File"

Or use the Command Palette:

1. Open the Command Palette
2. Type "SnapBack: Unprotect File"
3. Select the command

## Best Practices

### Choosing the Right Level

**Use Watched (🟢) for**:

-   Files you edit constantly (10+ times per day)
-   Active development work-in-progress
-   Test files and scripts
-   Documentation files

**Use Warning (🟡) for**:

-   Important business logic (1-5 edits per day)
-   API route handlers
-   Database query files
-   Shared utility functions

**Use Protected (🔴) for**:

-   Production environment configuration
-   Security-sensitive files
-   Database schema definitions
-   CI/CD pipeline definitions

### Performance Considerations

SnapBack is optimized for performance:

-   **O(1) lookup time**: Checking if a file is protected is instant
-   **Efficient debouncing**: Prevents snapshot spam
-   **Event-driven updates**: File decorations update efficiently

No noticeable performance impact with:

-   Up to 100 protected files
-   1000+ total files in workspace
-   Rapid save operations

### Starting Small

Begin with your most critical files:

1. Start with 5-10 files
2. Add more as you become comfortable
3. Adjust levels based on your workflow
4. Quality over quantity

## Visual Indicators

Protected files show visual indicators in the Explorer:

-   🟢 Watched files
-   🟡 Warning files
-   🔴 Protected files

These badges help you quickly identify the protection level of each file at a glance.

## Troubleshooting

### File Not Protected After Command

If a file doesn't appear protected after running a protection command:

1. Check that you selected a file (not a folder)
2. Verify the command completed successfully
3. Refresh the Explorer view (`Ctrl+R` or `Cmd+R`)

### Protection Level Not Changing

If the protection level doesn't change:

1. Ensure the file is already protected
2. Check that you selected a different level
3. Restart VS Code if issues persist

## Need Help?

-   Check the [main README](../../README.md) for general information
-   Review the [CHANGELOG](../../CHANGELOG.md) for recent updates
-   Open an [issue](https://github.com/Marcelle-Labs/SnapBack/issues) for bug reports
-   Join the [discussion](https://github.com/Marcelle-Labs/SnapBack/discussions) for questions

Happy protecting! 🛡️
