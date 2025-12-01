import * as fs from "node:fs/promises";
import * as path from "node:path";
import { describe, expect, it } from "vitest";

describe("Package JSON Structure", () => {
	it("should have correct package structure with all required fields", async () => {
		// Read the package.json
		const packagePath = path.join(__dirname, "../../../package.json");
		const packageContent = await fs.readFile(packagePath, "utf-8");
		const packageJson = JSON.parse(packageContent);

		// Verify base properties exist
		expect(packageJson.name).toBe("snapback-vscode");
		expect(packageJson.publisher).toBe("MarcelleLabs");
		expect(packageJson.displayName).toBe("SnapBack - Code Safety Net");
		expect(packageJson.version).toBeDefined();
		expect(packageJson.engines).toBeDefined();
		expect(packageJson.categories).toBeDefined();
		expect(packageJson.activationEvents).toBeDefined();
		expect(packageJson.main).toBe("./dist/extension.js");

		// Verify contributes section exists
		expect(packageJson.contributes).toBeDefined();
		expect(packageJson.contributes.commands).toBeDefined();
		expect(packageJson.contributes.views).toBeDefined();
		expect(packageJson.contributes.menus).toBeDefined();
		expect(packageJson.contributes.configuration).toBeDefined();

		// Verify scripts section exists
		expect(packageJson.scripts).toBeDefined();
		// Updated to reflect new simplified build process
		expect(packageJson.scripts["vscode:prepublish"]).toBe("pnpm run package");

		// Verify dependencies exist
		expect(packageJson.dependencies).toBeDefined();
		expect(packageJson.devDependencies).toBeDefined();
	});

	it("should have all commands declared in contributes.commands", async () => {
		// Read the package.json
		const packagePath = path.join(__dirname, "../../../package.json");
		const packageContent = await fs.readFile(packagePath, "utf-8");
		const packageJson = JSON.parse(packageContent);

		// Get all declared commands
		const declaredCommands = new Set(
			(packageJson.contributes?.commands || []).map((cmd: any) => cmd.command),
		);

		// Get all referenced commands in menus
		const referencedCommands = new Set<string>();

		// Check menus for command references
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

		// Check commandPalette for when conditions that might reference commands
		const commandPalette = packageJson.contributes?.menus?.commandPalette || [];
		for (const item of commandPalette) {
			if (item.command) {
				referencedCommands.add(item.command);
			}
		}

		// Check walkthroughs for completionEvents
		const walkthroughs = packageJson.contributes?.walkthroughs || [];
		for (const walkthrough of walkthroughs) {
			if (walkthrough.steps) {
				for (const step of walkthrough.steps) {
					if (step.completionEvents) {
						for (const event of step.completionEvents) {
							// Extract command from events like "onCommand:snapback.protectFile"
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
		const missingCommands: string[] = [];
		for (const command of referencedCommands) {
			// Skip built-in VS Code commands - they don't need to be declared in our manifest
			if (command.startsWith("vscode.")) {
				continue;
			}
			// For extension commands, they should definitely be declared
			if (command.startsWith("snapback.") && !declaredCommands.has(command)) {
				missingCommands.push(command);
			}
		}

		// All referenced commands should be declared
		expect(missingCommands).toHaveLength(0);
		if (missingCommands.length > 0) {
			throw new Error(
				`The following commands are referenced but not declared in contributes.commands: ${missingCommands.join(
					", ",
				)}`,
			);
		}
	});

	it("should not have duplicate command declarations", async () => {
		// Read the package.json
		const packagePath = path.join(__dirname, "../../../package.json");
		const packageContent = await fs.readFile(packagePath, "utf-8");
		const packageJson = JSON.parse(packageContent);

		// Get all declared commands
		const declaredCommands = packageJson.contributes?.commands || [];
		const commandIds = declaredCommands.map((cmd: any) => cmd.command);

		// Check for duplicates
		const uniqueCommands = new Set<string>();
		const duplicates: string[] = [];

		for (const commandId of commandIds) {
			if (uniqueCommands.has(commandId)) {
				duplicates.push(commandId);
			} else {
				uniqueCommands.add(commandId);
			}
		}

		expect(duplicates).toHaveLength(0);
		if (duplicates.length > 0) {
			throw new Error(
				`Duplicate command declarations found: ${duplicates.join(", ")}`,
			);
		}
	});
});
