# SnapBack - Code Safety Net 🧢

[![Version](https://img.shields.io/visual-studio-marketplace/v/MarcelleLabs.snapback-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/MarcelleLabs.snapback-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/MarcelleLabs.snapback-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)

**Smart snapshot manager with Watch/Warn/Block protection levels. Code Breaks. SnapBack.**

Protect your code with intelligent snapshots that automatically capture file states based on configurable protection levels. Never lose important work again with SnapBack's three-tier protection system.

## Why SnapBack?

Modern development is risky:

-   Accidental deletions happen
-   Critical files get corrupted
-   Team members make breaking changes
-   Git commits are too coarse-grained for real-time protection

SnapBack provides a safety net that automatically protects your code:

| Feature                     | Benefit                                    |
| --------------------------- | ------------------------------------------ |
| **Automatic Snapshots**     | Never lose work to accidental changes      |
| **Adaptive Protection**     | Match protection level to file criticality |
| **Team Policies**           | Consistent protection across your team     |
| **Lightning Fast Recovery** | Undo mistakes in seconds, not hours        |

## 🛡️ Protection Levels

SnapBack offers three protection levels to match your workflow:

### 👁️ Watch - Silent Protection

-   **When to use**: Files you edit frequently
-   **Behavior**: Automatic snapshots with no interruption
-   **Examples**: Feature code, tests, configs in flux

### ⚠️ Warn - Confirmation

-   **When to use**: Important shared files
-   **Behavior**: Notification with restore option
-   **Examples**: API handlers, migrations, utilities

### 🛑 Block - Required Checkpoint

-   **When to use**: Mission-critical files
-   **Behavior**: Modal requiring snapshot note

## 🚀 Getting Started

### 1. Installation

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
2. Reload VS Code
3. Open a workspace folder
4. Run `SnapBack: Initialize` from the Command Palette

### 2. Protect Your First File

1. Right-click any file in the Explorer
2. Select "SnapBack: Set Protection Level"
3. Choose your protection level:
    - **Watch**: Silent auto-protection
    - **Warn**: Confirmation before save
    - **Block**: Required checkpoint before save

### 3. Work Normally

SnapBack automatically creates snapshots based on your protection level.

### 4. Recover When Needed

-   **Activity Bar**: Click the SnapBack icon to browse snapshots
-   **Command Palette**: `SnapBack: Snap Back (Restore Snapshot) 🧢`
-   **Keyboard Shortcut**: `Ctrl+Alt+Z` / `Cmd+Alt+Z`

## 🎯 Key Features

### Three Protection Levels

Choose the right level of protection for each file:

-   **👁️ Watch**: Silent auto-checkpointing with intelligent debouncing
-   **⚠️ Warn**: Confirmation prompt before save with checkpoint option
-   **🛑 Block**: Required checkpoint or explicit override with modal dialog

### Smart Snapshots

-   Automatic snapshot creation based on protection levels
-   Manual snapshot creation at any time
-   Snapshot deduplication to save disk space
-   Git-integrated snapshot naming
-   Snapshot comparison and restoration

### Timeline Integration

View your SnapBack snapshots directly in VS Code's built-in Timeline view for easy access to file history.

### Team Configuration

Share protection policies across your team with `.snapbackrc` configuration files.

## ⌨️ Commands

| Command                                  | Description                                  |
| ---------------------------------------- | -------------------------------------------- |
| `SnapBack: Initialize`                   | Initialize SnapBack in the current workspace |
| `SnapBack: Show Protection Status`       | Show current protection status               |
| `SnapBack: Create Snapshot`              | Create a manual snapshot of the current file |
| `SnapBack: Snap Back (Restore Snapshot)` | Restore from a snapshot                      |
| `SnapBack: Protect File`                 | Protect the current file                     |
| `SnapBack: Change Protection Level`      | Change the protection level of a file        |
| `SnapBack: Show All Snapshots`           | Show all snapshots in the workspace          |
| `SnapBack: Show Protected Files`         | Show all protected files                     |

## ⚙️ Configuration

### VS Code Settings

Configure SnapBack through VS Code settings:

```json
{
	"snapback.protectionLevels.defaultLevel": "watch",
	"snapback.notifications.showCheckpointCreated": true,
	"snapback.checkpoint.deduplication.enabled": true
}
```

### Team Configuration with .snapbackrc

Create a `.snapbackrc` file in your repository root to share protection policies across your team:

```json
{
	"protection": [
		{
			"pattern": "**/*.env*",
			"level": "block",
			"reason": "Environment variables"
		},
		{
			"pattern": "**/package.json",
			"level": "warn",
			"reason": "Dependencies"
		},
		{
			"pattern": "**/tsconfig.json",
			"level": "warn",
			"reason": "TypeScript config"
		},
		{ "pattern": "src/**/*.ts", "level": "watch" }
	],
	"ignore": [
		"node_modules/**",
		"dist/**",
		"build/**",
		".git/**",
		"*.log",
		"*.tmp",
		".snapback/**"
	],
	"settings": {
		"maxCheckpoints": 100,
		"compressionEnabled": true,
		"notificationDuration": 1000,
		"defaultProtectionLevel": "watch"
	}
}
```

The `.snapbackrc` file is automatically protected at Warn level to prevent accidental changes.

## 📋 Timeline Integration

SnapBack integrates with VS Code's Timeline view to show your snapshots. Simply open the Timeline view (View → Open View… → Timeline) to see your SnapBack snapshots alongside other timeline events.

## 🛡️ Auto-Protection

SnapBack automatically protects critical files to prevent accidental changes:

-   **.snapbackrc**: Automatically protected at Warn level
-   Configuration files are visually distinguished with a 🧢 badge

If you accidentally unprotect the .snapbackrc file, SnapBack will warn you and offer to re-protect it.

## 🧪 Real-World Examples

### Protecting Configuration Files (Block Level)

For critical files like `.env.production`:

1. Right-click `.env.production` in the Explorer
2. Select "SnapBack: Set Protection: Block (Required)"
3. Every save will require creating a checkpoint first

### Active Development (Watch Level)

For files you edit frequently like `UserProfile.tsx`:

1. Right-click `UserProfile.tsx` in the Explorer
2. Hover over "Quick Set Level"
3. Click "Set Protection: Watch (Silent)"
4. SnapBack silently creates checkpoints without interrupting your workflow

### Business Logic (Warn Level)

For important but not critical files like `paymentProcessor.ts`:

1. Press `Ctrl+Shift+P` / `Cmd+Shift+P`
2. Type "SnapBack: Set Protection: Warn (Notify)"
3. SnapBack creates snapshots and shows a notification with restore option

## 🎮 Keyboard Shortcuts

-   **Create Snapshot**: `Ctrl+Alt+S` / `Cmd+Alt+S`
-   **Restore Snapshot**: `Ctrl+Alt+Z` / `Cmd+Alt+Z`

## 🧢 Visual Indicators

Protected files show visual badges in the Explorer:

-   👁️ Watch level
-   ⚠️ Warn level
-   🛑 Block level
-   🧢 .snapbackrc configuration file

## License

This project is licensed under the MIT License.

## Support

If you encounter any issues or have feature requests, please [file an issue](https://github.com/Marcelle-Labs/SnapBack/issues) on GitHub.
