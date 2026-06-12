/**
 * Workspace Register Stage
 *
 * Registers the workspace with the daemon
 */

import { generateWorkspaceId } from "@vreko/workspace-identity";
import { logger } from "../../utils/logger";
import type { OnboardingContext, OnboardingStage, SurfaceUpdates } from "./types";

export class WorkspaceRegisterStage implements OnboardingStage {
	id = "workspace.register";
	tier = "critical" as const;
	dependsOn = ["daemon.start"];
	timeout = 5000;
	canFail = false;
	errorStrategy = "block" as const;

	async check(context: OnboardingContext): Promise<boolean> {
		// Skip if daemon not running
		const daemonRunning = context.data.get("daemon.running");
		if (!daemonRunning) {
			logger.info("[Workspace] Skipping registration - daemon not available");
			return false;
		}
		return true;
	}

	async execute(context: OnboardingContext): Promise<void> {
		// Issue: LIN-0000  -  Call daemon workspace registration API
		logger.info(`[Workspace] Registering workspace: ${context.workspaceRoot}`);

		// Store workspace ID in context
		const workspaceId = generateWorkspaceId(context.workspaceRoot);
		context.data.set("workspace.id", workspaceId);
	}

	async verify(context: OnboardingContext): Promise<boolean> {
		return !!context.data.get("workspace.id");
	}

	getSurfaces(): SurfaceUpdates | undefined {
		return {
			statusBar: {
				text: "$(folder) Registering workspace...",
				tooltip: "Connecting workspace to 🦎 Vreko",
			},
		};
	}
}
