#!/usr/bin/env node

/**
 * Script to validate the VS Code extension manifest before publishing
 * Checks for required fields, proper configuration, and common issues
 */

const fs = require("node:fs");
const path = require("node:path");

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

function error(message) {
	log(`❌ ${message}`, "red");
}

function success(message) {
	log(`✅ ${message}`, "green");
}

function warning(message) {
	log(`⚠️  ${message}`, "yellow");
}

function info(message) {
	log(`ℹ️  ${message}`, "blue");
}

async function validateManifest() {
	try {
		const manifestPath = path.join(__dirname, "../package.json");
		const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

		let hasErrors = false;
		let hasWarnings = false;

		log("🔍 Validating VS Code Extension Manifest...\n", "blue");

		// Check required fields
		const requiredFields = [
			"name",
			"publisher",
			"displayName",
			"description",
			"version",
			"engines",
			"categories",
			"main",
			"repository",
		];

		for (const field of requiredFields) {
			if (!manifest[field]) {
				error(`Missing required field: ${field}`);
				hasErrors = true;
			}
		}

		// Check publisher
		if (manifest.publisher && manifest.publisher.length > 0) {
			success(`Publisher: ${manifest.publisher}`);
		}

		// Check version format
		if (manifest.version) {
			const versionRegex = /^\d+\.\d+\.\d+$/;
			if (versionRegex.test(manifest.version)) {
				success(`Version: ${manifest.version}`);
			} else {
				warning(
					`Version format might not follow semantic versioning: ${manifest.version}`,
				);
				hasWarnings = true;
			}
		}

		// Check engines
		if (manifest.engines?.vscode) {
			success(`VS Code engine: ${manifest.engines.vscode}`);
		} else {
			error("Missing VS Code engine specification");
			hasErrors = true;
		}

		// Check categories
		if (
			manifest.categories &&
			Array.isArray(manifest.categories) &&
			manifest.categories.length > 0
		) {
			success(`Categories: ${manifest.categories.join(", ")}`);
		} else {
			warning("No categories specified");
			hasWarnings = true;
		}

		// Check main entry point
		if (manifest.main) {
			const mainPath = path.join(__dirname, "..", manifest.main);
			if (fs.existsSync(mainPath)) {
				success(`Main entry point: ${manifest.main}`);
			} else {
				warning(`Main entry point file not found: ${manifest.main}`);
				hasWarnings = true;
			}
		}

		// Check repository
		if (manifest.repository) {
			if (manifest.repository.url) {
				success(`Repository: ${manifest.repository.url}`);
			} else {
				warning("Repository URL not specified");
				hasWarnings = true;
			}
		}

		// Check for pricing and sponsor information
		if (manifest.pricing) {
			success(`Pricing: ${manifest.pricing}`);
		} else {
			info("Consider adding pricing information for marketplace visibility");
		}

		if (manifest.sponsor) {
			success(`Sponsor: ${manifest.sponsor.url}`);
		} else {
			info("Consider adding sponsor information to support the project");
		}

		// Check for icon
		if (manifest.icon) {
			const iconPath = path.join(__dirname, "..", manifest.icon);
			if (fs.existsSync(iconPath)) {
				success(`Icon: ${manifest.icon}`);
			} else {
				warning(`Icon file not found: ${manifest.icon}`);
				hasWarnings = true;
			}
		} else {
			warning("No icon specified (recommended for marketplace)");
			hasWarnings = true;
		}

		// Check for gallery banner
		if (manifest.galleryBanner) {
			success("Gallery banner configuration present");
		} else {
			info("Consider adding gallery banner for better marketplace appearance");
		}

		// Check for activation events
		if (
			manifest.activationEvents &&
			Array.isArray(manifest.activationEvents) &&
			manifest.activationEvents.length > 0
		) {
			success(
				`Activation events: ${manifest.activationEvents.length} events configured`,
			);
		} else {
			warning("No activation events specified (extension will not activate)");
			hasWarnings = true;
		}

		// Check for contributes section
		if (manifest.contributes) {
			success("Contributes section present");

			// Check for commands
			if (
				manifest.contributes.commands &&
				Array.isArray(manifest.contributes.commands) &&
				manifest.contributes.commands.length > 0
			) {
				success(
					`Commands: ${manifest.contributes.commands.length} commands registered`,
				);
			}

			// Check for views
			if (manifest.contributes.views) {
				const viewCount = Object.keys(manifest.contributes.views).length;
				if (viewCount > 0) {
					success(`Views: ${viewCount} view containers registered`);
				}
			}
		} else {
			warning("No contributes section (no UI contributions)");
			hasWarnings = true;
		}

		// Check for scripts
		if (manifest.scripts) {
			const requiredScripts = ["vscode:prepublish", "compile", "package"];
			for (const script of requiredScripts) {
				if (manifest.scripts[script]) {
					success(`Script ${script}: present`);
				} else {
					warning(`Missing recommended script: ${script}`);
					hasWarnings = true;
				}
			}

			// Check for deploy script
			if (manifest.scripts.deploy) {
				success("Deploy script present");
			} else {
				info("Consider adding a deploy script for easier publishing");
			}
		}

		// Check for native modules
		if (manifest.dependencies?.["better-sqlite3"]) {
			success("Native module (better-sqlite3) properly declared as dependency");
		} else {
			warning(
				"better-sqlite3 not found in dependencies (required for SnapBack)",
			);
			hasWarnings = true;
		}

		// Summary
		log(`\n${"=".repeat(50)}`, "blue");

		if (hasErrors) {
			error("❌ Manifest validation failed with errors");
			process.exit(1);
		} else if (hasWarnings) {
			warning("⚠️  Manifest validation completed with warnings");
			log("\nRecommendations:", "blue");
			log(
				"1. Address the warnings above for a better marketplace experience",
				"cyan",
			);
			log("2. Test the extension locally before publishing", "cyan");
			log(
				"3. Ensure all assets (README, CHANGELOG, LICENSE) are up to date",
				"cyan",
			);
			process.exit(0);
		} else {
			success("✅ Manifest validation completed successfully!");
			log("\nReady for publishing! 🚀", "green");
			process.exit(0);
		}
	} catch (err) {
		error(`Failed to validate manifest: ${err.message}`);
		process.exit(1);
	}
}

// Run validation
if (require.main === module) {
	validateManifest().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}

module.exports = { validateManifest };
