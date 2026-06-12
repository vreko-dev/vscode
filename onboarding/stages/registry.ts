/**
 * Onboarding Stage Registry
 *
 * Orchestrates stage execution with topological sorting, parallel execution,
 * and error handling strategies.
 */

import { addBreadcrumb, captureException, startSpan } from "../../observability/sentry";
import { logger } from "../../utils/logger";
import type { OnboardingContext, OnboardingResult, OnboardingStage, StageRegistryConfig, StageResult } from "./types";

/**
 * Stage Registry - Manages and executes onboarding stages
 */
export class StageRegistry {
	private stages: Map<string, OnboardingStage> = new Map();
	private config: Required<StageRegistryConfig>;

	constructor(config: StageRegistryConfig = {}) {
		this.config = {
			maxConcurrency: config.maxConcurrency ?? 3,
			globalTimeout: config.globalTimeout ?? 60000,
			enableTelemetry: config.enableTelemetry ?? true,
		};
	}

	/**
	 * Register a stage
	 */
	register(stage: OnboardingStage): void {
		if (this.stages.has(stage.id)) {
			logger.warn(`Stage ${stage.id} already registered, overwriting`);
		}
		this.stages.set(stage.id, stage);
		addBreadcrumb(`Registered stage: ${stage.id}`, "onboarding");
	}

	/**
	 * Execute all registered stages
	 */
	async execute(context: OnboardingContext): Promise<OnboardingResult> {
		const span = startSpan("onboarding-pipeline", "onboarding");
		const startTime = Date.now();

		try {
			// Topological sort
			const sortedStages = this.topologicalSort();
			logger.info(`Executing ${sortedStages.length} stages in dependency order`);

			// Execute stages with parallel optimization
			const failures: string[] = [];
			const skipped: string[] = [];
			let degraded = false;

			await this.executeInWaves(sortedStages, context, failures, skipped, (stageDegraded) => {
				degraded = degraded || stageDegraded;
			});

			const duration = Date.now() - startTime;
			const success = failures.filter((id) => !this.stages.get(id)?.canFail).length === 0;

			span?.finish();

			return {
				success,
				duration,
				stageResults: context.stageResults,
				failures,
				skipped,
				degraded,
			};
		} catch (error) {
			span?.finish();
			captureException(error as Error, {
				tags: { component: "stage-registry" },
			});
			throw error;
		}
	}

	/**
	 * Topological sort of stages by dependencies
	 */
	private topologicalSort(): OnboardingStage[] {
		const sorted: OnboardingStage[] = [];
		const visited = new Set<string>();
		const visiting = new Set<string>();

		const visit = (stageId: string) => {
			if (visited.has(stageId)) {
				return;
			}
			if (visiting.has(stageId)) {
				throw new Error(`Circular dependency detected: ${stageId}`);
			}

			visiting.add(stageId);

			const stage = this.stages.get(stageId);
			if (!stage) {
				throw new Error(`Stage not found: ${stageId}`);
			}

			// Visit dependencies first
			for (const depId of stage.dependsOn) {
				visit(depId);
			}

			visiting.delete(stageId);
			visited.add(stageId);
			sorted.push(stage);
		};

		// Visit all stages
		for (const stageId of this.stages.keys()) {
			visit(stageId);
		}

		return sorted;
	}

	/**
	 * Execute stages in waves (parallel where possible)
	 */
	private async executeInWaves(
		stages: OnboardingStage[],
		context: OnboardingContext,
		failures: string[],
		skipped: string[],
		onDegraded: (degraded: boolean) => void,
	): Promise<void> {
		const remaining = new Set(stages);
		const completed = new Set<string>();

		while (remaining.size > 0) {
			// Find stages with all dependencies met
			const ready: OnboardingStage[] = [];
			for (const stage of remaining) {
				if (stage.dependsOn.every((dep) => completed.has(dep))) {
					ready.push(stage);
				}
			}

			if (ready.length === 0) {
				// Deadlock - should not happen after topological sort
				throw new Error("Deadlock detected in stage execution");
			}

			// Execute ready stages in parallel (up to maxConcurrency)
			const batch = ready.slice(0, this.config.maxConcurrency);
			await Promise.all(
				batch.map(async (stage) => {
					const result = await this.executeStage(stage, context);
					remaining.delete(stage);

					if (result.status === "completed") {
						completed.add(stage.id);
						if (result.degraded) {
							onDegraded(true);
						}
					} else if (result.status === "skipped") {
						completed.add(stage.id); // Allow dependents to run
						skipped.push(stage.id);
					} else if (result.status === "failed") {
						if (stage.canFail) {
							completed.add(stage.id); // Allow dependents to run
						} else {
							failures.push(stage.id);
							// Block dependent stages
							for (const remainingStage of remaining) {
								if (this.dependsOn(remainingStage, stage.id)) {
									remaining.delete(remainingStage);
									skipped.push(remainingStage.id);
								}
							}
						}
						failures.push(stage.id);
					}
				}),
			);
		}
	}

	/**
	 * Check if a stage depends on another (transitively)
	 */
	private dependsOn(stage: OnboardingStage, targetId: string): boolean {
		if (stage.dependsOn.includes(targetId)) {
			return true;
		}
		for (const depId of stage.dependsOn) {
			const depStage = this.stages.get(depId);
			if (depStage && this.dependsOn(depStage, targetId)) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Execute a single stage
	 */
	private async executeStage(stage: OnboardingStage, context: OnboardingContext): Promise<StageResult> {
		const span = startSpan(`stage-${stage.id}`, "stage");
		const startTime = Date.now();

		logger.info(`[Stage] ${stage.id} starting (tier: ${stage.tier})`);
		addBreadcrumb(`Stage ${stage.id} starting`, "stage", { tier: stage.tier });

		try {
			// Check if stage should run
			const shouldRun = await this.withTimeout(stage.check(context), stage.timeout, "check");
			if (!shouldRun) {
				logger.info(`[Stage] ${stage.id} skipped (check returned false)`);
				span?.finish();
				return {
					status: "skipped",
					duration: Date.now() - startTime,
				};
			}

			// Execute stage
			await this.withTimeout(stage.execute(context), stage.timeout, "execute");

			// Verify execution
			const verified = await this.withTimeout(stage.verify(context), stage.timeout, "verify");

			const duration = Date.now() - startTime;
			span?.finish();

			if (verified) {
				logger.info(`[Stage] ${stage.id} completed in ${duration}ms`);
				// Emit telemetry
				if (this.config.enableTelemetry) {
					// Issue: LIN-0000  -  PostHog event
				}

				// Update surfaces
				const surfaces = stage.getSurfaces();
				if (surfaces) {
					// Issue: LIN-0000  -  Apply surface updates to VS Code UI
				}

				return {
					status: "completed",
					duration,
				};
			}
			logger.warn(`[Stage] ${stage.id} verification failed`);
			return {
				status: "failed",
				duration,
				error: new Error("Stage verification failed"),
			};
		} catch (error) {
			span?.finish();
			const duration = Date.now() - startTime;
			logger.error(`[Stage] ${stage.id} failed`, error as Error);

			captureException(error as Error, {
				tags: { stage: stage.id, tier: stage.tier },
			});

			// Apply error strategy
			if (stage.errorStrategy === "retry") {
				// Issue: LIN-0000  -  Implement retry logic
			} else if (stage.errorStrategy === "degrade") {
				// Mark as degraded but continue
				return {
					status: "completed",
					duration,
					degraded: true,
					error: error as Error,
				};
			}

			return {
				status: "failed",
				duration,
				error: error as Error,
			};
		} finally {
			context.stageResults.set(stage.id, {
				status: "completed",
				duration: Date.now() - startTime,
			});
		}
	}

	/**
	 * Wrap promise with timeout
	 */
	private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, operation: string): Promise<T> {
		return Promise.race([
			promise,
			new Promise<T>((_, reject) =>
				setTimeout(() => reject(new Error(`${operation} timeout after ${timeoutMs}ms`)), timeoutMs),
			),
		]);
	}
}
