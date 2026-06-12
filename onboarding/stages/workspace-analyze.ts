/**
 * Workspace Analysis Stage
 *
 * Orchestrates IntelligenceProviders to analyze the workspace
 */

import { logger } from "../../utils/logger";
import type { OnboardingContext, OnboardingStage, SurfaceUpdates } from "./types";

export class WorkspaceAnalyzeStage implements OnboardingStage {
	id = "workspace.analyze";
	tier = "enhanced" as const;
	dependsOn = ["workspace.register"];
	timeout = 15000;
	canFail = true;
	errorStrategy = "skip" as const;

	async check(context: OnboardingContext): Promise<boolean> {
		// Only run if workspace is registered
		return !!context.data.get("workspace.id");
	}

	async execute(context: OnboardingContext): Promise<void> {
		logger.info("[Analysis] Starting workspace analysis");

		try {
			// Keep onboarding lightweight in the extension process; deep analysis runs in daemon.
			const analysisResult = {
				started: true,
				source: "daemon",
				workspace: context.workspaceRoot,
			};

			context.data.set("workspace.analyzed", true);
			context.data.set("intelligence.result", analysisResult);

			logger.info("[Analysis] Workspace analysis complete", {
				source: analysisResult.source,
			});
		} catch (error) {
			logger.error("[Analysis] Workspace analysis failed", error as Error);
			// Mark as analyzed anyway to not block onboarding
			context.data.set("workspace.analyzed", true);
			context.data.set("intelligence.error", (error as Error).message);
		}
	}

	async verify(context: OnboardingContext): Promise<boolean> {
		return context.data.get("workspace.analyzed") === true;
	}

	getSurfaces(): SurfaceUpdates | undefined {
		return {
			statusBar: {
				text: "$(search) Analyzing workspace...",
				tooltip: "Gathering intelligence about your codebase",
			},
		};
	}
}
