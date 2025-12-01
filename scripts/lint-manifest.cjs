#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");

async function lintManifest() {
	try {
		// Read the package.json
		const packageJsonPath = path.join(__dirname, "../package.json");
		const packageJsonContent = await fs.readFile(packageJsonPath, "utf-8");
		const packageJson = JSON.parse(packageJsonContent);

		console.log("🔍 Linting package.json manifest...");

		// Validate command declarations
		const declaredCommands = new Set(
			(packageJson.contributes?.commands || []).map((cmd) => cmd.command),
		);

		// Check menus for command references
		const referencedCommands = new Set();
		const menus = packageJson.contributes?.menus || {};

		for (const menuItems of Object.values(menus)) {
			if (Array.isArray(menuItems)) {
				for (const item of menuItems) {
					if (item.command) {
						referencedCommands.add(item.command);
					}
				}
			}
		}

		// Check commandPalette
		const commandPalette = packageJson.contributes?.menus?.commandPalette || [];
		for (const item of commandPalette) {
			if (item.command) {
				referencedCommands.add(item.command);
			}
		}

		// Check walkthroughs
		const walkthroughs = packageJson.contributes?.walkthroughs || [];
		for (const walkthrough of walkthroughs) {
			if (walkthrough.steps) {
				for (const step of walkthrough.steps) {
					if (step.completionEvents) {
						for (const event of step.completionEvents) {
							const commandMatch = event.match(/onCommand:(.+)/);
							if (commandMatch) {
								referencedCommands.add(commandMatch[1]);
							}
						}
					}
				}
			}
		}

		// Identify missing command declarations
		const missingCommands = [];
		for (const command of referencedCommands) {
			// Check VS Code built-in commands and extension commands
			if (command.startsWith("vscode.") || command.startsWith("snapback.")) {
				if (!declaredCommands.has(command)) {
					missingCommands.push(command);
				}
			}
		}

		if (missingCommands.length > 0) {
			console.error("❌ Missing command declarations:");
			for (const cmd of missingCommands) {
				console.error(`  - ${cmd}`);
			}
			process.exit(1);
		}

		console.log("✅ All referenced commands are properly declared");

		// Check for native modules
		if (packageJson.dependencies?.["better-sqlite3"]) {
			console.log("✅ better-sqlite3 is properly declared as a dependency");
		} else {
			console.error("❌ better-sqlite3 is not declared in dependencies");
			process.exit(1);
		}

		// Check for packaging scripts
		const requiredScripts = ["package", "package-vsce", "package-vsix"];
		const missingScripts = [];

		for (const script of requiredScripts) {
			if (!packageJson.scripts || !packageJson.scripts[script]) {
				missingScripts.push(script);
			}
		}

		if (missingScripts.length > 0) {
			console.error("❌ Missing required packaging scripts:");
			for (const script of missingScripts) {
				console.error(`  - ${script}`);
			}
			process.exit(1);
		}

		console.log("✅ All required packaging scripts are present");
		console.log("✅ Manifest linting completed successfully");
	} catch (error) {
		console.error("❌ Manifest linting failed:", error.message);
		process.exit(1);
	}
}

lintManifest();
