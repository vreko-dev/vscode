import * as https from "node:https";
import * as vscode from "vscode";
import type { CLIInstaller, InstallResult } from "./CLIInstaller";
import type { CLIResolver } from "./CLIResolver";

export interface VersionInfo {
	current: string | null;
	required: string;
	latest: string | null;
	updateAvailable: boolean;
	updateRequired: boolean;
	updateType?: "major" | "minor" | "patch";
}

export class CLIVersionManager {
	private readonly REQUIRED_VERSION = "0.1.0";
	private readonly VERSION_CHECK_URL = "https://api.github.com/repos/vreko-dev/cli/releases/latest";
	private latestVersionCache: { version: string; timestamp: number } | null = null;
	private readonly CACHE_TTL = 3600000; // 1 hour

	constructor(
		private readonly resolver: CLIResolver,
		private readonly installer: CLIInstaller,
	) {
		/* intentionally empty */
	}

	/**
	 * Get version information for current CLI
	 */
	async getVersionInfo(): Promise<VersionInfo> {
		const resolution = await this.resolver.resolve();
		const current = resolution.status === "found" ? resolution.version || null : null;
		const latest = await this.getLatestVersion();

		const info: VersionInfo = {
			current,
			required: this.REQUIRED_VERSION,
			latest,
			updateAvailable: false,
			updateRequired: false,
		};

		if (!current) {
			info.updateRequired = true;
			return info;
		}

		// Check if update is required (current < required)
		if (this.compareVersions(current, this.REQUIRED_VERSION) < 0) {
			info.updateRequired = true;
			info.updateType = this.getUpdateType(current, this.REQUIRED_VERSION);
			return info;
		}

		// Check if update is available (current < latest)
		if (latest && this.compareVersions(current, latest) < 0) {
			info.updateAvailable = true;
			info.updateType = this.getUpdateType(current, latest);
		}

		return info;
	}

	/**
	 * Check for updates and handle according to auto-update settings
	 */
	async checkAndUpdate(): Promise<InstallResult | null> {
		const config = vscode.workspace.getConfiguration("vreko.cli");
		const autoUpdate = config.get<string>("autoUpdate", "minor");

		if (autoUpdate === "none") {
			return null; // Auto-update disabled
		}

		const versionInfo = await this.getVersionInfo();

		// Required updates are always installed (breaking changes)
		if (versionInfo.updateRequired) {
			vscode.window.showWarningMessage(`🦎 Vreko: CLI update required (v${versionInfo.required}). Installing...`);
			return await this.installer.install(versionInfo.required);
		}

		// Optional updates based on auto-update setting
		if (versionInfo.updateAvailable && versionInfo.latest && versionInfo.updateType) {
			const shouldUpdate = this.shouldAutoUpdate(autoUpdate, versionInfo.updateType);

			if (shouldUpdate) {
				// Background update with notification
				vscode.window.showInformationMessage(`🦎 Vreko: Installing CLI v${versionInfo.latest}...`);
				return await this.installer.install(versionInfo.latest);
			}
			// Notify user but don't auto-install
			const action = await vscode.window.showInformationMessage(
				`🦎 Vreko: CLI v${versionInfo.latest} available (you have v${versionInfo.current})`,
				"Update Now",
				"Later",
			);

			if (action === "Update Now") {
				return await this.installer.install(versionInfo.latest);
			}
		}

		return null;
	}

	/**
	 * Get latest version from GitHub releases
	 */
	private async getLatestVersion(): Promise<string | null> {
		// Check cache first
		if (this.latestVersionCache) {
			const age = Date.now() - this.latestVersionCache.timestamp;
			if (age < this.CACHE_TTL) {
				return this.latestVersionCache.version;
			}
		}

		try {
			const data = await this.fetchJson(this.VERSION_CHECK_URL);
			const tagName = data.tag_name;
			const version = typeof tagName === "string" ? tagName.replace(/^v/, "") : null;

			if (version) {
				this.latestVersionCache = { version, timestamp: Date.now() };
				return version;
			}

			return null;
		} catch (_error) {
			return null;
		}
	}

	/**
	 * Fetch JSON from URL
	 */
	private async fetchJson(url: string): Promise<Record<string, unknown>> {
		return new Promise((resolve, reject) => {
			const request = https.get(url, { headers: { "User-Agent": "Vreko-VSCode" } }, (response) => {
				if (response.statusCode !== 200) {
					reject(new Error(`HTTP ${response.statusCode}`));
					return;
				}

				let data = "";
				response.on("data", (chunk: string) => {
					data += chunk;
				});
				response.on("end", () => {
					try {
						resolve(JSON.parse(data) as Record<string, unknown>);
					} catch (error) {
						reject(error);
					}
				});
				response.on("error", reject);
			});

			request.on("error", reject);
			request.setTimeout(10000, () => {
				request.destroy();
				reject(new Error("Request timed out"));
			});
		});
	}

	/**
	 * Compare two semantic versions
	 * Returns: -1 (v1 < v2), 0 (v1 === v2), 1 (v1 > v2)
	 */
	private compareVersions(v1: string, v2: string): number {
		const parts1 = v1.split(".").map(Number);
		const parts2 = v2.split(".").map(Number);

		for (let i = 0; i < 3; i++) {
			const p1 = parts1[i] || 0;
			const p2 = parts2[i] || 0;

			if (p1 > p2) {
				return 1;
			}
			if (p1 < p2) {
				return -1;
			}
		}

		return 0;
	}

	/**
	 * Determine update type (major/minor/patch)
	 */
	private getUpdateType(current: string, target: string): "major" | "minor" | "patch" {
		const [c_major, c_minor] = current.split(".").map(Number);
		const [t_major, t_minor] = target.split(".").map(Number);

		if (t_major > c_major) {
			return "major";
		}
		if (t_minor > c_minor) {
			return "minor";
		}
		return "patch";
	}

	/**
	 * Check if auto-update should proceed based on update type
	 */
	private shouldAutoUpdate(autoUpdate: string, updateType: "major" | "minor" | "patch"): boolean {
		if (autoUpdate === "none") {
			return false;
		}
		if (autoUpdate === "patch") {
			return updateType === "patch";
		}
		if (autoUpdate === "minor") {
			return updateType === "minor" || updateType === "patch";
		}
		return false; // Major updates are never auto-installed
	}
}
