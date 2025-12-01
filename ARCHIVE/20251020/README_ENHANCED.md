# SnapBack VS Code Extension

> Local-first snapshot safety net with adaptive protection levels, AI guardrails, and team policies for high-trust codebases.

[![Version](https://img.shields.io/visual-studio-marketplace/v/MarcelleLabs.snapback-vscode?style=for-the-badge&color=blue)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
[![Installs](https://img.shields.io/visual-studio-marketplace/i/MarcelleLabs.snapback-vscode?style=for-the-badge&color=green)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
[![Ratings](https://img.shields.io/visual-studio-marketplace/r/MarcelleLabs.snapback-vscode?style=for-the-badge&color=orange)](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)
[![License](https://img.shields.io/github/license/Marcelle-Labs/SnapBack?style=for-the-badge)](LICENSE)

<p align="center">
  <img src="media/snapback-vscode.png" alt="SnapBack Logo" width="200">
</p>

<p align="center">
  <strong>Never lose your work again. SnapBack automatically protects your code with intelligent snapshots.</strong>
</p>

## 🚀 Quick Start

> Prerequisite: Run `pnpm install` from the monorepo root before working in this app.

1. Install the extension locally or open the repo in VS Code
2. Press `Ctrl+Shift+P` / `Cmd+Shift+P` → `SnapBack: Initialize 🧢` to seed configs and views
3. Protect an important file via Explorer right-click → `SnapBack: Protect File 🧢` and choose Watch, Warn, or Block
4. Save the file—SnapBack creates a snapshot automatically
5. Browse or restore history from the SnapBack activity bar

## 🎯 Why SnapBack?

### The Problem

Modern development is risky:

-   AI assistants make unexpected changes
-   Accidental deletions happen
-   Critical files get corrupted
-   Team members make breaking changes
-   Git commits are too coarse-grained for real-time protection

### The Solution

SnapBack provides a safety net that automatically protects your code:

| Feature                     | Benefit                                    |
| --------------------------- | ------------------------------------------ |
| **Automatic Snapshots**     | Never lose work to accidental changes      |
| **Adaptive Protection**     | Match protection level to file criticality |
| **AI Integration**          | Smart context-aware protection             |
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
-   **Examples**: Secrets, auth code, deployment configs

<p align="center">
  <img src="media/snapback-vscode-glyph.svg" alt="Protection Levels" width="300">
</p>

## 🌟 Key Features

### 📸 Intelligent Snapshots

-   **Semantic Naming**: Snapshots get meaningful names based on context
-   **Deduplication**: Skip storing identical content to save space
-   **Git Integration**: Use Git context for smarter snapshot management
-   **Automatic Cleanup**: Configurable rules prevent disk bloat

### 🤖 AI-Powered Workflow

-   **Risk Analysis**: AI detects potentially risky changes
-   **Smart Suggestions**: Context-aware workflow recommendations
-   **Autonomous Mode**: Auto-apply high-confidence suggestions
-   **Monitoring**: Continuous change detection with alerts

### 👥 Team Collaboration

-   **Shared Policies**: `.snapbackprotected` files sync protection across teams
-   **Auto-Detection**: Suggest protection for critical files automatically
-   **Onboarding**: Guided setup for new team members
-   **Config Sync**: Keep settings consistent across the team

### 🔧 Developer Experience

-   **Keyboard-First**: All features accessible via shortcuts
-   **Rich UI**: Activity bar, status bar, and Explorer integrations
-   **Diff Tooling**: Compare snapshots with built-in diff viewer
-   **Structured Logging**: Configurable verbosity for debugging

## 🎮 Getting Started

### 1. Installation

```bash
# From VS Code Marketplace or install locally
pnpm install
```

### 2. Initialize

Press `Ctrl+Shift+P` / `Cmd+Shift+P` and run:

```
SnapBack: Initialize 🧢
```

### 3. Protect Files

Right-click any file in Explorer:

```
SnapBack: Protect File 🧢 → Choose protection level
```

### 4. Work Normally

SnapBack automatically creates snapshots based on your protection level.

### 5. Recover When Needed

-   **Activity Bar**: Click the SnapBack icon to browse snapshots
-   **Command Palette**: `SnapBack: Snap Back (Restore Snapshot) 🧢`
-   **Keyboard Shortcut**: `Ctrl+Alt+Z` / `Cmd+Alt+Z`

## 📋 Commands Reference

### 🛡️ Protection Management

| Command                                | Shortcut                   | Description                     |
| -------------------------------------- | -------------------------- | ------------------------------- |
| `SnapBack: Protect File 🧢`            | `Ctrl+Alt+P` / `Cmd+Alt+P` | Add file to protection registry |
| `SnapBack: Change Protection Level 🧢` | -                          | Switch between Watch/Warn/Block |
| `SnapBack: Set Protection: Watch 🧢`   | -                          | Quick-set to Watch level        |
| `SnapBack: Set Protection: Warn 👷`    | -                          | Quick-set to Warn level         |
| `SnapBack: Set Protection: Block ⛑️`   | -                          | Quick-set to Block level        |
| `SnapBack: Unprotect This File 🧢`     | -                          | Remove file from protection     |

### 📸 Snapshot Operations

| Command                                     | Shortcut                     | Description                     |
| ------------------------------------------- | ---------------------------- | ------------------------------- |
| `SnapBack: Create Snapshot 🧢`              | `Ctrl+Alt+S` / `Cmd+Alt+S`   | Manual snapshot creation        |
| `SnapBack: Snap Back (Restore Snapshot) 🧢` | `Ctrl+Alt+Z` / `Cmd+Alt+Z`   | Restore from snapshot           |
| `SnapBack: Compare with Snapshot 🧢`        | -                            | Diff current file with snapshot |
| `SnapBack: Show All Snapshots 🧢`           | -                            | Open snapshots view             |
| `SnapBack: Delete Snapshot 🧢`              | `Delete` (in snapshots view) | Remove a snapshot               |
| `SnapBack: Rename Snapshot 🧢`              | `F2` (in snapshots view)     | Update snapshot name            |

### 🤖 AI & Workflow

| Command                                  | Description                       |
| ---------------------------------------- | --------------------------------- |
| `SnapBack: Analyze Risk 🧢`              | Run risk analysis on current file |
| `SnapBack: Apply Workflow Suggestion 🧢` | Execute AI suggestion             |
| `SnapBack: Auto-Apply Suggestions 🧢`    | Enable autonomous suggestions     |
| `SnapBack: Toggle AI Monitoring 🧢`      | Enable/disable AI monitoring      |
| `SnapBack: Show AI Monitoring Status 🧢` | Display monitoring metrics        |

## ⚙️ Configuration

### Protection Settings

```json
{
	"snapback.protectionLevels.defaultLevel": "watch",
	"snapback.protectionLevels.showLevelBadges": true,
	"snapback.checkpoint.deletion.autoCleanup.enabled": false,
	"snapback.checkpoint.deletion.autoCleanup.olderThanDays": 30
}
```

### Notification Settings

```json
{
	"snapback.notifications.showCheckpointCreated": true,
	"snapback.notifications.duration": 3000,
	"snapback.showAutoCheckpointNotifications": true
}
```

### AI Settings

```json
{
	"snapback.aiDetectionEnabled": true,
	"snapback.autoInitialize": false
}
```

### Advanced Settings

```json
{
	"snapback.logLevel": "info",
	"snapback.checkpoint.naming.useGit": true,
	"snapback.checkpoint.deduplication.enabled": true,
	"snapback.checkpoint.deduplication.cacheSize": 500
}
```

## 📁 Team Configuration Files

### `.snapbackprotected`

Define shared protection policies:

```bash
# Mission-critical configs
package.json
@warn tsconfig.json
@watch src/config/**
@block infrastructure/terraform/**
.env*
```

### `.snapbackignore`

Exclude files from protection:

```bash
node_modules/**
.git/**
*.log
dist/**
build/**
```

### `.snapbackrc`

Advanced configuration:

```json
{
	"protectionLevels": {
		"defaultLevel": "watch"
	},
	"checkpoint": {
		"deletion": {
			"autoCleanup": {
				"enabled": true,
				"olderThanDays": 30
			}
		}
	}
}
```

## 🧪 Development

### Setup

```bash
# From monorepo root
pnpm install

# From apps/vscode
pnpm run compile
```

### Development Workflow

```bash
# Watch mode for development
pnpm run watch

# Run tests
pnpm run test:unit
pnpm run test:integration
pnpm run test

# Linting
pnpm run lint
pnpm run lint:fix

# Package extension
pnpm run package-vsce
```

### Project Structure

```
apps/vscode/
├── src/                 # Extension source code
├── test/                # Unit and integration tests
├── package-contributes/ # Modular package.json sections
├── scripts/             # Build and utility scripts
├── media/               # Icons and images
└── docs/                # Documentation
```

## 🛠️ Troubleshooting

### Common Issues

**Snap Back list is empty**

-   Ensure workspace is under Git
-   Run `SnapBack: Create Snapshot 🧢` to seed history

**Warn notifications too noisy**

-   Adjust debounce via protection settings
-   Downgrade frequent-edit files to Watch level

**Block level stops all saves**

-   Create snapshot directly from prompt
-   Temporarily drop to Warn using status bar control

**Team policies not applying**

-   Confirm `.snapbackprotected` is in repo root
-   Run `SnapBack: Refresh Views 🧢` after editing

### Debugging

1. Open VS Code Output panel
2. Select "SnapBack" from dropdown
3. Set `snapback.logLevel` to "debug" for verbose logging

## 📚 Documentation

-   [User Guide](docs/user-guide/) - End-user documentation
-   [Development Guide](docs/development/) - Developer documentation
-   [Feature Documentation](docs/features/) - Detailed feature specs
-   [Protection Levels Guide](docs/user-guide/protection-levels-guide.md) - Comprehensive protection levels documentation

## 🔄 Changelog

See [CHANGELOG.md](CHANGELOG.md) for detailed release notes.

## 🤝 Support

-   **Issues**: [GitHub Issues](https://github.com/Marcelle-Labs/SnapBack/issues)
-   **Discussions**: [GitHub Discussions](https://github.com/Marcelle-Labs/SnapBack/discussions)
-   **Documentation**: [snapback.dev/docs](https://snapback.dev/docs)

## 📄 License

[GPL-3.0-or-later](LICENSE)

---

<p align="center">
  Made with ❤️ by <a href="https://github.com/Marcelle-Labs">Marcelle Labs</a>
</p>
