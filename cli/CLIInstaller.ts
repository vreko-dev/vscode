import { exec } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as https from "node:https";
import * as os from "node:os";
import * as path from "node:path";
import { promisify } from "node:util";
import * as vscode from "vscode";

const execAsync = promisify(exec);

export interface InstallResult {
	success: boolean;
	binaryPath?: string;
	version?: string;
	method: "managed" | "global" | "bundled";
	error?: string;
}

interface PlatformInfo {
	platform: NodeJS.Platform;
	arch: string;
	binaryName: string;
}

export class CLIInstaller {
	private readonly MANAGED_DIR = path.join(os.homedir(), ".vreko", "bin");
	private readonly MANAGED_PATH = path.join(this.MANAGED_DIR, "vreko");
	private readonly DOWNLOAD_BASE_URL = "https://github.com/vreko-dev/cli/releases/download";
	private readonly BUNDLED_DIR: string;

	constructor(readonly extensionPath: string) {
		this.BUNDLED_DIR = path.join(extensionPath, "bundled-cli");
	}

	/**
	 * Install CLI using three-tier strategy:
	 * Tier 1 (default): Download to ~/.vreko/bin/
	 * Tier 2 (opt-in): npm install -g (if preferGlobal=true AND admin detected)
	 * Tier 3 (offline): Copy bundled binary
	 *
	 * Performance budget: <2s for Tier 1
	 */
	async install(version: string, channel: "stable" | "beta" | "canary" = "stable"): Promise<InstallResult> {
		const preferGlobal = vscode.workspace.getConfiguration("vreko.cli").get<boolean>("preferGlobal", false);

		try {
			// Tier 2: Try global installation first if preferred
			if (preferGlobal && (await this.isAdminUser())) {
				const globalResult = await this.installGlobal(version);
				if (globalResult.success) {
					return globalResult;
				}
			}

			// Tier 1: Managed installation (default)
			const managedResult = await this.installManaged(version, channel);
			if (managedResult.success) {
				return managedResult;
			}
			return await this.installBundled();
		} catch (error) {
			return {
				success: false,
				method: "managed",
				error: `Installation failed: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Tier 1: Download and install to ~/.vreko/bin/
	 */
	private async installManaged(version: string, channel: "stable" | "beta" | "canary"): Promise<InstallResult> {
		return await vscode.window.withProgress(
			{
				location: vscode.ProgressLocation.Notification,
				title: "🦎 Vreko: Installing CLI",
				cancellable: false,
			},
			async (progress) => {
				try {
					progress.report({ message: "Detecting platform..." });
					const platform = this.detectPlatform();

					progress.report({ message: "Creating installation directory...", increment: 10 });
					await fs.mkdir(this.MANAGED_DIR, { recursive: true });

					// Atomic update: rename old binary if exists
					const oldPath = `${this.MANAGED_PATH}.old`;
					try {
						await fs.rename(this.MANAGED_PATH, oldPath);
					} catch {
						// No existing binary, that's fine
					}

					progress.report({ message: "Downloading CLI binary...", increment: 20 });
					const downloadUrl = this.getDownloadUrl(version, channel, platform);
					const checksumUrl = `${downloadUrl}.sha256`;

					// Download binary and checksum in parallel
					const [binaryData, checksumData] = await Promise.all([
						this.download(downloadUrl),
						this.download(checksumUrl).catch(() => null), // Checksum optional
					]);

					if (checksumData) {
						progress.report({ message: "Verifying checksum...", increment: 30 });
						const expectedChecksum = checksumData.toString("utf-8").trim().split(" ")[0];
						const actualChecksum = crypto.createHash("sha256").update(binaryData).digest("hex");

						if (actualChecksum !== expectedChecksum) {
							throw new Error("Checksum verification failed - binary may be corrupted");
						}
					}

					progress.report({ message: "Installing binary...", increment: 20 });
					await fs.writeFile(this.MANAGED_PATH, binaryData, { mode: 0o755 });

					progress.report({ message: "Verifying installation...", increment: 10 });
					const installedVersion = await this.getVersion(this.MANAGED_PATH);
					if (!installedVersion) {
						throw new Error("Installed binary failed version check");
					}

					// Success: delete old binary
					try {
						await fs.unlink(oldPath);
					} catch {
						// Old binary doesn't exist, that's fine
					}

					progress.report({ message: "Installation complete.", increment: 10 });
					return {
						success: true,
						binaryPath: this.MANAGED_PATH,
						version: installedVersion,
						method: "managed",
					};
				} catch (error) {
					// Rollback: restore old binary if it exists
					const oldPath = `${this.MANAGED_PATH}.old`;
					try {
						await fs.rename(oldPath, this.MANAGED_PATH);
					} catch {
						// Rollback failed, but that's secondary to the original error
					}

					return {
						success: false,
						method: "managed",
						error: error instanceof Error ? error.message : String(error),
					};
				}
			},
		);
	}

	/**
	 * Tier 2: Global installation via npm
	 */
	private async installGlobal(version: string): Promise<InstallResult> {
		try {
			await execAsync(`npm install -g @vreko/cli@${version}`, {
				timeout: 60000,
			});

			// Verify installation
			const { stdout: whichOutput } = await execAsync(
				process.platform === "win32" ? "where vreko" : "which vreko",
			);
			const binaryPath = whichOutput.trim().split("\n")[0];
			const installedVersion = await this.getVersion(binaryPath);

			return {
				success: true,
				binaryPath,
				version: installedVersion || version,
				method: "global",
			};
		} catch (error) {
			return {
				success: false,
				method: "global",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Tier 3: Copy bundled binary (offline fallback)
	 */
	private async installBundled(): Promise<InstallResult> {
		try {
			const platform = this.detectPlatform();
			const bundledPath = path.join(this.BUNDLED_DIR, platform.binaryName);

			// Verify bundled binary exists
			await fs.access(bundledPath, fs.constants.X_OK);

			// Copy to managed location
			await fs.mkdir(this.MANAGED_DIR, { recursive: true });
			await fs.copyFile(bundledPath, this.MANAGED_PATH);
			await fs.chmod(this.MANAGED_PATH, 0o755);

			const version = await this.getVersion(this.MANAGED_PATH);
			return {
				success: true,
				binaryPath: this.MANAGED_PATH,
				version: version || "unknown",
				method: "bundled",
			};
		} catch (error) {
			return {
				success: false,
				method: "bundled",
				error: `Bundled binary not available: ${error instanceof Error ? error.message : String(error)}`,
			};
		}
	}

	/**
	 * Detect platform and architecture
	 */
	private detectPlatform(): PlatformInfo {
		const platform = process.platform;
		const arch = process.arch;

		const platformMap: Record<string, string> = {
			"darwin-arm64": "vreko-macos-arm64",
			"darwin-x64": "vreko-macos-x64",
			"linux-x64": "vreko-linux-x64",
			"linux-arm64": "vreko-linux-arm64",
			"win32-x64": "vreko-windows-x64.exe",
		};

		const key = `${platform}-${arch}`;
		const binaryName = platformMap[key];

		if (!binaryName) {
			throw new Error(`Unsupported platform: ${platform}-${arch}`);
		}

		return { platform, arch, binaryName };
	}

	/**
	 * Get download URL for version and platform
	 */
	private getDownloadUrl(version: string, channel: "stable" | "beta" | "canary", platform: PlatformInfo): string {
		const tag = channel === "stable" ? `v${version}` : `v${version}-${channel}`;
		return `${this.DOWNLOAD_BASE_URL}/${tag}/${platform.binaryName}`;
	}

	/**
	 * Download file from URL with redirect handling
	 */
	private async download(url: string): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const request = https.get(url, (response) => {
				// Handle redirects
				if (response.statusCode === 301 || response.statusCode === 302) {
					const redirectUrl = response.headers.location;
					if (redirectUrl) {
						this.download(redirectUrl).then(resolve).catch(reject);
						return;
					}
				}

				if (response.statusCode !== 200) {
					reject(new Error(`Download failed with status ${response.statusCode}`));
					return;
				}

				const chunks: Buffer[] = [];
				response.on("data", (chunk: Buffer) => chunks.push(chunk));
				response.on("end", () => resolve(Buffer.concat(chunks)));
				response.on("error", reject);
			});

			request.on("error", reject);
			request.setTimeout(30000, () => {
				request.destroy();
				reject(new Error("Download timed out"));
			});
		});
	}

	/**
	 * Check if current user has admin privileges
	 */
	private async isAdminUser(): Promise<boolean> {
		try {
			if (process.platform === "win32") {
				// On Windows, check if we can run 'net session'
				await execAsync("net session", { timeout: 5000 });
				return true;
			}
			// On Unix, check if npm global prefix is writable
			const { stdout } = await execAsync("npm config get prefix", { timeout: 5000 });
			const prefix = stdout.trim();
			await fs.access(prefix, fs.constants.W_OK);
			return true;
		} catch {
			return false;
		}
	}

	/**
	 * Get version from CLI binary
	 */
	private async getVersion(binaryPath: string): Promise<string | null> {
		try {
			const { stdout } = await execAsync(`"${binaryPath}" --version`, { timeout: 5000 });
			const match = stdout.trim().match(/(\d+\.\d+\.\d+)/);
			return match ? match[1] : null;
		} catch {
			return null;
		}
	}
}
