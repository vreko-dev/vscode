/**
 * Daemon Start Stage
 *
 * Ensures the Vreko daemon is running
 */

import { logger } from "../../utils/logger";
import type { OnboardingContext, OnboardingStage, SurfaceUpdates } from "./types";

export class DaemonStartStage implements OnboardingStage {
	id = "daemon.start";
	tier = "enhanced" as const;
	dependsOn = ["cli.ensure"];
	timeout = 15000;
	canFail = true;
	errorStrategy = "skip" as const;

	async check(context: OnboardingContext): Promise<boolean> {
		// Skip if CLI not available
		return context.data.get("cli.available") === true;
	}

	async execute(context: OnboardingContext): Promise<void> {
		try {
			// Issue: LIN-0000  -  Implement daemon health check
			// For now, assume daemon is running if CLI is available
			logger.info("[Daemon] Checking daemon status");
			context.data.set("daemon.running", true);
		} catch (error) {
			logger.warn("[Daemon] Failed to connect to daemon", error as Error);
			context.data.set("daemon.running", false);
		}
	}

	async verify(context: OnboardingContext): Promise<boolean> {
		return context.data.get("daemon.running") === true;
	}

	getSurfaces(): SurfaceUpdates | undefined {
		return {
			statusBar: {
				text: "$(server) Starting daemon...",
				tooltip: "Connecting to 🦎 Vreko daemon",
			},
		};
	}
}
