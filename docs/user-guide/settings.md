# SnapBack Settings

Configure SnapBack through VS Code settings or `.snapbackrc` configuration files.

## Table of Contents

-   [VS Code Settings](#vs-code-settings)
-   [Configuration File](#configuration-file)
-   [Setting Descriptions](#setting-descriptions)

## VS Code Settings

Access SnapBack settings through VS Code:

1. Open Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "SnapBack"
3. Configure the available options

### Available Settings

| Setting                                       | Description                                                     | Default Value |
| --------------------------------------------- | --------------------------------------------------------------- | ------------- |
| `snapback.protectionLevels.defaultLevel`      | Default protection level when protecting new files              | `watch`       |
| `snapback.protectionLevels.showLevelBadges`   | Show protection level badges in file explorer                   | `true`        |
| `snapback.notifications.showSnapshotCreated`  | Show notification when snapshots are created (Watch level only) | `true`        |
| `snapback.notifications.duration`             | Duration to show snapshot notifications (milliseconds)          | `3000`        |
| `snapback.onboarding.showWelcome`             | Show welcome experience on first run                            | `true`        |
| `snapback.onboarding.autoDetectCriticalFiles` | Automatically suggest protection for critical files             | `true`        |
| `snapback.logLevel`                           | Logging level for SnapBack extension                            | `info`        |
| `snapback.showAutoSnapshotNotifications`      | Show notifications when auto-snapshots are created              | `true`        |
| `snapback.snapshot.naming.useGit`             | Use git context for intelligent snapshot naming                 | `true`        |
| `snapback.snapshot.naming.gitTimeout`         | Git command timeout in milliseconds                             | `5000`        |
| `snapback.snapshot.deletion.confirmDelete`    | Show confirmation dialog before deleting snapshots              | `true`        |
| `snapback.snapshot.deletion.autoCleanup`      | Automatic snapshot cleanup settings                             | See below     |
| `snapback.snapshot.deduplication.enabled`     | Automatically replace duplicate snapshots                       | `true`        |
| `snapback.snapshot.deduplication.cacheSize`   | Maximum number of snapshot hashes to cache                      | `500`         |
| `snapback.config.enableExecutableConfigs`     | Enable loading of executable configuration files                | `false`       |

### Auto Cleanup Settings

The `snapback.snapshot.deletion.autoCleanup` setting has the following structure:

```json
{
	"enabled": false,
	"olderThanDays": 30,
	"keepProtected": true,
	"minimumSnapshots": 10
}
```

## Configuration File

Create a `.snapbackrc` file in your repository root to share protection policies across your team:

### Basic Configuration

```json
{
	"patterns": {
		"**/*.env": "block",
		"**/package.json": "warn",
		"**/*.config.js": "warn"
	}
}
```

### Advanced Configuration

```json
{
	"protectionLevels": {
		"defaultLevel": "watch"
	},
	"patterns": {
		"**/*.env": "Protected",
		"**/package.json": "Warning",
		"**/*.config.js": "Warning",
		"src/components/**/*": "Watched",
		"src/api/**/*": "Warning"
	},
	"snapshot": {
		"deduplication": {
			"enabled": true
		}
	}
}
```

### Pattern Matching

Patterns use glob syntax and are matched against file paths relative to the workspace root:

-   `**/*.env` - Matches all .env files in any directory
-   `src/components/**/*` - Matches all files in the src/components directory
-   `package.json` - Matches package.json in the root directory

## Setting Descriptions

### Protection Level Settings

#### `snapback.protectionLevels.defaultLevel`

Determines the default protection level when protecting new files.

Options:

-   `watch` (Watched) - Silent auto-snapshot on save
-   `warn` (Warning) - Notify before save with options
-   `block` (Protected) - Require snapshot or explicit override

#### `snapback.protectionLevels.showLevelBadges`

Controls whether protection level badges are shown in the file explorer.

### Notification Settings

#### `snapback.notifications.showSnapshotCreated`

Show notification when snapshots are created for Watched level files.

#### `snapback.notifications.duration`

Duration (in milliseconds) to show snapshot notifications.

#### `snapback.showAutoSnapshotNotifications`

Show notifications when auto-snapshots are created for Warning and Protected level files.

### Onboarding Settings

#### `snapback.onboarding.showWelcome`

Show the welcome experience on first run.

#### `snapback.onboarding.autoDetectCriticalFiles`

Automatically suggest protection for critical files like `.env`, `package.json`, etc.

### Snapshot Settings

#### `snapback.snapshot.naming.useGit`

Use git context for intelligent snapshot naming (branch name, commit message).

#### `snapback.snapshot.naming.gitTimeout`

Timeout (in milliseconds) for git commands used in snapshot naming.

#### `snapback.snapshot.deletion.confirmDelete`

Show confirmation dialog before deleting snapshots.

#### `snapback.snapshot.deletion.autoCleanup`

Automatic snapshot cleanup configuration:

-   `enabled`: Enable automatic cleanup
-   `olderThanDays`: Delete snapshots older than this many days
-   `keepProtected`: Keep protected snapshots even if old
-   `minimumSnapshots`: Never delete below this count

#### `snapback.snapshot.deduplication.enabled`

Automatically replace duplicate snapshots with identical file states.

#### `snapback.snapshot.deduplication.cacheSize`

Maximum number of snapshot hashes to cache for deduplication.

### Security Settings

#### `snapback.config.enableExecutableConfigs`

Enable loading of executable configuration files (CJS/MJS).
**WARNING**: Only enable in trusted environments as this can execute arbitrary code.

### Logging Settings

#### `snapback.logLevel`

Controls the verbosity of SnapBack's logging.

Options:

-   `debug` - Most verbose, useful for troubleshooting
-   `info` - Standard logging level
-   `warn` - Only warnings and errors
-   `error` - Only errors

## Team Configuration

Share protection policies across your team by committing a `.snapbackrc` file to your repository:

1. Create `.snapbackrc` in your repository root
2. Define protection patterns for your project
3. Commit the file to Git
4. Team members will automatically get the same protection levels

Example `.snapbackrc` for a web application:

```json
{
	"patterns": {
		".env.production": "Protected",
		".env.staging": "Protected",
		"package.json": "Warning",
		"package-lock.json": "Warning",
		"src/api/**/*": "Warning",
		"src/components/**/*": "Watched"
	}
}
```

## Need Help?

-   Check the [main README](../../README.md) for general information
-   Review the [CHANGELOG](../../CHANGELOG.md) for recent updates
-   Open an [issue](https://github.com/Marcelle-Labs/SnapBack/issues) for bug reports
-   Join the [discussion](https://github.com/Marcelle-Labs/SnapBack/discussions) for questions

Happy configuring! ⚙️
