#!/usr/bin/env node

/**
 * Script to rebuild better-sqlite3 for Electron
 * This script helps resolve ABI mismatch issues between Node.js and Electron
 */

const { execSync } = require("node:child_process");
const _path = require("node:path");

console.log("🔧 Rebuilding better-sqlite3 for Electron...");

try {
	// Check if electron-rebuild is installed
	console.log("🔍 Checking for electron-rebuild...");
	execSync("npx electron-rebuild --version", { stdio: "ignore" });
	console.log("✅ electron-rebuild found");
} catch (_error) {
	console.log("⚠️ electron-rebuild not found, installing...");
	try {
		execSync("npm install --no-save electron-rebuild", { stdio: "inherit" });
		console.log("✅ electron-rebuild installed");
	} catch (installError) {
		console.error(
			"❌ Failed to install electron-rebuild:",
			installError.message,
		);
		process.exit(1);
	}
}

try {
	// Run electron-rebuild on better-sqlite3
	console.log("🔨 Rebuilding better-sqlite3 for Electron...");
	execSync("npx electron-rebuild -f -w better-sqlite3", { stdio: "inherit" });
	console.log("🎉 better-sqlite3 rebuilt successfully for Electron!");

	console.log("\n✅ Rebuild completed successfully!");
	console.log("🔄 Please restart VS Code to apply changes");
} catch (error) {
	console.error("❌ Failed to rebuild better-sqlite3:", error.message);
	process.exit(1);
}
