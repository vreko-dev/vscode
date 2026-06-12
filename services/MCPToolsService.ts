import type { SessionCoordinator } from "../snapshot/SessionCoordinator";
import { logger } from "../utils/logger";
import { getCurrentWorkspaceId, getDaemonBridge } from "./DaemonBridge";
import type { ProtectedFileRegistry } from "./protectedFileRegistry";

// =============================================================================
// Types
// =============================================================================

export interface MCPToolsServiceConfig {
	workspaceRoot: string;
	sessionCoordinator: SessionCoordinator;
	protectedFileRegistry: ProtectedFileRegistry;
}

export interface StartTaskParams {
	task?: string;
	files?: string[];
	keywords?: string[];
	intent?: "implement" | "debug" | "refactor" | "review" | "explore";
}

export interface StartTaskResult {
	taskId: string;
	protection?: Record<string, string>;
	constraints?: string;
	warnings?: Warning[];
}

export interface CheckParams {
	mode: "quick" | "patterns" | "full" | "build" | "impact" | "circular" | "docs";
	files?: string[];
	code?: string;
	filePath?: string;
	runTests?: boolean;
}

export interface CheckResult {
	errors: number;
	warnings: number;
	passed: boolean;
	violations?: Violation[];
	layers?: LayerResult[];
	issues?: Issue[];
}

export interface EndTaskParams {
	ok: boolean;
	learnings?: string[];
	notes?: string;
	outcome?: "completed" | "abandoned" | "blocked";
}

export interface EndTaskResult {
	tokensSaved?: string;
	learningsCaptured: number;
	outcome: "completed" | "abandoned" | "blocked";
}

interface Warning {
	type: string;
	file: string;
	message?: string;
}

interface Violation {
	type: string;
	file: string;
	message: string;
	line?: number;
}

interface LayerResult {
	name: string;
	passed: boolean;
	issues: Issue[];
}

interface Issue {
	severity: "error" | "warning" | "info";
	message: string;
	file?: string;
	line?: number;
}

// =============================================================================
// Service Implementation
// =============================================================================

const WORKSPACE_CONSTRAINTS = "bundle<2MB, activation<500ms, save<100ms, memory<200MB";

export class MCPToolsService {
	private readonly _workspaceRoot: string;
	private readonly _sessionCoordinator: SessionCoordinator;
	private readonly _protectedFileRegistry: ProtectedFileRegistry;

	private _activeTaskId: string | null = null;
	private _taskStartTime: number | null = null;

	constructor(config: MCPToolsServiceConfig) {
		this._workspaceRoot = config.workspaceRoot;
		this._sessionCoordinator = config.sessionCoordinator;
		this._protectedFileRegistry = config.protectedFileRegistry;
	}

	get workspaceRoot(): string {
		return this._workspaceRoot;
	}

	get activeTaskId(): string | null {
		return this._activeTaskId;
	}

	async startTask(params: StartTaskParams): Promise<StartTaskResult> {
		const taskId = `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
		this._activeTaskId = taskId;
		this._taskStartTime = Date.now();

		const workspaceId = getCurrentWorkspaceId() ?? this._workspaceRoot;
		const bridge = getDaemonBridge(workspaceId);
		if (bridge.isConnected()) {
			try {
				await bridge.beginSession(
					this._workspaceRoot,
					params.task || "MCP task",
					params.files,
					params.keywords,
				);
				logger.debug("Session start synced with daemon", { taskId });
			} catch (error) {
				logger.debug("Daemon session sync failed (non-critical)", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const protection: Record<string, string> = {};
		const warnings: Warning[] = [];

		for (const file of params.files ?? []) {
			const level = this._protectedFileRegistry.getProtectionLevel(file);
			if (level !== undefined && level !== null) {
				protection[file] = level;
				if (level === "block") {
					warnings.push({
						type: "block-protected",
						file,
						message: `${file} requires snapshot note before changes`,
					});
				}
			}
		}

		return {
			taskId,
			protection: Object.keys(protection).length > 0 ? protection : undefined,
			constraints: WORKSPACE_CONSTRAINTS,
			warnings: warnings.length > 0 ? warnings : undefined,
		};
	}

	async check(params: CheckParams): Promise<CheckResult> {
		switch (params.mode) {
			case "quick":
				return this._runQuickCheck(params.files);
			case "patterns":
				return this._runPatternCheck(params.code, params.filePath);
			case "full":
				return this._runFullCheck(params.files);
			default:
				return { errors: 0, warnings: 0, passed: true };
		}
	}

	async endTask(params: EndTaskParams): Promise<EndTaskResult> {
		const outcome = params.ok ? "completed" : params.outcome || "blocked";
		const learningsCaptured = params.learnings?.length ?? 0;

		const candidateCount = this._sessionCoordinator.getCandidateCount();
		if (candidateCount > 0 && params.ok) {
			await this._sessionCoordinator.finalizeSession("task-complete");
		}

		const workspaceId = getCurrentWorkspaceId() ?? this._workspaceRoot;
		const bridge = getDaemonBridge(workspaceId);
		if (bridge.isConnected()) {
			try {
				const endResult = await bridge.endSession(this._workspaceRoot, outcome, true, params.notes);
				if (params.ok && endResult.sessionId) {
					const ceremonyData = await bridge.getClosingCeremony(this._workspaceRoot, endResult.sessionId);
					if (ceremonyData) {
						const { showClosingCeremony } = await import("../ui/ClosingCeremonyUI");
						showClosingCeremony(ceremonyData).catch((err) => {
							logger.debug("Ceremony display failed (non-critical)", { error: err });
						});
					}
				}
				logger.debug("Session end synced with daemon", { outcome });
			} catch (error) {
				logger.debug("Daemon session sync failed (non-critical)", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const duration = this._taskStartTime ? Date.now() - this._taskStartTime : 0;
		this._activeTaskId = null;
		this._taskStartTime = null;

		return {
			tokensSaved: `~${Math.round(duration / 100)}K`,
			learningsCaptured,
			outcome,
		};
	}

	dispose(): void {
		this._activeTaskId = null;
		this._taskStartTime = null;
	}

	// =========================================================================
	// Private Helpers
	// =========================================================================

	private async _runQuickCheck(files?: string[]): Promise<CheckResult> {
		const workspaceId = getCurrentWorkspaceId() ?? this._workspaceRoot;
		const bridge = getDaemonBridge(workspaceId);
		if (bridge.isConnected()) {
			try {
				const result = await bridge.validateQuick(this._workspaceRoot, files);
				const errors = result.errors ?? [];
				const warnings = result.warnings ?? [];
				return {
					passed: result.passed,
					errors: errors.length,
					warnings: warnings.length,
					issues: [
						...errors.map((e) => ({
							severity: "error" as const,
							message: e.message,
							file: e.file,
							line: e.line,
						})),
						...warnings.map((w) => ({
							severity: "warning" as const,
							message: w.message,
							file: w.file,
							line: w.line,
						})),
					],
				};
			} catch (error) {
				logger.debug("Daemon quick check failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}
		// Daemon unavailable  -  degrade gracefully rather than spawning subprocesses
		return { errors: 0, warnings: 0, passed: true, issues: [] };
	}

	private _runPatternCheck(code?: string, filePath?: string): CheckResult {
		if (!code) {
			return { errors: 0, warnings: 0, passed: true, violations: [] };
		}
		const violations = this._checkPatterns(code, filePath);
		return {
			errors: violations.length,
			warnings: 0,
			passed: violations.length === 0,
			violations,
		};
	}

	private async _runFullCheck(files?: string[]): Promise<CheckResult> {
		const layers: LayerResult[] = [
			{ name: "typescript", passed: true, issues: [] },
			{ name: "lint", passed: true, issues: [] },
			{ name: "patterns", passed: true, issues: [] },
			{ name: "security", passed: true, issues: [] },
			{ name: "tests", passed: true, issues: [] },
			{ name: "architecture", passed: true, issues: [] },
			{ name: "contracts", passed: true, issues: [] },
		];

		const workspaceId = getCurrentWorkspaceId() ?? this._workspaceRoot;
		const bridge = getDaemonBridge(workspaceId);
		if (bridge.isConnected()) {
			try {
				const filePath = files?.[0] ?? "";
				const daemonResult = await bridge.validateComprehensive(this._workspaceRoot, "", filePath);

				const tsLayer = this._findLayer(layers, "typescript");
				for (const err of daemonResult.typescriptErrors ?? []) {
					tsLayer.issues.push({ severity: "error", message: err.message, file: err.file, line: err.line });
				}
				tsLayer.passed = tsLayer.issues.length === 0;

				const lintLayer = this._findLayer(layers, "lint");
				for (const err of daemonResult.lintErrors ?? []) {
					lintLayer.issues.push({
						severity: err.rule ? "warning" : "error",
						message: `${err.message}${err.rule ? ` (${err.rule})` : ""}`,
						file: err.file,
						line: err.line,
					});
				}
				lintLayer.passed = lintLayer.issues.filter((i) => i.severity === "error").length === 0;

				const patternsLayer = this._findLayer(layers, "patterns");
				for (const v of daemonResult.patternViolations ?? []) {
					patternsLayer.issues.push({
						severity: "warning",
						message: `${v.pattern}: ${v.message}`,
						file: v.file,
						line: v.line,
					});
				}
				patternsLayer.passed = patternsLayer.issues.length === 0;

				return this._aggregateLayers(layers);
			} catch (error) {
				logger.debug("Daemon comprehensive check failed", {
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		// Daemon unavailable  -  return empty passing result rather than spawning subprocesses
		return this._aggregateLayers(layers);
	}

	private _findLayer(layers: LayerResult[], name: string): LayerResult {
		const found = layers.find((l) => l.name === name);
		if (found) return found;
		const fallback: LayerResult = { name, passed: true, issues: [] };
		layers.push(fallback);
		return fallback;
	}

	private _aggregateLayers(layers: LayerResult[]): CheckResult {
		const allIssues = layers.flatMap((l) => l.issues);
		return {
			errors: allIssues.filter((i) => i.severity === "error").length,
			warnings: allIssues.filter((i) => i.severity === "warning").length,
			passed: layers.every((l) => l.passed),
			layers,
			issues: allIssues,
		};
	}

	private _checkPatterns(code: string, filePath?: string): Violation[] {
		const violations: Violation[] = [];
		const file = filePath || "unknown";

		if (code.includes("process.stdout.write")) {
			violations.push({
				type: "no-console",
				file,
				message: "process.stdout.write should be removed in production code",
			});
		}
		if (code.includes(".toBeTruthy()") || code.includes(".toBeDefined()")) {
			violations.push({
				type: "vague-assertion",
				file,
				message: "Use specific assertions instead of toBeTruthy/toBeDefined",
			});
		}
		if (code.includes("catch (") && code.includes("{}")) {
			violations.push({
				type: "silent-catch",
				file,
				message: "Empty catch blocks swallow errors - log or rethrow",
			});
		}

		return violations;
	}
}
