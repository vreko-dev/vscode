/**
 * Vreko Context File Types
 *
 * Defines the structure of .vreko/ctx/context.json - the intelligence layer
 * that informs AI assistants about project state, constraints, and Vreko activity.
 *
 * 🦎 Vreko
 */

/**
 * Main context structure written to .vreko/ctx/context.json
 */
export interface VrekoContext {
	/** JSON Schema reference for IDE intellisense */
	$schema: string;

	/** Context schema version for migrations */
	version: string;

	/** Last update timestamp (ISO 8601) */
	generated: string;

	/** Project metadata */
	meta: ProjectMeta;

	/** Detected technology stack */
	stack: ProjectStack;

	/** Architecture decisions and constraints */
	architecture: ArchitectureConfig;

	/** Performance and size constraints */
	constraints: ConstraintsConfig;

	/** Quality requirements */
	quality: QualityConfig;

	/** Development workflows */
	workflows: WorkflowsConfig;

	/** Communication protocol with AI */
	protocol: ProtocolConfig;

	/** Live state (updated frequently) */
	live: LiveState;

	/** Learning system configuration (post-MVP) */
	learnings?: LearningsConfig;
}

/**
 * Project metadata from package.json or directory info
 */
export interface ProjectMeta {
	/** Project identifier (from package.json name or directory) */
	id: string;

	/** Project type (nextjs, react, node-api, typescript, etc) */
	type: string;

	/** Project version from package.json */
	version?: string;
}

/**
 * Detected technology stack
 */
export interface ProjectStack {
	/** Framework with version (next14, nuxt3, etc) */
	framework?: string;

	/** Package manager (pnpm, yarn, npm, bun) */
	packageManager?: string;

	/** Monorepo tool (turborepo, nx, lerna, pnpm-workspaces) */
	monorepo?: string;

	/** TypeScript version */
	typescript?: string;

	/** Testing framework (vitest, jest, mocha) */
	testing?: string;

	/** Styling approach (tailwind, styled-components, emotion) */
	styling?: string;

	/** ORM (drizzle, prisma, typeorm) */
	orm?: string;

	/** Database (postgres, mysql, sqlite) */
	database?: string;

	/** State management (zustand, redux, jotai, recoil) */
	state?: string;

	/** Linting tool (biome, eslint) */
	linting?: string;

	/** React version */
	react?: string;

	/** Vue version */
	vue?: string;

	/** Svelte version */
	svelte?: string;

	/** Allow additional stack properties */
	[key: string]: string | undefined;
}

/**
 * Architecture decisions and constraints
 */
export interface ArchitectureConfig {
	/** Privacy mode for context file */
	privacy: "metadata-only" | "full";

	/** Zero shortcuts policy */
	zeroShortcuts: boolean;

	/** Strict TypeScript mode */
	typeStrict: boolean;

	/** Architecture layers */
	layers?: string[];

	/** Import direction constraints */
	importDirection?: string;
}

/**
 * Constraint value with unit
 */
export interface ConstraintValue {
	max: number;
	unit: string;
	current?: number;
	blocker?: boolean;
}

/**
 * Performance and size constraints
 */
export interface ConstraintsConfig {
	/** Extension-specific constraints */
	extension?: {
		bundle?: ConstraintValue;
		activation?: ConstraintValue;
		memory?: ConstraintValue;
		save?: ConstraintValue;
	};

	/** Web application constraints */
	web?: {
		fcp?: ConstraintValue;
		lcp?: ConstraintValue;
		jsBundle?: ConstraintValue;
		cssBundle?: ConstraintValue;
	};
}

/**
 * Quality requirements
 */
export interface QualityConfig {
	/** TypeScript configuration */
	typescript: {
		errors: number;
		strict: boolean;
	};

	/** Code coverage requirements */
	coverage: {
		min: number;
		current?: number;
	};

	/** Performance budgets enabled */
	perfBudgets?: boolean;

	/** Bundle validation enabled */
	bundleValidation?: boolean;
}

/**
 * Development workflows
 */
export interface WorkflowsConfig {
	/** Pre-flight checklist */
	preFlight: string[];

	/** Verification steps */
	verification: string[];

	/** Feature development workflow */
	feature?: string[];

	/** Bug fix workflow */
	bugfix?: string[];

	/** Refactor workflow */
	refactor?: string[];

	/** Allow additional workflows */
	[key: string]: string[] | undefined;
}

/**
 * Communication protocol with AI
 */
export interface ProtocolConfig {
	/** Number of options to present (e.g., "2-3") */
	options: string;

	/** Reference format (e.g., "file:line") */
	references: string;

	/** Risk communication style */
	risks: string;

	/** Task sizing format */
	sizing: string;
}

/**
 * Live state updated by extension
 */
export interface LiveState {
	/** Snapshot statistics */
	snapshots: {
		today: number;
		total: number;
		lastCreated: string | null;
	};

	/** Current session information */
	session: {
		id: string | null;
		aiTool: string | null;
		filesChanged: string[];
		startedAt: string | null;
	};

	/** System vitals */
	vitals: {
		pulse: number;
		temperature: "cold" | "warm" | "hot";
		risk: "L" | "M" | "H";
		health: number;
	};

	/** Top most-changed files (basenames only) */
	hotFiles: string[];

	/** Recent file restores */
	recentRestores: Array<{
		file: string;
		timestamp: string;
	}>;
}

/**
 * Learning system configuration (post-MVP)
 */
export interface LearningsConfig {
	/** Location of learning files */
	location: string;

	/** Learning file paths */
	files: string[];

	/** Learning statistics */
	stats?: {
		patterns: number;
		pitfalls: number;
	};
}
