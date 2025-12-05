import type { ProtectionLevel } from "../types/protection.js";
import type {
	ProtectionRule,
	SnapBackRC,
	SnapBackSettings,
} from "../types/snapbackrc.types";

/**
 * CRITICAL PATTERNS - Files where accidental changes cause IMMEDIATE PRODUCTION IMPACT
 * These are the patterns that should be protected by default on extension activation
 * Total: ~15-20 patterns matching ~27 files in typical project
 */
export const DEFAULT_CRITICAL_PATTERNS: readonly ProtectionRule[] =
	Object.freeze([
		// Dependency locks - wrong versions break builds
		{
			pattern: "**/package-lock.json",
			level: "Protected" as ProtectionLevel,
			reason: "Lock file - wrong version breaks reproducible Node.js builds",
		},
		{
			pattern: "**/yarn.lock",
			level: "Protected" as ProtectionLevel,
			reason: "Lock file - ensures reproducible Yarn installs",
		},
		{
			pattern: "**/pnpm-lock.yaml",
			level: "Protected" as ProtectionLevel,
			reason: "Lock file - critical for pnpm monorepos",
		},
		{
			pattern: "**/poetry.lock",
			level: "Protected" as ProtectionLevel,
			reason: "Lock file - Python dependency lock",
		},
		{
			pattern: "**/Cargo.lock",
			level: "Protected" as ProtectionLevel,
			reason: "Lock file - Rust dependency lock",
		},
		{
			pattern: "**/go.sum",
			level: "Protected" as ProtectionLevel,
			reason: "Lock file - Go module checksums",
		},
		{
			pattern: "**/Gemfile.lock",
			level: "Protected" as ProtectionLevel,
			reason: "Lock file - Ruby gem dependencies",
		},
		{
			pattern: "**/composer.lock",
			level: "Protected" as ProtectionLevel,
			reason: "Lock file - PHP composer dependencies",
		},

		// Environment & Secrets - exposing causes immediate security breaches
		{
			pattern: "**/.env*",
			level: "Protected" as ProtectionLevel,
			reason: "Sensitive environment variables and secrets",
		},

		// Core configuration files - wrong changes break builds
		{
			pattern: "package.json",
			level: "Warning" as ProtectionLevel,
			reason: "Core Node.js configuration - dependencies and scripts",
		},
		{
			pattern: "tsconfig.json",
			level: "Warning" as ProtectionLevel,
			reason: "TypeScript compiler configuration",
		},

		// Infrastructure - controls deployment and infrastructure
		{
			pattern: "Dockerfile",
			level: "Warning" as ProtectionLevel,
			reason: "Container image definition",
		},
		{
			pattern: "docker-compose.yml",
			level: "Warning" as ProtectionLevel,
			reason: "Multi-container orchestration",
		},
		{
			pattern: "**/docker-compose.yaml",
			level: "Warning" as ProtectionLevel,
			reason: "Multi-container orchestration (yaml variant)",
		},
		{
			pattern: "**/*.tf",
			level: "Warning" as ProtectionLevel,
			reason: "Terraform infrastructure definitions",
		},
		{
			pattern: ".github/workflows/*.yml",
			level: "Warning" as ProtectionLevel,
			reason: "GitHub Actions CI/CD workflows",
		},
		{
			pattern: ".github/workflows/*.yaml",
			level: "Warning" as ProtectionLevel,
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
		level: "Watched" as ProtectionLevel,
		reason: "Documentation files",
	},
	{
		pattern: "*.txt",
		level: "Watched" as ProtectionLevel,
		reason: "Text files",
	},
	{
		pattern: "README*",
		level: "Watched" as ProtectionLevel,
		reason: "README documentation",
	},

	// General configuration files
	{
		pattern: "*.json",
		level: "Watched" as ProtectionLevel,
		reason: "JSON configuration files",
	},
	{
		pattern: ".editorconfig",
		level: "Watched" as ProtectionLevel,
		reason: "Editor configuration",
	},
	{
		pattern: ".prettierrc*",
		level: "Watched" as ProtectionLevel,
		reason: "Prettier formatting configuration",
	},
	{
		pattern: ".eslintrc*",
		level: "Watched" as ProtectionLevel,
		reason: "ESLint configuration",
	},
	{
		pattern: ".babelrc",
		level: "Watched" as ProtectionLevel,
		reason: "Babel transpiler configuration",
	},
	{
		pattern: ".gitignore",
		level: "Warning" as ProtectionLevel,
		reason: "Git ignore rules",
	},

	// IDE and editor settings
	{
		pattern: ".vscode/settings.json",
		level: "Watched" as ProtectionLevel,
		reason: "VS Code settings",
	},
	{
		pattern: ".idea/**",
		level: "Watched" as ProtectionLevel,
		reason: "IDE configuration directory",
	},

	// Build tool configurations
	{
		pattern: "vite.config.*",
		level: "Warning" as ProtectionLevel,
		reason: "Vite bundler configuration",
	},
	{
		pattern: "webpack.config.*",
		level: "Warning" as ProtectionLevel,
		reason: "Webpack bundler configuration",
	},
	{
		pattern: "rollup.config.*",
		level: "Warning" as ProtectionLevel,
		reason: "Rollup bundler configuration",
	},
	{
		pattern: "esbuild.config.*",
		level: "Warning" as ProtectionLevel,
		reason: "esbuild bundler configuration",
	},
	{
		pattern: "Makefile",
		level: "Watched" as ProtectionLevel,
		reason: "Make build configuration",
	},
	{
		pattern: "CMakeLists.txt",
		level: "Watched" as ProtectionLevel,
		reason: "CMake build configuration",
	},

	// Language-specific package managers and configs
	{
		pattern: "requirements.txt",
		level: "Watched" as ProtectionLevel,
		reason: "Python dependencies",
	},
	{
		pattern: "Gemfile",
		level: "Warning" as ProtectionLevel,
		reason: "Ruby gem configuration",
	},
	{
		pattern: "composer.json",
		level: "Warning" as ProtectionLevel,
		reason: "PHP composer configuration",
	},
	{
		pattern: "setup.py",
		level: "Warning" as ProtectionLevel,
		reason: "Python package setup",
	},
	{
		pattern: "pyproject.toml",
		level: "Warning" as ProtectionLevel,
		reason: "Python project configuration",
	},
	{
		pattern: "pom.xml",
		level: "Warning" as ProtectionLevel,
		reason: "Maven Java build configuration",
	},
	{
		pattern: "build.gradle*",
		level: "Warning" as ProtectionLevel,
		reason: "Gradle Java build configuration",
	},
	{
		pattern: "*.csproj",
		level: "Warning" as ProtectionLevel,
		reason: ".NET C# project file",
	},
	{
		pattern: "go.mod",
		level: "Warning" as ProtectionLevel,
		reason: "Go module definition",
	},
	{
		pattern: "Cargo.toml",
		level: "Warning" as ProtectionLevel,
		reason: "Rust package configuration",
	},
	{
		pattern: "bunfig.toml",
		level: "Warning" as ProtectionLevel,
		reason: "Bun runtime configuration",
	},
	{
		pattern: "*.sln",
		level: "Watched" as ProtectionLevel,
		reason: "Visual Studio solution file",
	},

	// Kubernetes and container orchestration
	{
		pattern: "kubernetes/*.yaml",
		level: "Warning" as ProtectionLevel,
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
		defaultProtectionLevel: "Watched" as ProtectionLevel,
		protectionDebounce: 1000,
		enableCaching: true,
	},
	policies: {},
	hooks: {},
	templates: [],
});

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
	defaultProtectionLevel: "Watched" as ProtectionLevel,
	protectionDebounce: 1000,
	enableCaching: true,
});

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
