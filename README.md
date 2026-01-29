<p align="center">
  <img src="../../brand/github/github-vscode.png" alt="SnapBack for VS Code - Intelligent code safety and restoration in your editor" />
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/MarcelleLabs.snapback-vscode?style=flat-square&color=4ADE80" alt="Version" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode"><img src="https://img.shields.io/visual-studio-marketplace/d/MarcelleLabs.snapback-vscode?style=flat-square&color=4ADE80" alt="Downloads" /></a>
  <a href="https://discord.gg/B4BXeYkE2F"><img src="https://img.shields.io/discord/1234567890?style=flat-square&color=5865F2&logo=discord&logoColor=white&label=Discord" alt="Discord" /></a>
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square" alt="License" /></a>
</p>

<p align="center">
  SnapBack watches every AI-assisted change, learns what breaks in YOUR codebase, and catches disasters before they ship. Works with Cursor, Copilot, Claude, Windsurf, Cline, and more.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-the-snapback-platform">Platform</a> ·
  <a href="#-mcp-integration">MCP Integration</a> ·
  <a href="https://docs.snapback.dev">Documentation</a> ·
  <a href="https://discord.gg/B4BXeYkE2F">Discord</a>
</p>

---

## Why SnapBack?

AI coding assistants are powerful but unpredictable. They can:
- Overwrite hours of work in a single paste
- Break configurations that "always worked"
- Introduce subtle bugs across multiple files

**SnapBack is your safety net.** It runs silently in the background, creating restore points and learning patterns. When AI breaks something—and it will—you're one click away from recovery.

> *"Day 1: 94% accurate. Day 30: It knows YOUR codebase. Month 3: It catches patterns you didn't know existed."*

---

## The SnapBack Platform

This extension is the **visual interface** to the SnapBack intelligence platform. The full platform includes:

| Component | Purpose |
|-----------|---------|
| **VS Code Extension** | Real-time protection, instant recovery, status bar dashboard |
| **CLI** (`@snapback/cli`) | Terminal workflows, CI/CD integration, automation scripts |
| **MCP Server** | AI assistant coordination, intelligent checkpointing |
| **Web Dashboard** | Cross-project analytics, team insights, pattern library |

Install the extension to get started—the intelligence layer works immediately. Add the CLI or MCP server when you're ready for advanced workflows.

---

## Key Capabilities

### Instant Recovery
Restore any file to any point in seconds. No Git archaeology, no lost work.

### AI Detection
Automatically detects changes from **11 AI assistants**: GitHub Copilot, Cursor, Claude, Windsurf, Cline, Tabnine, Codeium, Amazon Q, JetBrains AI, Sourcegraph Cody, and more.

### Pattern Learning
SnapBack learns what breaks in your specific codebase and warns you before the same mistakes happen again.

### Status Bar Dashboard
Click the **SnapBack icon** in your status bar to instantly access:
- Protection status at a glance
- Quick actions (snapshot, restore, protect)
- Jump to your web dashboard
- Session statistics

### Privacy-First
100% local by default. Your code never leaves your machine. Cloud sync is optional.

---

## Quick Start

### 1. Install

**VS Code Marketplace** (Recommended)
```
ext install MarcelleLabs.snapback-vscode
```

Or [install from the marketplace](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.snapback-vscode)

### 2. Protect Your First File

1. Open any critical file (`.env`, `auth.ts`, `database.ts`)
2. Right-click → **SnapBack: Protect This File**
3. Choose a protection level:

| Level | Icon | Behavior |
|-------|------|----------|
| **Watch** | 👁️ | Monitor silently, auto-snapshot on changes |
| **Warn** | ⚠️ | Show banner before risky edits |
| **Block** | 🔒 | Require confirmation for any edit |

### 3. Your First Restore

When AI breaks something:

1. `Cmd+Shift+P` → **SnapBack: Restore Snapshot**
2. Select the snapshot (timestamped, with AI tool attribution)
3. Preview the diff → Confirm
4. Done. File restored.

**Shortcut**: `Cmd+Shift+S` creates a snapshot, `Cmd+Shift+R` restores.

---

## Status Bar Quick Access

The **SnapBack status bar item** gives you one-click access to everything:

```
┌─────────────────────────────────────┐
│  SnapBack Quick Actions             │
├─────────────────────────────────────┤
│  📸  Create Snapshot                │
│  ↩️   Quick Restore                 │
│  🛡️   Protect Current File          │
│  📊  Open Dashboard                 │
│  ⚙️   Settings                      │
└─────────────────────────────────────┘
```

Click the status bar → select an action → done. No command palette required.

---

## MCP Integration

SnapBack includes a **Model Context Protocol (MCP) server** that enables AI assistants to coordinate with your protection system.

### For AI Assistants (Claude, Cursor, etc.)

When configured, AI assistants can:

```
snap({mode: "start", task: "refactor auth module"})
→ SnapBack creates checkpoint, returns context

snap({mode: "check", files: ["auth.ts"]})
→ Validates changes against learned patterns

snap_end({ok: 1, learnings: ["Always backup before auth changes"]})
→ Records session outcome for future learning
```

### MCP Tools Available

| Tool | Purpose |
|------|---------|
| `snap` | Start task, get context, quick check |
| `check` | Validate code against patterns |
| `advise` | Get risk analysis before changes |
| `pulse` | Health check and session status |
| `snap_learn` | Record a new pattern |
| `snap_violation` | Report a mistake for learning |
| `snap_end` | Complete task with learnings |
| `snap_fix` | List/restore snapshots |
| `snap_help` | Get workflow guidance |

### Setup MCP

Add to your AI assistant's MCP configuration:

```json
{
  "mcpServers": {
    "snapback": {
      "command": "npx",
      "args": ["@snapback/mcp-server"]
    }
  }
}
```

[Full MCP documentation →](https://docs.snapback.dev/mcp)

---

## CLI Integration

For terminal workflows and automation, install the SnapBack CLI:

```bash
npm install -g @snapback/cli
```

### CLI Commands

```bash
# Create a snapshot before risky operations
snapback snap "before refactor"

# List recent snapshots
snapback list

# Restore a specific snapshot
snapback restore <snapshot-id>

# Check file against learned patterns
snapback check src/auth.ts

# View protection status
snapback status
```

The CLI shares the same `.snapback/` database as the extension—your snapshots and learnings sync automatically.

[CLI documentation →](https://docs.snapback.dev/cli)

---

## Commands

### Core Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Create Snapshot** | `Cmd+Shift+S` | Snapshot current file state |
| **Quick Restore** | `Cmd+Shift+R` | Restore most recent snapshot |
| **Undo AI Change** | — | Revert the last AI-detected change |
| **View All Snapshots** | — | Browse snapshot history with diffs |

### Protection Commands

| Command | Description |
|---------|-------------|
| **Protect File** | Add file to protection with level selection |
| **Protect Entire Repo** | Auto-protect based on patterns |
| **Change Protection Level** | Adjust Watch/Warn/Block |
| **View Protected Files** | See all protected files |

### Session Commands

| Command | Description |
|---------|-------------|
| **Restore Session** | Restore multiple files from a session |
| **Compare with Snapshot** | Diff current vs snapshot |
| **Delete Older Snapshots** | Clean up old snapshots |

Access all commands: `Cmd+Shift+P` → type "SnapBack"

---

## Authentication

SnapBack works **100% offline** with full functionality. Sign in to unlock cloud features.

### Sign In (Optional)

1. `Cmd+Shift+P` → **SnapBack: Sign In**
2. Browser opens → Sign in with GitHub or Google
3. Extension auto-connects

### What Cloud Unlocks

| Feature | Local | Cloud |
|---------|-------|-------|
| Snapshots | ✅ Unlimited | ✅ + Sync |
| AI Detection | ✅ 11 tools | ✅ Same |
| Pattern Learning | ✅ Local patterns | ✅ + Community patterns |
| Cross-device | ❌ | ✅ Yes |
| Team sharing | ❌ | ✅ Yes |

### Sign Out

`Cmd+Shift+P` → **SnapBack: Sign Out** — all local data preserved.

---

## Configuration

### Quick Setup (`.snapbackrc`)

Create `.snapbackrc` in your workspace root:

```json
{
  "protection": {
    "patterns": {
      "*.env*": "block",
      "src/auth/**": "warn",
      "**/database/**": "watch"
    }
  },
  "snapshots": {
    "autoCreate": true,
    "maxAge": "30d"
  }
}
```

### VS Code Settings

```json
{
  "snapback.autoProtect": true,
  "snapback.protectionPatterns": ["*.env*", "**/*.key"],
  "snapback.telemetry": false
}
```

[Full configuration reference →](https://docs.snapback.dev/configuration)

---

## Privacy & Security

- **Local-first**: All data in `.snapback/` in your workspace
- **No telemetry** without explicit consent
- **No code upload**: We never see your code
- **Open source**: Audit at [github.com/snapback-dev](https://github.com/snapback-dev)
- **Cloud optional**: Full functionality offline

---

## Troubleshooting

### Extension Not Activating?

1. Requires VS Code 1.80+
2. `Cmd+Shift+P` → "Developer: Reload Window"
3. Check Output panel → "SnapBack" for errors

### Snapshots Not Appearing?

1. Check `.snapback/` directory exists in workspace
2. Verify file is protected: look for badge in explorer
3. Confirm disk space available

### MCP Not Connecting?

1. Verify MCP config syntax
2. Check AI assistant supports MCP
3. See [MCP troubleshooting →](https://docs.snapback.dev/mcp-troubleshooting)

---

## Get Help & Give Feedback

We're building SnapBack in public and your feedback shapes the product.

- **Discord**: [Join our community →](https://discord.gg/B4BXeYkE2F)
- **GitHub Issues**: [Report bugs →](https://github.com/snapback-dev/vscode/issues)
- **Feature Requests**: [Discussions →](https://github.com/snapback-dev/vscode/discussions)
- **Twitter**: [@snapbackdev](https://twitter.com/snapbackdev)

---

## Links

| Resource | Link |
|----------|------|
| Documentation | [docs.snapback.dev](https://docs.snapback.dev) |
| Website | [snapback.dev](https://snapback.dev) |
| GitHub | [github.com/snapback-dev](https://github.com/snapback-dev) |
| MCP Server | [@snapback/mcp-server](https://www.npmjs.com/package/@snapback/mcp-server) |
| CLI | [@snapback/cli](https://www.npmjs.com/package/@snapback/cli) |
| Changelog | [View releases](https://github.com/snapback-dev/vscode/releases) |

---

<p align="center">
  <sub>Built with 💚 by <a href="https://snapback.dev">Marcelle Labs</a></sub>
</p>

<p align="center">
  <a href="https://opensource.org/licenses/Apache-2.0"><img src="https://img.shields.io/badge/License-Apache_2.0-blue.svg?style=flat-square" alt="License" /></a>
</p>
