#!/usr/bin/env node

/**
 * SnapBack VS Code Extension Development Workflow Script
 *
 * This script automates the complete development workflow for the SnapBack VS Code extension,
 * including packaging, installation, and testing in a development environment.
 *
 * Usage:
 *   node scripts/dev-workflow.cjs [--install] [--test] [--clean]
 */

const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

// ANSI colors for output
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
	white: "\x1b[37m",
};

function log(message, color = "reset", prefix = "ℹ") {
	console.log(`${colors[color]}${prefix} ${message}${colors.reset}`);
}

function logError(message) {
	log(message, "red", "✖");
}

function logSuccess(message) {
	log(message, "green", "✔");
}

function logWarning(message) {
	log(message, "yellow", "⚠");
}

function logInfo(message) {
	log(message, "blue", "ℹ");
}

function execCommand(command, options = {}) {
	try {
		log(`Executing: ${command}`, "cyan");
		return execSync(command, {
			stdio: "inherit",
			encoding: "utf8",
			...options,
		});
	} catch (error) {
		logError(`Command failed: ${command}`);
		throw error;
	}
}

class DevWorkflow {
	constructor() {
		this.extensionRoot = process.cwd();
		this.extensionName = "snapback-vscode";
		this.publisher = "marcelle-labs";
		this.vsixPattern = `${this.extensionName}-*.vsix`;
	}

	/**
	 * Check what versions are currently installed
	 */
	checkInstalledVersions() {
		logInfo("Checking currently installed versions...");

		try {
			// Detect editor installation
			const os = require("node:os");
			const path = require("node:path");
			const fs = require("node:fs");

			const editorPaths = [
				path.join(os.homedir(), ".cursor/extensions"),
				path.join(os.homedir(), ".vscode/extensions"),
				path.join(os.homedir(), ".vscode-insiders/extensions"),
			];

			const extensionPath = editorPaths.find((p) => fs.existsSync(p));

			if (extensionPath) {
				const output = execSync(`ls -la "${extensionPath}" | grep snapback`, {
					encoding: "utf8",
					stdio: ["pipe", "pipe", "ignore"],
				});

				if (output.trim()) {
					console.log(output);
				} else {
					logInfo("No SnapBack extensions found");
				}
			} else {
				logInfo("No editor extensions directory found");
			}
		} catch (_error) {
			logInfo("No SnapBack extensions found or directory doesn't exist");
		}
	}

	/**
	 * Clean previous installations
	 */
	cleanInstallations() {
		logInfo("Removing old versions...");

		try {
			const os = require("node:os");
			const path = require("node:path");
			const fs = require("node:fs");

			const editorPaths = [
				path.join(os.homedir(), ".cursor/extensions"),
				path.join(os.homedir(), ".vscode/extensions"),
				path.join(os.homedir(), ".vscode-insiders/extensions"),
			];

			const extensionPath = editorPaths.find((p) => fs.existsSync(p));

			if (extensionPath) {
				execSync(
					`rm -rf "${extensionPath}/${this.publisher}.${this.extensionName}-*"`,
					{
						stdio: "inherit",
					},
				);
				logSuccess("Old versions removed successfully");
			} else {
				logWarning("No editor extensions directory found");
			}
		} catch (_error) {
			logWarning("No old versions found or removal failed");
		}
	}

	/**
	 * Verify removal
	 */
	verifyRemoval() {
		logInfo("Verifying removal...");

		try {
			const os = require("node:os");
			const path = require("node:path");
			const fs = require("node:fs");

			const editorPaths = [
				path.join(os.homedir(), ".cursor/extensions"),
				path.join(os.homedir(), ".vscode/extensions"),
				path.join(os.homedir(), ".vscode-insiders/extensions"),
			];

			const extensionPath = editorPaths.find((p) => fs.existsSync(p));

			if (extensionPath) {
				const output = execSync(
					`ls -la "${extensionPath}" | grep snapback || echo "✅ All versions removed"`,
					{
						encoding: "utf8",
						stdio: "pipe",
					},
				);

				if (output.includes("All versions removed")) {
					logSuccess("All versions removed");
				} else {
					logWarning("Some versions may still be present");
					console.log(output);
				}
			} else {
				logSuccess("All versions removed (no extensions directory found)");
			}
		} catch (_error) {
			logSuccess("All versions removed");
		}
	}

	/**
	 * Bump version in package.json
	 */
	bumpVersion() {
		logInfo("Bumping version...");

		try {
			// Read current package.json
			const packagePath = path.join(this.extensionRoot, "package.json");
			const packageJson = JSON.parse(fs.readFileSync(packagePath, "utf8"));

			// Get current version
			const currentVersion = packageJson.version;
			logInfo(`Current version: ${currentVersion}`);

			// Bump patch version
			const versionParts = currentVersion.split(".");
			const newPatch = Number.parseInt(versionParts[2], 10) + 1;
			const newVersion = `${versionParts[0]}.${versionParts[1]}.${newPatch}`;

			// Update package.json
			packageJson.version = newVersion;
			fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2));

			logSuccess(`Version bumped to: ${newVersion}`);
			return newVersion;
		} catch (error) {
			logError(`Failed to bump version: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Package the extension
	 */
	async packageExtension() {
		logInfo("Packaging extension...");

		try {
			// Use the existing package-vsix script
			execCommand("npm run package-vsix");
			logSuccess("Extension packaged successfully");
		} catch (error) {
			logError(`Failed to package extension: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Install the extension
	 */
	installExtension() {
		logInfo("Installing extension...");

		try {
			// Find the generated VSIX file
			const vsixFiles = fs
				.readdirSync(this.extensionRoot)
				.filter(
					(file) =>
						file.startsWith(this.extensionName) && file.endsWith(".vsix"),
				);

			if (vsixFiles.length === 0) {
				throw new Error("No VSIX file found");
			}

			const vsixFile = vsixFiles[0];
			logInfo(`Found VSIX file: ${vsixFile}`);

			// Install with force flag
			execCommand(`code --install-extension ${vsixFile} --force`);
			logSuccess("Extension installed successfully");
		} catch (error) {
			logError(`Failed to install extension: ${error.message}`);
			throw error;
		}
	}

	/**
	 * Main workflow execution
	 */
	async run(options = {}) {
		try {
			logInfo("Starting SnapBack VS Code Extension Development Workflow");

			// Step 1: Check installed versions
			this.checkInstalledVersions();

			// Step 2: Clean previous installations if requested
			if (options.clean) {
				this.cleanInstallations();
				this.verifyRemoval();
			}

			// Step 3: Bump version if requested
			let _newVersion = null;
			if (options.bump) {
				_newVersion = this.bumpVersion();
			}

			// Step 4: Package the extension
			await this.packageExtension();

			// Step 5: Install the extension if requested
			if (options.install) {
				this.installExtension();

				logSuccess("==========================================");
				logSuccess("✅ DEVELOPMENT WORKFLOW COMPLETED!");
				logSuccess("==========================================");
				logInfo("Next steps:");
				logInfo("1. FULLY QUIT Cursor/VS Code (Cmd+Q)");
				logInfo("2. Reopen Cursor/VS Code");
				logInfo("3. Open Developer Console IMMEDIATELY");
				logInfo("4. Look for: [SnapBack] Registering decoration provider...");
				logInfo("5. If you see it, protect a file and watch for more logs");
				logSuccess("==========================================");
			}
		} catch (error) {
			logError(`Workflow failed: ${error.message}`);
			process.exit(1);
		}
	}
}

// Parse command line arguments
function parseArgs() {
	const args = process.argv.slice(2);
	const options = {
		install: args.includes("--install") || args.includes("-i"),
		clean: args.includes("--clean") || args.includes("-c"),
		bump: args.includes("--bump") || args.includes("-b"),
		help: args.includes("--help") || args.includes("-h"),
	};

	return options;
}

// Show help
function showHelp() {
	console.log(`
${colors.blue}SnapBack VS Code Extension Development Workflow${colors.reset}

Usage:
  node scripts/dev-workflow.cjs [options]

Options:
  -i, --install    Install the extension after packaging
  -c, --clean      Clean previous installations before packaging
  -b, --bump       Bump the version before packaging
  -h, --help       Show this help message

Examples:
  node scripts/dev-workflow.cjs              # Package only
  node scripts/dev-workflow.cjs --install    # Package and install
  node scripts/dev-workflow.cjs --clean --install --bump  # Full workflow
  `);
}

// Main execution
async function main() {
	const options = parseArgs();

	if (options.help) {
		showHelp();
		process.exit(0);
	}

	const workflow = new DevWorkflow();
	await workflow.run(options);
}

if (require.main === module) {
	main().catch((error) => {
		logError(error.message);
		process.exit(1);
	});
}

module.exports = { DevWorkflow };
