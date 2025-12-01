/**
 * @fileoverview Package.json Contract Tests
 *
 * These tests validate the VS Code extension manifest (package.json) to ensure
 * all required commands, activation events, and configuration are present.
 * This catches breaking changes before VSIX packaging.
 *
 * CRITICAL: These tests prevent "works in dev, breaks in package" issues.
 */

import { describe, expect, it } from "vitest";
import packageJson from "../../../package.json";

describe("[DEMO-CRITICAL] Package.json Contracts", () => {
	describe("Extension Metadata", () => {
		it("[DEMO] has required extension metadata", () => {
			expect(packageJson.name).toBe("snapback-vscode");
			expect(packageJson.displayName).toBeDefined();
			expect(packageJson.description).toBeDefined();
			expect(packageJson.version).toMatch(/^\d+\.\d+\.\d+/);
			expect(packageJson.publisher).toBe("MarcelleLabs");
		});

		it("[DEMO] specifies correct engine version", () => {
			expect(packageJson.engines).toBeDefined();
			expect(packageJson.engines.vscode).toBeDefined();
			// Should support VS Code 1.95+
			expect(packageJson.engines.vscode).toMatch(/^\^1\.\d+/);
		});

		it("[DEMO] has main entry point", () => {
			expect(packageJson.main).toBeDefined();
			expect(packageJson.main).toBe("./dist/extension.js");
		});
	});

	describe("Demo-Critical Commands", () => {
		const commands = packageJson.contributes.commands.map(
			(c: any) => c.command,
		);

		it("[DEMO] has initialize command", () => {
			expect(commands).toContain("snapback.initialize");

			const cmd = packageJson.contributes.commands.find(
				(c: any) => c.command === "snapback.initialize",
			);
			expect(cmd?.title).toContain("Initialize");
		});

		it("[DEMO] has protection commands (WATCH/WARN/BLOCK)", () => {
			expect(commands).toContain("snapback.setWatchLevel");
			expect(commands).toContain("snapback.setWarnLevel");
			expect(commands).toContain("snapback.setBlockLevel");

			const watchCmd = packageJson.contributes.commands.find(
				(c: any) => c.command === "snapback.setWatchLevel",
			);
			expect(watchCmd?.title).toContain("Watch");
		});

		it("[DEMO] has snapshot commands (create & restore)", () => {
			expect(commands).toContain("snapback.createSnapshot");
			expect(commands).toContain("snapback.snapBack");

			const createCmd = packageJson.contributes.commands.find(
				(c: any) => c.command === "snapback.createSnapshot",
			);
			expect(createCmd?.icon).toBeDefined(); // Should have icon for UI
		});

		it("[DEMO] has file protection commands", () => {
			expect(commands).toContain("snapback.protectFile");
			expect(commands).toContain("snapback.unprotectFile");
			expect(commands).toContain("snapback.changeProtectionLevel");
		});

		it("[DEMO] has all required command categories", () => {
			const _categories = packageJson.contributes.commands.map(
				(c: any) => c.category,
			);

			// All commands should be in SnapBack category
			const snapbackCommands = packageJson.contributes.commands.filter(
				(c: any) => c.command.startsWith("snapback."),
			);

			snapbackCommands.forEach((cmd: any) => {
				expect(cmd.category).toBe("SnapBack");
			});
		});
	});

	describe("Activation Events", () => {
		const activationEvents = packageJson.activationEvents;

		it("[DEMO] activates on startup", () => {
			expect(activationEvents).toContain("onStartupFinished");
		});

		it("[DEMO] activates when .snapbackrc exists", () => {
			expect(activationEvents).toContain("workspaceContains:.snapbackrc");
		});

		it("[DEMO] activates on snapback commands", () => {
			expect(activationEvents).toContain("onCommand:snapback.*");
		});
	});

	describe("Configuration Schema", () => {
		const config = packageJson.contributes.configuration;

		it("[DEMO] has configuration section", () => {
			expect(config).toBeDefined();
			expect(config.title).toBe("SnapBack");
			expect(config.properties).toBeDefined();
		});

		it("[DEMO] has protection level configuration", () => {
			const props = config.properties;

			expect(props["snapback.protectionLevels.defaultLevel"]).toBeDefined();
			expect(props["snapback.protectionLevels.defaultLevel"].type).toBe(
				"string",
			);
			expect(props["snapback.protectionLevels.defaultLevel"].enum).toEqual([
				"watch",
				"warn",
				"block",
			]);
			expect(props["snapback.protectionLevels.defaultLevel"].default).toBe(
				"watch",
			);
		});

		it("[DEMO] has notification configuration", () => {
			const props = config.properties;

			expect(props["snapback.notifications.showSnapshotCreated"]).toBeDefined();
			expect(props["snapback.notifications.duration"]).toBeDefined();
			expect(props["snapback.notifications.duration"].default).toBe(3000);
		});

		it("[DEMO] has snapshot configuration", () => {
			const props = config.properties;

			expect(props["snapback.snapshot.deduplication.enabled"]).toBeDefined();
			expect(props["snapback.snapshot.naming.useGit"]).toBeDefined();
			expect(props["snapback.snapshot.deletion.confirmDelete"]).toBeDefined();
		});

		it("[DEMO] has Guardian (AI detection) configuration", () => {
			const props = config.properties;

			expect(props["snapback.guardian.enabled"]).toBeDefined();
			expect(props["snapback.guardian.protectionLevel"]).toBeDefined();
			expect(props["snapback.guardian.protectionLevel"].enum).toContain("warn");
			expect(props["snapback.guardian.protectionLevel"].enum).toContain(
				"block",
			);
		});

		it("[DEMO] has offline mode configuration", () => {
			const props = config.properties;

			expect(props["snapback.offlineMode.enabled"]).toBeDefined();
			expect(props["snapback.offlineMode.enabled"].type).toBe("boolean");
			expect(props["snapback.offlineMode.enabled"].default).toBe(false);
		});
	});

	describe("Views and UI", () => {
		it("[DEMO] has activity bar view container", () => {
			const viewContainers = packageJson.contributes.viewsContainers;

			expect(viewContainers.activitybar).toBeDefined();
			const snapbackContainer = viewContainers.activitybar.find(
				(vc: any) => vc.id === "snapback",
			);

			expect(snapbackContainer).toBeDefined();
			expect(snapbackContainer.title).toBe("SnapBack");
			expect(snapbackContainer.icon).toBeDefined();
		});

		it("[DEMO] has main snapshots view", () => {
			const views = packageJson.contributes.views;

			expect(views.snapback).toBeDefined();
			const mainView = views.snapback.find(
				(v: any) => v.id === "snapback.main",
			);

			expect(mainView).toBeDefined();
			expect(mainView.name).toBe("Snapshots");
		});

		it("[DEMO] has protected files view in explorer", () => {
			const views = packageJson.contributes.views;

			expect(views.explorer).toBeDefined();
			const protectedFilesView = views.explorer.find(
				(v: any) => v.id === "snapback.protectedFiles",
			);

			expect(protectedFilesView).toBeDefined();
			expect(protectedFilesView.name).toBe("SnapBack Protected Files");
		});
	});

	describe("Keybindings", () => {
		const keybindings = packageJson.contributes.keybindings;

		it("[DEMO] has protect file keybinding", () => {
			const binding = keybindings.find(
				(kb: any) => kb.command === "snapback.protectFile",
			);

			expect(binding).toBeDefined();
			expect(binding.key).toBe("ctrl+alt+p");
			expect(binding.mac).toBe("cmd+alt+p");
		});

		it("[DEMO] has create snapshot keybinding", () => {
			const binding = keybindings.find(
				(kb: any) => kb.command === "snapback.createSnapshot",
			);

			expect(binding).toBeDefined();
			expect(binding.key).toBe("ctrl+alt+s");
			expect(binding.mac).toBe("cmd+alt+s");
		});

		it("[DEMO] has restore keybinding", () => {
			const binding = keybindings.find(
				(kb: any) => kb.command === "snapback.snapBack",
			);

			expect(binding).toBeDefined();
			expect(binding.key).toBe("ctrl+alt+z");
			expect(binding.mac).toBe("cmd+alt+z");
		});
	});

	describe("Walkthrough (Onboarding)", () => {
		const walkthroughs = packageJson.contributes.walkthroughs;

		it("[DEMO] has welcome walkthrough", () => {
			expect(walkthroughs).toBeDefined();
			expect(walkthroughs).toHaveLength(1);

			const welcomeWalkthrough = walkthroughs[0];
			expect(welcomeWalkthrough.id).toBe("snapback.welcome");
			expect(welcomeWalkthrough.title).toContain("Get Started");
		});

		it("[DEMO] has protection levels step", () => {
			const welcomeWalkthrough = walkthroughs[0];
			const step = welcomeWalkthrough.steps.find(
				(s: any) => s.id === "snapback.understand-levels",
			);

			expect(step).toBeDefined();
			expect(step.title).toContain("Protection");
			expect(step.description).toContain("Watch");
			expect(step.description).toContain("Warn");
			expect(step.description).toContain("Block");
		});

		it("[DEMO] has protect first file step", () => {
			const welcomeWalkthrough = walkthroughs[0];
			const step = welcomeWalkthrough.steps.find(
				(s: any) => s.id === "snapback.protect-first-file",
			);

			expect(step).toBeDefined();
			expect(step.completionEvents).toBeDefined();
			expect(step.completionEvents).toContain("onCommand:snapback.protectFile");
		});
	});

	describe("Dependencies", () => {
		it("[DEMO] has required SnapBack packages", () => {
			const deps = packageJson.dependencies;

			expect(deps["@snapback/contracts"]).toBeDefined();
			expect(deps["@snapback/core"]).toBeDefined();
			expect(deps["@snapback/sdk"]).toBeDefined();
			expect(deps["@snapback/events"]).toBeDefined();
			expect(deps["@snapback/infrastructure"]).toBeDefined();
		});

		it("[DEMO] has required development dependencies", () => {
			const devDeps = packageJson.devDependencies;

			expect(devDeps["@vscode/test-cli"]).toBeDefined();
			expect(devDeps["@vscode/test-electron"]).toBeDefined();
			expect(devDeps["@playwright/test"]).toBeDefined();
			expect(devDeps.vitest).toBeDefined();
		});
	});

	describe("Scripts", () => {
		const scripts = packageJson.scripts;

		it("[DEMO] has test scripts", () => {
			expect(scripts.test).toBeDefined();
			expect(scripts["test:unit"]).toBeDefined();
			expect(scripts["test:integration"]).toBeDefined();
			expect(scripts["test:e2e"]).toBeDefined();
		});

		it("[DEMO] has build scripts", () => {
			expect(scripts.compile).toBeDefined();
			expect(scripts.package).toBeDefined();
			expect(scripts["vscode:prepublish"]).toBeDefined();
		});

		it("[DEMO] has VSIX packaging scripts", () => {
			expect(scripts["package-vsce"]).toBeDefined();
			expect(scripts["package-vsix"]).toBeDefined();
		});
	});
});
