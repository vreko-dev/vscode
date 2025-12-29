/**
 * RemoteEnvironmentDetector.ts
 *
 * Detects VS Code remote environments and provides appropriate guidance.
 *
 * Spec Reference: unified_ux_spec_UPDATED.md §3.2, J1-E10
 * Edge Case: VS Code Remote (SSH/Container/WSL)
 *
 * Implementation:
 *   1. Detect remote type (SSH, Container, WSL)
 *   2. Identify limitations for that environment
 *   3. Suggest workarounds
 *
 * @see https://github.com/your-org/snapback/blob/main/apps/vscode/unified_ux_spec_UPDATED.md
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Remote environment information
 */
export interface RemoteEnvironmentInfo {
	isRemote: boolean;
	remoteType?: "ssh" | "container" | "wsl" | "unknown";
	remoteName?: string;
	limitations: string[];
	workarounds: string[];
}

/**
 * Remote Environment Detector
 *
 * Detects remote environment and provides appropriate guidance:
 * 1. Detect remote type (SSH, Container, WSL)
 * 2. Identify limitations for that environment
 * 3. Suggest workarounds
 */
export class RemoteEnvironmentDetector {
	/**
	 * Detect if running in a remote environment
	 */
	detect(): RemoteEnvironmentInfo {
		const remoteName = vscode.env.remoteName;
		const isRemote = !!remoteName;

		if (!isRemote) {
			return {
				isRemote: false,
				limitations: [],
				workarounds: [],
			};
		}

		// Determine remote type
		let remoteType: RemoteEnvironmentInfo["remoteType"] = "unknown";
		const limitations: string[] = [];
		const workarounds: string[] = [];

		if (remoteName?.includes("ssh")) {
			remoteType = "ssh";
			limitations.push(
				"OAuth browser redirect may not work",
				"Clipboard may not sync between local and remote",
				"File watcher may have latency",
			);
			workarounds.push(
				"Use manual token authentication",
				"Configure SSH with ForwardAgent for smoother auth",
			);
		} else if (remoteName?.includes("container") || remoteName?.includes("docker")) {
			remoteType = "container";
			limitations.push(
				"OAuth redirect requires container port forwarding",
				"Storage is ephemeral unless volume mounted",
			);
			workarounds.push("Mount ~/.snapback as volume for persistence", "Use manual token authentication");
		} else if (remoteName?.includes("wsl")) {
			remoteType = "wsl";
			limitations.push(
				"OAuth browser may open in Windows instead of WSL",
				"Path translation between Windows and WSL",
			);
			workarounds.push("Set default browser in WSL", "Use manual token authentication if browser issues");
		}

		logger.debug("Remote environment detected", {
			isRemote,
			remoteType,
			remoteName,
			limitationsCount: limitations.length,
		});

		return {
			isRemote,
			remoteType,
			remoteName,
			limitations,
			workarounds,
		};
	}

	/**
	 * Check if OAuth will work in current environment
	 */
	canUseOAuth(): boolean {
		const env = this.detect();

		// OAuth works in desktop mode
		if (!env.isRemote) {
			return true;
		}

		// WSL usually works with some caveats
		if (env.remoteType === "wsl") {
			return true;
		}

		// SSH and container have issues with browser redirect
		logger.info("OAuth may not work in remote environment", {
			remoteType: env.remoteType,
		});
		return false;
	}

	/**
	 * Show warning about remote environment limitations
	 */
	async showRemoteLimitationsWarning(): Promise<"continue" | "manual" | "cancel"> {
		const env = this.detect();

		if (!env.isRemote) {
			return "continue";
		}

		const message = `Running in ${env.remoteType || "remote"} environment. Some features may have limitations.`;
		const detail = env.limitations.length > 0 ? `Limitations: ${env.limitations.join(", ")}` : undefined;

		logger.info("Showing remote limitations warning", {
			remoteType: env.remoteType,
		});

		const choice = await vscode.window.showWarningMessage(
			message,
			{ modal: true, detail },
			"Continue",
			"Use Manual Auth",
			"Cancel",
		);

		if (choice === "Use Manual Auth") {
			logger.info("User chose manual auth due to remote environment");
			return "manual";
		}
		if (choice === "Continue") {
			return "continue";
		}
		return "cancel";
	}

	/**
	 * Get recommendations for current remote environment
	 */
	getRecommendations(): string[] {
		const env = this.detect();
		const recommendations: string[] = [];

		if (!env.isRemote) {
			return recommendations;
		}

		// Add environment-specific recommendations
		recommendations.push(...env.workarounds);

		// Add general recommendations
		if (!this.canUseOAuth()) {
			recommendations.push("Consider using manual token authentication for better reliability");
		}

		return recommendations;
	}

	/**
	 * Check if storage might be ephemeral (container without volume)
	 */
	isStoragePotentiallyEphemeral(): boolean {
		const env = this.detect();
		return env.remoteType === "container";
	}
}
