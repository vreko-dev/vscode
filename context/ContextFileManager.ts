/**
 * Vreko Context File Manager
 *
 * Creates and maintains .vreko/ctx/context.json - the intelligence layer
 * that informs AI assistants about project state, constraints, and Vreko activity.
 *
 * This is what makes Vreko more than "fancy git stash."
 *
 * 🦎 Vreko
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Disposable } from "vscode";
import { logger } from "../utils/logger";
import { CONTEXT_SCHEMA } from "./schema";
import type {
	ArchitectureConfig,
	ConstraintsConfig,
	LiveState,
	ProjectMeta,
	ProjectStack,
	ProtocolConfig,
	QualityConfig,
	VrekoContext,
	WorkflowsConfig,
} from "./types";

const CONTEXT_VERSION = "2.0.0";
const UPDATE_INTERVAL_MS = 60_000; // 60 seconds
const MAX_HOT_FILES = 5;
const MAX_RECENT_RESTORES = 5;

/**
 * Dependencies for ContextFileManager
 */
export interface ContextFileManagerDeps {
	snapshotService: {
		list(): Promise<Array<{ timestamp: number; id: string }>>;
		onSnapshotCreated(handler: () => void): Disposable;
	};
	vitalsService: {
		getVitals(): Promise<{
			pulse?: number;
			temperature?: "cold" | "warm" | "hot";
			risk?: "L" | "M" | "H";
			health?: number;
			hotFiles?: string[];
		} | null>;
		onVitalsChanged?(handler: () => void): Disposable;
	};
	sessionTracker: {
		getCurrentSession(): {
			id: string;
			detectedTool?: string;
			files?: string[];
			startedAt?: number;
		} | null;
		onSessionChanged?(handler: () => void): Disposable;
		onAIDetected?(handler: () => void): Disposable;
	};
	restoreTracker?: {
		getRecentRestores(): Array<{ file: string; timestamp: number }>;
		onRestoreCompleted?(handler: () => void): Disposable;
	};
}

/**
 * Manages the .vreko/ctx/context.json file
 */
export class ContextFileManager implements Disposable {
	private readonly contextDir: string;
	private readonly contextPath: string;
	private readonly schemaPath: string;

	private updateTimer: NodeJS.Timeout | null = null;
	private disposables: Disposable[] = [];
	private isUpdating = false;

	constructor(
		private readonly workspaceRoot: string,
		private readonly deps: ContextFileManagerDeps,
	) {
		this.contextDir = path.join(workspaceRoot, ".vreko", "ctx");
		this.contextPath = path.join(this.contextDir, "context.json");
		this.schemaPath = path.join(this.contextDir, "context.schema.json");
	}

	/**
	 * Initialize the context file system.
	 * Creates files if missing, updates live state, starts periodic refresh.
	 */
	async initialize(): Promise<void> {
		// 1. Ensure directory exists
		await fs.mkdir(this.contextDir, { recursive: true });

		// 2. Write schema file (for IDE intellisense)
		await this.writeSchemaIfMissing();

		// 3. Create or update context file
		if (await this.contextExists()) {
			await this.updateLiveState();
		} else {
			await this.createInitialContext();
		}

		// 4. Subscribe to events for live updates
		this.subscribeToEvents();

		// 5. Start periodic refresh
		this.updateTimer = setInterval(() => {
			this.updateLiveState().catch((err) => {
				logger.debug("Failed to update context", { error: err instanceof Error ? err.message : String(err) });
			});
		}, UPDATE_INTERVAL_MS);
	}

	/**
	 * Force an immediate update of the live state.
	 */
	async refresh(): Promise<void> {
		await this.updateLiveState();
	}

	/**
	 * Get the current context (for testing/debugging).
	 */
	async getContext(): Promise<VrekoContext | null> {
		try {
			const content = await fs.readFile(this.contextPath, "utf-8");
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	/**
	 * Clean up resources.
	 */
	dispose(): void {
		if (this.updateTimer) {
			clearInterval(this.updateTimer);
			this.updateTimer = null;
		}
		for (const d of this.disposables) {
			d.dispose();
		}
		this.disposables = [];
	}

	// ─────────────────────────────────────────────────────────────────
	// Private: File Operations
	// ─────────────────────────────────────────────────────────────────

	private async contextExists(): Promise<boolean> {
		try {
			await fs.access(this.contextPath);
			return true;
		} catch {
			return false;
		}
	}

	private async writeContext(context: VrekoContext): Promise<void> {
		const content = JSON.stringify(context, null, "\t");
		await fs.writeFile(this.contextPath, content, "utf-8");
	}

	private async readContext(): Promise<VrekoContext | null> {
		try {
			const content = await fs.readFile(this.contextPath, "utf-8");
			return JSON.parse(content);
		} catch {
			return null;
		}
	}

	private async writeSchemaIfMissing(): Promise<void> {
		try {
			await fs.access(this.schemaPath);
		} catch {
			await fs.writeFile(this.schemaPath, CONTEXT_SCHEMA, "utf-8");
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Private: Context Creation
	// ─────────────────────────────────────────────────────────────────

	private async createInitialContext(): Promise<void> {
		const context: VrekoContext = {
			$schema: "./context.schema.json",
			version: CONTEXT_VERSION,
			generated: new Date().toISOString(),

			meta: await this.detectProjectMeta(),
			stack: await this.detectStack(),
			architecture: this.getDefaultArchitecture(),
			constraints: this.getDefaultConstraints(),
			quality: this.getDefaultQuality(),
			workflows: this.getDefaultWorkflows(),
			protocol: this.getDefaultProtocol(),
			live: await this.buildLiveState(),
		};

		await this.writeContext(context);
	}

	private async detectProjectMeta(): Promise<ProjectMeta> {
		try {
			const pkgPath = path.join(this.workspaceRoot, "package.json");
			const content = await fs.readFile(pkgPath, "utf-8");
			const pkg = JSON.parse(content);

			return {
				id: pkg.name ?? path.basename(this.workspaceRoot),
				type: this.inferProjectType(pkg),
				version: pkg.version,
			};
		} catch {
			return {
				id: path.basename(this.workspaceRoot),
				type: "unknown",
			};
		}
	}

	private inferProjectType(pkg: {
		dependencies?: Record<string, string>;
		devDependencies?: Record<string, string>;
	}): string {
		const deps = { ...pkg.dependencies, ...pkg.devDependencies };

		// Order matters - more specific first
		if (deps.next) {
			return "nextjs";
		}
		if (deps.nuxt) {
			return "nuxt";
		}
		if (deps.gatsby) {
			return "gatsby";
		}
		if (deps.remix) {
			return "remix";
		}
		if (deps["@sveltejs/kit"]) {
			return "sveltekit";
		}
		if (deps.svelte) {
			return "svelte";
		}
		if (deps.vue) {
			return "vue";
		}
		if (deps["@angular/core"]) {
			return "angular";
		}
		if (deps["react-native"]) {
			return "react-native";
		}
		if (deps.react) {
			return "react";
		}
		if (deps.express || deps.fastify || deps.hono) {
			return "node-api";
		}
		if (deps.electron) {
			return "electron";
		}
		if (deps.typescript) {
			return "typescript";
		}

		return "javascript";
	}

	private async detectStack(): Promise<ProjectStack> {
		const stack: ProjectStack = {};

		try {
			const pkgPath = path.join(this.workspaceRoot, "package.json");
			const content = await fs.readFile(pkgPath, "utf-8");
			const pkg = JSON.parse(content);
			const deps = { ...pkg.dependencies, ...pkg.devDependencies };

			// Framework
			if (deps.next) {
				stack.framework = `next${this.majorVersion(deps.next)}`;
			}
			if (deps.nuxt) {
				stack.framework = `nuxt${this.majorVersion(deps.nuxt)}`;
			}
			if (deps.vue) {
				stack.vue = this.majorVersion(deps.vue);
			}
			if (deps.react) {
				stack.react = this.majorVersion(deps.react);
			}
			if (deps.svelte) {
				stack.svelte = this.majorVersion(deps.svelte);
			}

			// TypeScript
			if (deps.typescript) {
				stack.typescript = this.majorVersion(deps.typescript);
			}

			// Testing
			if (deps.vitest) {
				stack.testing = "vitest";
			} else if (deps.jest) {
				stack.testing = "jest";
			} else if (deps.mocha) {
				stack.testing = "mocha";
			}

			// Styling
			if (deps.tailwindcss) {
				stack.styling = "tailwind";
			} else if (deps["styled-components"]) {
				stack.styling = "styled-components";
			} else if (deps["@emotion/react"]) {
				stack.styling = "emotion";
			}

			// ORM / Database
			if (deps["drizzle-orm"]) {
				stack.orm = "drizzle";
			} else if (deps.prisma || deps["@prisma/client"]) {
				stack.orm = "prisma";
			} else if (deps.typeorm) {
				stack.orm = "typeorm";
			}

			if (deps.pg || deps.postgres) {
				stack.database = "postgres";
			} else if (deps.mysql2) {
				stack.database = "mysql";
			} else if (deps["better-sqlite3"]) {
				stack.database = "sqlite";
			}

			// State management
			if (deps.zustand) {
				stack.state = "zustand";
			} else if (deps["@reduxjs/toolkit"]) {
				stack.state = "redux";
			} else if (deps.jotai) {
				stack.state = "jotai";
			} else if (deps.recoil) {
				stack.state = "recoil";
			}
		} catch {
			// Failed to read package.json, continue with detection
		}

		// Package manager (check lock files)
		if (await this.fileExists("pnpm-lock.yaml")) {
			stack.packageManager = "pnpm";
		} else if (await this.fileExists("bun.lockb")) {
			stack.packageManager = "bun";
		} else if (await this.fileExists("yarn.lock")) {
			stack.packageManager = "yarn";
		} else if (await this.fileExists("package-lock.json")) {
			stack.packageManager = "npm";
		}

		// Monorepo
		if (await this.fileExists("turbo.json")) {
			stack.monorepo = "turborepo";
		} else if (await this.fileExists("nx.json")) {
			stack.monorepo = "nx";
		} else if (await this.fileExists("lerna.json")) {
			stack.monorepo = "lerna";
		} else if (await this.fileExists("pnpm-workspace.yaml")) {
			stack.monorepo = "pnpm-workspaces";
		}

		// Linting
		if ((await this.fileExists("biome.json")) || (await this.fileExists("biome.jsonc"))) {
			stack.linting = "biome";
		} else if (
			(await this.fileExists(".eslintrc.js")) ||
			(await this.fileExists(".eslintrc.json")) ||
			(await this.fileExists("eslint.config.js"))
		) {
			stack.linting = "eslint";
		}

		return stack;
	}

	private majorVersion(version: string): string {
		// Handle various version formats: ^19.0.0, ~19.0.0, 19.0.0, latest, *
		const match = version.match(/\d+/);
		return match ? match[0] : "latest";
	}

	private async fileExists(relativePath: string): Promise<boolean> {
		try {
			await fs.access(path.join(this.workspaceRoot, relativePath));
			return true;
		} catch {
			return false;
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Private: Default Configurations
	// ─────────────────────────────────────────────────────────────────

	private getDefaultArchitecture(): ArchitectureConfig {
		return {
			privacy: "metadata-only",
			zeroShortcuts: true,
			typeStrict: true,
		};
	}

	private getDefaultConstraints(): ConstraintsConfig {
		return {
			extension: {
				bundle: { max: 2, unit: "MB" },
				activation: { max: 500, unit: "ms" },
				memory: { max: 200, unit: "MB" },
			},
		};
	}

	private getDefaultQuality(): QualityConfig {
		return {
			typescript: { errors: 0, strict: true },
			coverage: { min: 80 },
			perfBudgets: true,
		};
	}

	private getDefaultWorkflows(): WorkflowsConfig {
		return {
			preFlight: ["start_task", "review_context"],
			verification: ["type_check", "tests", "manual_test"],
			feature: ["design", "tdd", "implement", "test", "docs"],
			bugfix: ["reproduce", "root_cause", "fix", "regression_test"],
		};
	}

	private getDefaultProtocol(): ProtocolConfig {
		return {
			options: "2-3",
			references: "file:line",
			risks: "explicit",
			sizing: "S/M/L/XL",
		};
	}

	// ─────────────────────────────────────────────────────────────────
	// Private: Live State
	// ─────────────────────────────────────────────────────────────────

	private async buildLiveState(): Promise<LiveState> {
		const todayStart = new Date();
		todayStart.setHours(0, 0, 0, 0);

		// Snapshots
		let todayCount = 0;
		let totalCount = 0;
		let lastCreated: string | null = null;

		try {
			const snapshots = await this.deps.snapshotService.list();
			totalCount = snapshots.length;
			todayCount = snapshots.filter((s) => s.timestamp >= todayStart.getTime()).length;

			if (snapshots.length > 0) {
				// Assuming sorted descending by timestamp
				lastCreated = new Date(snapshots[0].timestamp).toISOString();
			}
		} catch {
			// Service unavailable, use defaults
		}

		// Session
		let sessionState: LiveState["session"] = {
			id: null,
			aiTool: null,
			filesChanged: [],
			startedAt: null,
		};

		try {
			const session = this.deps.sessionTracker.getCurrentSession();
			if (session) {
				sessionState = {
					id: session.id,
					aiTool: session.detectedTool ?? null,
					filesChanged: (session.files ?? []).map((f) => path.basename(f)).slice(0, 10),
					startedAt: session.startedAt ? new Date(session.startedAt).toISOString() : null,
				};
			}
		} catch {
			// Service unavailable, use defaults
		}

		// Vitals
		let vitalsState: LiveState["vitals"] = {
			pulse: 0,
			temperature: "cold",
			risk: "L",
			health: 100,
		};

		let hotFiles: string[] = [];

		try {
			const vitals = await this.deps.vitalsService.getVitals();
			if (vitals) {
				vitalsState = {
					pulse: vitals.pulse ?? 0,
					temperature: vitals.temperature ?? "cold",
					risk: vitals.risk ?? "L",
					health: vitals.health ?? 100,
				};
				hotFiles = (vitals.hotFiles ?? []).slice(0, MAX_HOT_FILES);
			}
		} catch {
			// Service unavailable, use defaults
		}

		// Recent restores
		let recentRestores: LiveState["recentRestores"] = [];

		try {
			if (this.deps.restoreTracker) {
				const restores = this.deps.restoreTracker.getRecentRestores();
				recentRestores = restores.slice(0, MAX_RECENT_RESTORES).map((r) => ({
					file: path.basename(r.file),
					timestamp: new Date(r.timestamp).toISOString(),
				}));
			}
		} catch {
			// Service unavailable, use defaults
		}

		return {
			snapshots: {
				today: todayCount,
				total: totalCount,
				lastCreated,
			},
			session: sessionState,
			vitals: vitalsState,
			hotFiles,
			recentRestores,
		};
	}

	private async updateLiveState(): Promise<void> {
		// Prevent concurrent updates
		if (this.isUpdating) {
			return;
		}
		this.isUpdating = true;

		try {
			const existing = await this.readContext();

			if (!existing) {
				// File was deleted or corrupted, recreate
				await this.createInitialContext();
				return;
			}

			// Update only live state and timestamp, preserve everything else
			const updated: VrekoContext = {
				...existing,
				generated: new Date().toISOString(),
				live: await this.buildLiveState(),
			};

			await this.writeContext(updated);
		} catch (error) {
			logger.debug("Failed to update live state", {
				error: error instanceof Error ? error.message : String(error),
			});
		} finally {
			this.isUpdating = false;
		}
	}

	// ─────────────────────────────────────────────────────────────────
	// Private: Event Subscriptions
	// ─────────────────────────────────────────────────────────────────

	private subscribeToEvents(): void {
		// Snapshot created → immediate update
		this.disposables.push(
			this.deps.snapshotService.onSnapshotCreated(() => {
				this.updateLiveState().catch(() => {
					/* fire-and-forget */
				});
			}),
		);

		// Session changed → immediate update
		if (this.deps.sessionTracker.onSessionChanged) {
			this.disposables.push(
				this.deps.sessionTracker.onSessionChanged(() => {
					this.updateLiveState().catch(() => {
						/* fire-and-forget */
					});
				}),
			);
		}

		// AI detected → immediate update
		if (this.deps.sessionTracker.onAIDetected) {
			this.disposables.push(
				this.deps.sessionTracker.onAIDetected(() => {
					this.updateLiveState().catch(() => {
						/* fire-and-forget */
					});
				}),
			);
		}

		// Vitals changed → immediate update
		if (this.deps.vitalsService.onVitalsChanged) {
			this.disposables.push(
				this.deps.vitalsService.onVitalsChanged(() => {
					this.updateLiveState().catch(() => {
						/* fire-and-forget */
					});
				}),
			);
		}

		// Restore completed → immediate update
		if (this.deps.restoreTracker?.onRestoreCompleted) {
			this.disposables.push(
				this.deps.restoreTracker.onRestoreCompleted(() => {
					this.updateLiveState().catch(() => {
						/* fire-and-forget */
					});
				}),
			);
		}
	}
}
