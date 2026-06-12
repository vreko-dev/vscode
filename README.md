<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="./media/lockup-white.png" width="400">
    <img alt="Vreko" src="./media/lockup-dark.png" width="400">
  </picture>
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.vreko-vscode"><img src="https://img.shields.io/visual-studio-marketplace/v/MarcelleLabs.vreko-vscode?style=flat-square&color=4ADE80" alt="Version" /></a>
  <a href="https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.vreko-vscode"><img src="https://img.shields.io/visual-studio-marketplace/d/MarcelleLabs.vreko-vscode?style=flat-square&color=4ADE80" alt="Downloads" /></a>
  <a href="https://discord.gg/B4BXeYkE2F"><img src="https://img.shields.io/badge/Discord-Join%20Community-5865F2?style=flat-square&logo=discord&logoColor=white" alt="Discord" /></a>
  <a href="https://opensource.org/licenses/GPL-3.0"><img src="https://img.shields.io/badge/License-GPL_3.0-blue.svg?style=flat-square" alt="License" /></a>
</p>

<p align="center">
  <strong>Your codebase gets smarter every session.</strong><br />
  Pattern Memory learns what breaks YOUR code - mistakes don't repeat, patterns compound.
</p>

<p align="center">
  <a href="#-quick-start">Quick Start</a> ·
  <a href="#-the-vreko-intelligence-platform">Platform</a> ·
  <a href="#-mcp-integration">MCP Integration</a> ·
  <a href="https://docs.vreko.dev">Documentation</a> ·
  <a href="https://discord.gg/B4BXeYkE2F">Discord</a>
</p>

---

## Why Vreko?

AI coding agents are powerful but unpredictable. Vibe-coding with Cursor, Claude Code, or Copilot ships features fast - and introduces regressions just as fast. Vreko turns that unpredictability into **compound intelligence**:

| Day 1 | Day 30 | Month 3 |
|-------|--------|---------|
| Automatic snapshots | Learns YOUR patterns | Catches issues before they ship |
| AI change detection | Context-aware warnings | Team-wide pattern library |
| Real-time intelligence | Risk calibration | Mistakes don't repeat |

> Your codebase gets smarter every session. Patterns compound. Mistakes don't repeat.

---

## The Vreko Intelligence Platform

This extension is one piece of an integrated intelligence system. Each component amplifies the others:

| Component | What It Adds |
|-----------|--------------|
| **🦎 VS Code Extension** | Visual interface, real-time snapshots, Pattern Memory feedback |
| **⌨️ CLI** (`@vreko/cli`) | Terminal workflows, CI/CD hooks, automation scripts |
| **🤖 MCP Server** | AI assistant coordination, context-aware checkpoints, learning capture |
| **📊 Web Dashboard** | Cross-project insights, team patterns, intelligence analytics |

**Start here** → Extension works standalone. Add CLI for terminal workflows. Add MCP to supercharge your AI assistant.

---

## Key Capabilities

### 🧠 Pattern Memory

The intelligence layer that learns YOUR codebase. Day 1: snapshots. Day 30: it knows what breaks. Month 3: catches patterns you didn't know existed.

### ⚡ Time Travel

Access any previous state in <1 second. Compare, diff, learn from what changed.

### 🔍 AI Detection

Automatically detects changes from **11 AI assistants**: GitHub Copilot, Cursor, Claude, Windsurf, Cline, Tabnine, Codeium, Amazon Q, JetBrains AI, Sourcegraph Cody, and more.

### 📊 Status Bar Dashboard

One-click access to session status, quick actions, stats, and web dashboard.

### 🔒 Privacy-First

100% local by default. Your code never leaves your machine. Cloud sync is optional.

---

## Quick Start

### 1. Install

**VS Code Marketplace** (Recommended)
```
ext install MarcelleLabs.vreko-vscode
```

Or [install from the marketplace](https://marketplace.visualstudio.com/items?itemName=MarcelleLabs.vreko-vscode)

### 2. Protect Your First File

1. Open any critical file (`.env`, `auth.ts`, `database.ts`)
2. Right-click → **Vreko: Protect This File**
3. Choose a protection level:

| Level | Icon | Behavior |
|-------|------|----------|
| **Watch** | 👁️ | Monitor silently, auto-snapshot on changes |
| **Warn** | ⚠️ | Show banner before risky edits |
| **Block** | 🔒 | Require confirmation for any edit |

### 3. See Pattern Memory in Action

When Vreko detects a risky change:

1. You'll see a warning with context about why it's risky
2. Compare the diff to understand what changed
3. Accept or revert based on Pattern Memory's guidance
4. Vreko learns from your decision

**Shortcut**: `Cmd+Shift+S` creates a snapshot, `Cmd+Shift+R` opens the timeline.

---

## Status Bar Quick Access

The **Vreko status bar item** gives you one-click access to everything:

```
┌─────────────────────────────────────┐
│  Vreko Quick Actions             │
├─────────────────────────────────────┤
│  📸  Create Snapshot                │
│  🧠  View Timeline                  │
│  🛡️   Protect Current File          │
│  📊  Open Dashboard                 │
│  ⚙️   Settings                      │
└─────────────────────────────────────┘
```

Click the status bar → select an action → done. No command palette required.

---

## MCP Integration

Vreko includes a **Model Context Protocol (MCP) server** that enables AI assistants to coordinate with your intelligence system.

### MCP Health Guardian

The extension includes **proactive health monitoring** to ensure your MCP server is always ready when AI assistants need it:

- **Fast Detection**: Know about issues in <5s (not 30s)
- **Adaptive Polling**: Faster checks when you're actively using AI tools
- **Status Bar Indicator**: Real-time health status with visual feedback
- **Proactive Alerts**: Toast notifications when MCP becomes unavailable
- **Zero Surprise Failures**: LLM tools never hit a dead server unexpectedly

**Status Bar States**:

| Icon | Color | Meaning |
|------|-------|---------|
| ✓ | Green | MCP healthy and ready |
| ⚠ | Yellow | MCP degraded (slower than usual) |
| ✗ | Red | MCP unavailable |
| ? | Gray | MCP status unknown |

**Configuration**:

```json
{
  "vreko.mcp.healthGuardian.enabled": true,
  "vreko.mcp.healthGuardian.proactiveAlerts": true
}
```

### For AI Assistants (Claude, Cursor, etc.)

Vreko exposes a **4-tool session API** designed for agentic coding loops. Your AI assistant calls these automatically:

```
vreko({ task: "refactor auth module" })
  → briefing: past learnings, active warnings, lineage chain

  [... agent works with full context ...]

vreko_pulse()   // optional mid-session vitals check
  → pulse: elevated, pressure: 38%, trajectory: stable

vreko_learn({ insight: "always snapshot before token refresh logic" })

vreko_end({ outcome: "completed", summary: "..." })
  → ceremony: files changed, patterns captured, carry-forward context
```

### MCP Tools

| Tool | When | Purpose |
|------|------|---------|
| `vreko` | Start of every task | Opens session, returns intelligence briefing |
| `vreko_pulse` | Mid-session check | Read-only vitals: pulse, pressure, trajectory |
| `vreko_learn` | Any discovery | Captures pattern, gotcha, or decision |
| `vreko_end` | Task complete | Closes session with ceremony and carry-forward context |

The full surface - `check`, `advise`, `safe_to_write`, refactoring and learning intelligence tools - is also available. See [MCP documentation →](https://docs.vreko.dev/mcp)

### Setup MCP

Add to your AI assistant's MCP configuration:

```json
{
  "mcpServers": {
    "vreko": {
      "command": "npx",
      "args": ["-y", "@vreko/cli", "mcp", "--stdio", "--workspace", "/absolute/path/to/your/project"],
      "env": {
        "VREKO_API_KEY": "your-api-key-here"
      }
    }
  }
}
```

[Full MCP documentation →](https://docs.vreko.dev/mcp)

---

## CLI Integration

For terminal workflows and automation, install the Vreko CLI:

```bash
npm install -g @vreko/cli
# or
pnpm add -g @vreko/cli
```

### CLI Commands

```bash
# Create a snapshot before risky operations
vreko "before refactor"

# List recent snapshots
vreko list

# Check file against learned patterns
vreko check src/auth.ts

# View intelligence status
vreko status

# Compare current state with a snapshot
vreko diff <snapshot-id>
```

The CLI shares the same `.vreko/` database as the extension - your snapshots and learnings sync automatically.

[CLI documentation →](https://docs.vreko.dev/cli)

---

## Commands

### Core Commands

| Command | Shortcut | Description |
|---------|----------|-------------|
| **Create Snapshot** | `Cmd+Shift+S` | Snapshot current file state |
| **View Timeline** | `Cmd+Shift+R` | Browse snapshot history with diffs |
| **Compare Changes** |  -  | See what AI changed and why |
| **View All Snapshots** |  -  | Full snapshot history |

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
| **Browse Session** | View all changes from a session |
| **Compare with Snapshot** | Diff current vs snapshot |
| **Delete Older Snapshots** | Clean up old snapshots |

Access all commands: `Cmd+Shift+P` → type "Vreko"

---

## Authentication

Vreko works **100% offline** with full functionality. Sign in to unlock cloud features.

### Sign In (Optional)

1. `Cmd+Shift+P` → **Vreko: Sign In**
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

`Cmd+Shift+P` → **Vreko: Sign Out**  -  all local data preserved.

---

## Configuration

### Quick Setup (`.vrekorc`)

Create `.vrekorc` in your workspace root:

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
  "vreko.autoProtect": true,
  "vreko.protectionPatterns": ["*.env*", "**/*.key"],
  "vreko.telemetry": false
}
```

[Full configuration reference →](https://docs.vreko.dev/configuration)

---

## Privacy & Security

- **Local-first**: All data in `.vreko/` in your workspace
- **No telemetry** without explicit consent
- **No code upload**: We never see your code
- **Open source**: Audit at [github.com/vreko-dev](https://github.com/vreko-dev)
- **Cloud optional**: Full functionality offline

---

## Troubleshooting

### Extension Not Activating?

1. Requires VS Code 1.80+
2. `Cmd+Shift+P` → "Developer: Reload Window"
3. Check Output panel → "Vreko" for errors

### Snapshots Not Appearing?

1. Check `.vreko/` directory exists in workspace
2. Verify file is protected: look for badge in explorer
3. Confirm disk space available

### MCP Not Connecting?

1. Verify MCP config syntax
2. Check AI assistant supports MCP
3. See [MCP troubleshooting →](https://docs.vreko.dev/mcp-troubleshooting)

---

## Get Help & Give Feedback

We're building Vreko in public and your feedback shapes the product.

- **Discord**: [Join our community →](https://discord.gg/B4BXeYkE2F)
- **GitHub Issues**: [Report bugs →](https://github.com/vreko-dev/vscode/issues)
- **Feature Requests**: [Discussions →](https://github.com/vreko-dev/vscode/discussions)
- **Twitter**: [@vrekodev](https://twitter.com/vrekodev)

---

## Links

| Resource | Link |
|----------|------|
| Documentation | [docs.vreko.dev](https://docs.vreko.dev) |
| Website | [vreko.dev](https://vreko.dev) |
| GitHub | [github.com/vreko-dev](https://github.com/vreko-dev) |
| CLI | [@vreko/cli](https://www.npmjs.com/package/@vreko/cli) | Includes bundled MCP server |
| Changelog | [View releases](https://github.com/vreko-dev/vscode/releases) |

---

<p align="center">
  <sub>Built with 💚 by <a href="https://vreko.dev">Marcelle Labs</a></sub>
</p>


<p align="center">
  <a href="https://opensource.org/licenses/GPL-3.0"><img src="https://img.shields.io/badge/License-GPL_3.0-blue.svg?style=flat-square" alt="License" /></a>
</p>
