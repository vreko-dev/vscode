# SnapBack for VS Code

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/snapback.snapback)](https://marketplace.visualstudio.com/items?itemName=snapback.snapback)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/snapback.snapback)](https://marketplace.visualstudio.com/items?itemName=snapback.snapback)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

> Automated file protection and snapshot management for VS Code

Never lose critical work again. SnapBack automatically protects your important files and creates snapshots before risky changes.

## Features

### 🆓 Always Free

- ✅ **Auto-Protection**: Automatically protect config files, credentials, schemas
- ✅ **Local Snapshots**: Create unlimited snapshots stored locally
- ✅ **Secret Detection**: Prevent committing API keys and passwords
- ✅ **Risk Analysis**: Detect dangerous code patterns
- ✅ **File History**: Track changes to protected files
- ✅ **Works Offline**: No account or internet required

### ☁️ Cloud Features (Optional - Free API Key)

Get a free API key from [snapback.dev](https://snapback.dev) to unlock:

- 🔐 **Cross-Device Sync**: Access snapshots on any computer
- 🔐 **Team Sharing**: Share protection rules with your team
- 🔐 **Advanced Analytics**: ML-powered risk detection
- 🔐 **Cloud Backup**: Never lose snapshots

## Installation

1. Install from [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=snapback.snapback)

   **OR** via command line:
   ```bash
   code --install-extension snapback.snapback
   ```

2. **That's it!** Extension works immediately - no setup needed.

## Quick Start

### Protect Your First File

1. Open any file (e.g., `.env`, `database.ts`)
2. Right-click → **SnapBack: Protect This File**
3. Choose protection level:
   - **Watched**: Monitor for changes
   - **Caution**: Warn before risky edits
   - **Protected**: Require confirmation to edit

### Create Your First Snapshot

1. Press `Cmd+Shift+S` (or `Ctrl+Shift+S` on Windows/Linux)
2. Enter a description (e.g., "Before refactor")
3. Done! Snapshot saved locally

### Restore from Snapshot

1. Open Command Palette (`Cmd+Shift+P`)
2. Type "SnapBack: Restore Snapshot"
3. Select snapshot from list
4. Files restored to that point in time

## How It Works

```
┌─────────────────────────────────────┐
│  Your Workspace                     │
│  ┌────────────────────────────────┐ │
│  │ .env          [PROTECTED] 🔒   │ │
│  │ auth.ts       [CAUTION]    ⚠️  │ │
│  │ database.ts   [WATCHED]    👁️  │ │
│  └────────────────────────────────┘ │
│                                     │
│  SnapBack monitors edits            │
│  ├─ Detects secrets                 │
│  ├─ Warns on risky changes          │
│  └─ Auto-creates snapshots          │
└─────────────────────────────────────┘
```

## Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| Create Snapshot | `Cmd+Shift+S` | Create snapshot of current state |
| Restore Snapshot | - | View and restore from snapshots |
| Protect File | - | Add file to protection list |
| View Protected Files | - | See all protected files |
| Snapshot Settings | - | Configure auto-snapshot rules |

## Protection Levels

### 🔵 Watched
- Monitors file for changes
- Shows badge in file explorer
- Non-intrusive

**Good for**: Config files, package.json

### 🟡 Caution
- Shows warning banner when editing
- Suggests creating snapshot first
- Can still edit freely

**Good for**: Auth logic, database schemas

### 🔴 Protected
- Requires explicit confirmation to edit
- Auto-creates snapshot before changes
- Maximum safety

**Good for**: .env files, private keys, production configs

## Configuration

### Extension Settings

```json
{
  // Auto-protect common files
  "snapback.autoProtect": true,

  // Protection patterns (glob)
  "snapback.protectionPatterns": [
    "*.env*",
    "**/*.key",
    "**/secrets/**"
  ],

  // Auto-snapshot before risky changes
  "snapback.autoSnapshot": true,

  // Optional: API key for cloud features
  "snapback.apiKey": ""
}
```

### Enable Cloud Sync (Optional)

1. Get free API key: [snapback.dev](https://snapback.dev)
2. Open Settings (`Cmd+,`)
3. Search "SnapBack API Key"
4. Paste your key
5. Cloud features enabled!

## Feature Comparison

| Feature | Free (Local) | With API Key |
|---------|-------------|--------------|
| File Protection | ✅ Unlimited | ✅ Unlimited |
| Local Snapshots | ✅ Unlimited | ✅ Unlimited |
| Secret Detection | ✅ Basic | ✅ ML-Powered |
| Works Offline | ✅ Yes | ✅ Yes |
| Cloud Sync | ❌ | ✅ Yes |
| Team Sharing | ❌ | ✅ Yes |
| Cross-Device | ❌ | ✅ Yes |
| Advanced Analytics | ❌ | ✅ Yes |

## Privacy & Security

- **No telemetry** without your consent
- **Local-first**: All data stored in your workspace by default
- **Open source**: Audit the code yourself
- **No tracking**: We don't know what files you protect
- **API key optional**: Full features work offline

## Examples

### Protect Critical Files

```javascript
// .snapbackrc in your workspace root
{
  "protection": {
    "patterns": {
      "*.env*": "protected",
      "src/auth/**": "caution",
      "database/**": "watched"
    }
  }
}
```

### Auto-Snapshot Rules

```javascript
{
  "snapshots": {
    "autoCreate": {
      "beforeGitCommit": true,
      "beforeRefactor": true,
      "beforeDeploy": true
    }
  }
}
```

## Troubleshooting

### Extension not activating

1. Check VS Code version (requires 1.80+)
2. Reload window: `Cmd+Shift+P` → "Reload Window"
3. Check extension is enabled: Extensions panel

### Snapshots not appearing

1. Check storage location: `.snapback/` in workspace
2. Verify disk space available
3. Check file permissions

### Cloud sync not working

1. Verify API key in settings
2. Check internet connection
3. Look for error notifications

## Development

### Building from Source

```bash
git clone https://github.com/snapback-dev/vscode.git
cd vscode

pnpm install
pnpm build

# Package
pnpm vsce package

# Install locally
code --install-extension snapback-1.0.0.vsix
```

### Testing

```bash
# Run tests
pnpm test

# Launch extension development host
pnpm dev
```

## Links

- **Documentation**: [docs.snapback.dev](https://docs.snapback.dev)
- **Get API Key**: [snapback.dev](https://snapback.dev)
- **Report Issues**: [github.com/snapback-dev/vscode/issues](https://github.com/snapback-dev/vscode/issues)
- **Main Repository**: [Marcelle-Labs/snapback.dev](https://github.com/Marcelle-Labs/snapback.dev)

## Related

- [`@snapback/mcp-server`](https://github.com/snapback-dev/mcp-server) - MCP server for AI tools
- [`@snapback-oss/sdk`](https://github.com/snapback-dev/sdk) - TypeScript SDK

## License

Apache-2.0 © SnapBack
