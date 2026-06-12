import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

export interface PatchResult {
	success: boolean;
	profilePath?: string;
	action: "patched" | "already-patched" | "skipped" | "failed";
	error?: string;
}

export class ShellProfilePatcher {
	private readonly MARKER_START = "# >>> vreko cli initialize >>>";
	private readonly MARKER_END = "# <<< vreko cli initialize <<<";
	private readonly CLI_PATH = path.join(os.homedir(), ".vreko", "bin");

	/**
	 * Patch shell profile to add CLI to PATH
	 */
	async patch(): Promise<PatchResult> {
		try {
			const shell = this.detectShell();
			if (!shell) {
				return {
					success: false,
					action: "skipped",
					error: "Could not detect shell",
				};
			}

			const profilePath = this.getProfilePath(shell);
			if (!profilePath) {
				return {
					success: false,
					action: "skipped",
					error: `No profile file found for shell: ${shell}`,
				};
			}

			// Read existing profile content
			let content: string;
			try {
				content = await fs.readFile(profilePath, "utf-8");
			} catch {
				// Profile doesn't exist, create it
				content = "";
			}

			// Check if already patched
			if (content.includes(this.MARKER_START)) {
				return {
					success: true,
					profilePath,
					action: "already-patched",
				};
			}

			// Generate patch content based on shell
			const patchContent = this.generatePatch(shell);

			// Append patch to profile
			const newContent = `${content + (content.endsWith("\n") ? "" : "\n") + patchContent}\n`;
			await fs.writeFile(profilePath, newContent, "utf-8");

			return {
				success: true,
				profilePath,
				action: "patched",
			};
		} catch (error) {
			return {
				success: false,
				action: "failed",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Remove patch from shell profile
	 */
	async unpatch(): Promise<PatchResult> {
		try {
			const shell = this.detectShell();
			if (!shell) {
				return {
					success: true,
					action: "skipped",
					error: "Could not detect shell",
				};
			}

			const profilePath = this.getProfilePath(shell);
			if (!profilePath) {
				return {
					success: true,
					action: "skipped",
				};
			}

			// Read profile content
			let content: string;
			try {
				content = await fs.readFile(profilePath, "utf-8");
			} catch {
				return {
					success: true,
					action: "skipped",
					error: "Profile file does not exist",
				};
			}

			// Check if patch exists
			const startIndex = content.indexOf(this.MARKER_START);
			if (startIndex === -1) {
				return {
					success: true,
					profilePath,
					action: "already-patched", // No patch to remove
				};
			}

			// Find end marker
			const endIndex = content.indexOf(this.MARKER_END, startIndex);
			if (endIndex === -1) {
				return {
					success: false,
					action: "failed",
					error: "Malformed patch (missing end marker)",
				};
			}

			// Remove patch section
			const beforePatch = content.substring(0, startIndex);
			const afterPatch = content.substring(endIndex + this.MARKER_END.length);
			const newContent = (beforePatch + afterPatch).replace(/\n{3,}/g, "\n\n"); // Clean up extra newlines

			await fs.writeFile(profilePath, newContent, "utf-8");

			return {
				success: true,
				profilePath,
				action: "patched", // Successfully removed patch
			};
		} catch (error) {
			return {
				success: false,
				action: "failed",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	/**
	 * Detect current shell from environment
	 */
	private detectShell(): string | null {
		const shell = process.env.SHELL || "";

		if (shell.includes("zsh")) {
			return "zsh";
		}
		if (shell.includes("bash")) {
			return "bash";
		}
		if (shell.includes("fish")) {
			return "fish";
		}

		// Fallback: check common shells on Windows
		if (process.platform === "win32") {
			return "powershell";
		}

		return null;
	}

	/**
	 * Get profile file path for shell
	 */
	private getProfilePath(shell: string): string | null {
		const home = os.homedir();

		const profileMap: Record<string, string> = {
			zsh: path.join(home, ".zshrc"),
			bash: path.join(home, ".bashrc"),
			fish: path.join(home, ".config", "fish", "config.fish"),
			powershell: path.join(home, "Documents", "PowerShell", "Microsoft.PowerShell_profile.ps1"),
		};

		return profileMap[shell] || null;
	}

	/**
	 * Generate patch content for shell
	 */
	private generatePatch(shell: string): string {
		if (shell === "fish") {
			return `${this.MARKER_START}
set -gx PATH "${this.CLI_PATH}" $PATH
${this.MARKER_END}`;
		}
		if (shell === "powershell") {
			return `${this.MARKER_START}
$env:PATH = "${this.CLI_PATH};$env:PATH"
${this.MARKER_END}`;
		}
		// bash/zsh
		return `${this.MARKER_START}
export PATH="${this.CLI_PATH}:$PATH"
${this.MARKER_END}`;
	}
}
