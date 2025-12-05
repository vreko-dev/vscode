#!/usr/bin/env node

/**
 * SnapBack VS Code Extension Package and Install Script
 *
 * This script packages the VS Code extension and installs it locally for development testing.
 * It follows industry best practices by integrating with the existing build system.
 */

const fs = require("node:fs");
const { execSync } = require("node:child_process");

// ANSI colors for output
const colors = {
	reset: "\x1b[0m",
	red: "\x1b[31m",
	green: "\x1b[32m",
	yellow: "\x1b[33m",
	blue: "\x1b[34m",
	cyan: "\x1b[36m",
};

function log(message, color = "reset") {
	console.log(`${colors[color]}${message}${colors.reset}`);
}

function execCommand(command, options = {}) {
	try {
		log(`> ${command}`, "cyan");
		return execSync(command, {
			stdio: "inherit",
			encoding: "utf8",
			...options,
		});
	} catch (error) {
		log(`❌ Command failed: ${command}`, "red");
		throw error;
	}
}

class PackageAndInstall {
	constructor() {
		this.extensionRoot = process.cwd();
		this.extensionName = "snapback-vscode";
	}

	/**
	 * Package the extension using the existing package-vsix script
	 */
	async package() {
		log("📦 Packaging extension...", "blue");

		try {
			// Use the existing package-vsix script which handles workspace dependencies correctly
			execCommand("npm run package-vsix");
			log("✅ Extension packaged successfully!", "green");
		} catch (error) {
			log(`❌ Failed to package extension: ${error.message}`, "red");
			throw error;
		}
	}

	/**
	 * Find the generated VSIX file
	 */
	findVsixFile() {
		log("🔍 Finding generated VSIX file...", "blue");

		const files = fs
			.readdirSync(this.extensionRoot)
			.filter(
				(file) => file.startsWith(this.extensionName) && file.endsWith(".vsix"),
			);

		if (files.length === 0) {
			throw new Error(
				"No VSIX file found. Make sure packaging completed successfully.",
			);
		}

		const vsixFile = files[0];
		log(`✅ Found VSIX file: ${vsixFile}`, "green");
		return vsixFile;
	}

	/**
	 * Install the extension in VS Code
	 */
	install(vsixFile) {
		log("📥 Installing extension...", "blue");

		try {
			// Install with force flag to overwrite any existing version
			// Try cursor command first (for Cursor IDE), fallback to code (for VS Code)
			try {
				execCommand(`cursor --install-extension ${vsixFile} --force`);
			} catch (cursorError) {
				// If cursor command fails, try code command
				try {
					execCommand(`code --install-extension ${vsixFile} --force`);
				} catch (_codeError) {
					// If both fail, throw the original cursor error
					throw cursorError;
				}
			}
			log("✅ Extension installed successfully!", "green");
		} catch (error) {
			log(`❌ Failed to install extension: ${error.message}`, "red");
			throw error;
		}
	}

	/**
	 * Clean up generated VSIX files
	 */
	cleanup() {
		log("🧹 Cleaning up...", "blue");

		try {
			const files = fs
				.readdirSync(this.extensionRoot)
				.filter(
					(file) =>
						file.startsWith(this.extensionName) && file.endsWith(".vsix"),
				);

			files.forEach((file) => {
				fs.unlinkSync(file);
				log(`✅ Removed ${file}`, "green");
			});
		} catch (error) {
			log(`⚠️  Cleanup warning: ${error.message}`, "yellow");
		}
	}

	/**
	 * Main execution
	 */
	async run(options = {}) {
		try {
			log(
				"🚀 Starting SnapBack VS Code Extension Package and Install Process",
				"green",
			);

			// Package the extension
			await this.package();

			// Find the VSIX file
			const vsixFile = this.findVsixFile();

			// Install if requested
			if (options.install) {
				this.install(vsixFile);

				log("\n==========================================", "green");
				log("✅ PACKAGE AND INSTALL COMPLETED!", "green");
				log("==========================================", "green");
				log("Next steps:", "blue");
				log("1. FULLY QUIT VS Code/Cursor (Cmd+Q)", "blue");
				log("2. Reopen VS Code/Cursor", "blue");
				log(
					"3. Open Developer Console (Help > Toggle Developer Tools)",
					"blue",
				);
				log(
					"4. Look for: [SnapBack] Registering decoration provider...",
					"blue",
				);
				log("5. If you see it, protect a file and watch for more logs", "blue");
				log("==========================================", "green");
			}

			// Clean up if requested
			if (options.clean) {
				this.cleanup();
			}
		} catch (error) {
			log(`❌ Process failed: ${error.message}`, "red");
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
		help: args.includes("--help") || args.includes("-h"),
	};

	return options;
}

// Show help
function showHelp() {
	console.log(`
${colors.blue}SnapBack VS Code Extension Package and Install Script${colors.reset}

Usage:
  node scripts/package-and-install.cjs [options]

Options:
  -i, --install    Install the extension after packaging
  -c, --clean      Clean up VSIX files after installation
  -h, --help       Show this help message

Examples:
  node scripts/package-and-install.cjs              # Package only
  node scripts/package-and-install.cjs --install    # Package and install
  node scripts/package-and-install.cjs --install --clean  # Package, install, and clean up
  `);
}

// Main execution
async function main() {
	const options = parseArgs();

	if (options.help) {
		showHelp();
		process.exit(0);
	}

	const packager = new PackageAndInstall();
	await packager.run(options);
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

module.exports = { PackageAndInstall };
