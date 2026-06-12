/**
 * CLI Ensure Stage
 *
 * Ensures the Vreko CLI is available
 */

import { execSync } from "node:child_process";
import { logger } from "../../utils/logger";
import type { OnboardingContext, OnboardingStage, SurfaceUpdates } from "./types";

export class CliEnsureStage implements OnboardingStage {
	id = "cli.ensure";
	tier = "enhanced" as const;
	dependsOn = ["extension.activate"];
	timeout = 10000;
	canFail = true;
	errorStrategy = "skip" as const;

	async check(_context: OnboardingContext): Promise<boolean> {
		// Always try to ensure CLI
		return true;
	}

	async execute(context: OnboardingContext): Promise<void> {
		try {
			// Check if vreko CLI is in PATH
			execSync("vreko --version", { stdio: "pipe" });
			logger.info("[CLI] Vreko CLI found in PATH");
			context.data.set("cli.available", true);
		} catch (_error) {
			logger.warn("[CLI] Vreko CLI not found in PATH");
			context.data.set("cli.available", false);
			// Could trigger CLI installation here
		}
	}

	async verify(context: OnboardingContext): Promise<boolean> {
		return context.data.get("cli.available") === true;
	}

	getSurfaces(): SurfaceUpdates | undefined {
		return {
			statusBar: {
				text: "$(tools) Checking CLI...",
				tooltip: "Verifying 🦎 Vreko CLI installation",
			},
		};
	}
}
