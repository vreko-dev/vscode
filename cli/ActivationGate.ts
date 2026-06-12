import * as vscode from "vscode";
import type { CLIInstaller } from "./CLIInstaller";
import type { CLIResolution, CLIResolver } from "./CLIResolver";
import type { CLIVersionManager } from "./CLIVersionManager";
import { ShellProfilePatcher } from "./ShellProfilePatcher";

export type ActivationState =
	| "IDLE"
	| "RESOLVING_CLI"
	| "INSTALLING_CLI"
	| "READY"
	| "DISABLED"
	| "RECONNECTING"
	| "ERROR";

export interface ActivationEvent {
	state: ActivationState;
	timestamp: number;
	message?: string;
	error?: string;
}

export class ActivationGate {
	private state: ActivationState = "IDLE";
	private readonly events: ActivationEvent[] = [];
	private readonly stateChangeEmitter = new vscode.EventEmitter<ActivationEvent>();
	public readonly onStateChange = this.stateChangeEmitter.event;

	private cliResolution: CLIResolution | null = null;
	private readonly shellPatcher = new ShellProfilePatcher();

	constructor(
		private readonly resolver: CLIResolver,
		private readonly installer: CLIInstaller,
		private readonly versionManager: CLIVersionManager,
		readonly _context: vscode.ExtensionContext,
	) {
		/* intentionally empty */
	}

	/**
	 * Start activation sequence
	 *
	 * Performance budget: <700ms happy path
	 */
	async activate(): Promise<boolean> {
		const startTime = Date.now();

		try {
			// Check if auto-install is disabled
			const autoInstall = vscode.workspace.getConfiguration("vreko.cli").get<boolean>("autoInstall", true);

			if (!autoInstall) {
				this.transition("DISABLED", "Auto-install disabled in settings");
				return false;
			}

			// Phase 1: Resolve CLI
			this.transition("RESOLVING_CLI", "Locating Vreko CLI binary...");
			this.cliResolution = await this.resolver.resolve();

			if (this.cliResolution.status === "not-found") {
				// Phase 2: Install CLI
				this.transition("INSTALLING_CLI", "Installing Vreko CLI...");
				const installResult = await this.installer.install("latest");

				if (!installResult.success) {
					throw new Error(`Installation failed: ${installResult.error}`);
				}

				// Patch shell profile for PATH
				await this.shellPatcher.patch();

				// Re-resolve after installation
				this.cliResolution = await this.resolver.resolve();
			}

			// Check for updates (non-blocking background task)
			this.versionManager.checkAndUpdate().catch((_error) => {
				/* intentionally empty */
			});

			// Phase 3: Ready
			const duration = Date.now() - startTime;
			this.transition("READY", `Activation complete in ${duration}ms`);

			// Log performance (budget: <700ms happy path)
			if (duration > 700) {
				// intentionally empty
			} else {
				process.stdout.write(`[ActivationGate] Activation completed in ${duration}ms (under budget)`);
			}

			return true;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.transition("ERROR", errorMessage);

			vscode.window
				.showErrorMessage(`🦎 Vreko: Activation failed  -  ${errorMessage}`, "Retry", "Disable")
				.then((action) => {
					if (action === "Retry") {
						void this.activate();
					} else if (action === "Disable") {
						void vscode.workspace.getConfiguration("vreko.cli").update("autoInstall", false, true);
						this.transition("DISABLED", "Disabled by user");
					}
				});

			return false;
		}
	}

	/**
	 * Handle daemon crash recovery
	 */
	async handleCrash(): Promise<void> {
		this.transition("RECONNECTING", "Daemon connection lost, attempting recovery...");

		try {
			this.transition("READY", "Reconnected to daemon");

			vscode.window.showInformationMessage("🦎 Vreko: Daemon reconnected");
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			this.transition("ERROR", `Recovery failed: ${errorMessage}`);

			vscode.window
				.showErrorMessage("🦎 Vreko: Daemon recovery failed", "Restart Extension", "Disable")
				.then((action) => {
					if (action === "Restart Extension") {
						void this.activate();
					} else if (action === "Disable") {
						this.transition("DISABLED", "Disabled by user after crash");
					}
				});
		}
	}

	/**
	 * Get current activation state
	 */
	getState(): ActivationState {
		return this.state;
	}

	/**
	 * Check if extension is ready for use
	 */
	isReady(): boolean {
		return this.state === "READY";
	}

	/**
	 * Get CLI resolution info
	 */
	getResolution(): CLIResolution | null {
		return this.cliResolution;
	}

	/**
	 * Get activation history
	 */
	getHistory(): ActivationEvent[] {
		return [...this.events];
	}

	/**
	 * Transition to a new state
	 */
	private transition(state: ActivationState, message?: string): void {
		this.state = state;

		const event: ActivationEvent = {
			state,
			timestamp: Date.now(),
			message,
		};

		this.events.push(event);
		this.stateChangeEmitter.fire(event);

		process.stdout.write(`[ActivationGate] ${state}${message ? `: ${message}` : ""}`);
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		this.stateChangeEmitter.dispose();
	}
}
