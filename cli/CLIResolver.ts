import { exec } from "node:child_process";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execAsync = promisify(exec);

export interface CLIResolution {
	status: "found" | "not-found" | "invalid-version";
	binaryPath?: string;
	version?: string;
	installMethod?: "managed" | "global" | "custom";
	error?: string;
}

export class CLIResolver {
	private readonly MANAGED_PATH = path.join(os.homedir(), ".vreko", "bin", "vreko");
	private readonly MIN_VERSION = "0.1.0";

	/**
	 * Resolve CLI binary using priority order:
	 * 1. Custom path from settings
	 * 2. Managed installation (~/.vreko/bin)
	 * 3. Global installation (PATH)
	 *
	 * Performance budget: <50ms
	 */
	async resolve(): Promise<CLIResolution> {
		const startTime = Date.now();

		try {
			// Priority 1: Custom path from settings
			const customPath = vscode.workspace.getConfiguration("vreko.cli").get<string>("path");
			if (customPath) {
				const resolution = await this.checkBinary(customPath, "custom");
				if (resolution.status === "found") {
					this.logPerformance("resolve", startTime);
					return resolution;
				}
			}

			// Priority 2: Managed installation
			const managedResolution = await this.checkBinary(this.MANAGED_PATH, "managed");
			if (managedResolution.status === "found") {
				this.logPerformance("resolve", startTime);
				return managedResolution;
			}

			// Priority 3: Global installation (PATH)
			const globalResolution = await this.findInPath();
			if (globalResolution.status === "found") {
				this.logPerformance("resolve", startTime);
				return globalResolution;
			}

			this.logPerformance("resolve", startTime);
			return { status: "not-found", error: "CLI binary not found in any location" };
		} catch (error) {
			this.logPerformance("resolve", startTime);
			return {
				status: "not-found",
				error: `Resolution failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Check if a specific binary path is valid
	 */
	private async checkBinary(
		binaryPath: string,
		installMethod: CLIResolution["installMethod"],
	): Promise<CLIResolution> {
		try {
			// Check if file exists and is executable
			await fs.access(binaryPath, fs.constants.X_OK);

			// Verify it's the Vreko CLI by checking version
			const version = await this.getVersion(binaryPath);
			if (!version) {
				return {
					status: "not-found",
					error: `Binary at ${binaryPath} is not a valid Vreko CLI`,
				};
			}

			// Check version compatibility
			if (!this.isVersionCompatible(version)) {
				return {
					status: "invalid-version",
					binaryPath,
					version,
					installMethod,
					error: `Version ${version} is below minimum required ${this.MIN_VERSION}`,
				};
			}

			return {
				status: "found",
				binaryPath,
				version,
				installMethod,
			};
		} catch {
			// File doesn't exist or isn't executable
			return {
				status: "not-found",
				error: `Binary not accessible at ${binaryPath}`,
			};
		}
	}

	/**
	 * Find CLI in system PATH using 'which' command
	 */
	private async findInPath(): Promise<CLIResolution> {
		try {
			const isWindows = process.platform === "win32";
			const command = isWindows ? "where vreko" : "which vreko";

			const { stdout, stderr } = await execAsync(command, { timeout: 5000 });
			if (stderr || !stdout.trim()) {
				return { status: "not-found", error: "CLI not found in PATH" };
			}

			// On Windows, 'where' returns all matches; take the first
			const binaryPath = stdout.trim().split("\n")[0];
			return this.checkBinary(binaryPath, "global");
		} catch {
			return { status: "not-found", error: "CLI not found in PATH" };
		}
	}

	/**
	 * Get version from CLI binary
	 */
	private async getVersion(binaryPath: string): Promise<string | null> {
		try {
			const { stdout } = await execAsync(`"${binaryPath}" --version`, {
				timeout: 5000,
			});

			// Extract version from output (e.g., "vreko 0.1.0" or "0.1.0")
			const match = stdout.trim().match(/(\d+\.\d+\.\d+)/);
			return match ? match[1] : null;
		} catch {
			return null;
		}
	}

	/**
	 * Check if version meets minimum requirements
	 */
	private isVersionCompatible(version: string): boolean {
		const parseVersion = (v: string): number[] => v.split(".").map(Number);
		const current = parseVersion(version);
		const minimum = parseVersion(this.MIN_VERSION);

		for (let i = 0; i < 3; i++) {
			if (current[i] > minimum[i]) {
				return true;
			}
			if (current[i] < minimum[i]) {
				return false;
			}
		}
		return true; // Equal versions
	}

	/**
	 * Get the managed installation path
	 */
	getManagedPath(): string {
		return this.MANAGED_PATH;
	}

	/**
	 * Log performance metrics (budget: <50ms for found CLI)
	 */
	private logPerformance(_operation: string, startTime: number): void {
		const duration = Date.now() - startTime;

		if (duration > 50) {
			// intentionally empty
		}
	}
}
