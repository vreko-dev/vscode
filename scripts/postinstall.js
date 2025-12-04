#!/usr/bin/env node

/**
 * Post-install script to rebuild native modules for VS Code extension
 * This ensures better-sqlite3 works correctly in the VS Code environment
 */

const { execSync } = require("node:child_process");
const fs = require("node:fs");
const p = require("node:path");
const hook = `#!/bin/sh
pnpm --silent snapback:check --staged
if [ $? -ne 0 ]; then echo "❌ SnapBack blocked commit"; exit 1; fi
`;
const fp = p.join(process.cwd(), "../../.git/hooks/pre-commit");
fs.writeFileSync(fp, hook, { mode: 0o755 });
console.log("✅ pre-commit installed");

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

async function main() {
	try {
		log("🔧 Post-install script running...", "blue");

		// Check if we're in the VS Code extension directory
		const extensionRoot = process.cwd();
		const betterSqlite3Path = path.join(
			extensionRoot,
			"node_modules",
			"better-sqlite3",
		);

		if (!fs.existsSync(betterSqlite3Path)) {
			log(
				"  ℹ better-sqlite3 not found, skipping native module rebuild",
				"yellow",
			);
			return;
		}

		log("  ✓ better-sqlite3 found in node_modules", "green");

		// Try to rebuild better-sqlite3 for Electron
		// Use npm rebuild directly as it's more reliable in monorepo environments
		try {
			log("  🔧 Rebuilding better-sqlite3 for VS Code/Electron...", "blue");
			execCommand(
				"npm rebuild better-sqlite3 --runtime=electron --target=20.0.0 --disturl=https://electronjs.org/headers",
				{ cwd: extensionRoot },
			);
			log("  ✅ better-sqlite3 rebuilt successfully!", "green");
		} catch (error) {
			log(`  ⚠ Warning: npm rebuild failed: ${error.message}`, "yellow");

			// Try electron-rebuild as fallback, but only for this directory
			try {
				log("  🔧 Trying electron-rebuild as fallback...", "blue");
				execCommand(
					"npx electron-rebuild -w better-sqlite3 -f -v 20.0.0 -o .",
					{ cwd: extensionRoot },
				);
				log("  ✅ better-sqlite3 rebuilt with electron-rebuild!", "green");
			} catch (altError) {
				log(`  ⚠ electron-rebuild also failed: ${altError.message}`, "yellow");
				log("  ℹ This may cause issues in the packaged extension", "yellow");
				log(
					"  ℹ You may need to manually rebuild better-sqlite3 for your VS Code version",
					"yellow",
				);
				// Don't fail the postinstall - let it continue
			}
		}

		log("✅ Post-install script completed!", "green");
	} catch (error) {
		log(`❌ Post-install script failed: ${error.message}`, "red");
		process.exit(1);
	}
}

if (require.main === module) {
	main().catch((error) => {
		console.error(error);
		process.exit(1);
	});
}
