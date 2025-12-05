/**
 * Stack Profile Definitions
 *
 * Phase 2 Introduction: Data-driven stack detection
 * Extracted from hardcoded patterns in RepoProtectionScanner
 *
 * A StackProfile defines:
 * - How to detect a particular tech stack (Node, Next.js, Python, etc.)
 * - What files should be protected for that stack
 * - Default protection rules for stack-specific files
 */

import type { ProtectionRule } from "../services/protectionPolicy.js";

/**
 * Stack detection criteria
 * Multiple detectors can be combined with OR logic (any match = stack detected)
 */
export interface StackDetector {
	/** Glob pattern to match files indicating this stack */
	glob: string;
	/** Confidence level (0-1) of this detector */
	confidence: number;
}

/**
 * Stack Profile definition
 * Describes a technology stack and its recommended protection rules
 */
export interface StackProfile {
	/** Unique identifier for the stack */
	id: string;
	/** Human-readable stack name */
	name: string;
	/** Detectors to identify if this stack is present in the workspace */
	detect: StackDetector[];
	/** Protection rules recommended for this stack */
	rules: ProtectionRule[];
	/** Optional: Description of the stack */
	description?: string;
	/** Optional: Link to documentation */
	docUrl?: string;
}

/**
 * Catalog of known stack profiles
 * These are derived from hardcoded patterns in RepoProtectionScanner
 */
export const STACK_PROFILES: readonly StackProfile[] = [
	{
		id: "nextjs",
		name: "Next.js",
		description: "Next.js React framework with file-based routing",
		detect: [
			{ glob: "next.config.*", confidence: 1.0 },
			{ glob: "pages/**/*.tsx", confidence: 0.8 },
			{ glob: "app/**/*.tsx", confidence: 0.9 },
			{ glob: "package.json", confidence: 0.3 }, // Low confidence - too generic
		],
		rules: [
			{
				pattern: "next.config.*",
				level: "Protected",
				category: "Configuration",
			},
			{ pattern: ".env.local", level: "Protected", category: "Environment" },
			{ pattern: ".env.*.local", level: "Protected", category: "Environment" },
		],
	},
	{
		id: "nodejs",
		name: "Node.js",
		description: "Node.js runtime and package management",
		detect: [
			{ glob: "package.json", confidence: 0.7 },
			{ glob: "package-lock.json", confidence: 0.8 },
			{ glob: "node_modules/", confidence: 0.9 },
		],
		rules: [
			{
				pattern: "package.json",
				level: "Protected",
				category: "Package Manager",
			},
			{
				pattern: "package-lock.json",
				level: "Watched",
				category: "Package Manager",
			},
			{ pattern: ".npmrc", level: "Protected", category: "Configuration" },
			{ pattern: ".yarnrc*", level: "Protected", category: "Configuration" },
		],
	},
	{
		id: "python",
		name: "Python",
		description: "Python runtime and package management",
		detect: [
			{ glob: "requirements.txt", confidence: 0.9 },
			{ glob: "setup.py", confidence: 0.9 },
			{ glob: "pyproject.toml", confidence: 0.9 },
			{ glob: "*.py", confidence: 0.6 },
		],
		rules: [
			{
				pattern: "requirements.txt",
				level: "Protected",
				category: "Dependencies",
			},
			{ pattern: "setup.py", level: "Protected", category: "Configuration" },
			{
				pattern: "pyproject.toml",
				level: "Protected",
				category: "Configuration",
			},
			{ pattern: ".env*", level: "Protected", category: "Environment" },
		],
	},
	{
		id: "typescript",
		name: "TypeScript",
		description: "TypeScript language and configuration",
		detect: [
			{ glob: "tsconfig.json", confidence: 1.0 },
			{ glob: "tsconfig.*.json", confidence: 0.9 },
			{ glob: "*.ts", confidence: 0.5 }, // Low confidence - too generic
			{ glob: "*.tsx", confidence: 0.6 }, // Low confidence
		],
		rules: [
			{
				pattern: "tsconfig.json",
				level: "Protected",
				category: "Configuration",
			},
			{
				pattern: "tsconfig.*.json",
				level: "Watched",
				category: "Configuration",
			},
		],
	},
	{
		id: "docker",
		name: "Docker",
		description: "Container orchestration with Docker",
		detect: [
			{ glob: "Dockerfile", confidence: 1.0 },
			{ glob: "docker-compose.yml", confidence: 0.95 },
			{ glob: "docker-compose.yaml", confidence: 0.95 },
			{ glob: ".dockerignore", confidence: 0.8 },
		],
		rules: [
			{ pattern: "Dockerfile", level: "Warning", category: "Infrastructure" },
			{
				pattern: "docker-compose*.yml",
				level: "Warning",
				category: "Infrastructure",
			},
			{
				pattern: ".dockerignore",
				level: "Watched",
				category: "Infrastructure",
			},
		],
	},
	{
		id: "kubernetes",
		name: "Kubernetes",
		description: "Kubernetes container orchestration",
		detect: [
			{ glob: "k8s/**/*.yaml", confidence: 0.9 },
			{ glob: "k8s/**/*.yml", confidence: 0.9 },
			{ glob: "**/kustomization.yaml", confidence: 0.9 },
			{ glob: "helm/Chart.yaml", confidence: 0.9 },
		],
		rules: [
			{ pattern: "k8s/**/*", level: "Protected", category: "Infrastructure" },
			{ pattern: "helm/**/*", level: "Protected", category: "Infrastructure" },
		],
	},
	{
		id: "terraform",
		name: "Terraform",
		description: "Infrastructure as Code with Terraform",
		detect: [
			{ glob: "*.tf", confidence: 0.95 },
			{ glob: "terraform/**/*", confidence: 0.9 },
			{ glob: ".terraform/**/*", confidence: 0.8 },
		],
		rules: [
			{ pattern: "*.tf", level: "Protected", category: "Infrastructure" },
			{ pattern: "terraform.tfvars", level: "Protected", category: "Secrets" },
			{
				pattern: ".terraform/**",
				level: "Watched",
				category: "Infrastructure",
			},
		],
	},
	{
		id: "database",
		name: "Database",
		description: "Database migrations and schemas",
		detect: [
			{ glob: "**/migrations/*.sql", confidence: 0.9 },
			{ glob: "**/migrations/*.js", confidence: 0.8 },
			{ glob: "db/schema*", confidence: 0.8 },
			{ glob: "sqlScripts/**/*.sql", confidence: 0.9 },
		],
		rules: [
			{
				pattern: "**/migrations/*.sql",
				level: "Protected",
				category: "Database",
			},
			{
				pattern: "**/migrations/*.js",
				level: "Protected",
				category: "Database",
			},
			{ pattern: "**/schema*", level: "Protected", category: "Database" },
		],
	},
	{
		id: "git",
		name: "Git",
		description: "Git version control system",
		detect: [
			{ glob: ".git/", confidence: 1.0 },
			{ glob: ".gitignore", confidence: 0.8 },
			{ glob: ".gitattributes", confidence: 0.7 },
		],
		rules: [
			{ pattern: ".gitignore", level: "Watched", category: "Configuration" },
			{
				pattern: ".gitattributes",
				level: "Watched",
				category: "Configuration",
			},
		],
	},
	{
		id: "github",
		name: "GitHub",
		description: "GitHub Actions and configuration",
		detect: [
			{ glob: ".github/workflows/**", confidence: 0.95 },
			{ glob: ".github/**", confidence: 0.8 },
		],
		rules: [
			{
				pattern: ".github/workflows/**",
				level: "Protected",
				category: "CI/CD",
			},
		],
	},
];

/**
 * Get a stack profile by ID
 * @param id - Stack ID
 * @returns Stack profile or undefined if not found
 */
export function getStackProfile(id: string): StackProfile | undefined {
	return STACK_PROFILES.find((profile) => profile.id === id);
}

/**
 * Get all stack profiles
 * @returns Array of all stack profiles
 */
export function getAllStackProfiles(): readonly StackProfile[] {
	return STACK_PROFILES;
}
