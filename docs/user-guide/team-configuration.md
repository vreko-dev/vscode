# Team Configuration

Share protection policies across your team with `.snapbackrc` configuration files.

## Table of Contents

-   [Introduction](#introduction)
-   [Creating a Team Configuration](#creating-a-team-configuration)
-   [Configuration File Format](#configuration-file-format)
-   [Pattern Matching](#pattern-matching)
-   [Best Practices](#best-practices)
-   [Examples](#examples)

## Introduction

Team configuration allows you to share protection policies across your entire development team. By committing a `.snapbackrc` file to your repository, all team members will automatically get the same protection levels for files matching specified patterns.

This ensures consistency in how files are protected and helps prevent accidental changes to critical files.

## Creating a Team Configuration

To create a team configuration:

1. Create a `.snapbackrc` file in your repository root
2. Define protection patterns for your project
3. Commit the file to Git
4. Team members will automatically get the same protection levels

## Configuration File Format

The `.snapbackrc` file uses JSON5 format, which supports:

-   Comments
-   Trailing commas
-   Unquoted keys
-   Single and double quotes

### Basic Structure

```json5
{
	// Protection patterns
	patterns: {
		// Pattern: Protection Level
		"**/*.env": "Protected",
		"**/package.json": "Warning",
		"**/*.config.js": "Warning",
	},
}
```

### Advanced Structure

```json5
{
	// Optional: Override default settings
	protectionLevels: {
		defaultLevel: "Watched",
	},

	// Protection patterns
	patterns: {
		// Critical files - require snapshots
		".env.production": "Protected",
		".env.staging": "Protected",
		"docker-compose.production.yml": "Protected",

		// Important files - notify on changes
		"package.json": "Warning",
		"package-lock.json": "Warning",
		"yarn.lock": "Warning",
		"src/api/**/*": "Warning",
		"database/migrations/**/*": "Warning",

		// Development files - silent protection
		"src/components/**/*": "Watched",
		"src/hooks/**/*": "Watched",
		"tests/**/*": "Watched",
	},

	// Optional: Snapshot settings
	snapshot: {
		deduplication: {
			enabled: true,
		},
	},
}
```

## Pattern Matching

Patterns use glob syntax and are matched against file paths relative to the workspace root:

### Pattern Examples

| Pattern               | Description                                           | Matches                                                        |
| --------------------- | ----------------------------------------------------- | -------------------------------------------------------------- |
| `**/*.env`            | All .env files in any directory                       | `.env`, `config/.env`, `src/.env`                              |
| `src/components/**/*` | All files in the src/components directory             | `src/components/Button.tsx`, `src/components/utils/helpers.js` |
| `package.json`        | package.json in the root directory                    | `package.json`                                                 |
| `src/api/*.ts`        | TypeScript files directly in src/api                  | `src/api/users.ts`, `src/api/products.ts`                      |
| `!src/api/test.ts`    | Exclude specific file (when used with other patterns) | Excludes `src/api/test.ts`                                     |

### Protection Levels

Use these exact strings for protection levels:

-   `"Watched"` - Silent auto-snapshot on save (🟢)
-   `"Warning"` - Notify before save with options (🟡)
-   `"Protected"` - Require snapshot or explicit override (🔴)

## Best Practices

### 1. Start Simple

Begin with critical files only:

```json5
{
	patterns: {
		".env.production": "Protected",
		"package.json": "Warning",
	},
}
```

### 2. Use Descriptive Comments

Add comments to explain why certain files are protected:

```json5
{
	patterns: {
		// Production credentials - never change without snapshot
		".env.production": "Protected",

		// Dependency changes affect all developers
		"package.json": "Warning",
		"package-lock.json": "Warning",
	},
}
```

### 3. Organize by Risk Level

Group patterns by protection level:

```json5
{
	patterns: {
		// 🔴 Protected - Critical files
		".env.production": "Protected",
		"docker-compose.production.yml": "Protected",

		// 🟡 Warning - Important files
		"package.json": "Warning",
		"src/api/**/*": "Warning",

		// 🟢 Watched - Development files
		"src/components/**/*": "Watched",
		"tests/**/*": "Watched",
	},
}
```

### 4. Consider Your Workflow

Think about your team's workflow:

-   Files changed frequently → Watched
-   Files changed occasionally → Warning
-   Files rarely changed but critical → Protected

## Examples

### Web Application

```json5
{
	patterns: {
		// 🔴 Critical - Production configs
		".env.production": "Protected",
		"docker-compose.production.yml": "Protected",

		// 🟡 Important - Shared configs and dependencies
		".env.local": "Warning",
		"package.json": "Warning",
		"package-lock.json": "Warning",
		"tsconfig.json": "Warning",
		"src/api/**/*": "Warning",

		// 🟢 Development - Active work
		"src/components/**/*": "Watched",
		"src/hooks/**/*": "Watched",
		"src/utils/**/*": "Watched",
	},
}
```

### Backend/API Service

```json5
{
	patterns: {
		// 🔴 Critical - Production configs and schemas
		".env.production": "Protected",
		"database/schema.sql": "Protected",
		"kubernetes/production.yaml": "Protected",

		// 🟡 Important - Business logic and migrations
		"src/routes/**/*": "Warning",
		"src/services/**/*": "Warning",
		"database/migrations/**/*": "Warning",

		// 🟢 Development - Active work
		"src/controllers/**/*": "Watched",
		"src/middleware/**/*": "Watched",
	},
}
```

### Configuration Management

```json5
{
	patterns: {
		// 🔴 Production infrastructure
		"terraform/production/**/*": "Protected",
		"kubernetes/production/**/*": "Protected",
		".github/workflows/deploy.yml": "Protected",

		// 🟡 Staging infrastructure
		"terraform/staging/**/*": "Warning",
		"kubernetes/staging/**/*": "Warning",
		".github/workflows/staging.yml": "Warning",

		// 🟢 Development infrastructure
		"terraform/dev/**/*": "Watched",
		"kubernetes/dev/**/*": "Watched",
	},
}
```

## Troubleshooting

### Configuration Not Applied

If team configuration isn't working:

1. Verify the `.snapbackrc` file is in the repository root
2. Check that the file is valid JSON5
3. Ensure patterns match your file structure
4. Restart VS Code to reload configuration

### Pattern Conflicts

When multiple patterns match a file, the most specific pattern wins:

-   `src/api/users.ts` matches both `src/api/**/*` and `src/api/users.ts`
-   `src/api/users.ts` will use the protection level from `src/api/users.ts` if it exists

### Debugging

Enable debug logging to troubleshoot configuration issues:

1. Open VS Code Settings (`Ctrl+,` or `Cmd+,`)
2. Search for "snapback.logLevel"
3. Set to "debug"
4. Open Output panel and select "SnapBack"

## Need Help?

-   Check the [main README](../../README.md) for general information
-   Review the [CHANGELOG](../../CHANGELOG.md) for recent updates
-   Open an [issue](https://github.com/Marcelle-Labs/SnapBack/issues) for bug reports
-   Join the [discussion](https://github.com/Marcelle-Labs/SnapBack/discussions) for questions

Happy collaborating! 🤝
