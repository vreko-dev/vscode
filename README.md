# SnapBack - Code Safety Net 🧢

[![Version](https://img.shields.io/visual-studio-marketplace/v/MarcelleLabs.snapback-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/MarcelleLabs.snapback-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
[![Rating](https://img.shields.io/visual-studio-marketplace/r/MarcelleLabs.snapback-vscode.svg)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
[![License](https://img.shields.io/github/license/Marcelle-Labs/SnapBack)](LICENSE)

**Smart snapshot manager with Watch/Warn/Block protection levels. Code Breaks. SnapBack.**

Protect your code with intelligent snapshots that automatically capture file states based on configurable protection levels. Never lose important work again with SnapBack's three-tier protection system.

## Features

### 🧢 Three Protection Levels

Choose the right level of protection for each file:

-   **Watch (Silent)**: Automatic snapshots with no interruptions
-   **Warn (Notify)**: Confirmation dialog before saving
-   **Block (Required)**: Required snapshot note before saving

### 📸 Smart Snapshots

-   Automatic snapshot creation based on protection levels
-   Manual snapshot creation at any time
-   Snapshot deduplication to save disk space
-   Git-integrated snapshot naming
-   Snapshot comparison and restoration

### 📋 Timeline Integration

View your SnapBack snapshots directly in VS Code's built-in Timeline view for easy access to file history.

### 🔧 Team Configuration

Share protection policies across your team with `.snapbackrc` configuration files.

## Installation

1. Install from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
2. Reload VS Code
3. Open a workspace folder
4. Run `SnapBack: Initialize` from the Command Palette

## Quick Start

1. **Protect a file**:

    - Right-click any file in the Explorer
    - Select "SnapBack: Set Protection Level"
    - Choose your protection level

2. **Create a snapshot**:

    - Use `Ctrl+Alt+S` (or `Cmd+Alt+S` on Mac)
    - Or right-click a file and select "SnapBack: Create Snapshot"

3. **Restore from a snapshot**:
    - Use `Ctrl+Alt+Z` (or `Cmd+Alt+Z` on Mac)
    - Or right-click a file and select "SnapBack: Snap Back (Restore Snapshot)"
    - Or use the Timeline view to see file history

## Documentation

For detailed information, see our documentation:

-   [Getting Started](docs/user-guide/getting-started.md) - Complete guide to using SnapBack
-   [Protection Levels](docs/user-guide/protection-levels.md) - In-depth guide to protection levels
-   [Settings](docs/user-guide/settings.md) - Configuration options and settings
-   [Team Configuration](docs/user-guide/team-configuration.md) - Sharing protection policies with your team
-   [Advanced Features](docs/user-guide/advanced-features.md) - Timeline integration, snapshot comparison, and more

## Commands

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

## Configuration

Configure SnapBack through VS Code settings or `.snapbackrc` files:

```json
{
	"snapback.protectionLevels.defaultLevel": "watch",
	"snapback.notifications.showSnapshotCreated": true,
	"snapback.snapshot.deduplication.enabled": true
}
```

## Timeline Integration

SnapBack integrates with VS Code's Timeline view to show your snapshots. Simply open the Timeline view (View → Open View… → Timeline) to see your SnapBack snapshots alongside other timeline events.

## Team Configuration

Create a `.snapbackrc` file in your repository root to share protection policies:

```json
{
	"patterns": {
		"**/*.env": "Protected",
		"**/package.json": "Warning",
		"**/*.config.js": "Warning"
	}
}
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Support

If you encounter any issues or have feature requests, please [file an issue](https://github.com/Marcelle-Labs/SnapBack/issues) on GitHub.
