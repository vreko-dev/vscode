import type { SnapBackRC } from "../types/snapbackrc.types";

/**
 * Default SnapBack configuration that provides sensible protection levels
 * for common file types without requiring any configuration file.
 *
 * Protection levels:
 * - block: Critical files that should never be modified directly
 * - warn: Important files that require confirmation before modification
 * - watch: Auxiliary files that should be tracked but not protected
 */
export const DEFAULT_SNAPBACKRC: SnapBackRC = {
	protection: [
		// Block level protections (sensitive files)
		{
			pattern: "**/.env*",
			level: "block",
			reason: "Environment files contain sensitive data",
		},
		{
			pattern: "**/.npmrc",
			level: "block",
			reason: "NPM configuration may contain tokens",
		},
		{
			pattern: "**/yarn.lock",
			level: "block",
			reason: "Lock files should be committed, not modified directly",
		},
		{
			pattern: "**/package-lock.json",
			level: "block",
			reason: "Lock files should be committed, not modified directly",
		},
		{
			pattern: "**/pnpm-lock.yaml",
			level: "block",
			reason: "Lock files should be committed, not modified directly",
		},

		// Warn level protections (important config files)
		{
			pattern: "**/package.json",
			level: "warn",
			reason: "Changes affect dependencies and scripts",
		},
		{
			pattern: "**/tsconfig.json",
			level: "warn",
			reason: "TypeScript configuration affects compilation",
		},
		{
			pattern: "**/webpack.config.js",
			level: "warn",
			reason: "Build configuration affects output",
		},
		{
			pattern: "**/.github/workflows/**",
			level: "warn",
			reason: "CI/CD workflows affect deployment",
		},
		{
			pattern: "**/Dockerfile",
			level: "warn",
			reason: "Container configuration affects deployment",
		},

		// Watch level protections (auxiliary files)
		{
			pattern: "**/*.md",
			level: "watch",
			reason: "Documentation changes tracked passively",
		},
		{
			pattern: "**/*.txt",
			level: "watch",
			reason: "Text files tracked passively",
		},
		{
			pattern: "**/.vscode/**",
			level: "watch",
			reason: "IDE configuration tracked passively",
		},
		{
			pattern: "**/.idea/**",
			level: "watch",
			reason: "IDE configuration tracked passively",
		},
	],
	ignore: [
		"node_modules/**",
		".git/**",
		"dist/**",
		"build/**",
		"coverage/**",
		"*.log",
		".DS_Store",
		"Thumbs.db",
		".snapback/**",
	],
	settings: {
		maxSnapshots: 100,
		compressionEnabled: true,
		defaultProtectionLevel: "watch",
	},
};
