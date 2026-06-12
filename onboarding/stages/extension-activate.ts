/**
 * Extension Activation Stage
 *
 * Verifies VS Code extension context is initialized
 */

import type { OnboardingContext, OnboardingStage, SurfaceUpdates } from "./types";

export class ExtensionActivateStage implements OnboardingStage {
	id = "extension.activate";
	tier = "critical" as const;
	dependsOn: string[] = [];
	timeout = 5000;
	canFail = false;
	errorStrategy = "block" as const;

	async check(_context: OnboardingContext): Promise<boolean> {
		// Always run - this is the entry point
		return true;
	}

	async execute(context: OnboardingContext): Promise<void> {
		// Verify extension context
		if (!context.extensionContext) {
			throw new Error("Extension context not available");
		}
		// Extension is already activated at this point
	}

	async verify(context: OnboardingContext): Promise<boolean> {
		return !!context.extensionContext && !!context.workspaceRoot;
	}

	getSurfaces(): SurfaceUpdates | undefined {
		return {
			statusBar: {
				text: "$(sync~spin) 🦎 Vreko: Initializing...",
				tooltip: "Extension activating",
			},
		};
	}
}
