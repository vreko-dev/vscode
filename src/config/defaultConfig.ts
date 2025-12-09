import type { ProtectionRule, SnapBackRC, SnapBackSettings } from "../types/snapbackrc.types";

/**
 * CRITICAL PATTERNS - Files where accidental changes cause IMMEDIATE PRODUCTION IMPACT
 * These are the patterns that should be protected by default on extension activation
 * Total: ~15-20 patterns matching ~27 files in typical project
 */
export const DEFAULT_CRITICAL_PATTERNS: readonly ProtectionRule[] = Object.freeze([
	// Dependency locks - wrong versions break builds
	{
		pattern: "**/package-lock.json",
		level: "block",
		reason: "Lock file - wrong version breaks reproducible Node.js builds",
	},
	{
		pattern: "**/yarn.lock",
		level: "block",
		reason: "Lock file - ensures reproducible Yarn installs",
	},
	{
		pattern: "**/pnpm-lock.yaml",
		level: "block",
		reason: "Lock file - critical for pnpm monorepos",
	},
	{
		pattern: "**/poetry.lock",
		level: "block",
		reason: "Lock file - Python dependency lock",
	},
	{
		pattern: "**/Cargo.lock",
		level: "block",
		reason: "Lock file - Rust dependency lock",
	},
	{
		pattern: "**/go.sum",
		level: "block",
		reason: "Lock file - Go module checksums",
	},
	{
		pattern: "**/Gemfile.lock",
		level: "block",
		reason: "Lock file - Ruby gem dependencies",
	},
	{
		pattern: "**/composer.lock",
		level: "block",
		reason: "Lock file - PHP composer dependencies",
	},

	// Environment & Secrets - exposing causes immediate security breaches
	{
		pattern: "**/.env*",
		level: "block",
		reason: "Sensitive environment variables and secrets",
	},

	// Core configuration files - wrong changes break builds
	{
		pattern: "package.json",
		level: "warn",
		reason: "Core Node.js configuration - dependencies and scripts",
	},
	{
		pattern: "tsconfig.json",
		level: "warn",
		reason: "TypeScript compiler configuration",
	},

	// Infrastructure - controls deployment and infrastructure
	{
		pattern: "Dockerfile",
		level: "warn",
		reason: "Container image definition",
	},
	{
		pattern: "docker-compose.yml",
		level: "warn",
		reason: "Multi-container orchestration",
	},
	{
		pattern: "**/docker-compose.yaml",
		level: "warn",
		reason: "Multi-container orchestration (yaml variant)",
	},
	{
		pattern: "**/*.tf",
		level: "warn",
		reason: "Terraform infrastructure definitions",
	},
	{
		pattern: ".github/workflows/*.yml",
		level: "warn",
		reason: "GitHub Actions CI/CD workflows",
	},
	{
		pattern: ".github/workflows/*.yaml",
		level: "warn",
		reason: "GitHub Actions CI/CD workflows (yaml variant)",
	},
]);

/**
 * EXTENDED PATTERNS - Optional patterns for enhanced protection
 * These are useful but not critical - users should opt-in to apply these
 * Documentation, general configs, IDE settings, build tools, language-specific configs
 * Total: ~25-30 patterns
 */
export const EXTENDED_PATTERNS: readonly ProtectionRule[] = Object.freeze([
	// Documentation - passive watching
	{
		pattern: "*.md",
		level: "watch",
		reason: "Documentation files",
	},
	{
		pattern: "*.txt",
		level: "watch",
		reason: "Text files",
	},
	{
		pattern: "README*",
		level: "watch",
		reason: "README documentation",
	},

	// General configuration files
	{
		pattern: "*.json",
		level: "watch",
		reason: "JSON configuration files",
	},
	{
		pattern: ".editorconfig",
		level: "watch",
		reason: "Editor configuration",
	},
	{
		pattern: ".prettierrc*",
		level: "watch",
		reason: "Prettier formatting configuration",
	},
	{
		pattern: ".eslintrc*",
		level: "watch",
		reason: "ESLint configuration",
	},
	{
		pattern: ".babelrc",
		level: "watch",
		reason: "Babel transpiler configuration",
	},
	{
		pattern: ".gitignore",
		level: "warn",
		reason: "Git ignore rules",
	},

	// IDE and editor settings
	{
		pattern: ".vscode/settings.json",
		level: "watch",
		reason: "VS Code settings",
	},
	{
		pattern: ".idea/**",
		level: "watch",
		reason: "IDE configuration directory",
	},

	// Build tool configurations
	{
		pattern: "vite.config.*",
		level: "warn",
		reason: "Vite bundler configuration",
	},
	{
		pattern: "webpack.config.*",
		level: "warn",
		reason: "Webpack bundler configuration",
	},
	{
		pattern: "rollup.config.*",
		level: "warn",
		reason: "Rollup bundler configuration",
	},
	{
		pattern: "esbuild.config.*",
		level: "warn",
		reason: "esbuild bundler configuration",
	},
	{
		pattern: "Makefile",
		level: "watch",
		reason: "Make build configuration",
	},
	{
		pattern: "CMakeLists.txt",
		level: "watch",
		reason: "CMake build configuration",
	},

	// Language-specific package managers and configs
	{
		pattern: "requirements.txt",
		level: "watch",
		reason: "Python dependencies",
	},
	{
		pattern: "Gemfile",
		level: "warn",
		reason: "Ruby gem configuration",
	},
	{
		pattern: "composer.json",
		level: "warn",
		reason: "PHP composer configuration",
	},
	{
		pattern: "setup.py",
		level: "warn",
		reason: "Python package setup",
	},
	{
		pattern: "pyproject.toml",
		level: "warn",
		reason: "Python project configuration",
	},
	{
		pattern: "pom.xml",
		level: "warn",
		reason: "Maven Java build configuration",
	},
	{
		pattern: "build.gradle*",
		level: "warn",
		reason: "Gradle Java build configuration",
	},
	{
		pattern: "*.csproj",
		level: "warn",
		reason: ".NET C# project file",
	},
	{
		pattern: "go.mod",
		level: "warn",
		reason: "Go module definition",
	},
	{
		pattern: "Cargo.toml",
		level: "warn",
		reason: "Rust package configuration",
	},
	{
		pattern: "bunfig.toml",
		level: "warn",
		reason: "Bun runtime configuration",
	},
	{
		pattern: "*.sln",
		level: "watch",
		reason: "Visual Studio solution file",
	},

	// Kubernetes and container orchestration
	{
		pattern: "kubernetes/*.yaml",
		level: "warn",
		reason: "Kubernetes manifests",
	},
]);
/**
 * Default SnapBack configuration
 * Comprehensive protection rules for common development files
 * Uses DEFAULT_CRITICAL_PATTERNS as base with all optional EXTENDED_PATTERNS
 */
export const DEFAULT_SNAPBACK_CONFIG: Readonly<SnapBackRC> = Object.freeze({
	protection: [...DEFAULT_CRITICAL_PATTERNS, ...EXTENDED_PATTERNS],
	ignore: [
		"node_modules/**",
		"dist/**",
		"build/**",
		"coverage/**",
		"*.log",
		"*.tmp",
		".snapback/**",
		".git/**",
		"vendor/**",
		"target/**",
	],
	settings: {
		maxSnapshots: 100,
		compressionEnabled: true,
		autoSnapshotInterval: 0,
		notificationDuration: 1000,
		showStatusBarItem: true,
		confirmRestore: true,
		defaultProtectionLevel: "watch" as const,
		protectionDebounce: 1000,
		enableCaching: true,
	},
	policies: {},
	hooks: {},
	templates: [],
} as const satisfies SnapBackRC);

/**
 * Default SnapBack settings
 */
export const DEFAULT_SETTINGS: Readonly<SnapBackSettings> = Object.freeze({
	maxSnapshots: 100,
	compressionEnabled: true,
	autoSnapshotInterval: 0,
	notificationDuration: 1000,
	showStatusBarItem: true,
	confirmRestore: true,
	defaultProtectionLevel: "watch" as const,
	protectionDebounce: 1000,
	enableCaching: true,
} as const satisfies SnapBackSettings);

/**
 * Default ignore patterns
 */
export const DEFAULT_IGNORE_PATTERNS: readonly string[] = Object.freeze([
	"node_modules/**",
	".git/**",
	"dist/**",
	"build/**",
	"out/**",
	"*.log",
	"*.tmp",
	".snapback/**",
]);
