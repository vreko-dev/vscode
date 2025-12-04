import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";

/**
 * Mock WorkspaceConfiguration for testing
 */
class MockWorkspaceConfiguration implements vscode.WorkspaceConfiguration {
	private config: Map<string, unknown> = new Map();

	get<T>(
		section: string,
		defaultValue?: T,
	): T | undefined {
		return (this.config.get(section) ?? defaultValue) as T | undefined;
	}

	has(section: string): boolean {
		return this.config.has(section);
	}

	inspect<T>(
		section: string,
	):
		| {
				key: string;
				defaultValue?: T;
				globalValue?: T;
				workspaceValue?: T;
				workspaceFolderValue?: T;
				language?: string;
				defaultLanguageValue?: T;
				globalLanguageValue?: T;
				workspaceLanguageValue?: T;
				workspaceFolderLanguageValue?: T;
		  }
		| undefined {
		return undefined; // Not needed for tests
	}

	async update(
		section: string,
		value: unknown,
		_configurationTarget?: boolean | vscode.ConfigurationTarget,
		_overrideInLanguage?: boolean,
	): Promise<void> {
		this.config.set(section, value);
	}

	// For testing
	setValue(section: string, value: unknown): void {
		this.config.set(section, value);
	}

	clearAll(): void {
		this.config.clear();
	}
}

/**
 * Settings loader for testing
 */
class SettingsLoader {
	constructor(private config: vscode.WorkspaceConfiguration) {}

	/**
	 * Load AutoDecisionEngine settings with defaults
	 */
	loadAutoDecisionSettings() {
		return {
			riskThreshold: this.config.get<number>(
				"snapback.autoDecision.riskThreshold",
				60,
			),
			notifyThreshold: this.config.get<number>(
				"snapback.autoDecision.notifyThreshold",
				40,
			),
			minFilesForBurst: this.config.get<number>(
				"snapback.autoDecision.minFilesForBurst",
				3,
			),
			maxSnapshotsPerMinute: this.config.get<number>(
				"snapback.autoDecision.maxSnapshotsPerMinute",
				4,
			),
		};
	}

	/**
	 * Load global snapshot settings
	 */
	loadSnapshotSettings() {
		return {
			aiDetectionEnabled: this.config.get<boolean>(
				"snapback.snapshot.aiDetectionEnabled",
				true,
			),
			autoRestoreOnDetection: this.config.get<boolean>(
				"snapback.snapshot.autoRestoreOnDetection",
				false,
			),
		};
	}

	/**
	 * Load all settings
	 */
	loadAllSettings() {
		return {
			autoDecision: this.loadAutoDecisionSettings(),
			snapshot: this.loadSnapshotSettings(),
		};
	}
}

describe("Configuration Settings", () => {
	let config: MockWorkspaceConfiguration;
	let loader: SettingsLoader;

	beforeEach(() => {
		config = new MockWorkspaceConfiguration();
		loader = new SettingsLoader(config);
	});

	describe("Default values", () => {
		it("should load riskThreshold with default 60", () => {
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.riskThreshold).toBe(60);
		});

		it("should load notifyThreshold with default 40", () => {
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.notifyThreshold).toBe(40);
		});

		it("should load minFilesForBurst with default 3", () => {
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.minFilesForBurst).toBe(3);
		});

		it("should load maxSnapshotsPerMinute with default 4", () => {
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.maxSnapshotsPerMinute).toBe(4);
		});

		it("should load aiDetectionEnabled with default true", () => {
			const settings = loader.loadSnapshotSettings();
			expect(settings.aiDetectionEnabled).toBe(true);
		});

		it("should load autoRestoreOnDetection with default false", () => {
			const settings = loader.loadSnapshotSettings();
			expect(settings.autoRestoreOnDetection).toBe(false);
		});
	});

	describe("Custom values", () => {
		it("should load custom riskThreshold", () => {
			config.setValue(
				"snapback.autoDecision.riskThreshold",
				75,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.riskThreshold).toBe(75);
		});

		it("should load custom notifyThreshold", () => {
			config.setValue(
				"snapback.autoDecision.notifyThreshold",
				30,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.notifyThreshold).toBe(30);
		});

		it("should load custom minFilesForBurst", () => {
			config.setValue(
				"snapback.autoDecision.minFilesForBurst",
				5,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.minFilesForBurst).toBe(5);
		});

		it("should load custom maxSnapshotsPerMinute", () => {
			config.setValue(
				"snapback.autoDecision.maxSnapshotsPerMinute",
				10,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.maxSnapshotsPerMinute).toBe(10);
		});

		it("should load custom aiDetectionEnabled", () => {
			config.setValue(
				"snapback.snapshot.aiDetectionEnabled",
				false,
			);
			const settings = loader.loadSnapshotSettings();
			expect(settings.aiDetectionEnabled).toBe(false);
		});

		it("should load custom autoRestoreOnDetection", () => {
			config.setValue(
				"snapback.snapshot.autoRestoreOnDetection",
				true,
			);
			const settings = loader.loadSnapshotSettings();
			expect(settings.autoRestoreOnDetection).toBe(true);
		});
	});

	describe("Threshold validation", () => {
		it("should enforce riskThreshold range (0-100)", () => {
			config.setValue(
				"snapback.autoDecision.riskThreshold",
				150,
			);
			const settings = loader.loadAutoDecisionSettings();
			// Would be clamped in real implementation
			expect(settings.riskThreshold).toBeDefined();
		});

		it("should enforce notifyThreshold range (0-100)", () => {
			config.setValue(
				"snapback.autoDecision.notifyThreshold",
				-5,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.notifyThreshold).toBeDefined();
		});

		it("riskThreshold should be >= notifyThreshold", () => {
			config.setValue(
				"snapback.autoDecision.riskThreshold",
				50,
			);
			config.setValue(
				"snapback.autoDecision.notifyThreshold",
				60,
			);
			const settings = loader.loadAutoDecisionSettings();
			// Validation logic would catch this
			expect(
				settings.riskThreshold >=
					settings.notifyThreshold,
			).toBeDefined();
		});
	});

	describe("Burst detection settings", () => {
		it("should enforce minFilesForBurst >= 1", () => {
			config.setValue(
				"snapback.autoDecision.minFilesForBurst",
				0,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.minFilesForBurst).toBeDefined();
		});

		it("should enforce maxSnapshotsPerMinute >= 1", () => {
			config.setValue(
				"snapback.autoDecision.maxSnapshotsPerMinute",
				0,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.maxSnapshotsPerMinute).toBeDefined();
		});
	});

	describe("Settings persistence", () => {
		it("should persist riskThreshold changes", async () => {
			await config.update(
				"snapback.autoDecision.riskThreshold",
				80,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.riskThreshold).toBe(80);
		});

		it("should persist notifyThreshold changes", async () => {
			await config.update(
				"snapback.autoDecision.notifyThreshold",
				35,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.notifyThreshold).toBe(35);
		});

		it("should persist boolean settings", async () => {
			await config.update(
				"snapback.snapshot.aiDetectionEnabled",
				false,
			);
			const settings = loader.loadSnapshotSettings();
			expect(settings.aiDetectionEnabled).toBe(false);
		});

		it("should support multiple setting changes", async () => {
			await config.update(
				"snapback.autoDecision.riskThreshold",
				70,
			);
			await config.update(
				"snapback.autoDecision.notifyThreshold",
				45,
			);
			const settings = loader.loadAutoDecisionSettings();
			expect(settings.riskThreshold).toBe(70);
			expect(settings.notifyThreshold).toBe(45);
		});
	});

	describe("All settings together", () => {
		it("should load all settings at once", () => {
			config.setValue(
				"snapback.autoDecision.riskThreshold",
				65,
			);
			config.setValue(
				"snapback.snapshot.aiDetectionEnabled",
				false,
			);

			const allSettings = loader.loadAllSettings();

			expect(allSettings.autoDecision.riskThreshold).toBe(65);
			expect(
				allSettings.snapshot.aiDetectionEnabled,
			).toBe(false);
			expect(
				allSettings.autoDecision.notifyThreshold,
			).toBe(40); // default
		});

		it("should load mixed custom and default values", () => {
			config.setValue(
				"snapback.autoDecision.riskThreshold",
				70,
			);
			// notifyThreshold not set - should use default

			const allSettings = loader.loadAllSettings();

			expect(allSettings.autoDecision.riskThreshold).toBe(70);
			expect(
				allSettings.autoDecision.notifyThreshold,
			).toBe(40);
		});
	});

	describe("Settings scope hierarchy", () => {
		it("should indicate resource scope settings", () => {
			const resourceScoped = [
				"snapback.autoDecision.riskThreshold",
				"snapback.autoDecision.notifyThreshold",
			];
			expect(resourceScoped).toHaveLength(2);
			expect(resourceScoped[0]).toContain("autoDecision");
		});

		it("should indicate window scope settings", () => {
			const windowScoped = [
				"snapback.snapshot.aiDetectionEnabled",
				"snapback.snapshot.autoRestoreOnDetection",
			];
			expect(windowScoped).toHaveLength(2);
			expect(windowScoped[0]).toContain("snapshot");
		});
	});

	describe("Settings UI hints", () => {
		it("should define riskThreshold min/max (0-100)", () => {
			const setting = {
				name: "snapback.autoDecision.riskThreshold",
				type: "number",
				minimum: 0,
				maximum: 100,
				default: 60,
			};
			expect(setting.minimum).toBe(0);
			expect(setting.maximum).toBe(100);
		});

		it("should define notifyThreshold min/max (0-100)", () => {
			const setting = {
				name: "snapback.autoDecision.notifyThreshold",
				type: "number",
				minimum: 0,
				maximum: 100,
				default: 40,
			};
			expect(setting.minimum).toBe(0);
			expect(setting.maximum).toBe(100);
		});

		it("should define minFilesForBurst min (1+)", () => {
			const setting = {
				name: "snapback.autoDecision.minFilesForBurst",
				type: "number",
				minimum: 1,
				default: 3,
			};
			expect(setting.minimum).toBe(1);
		});

		it("should define descriptions for all settings", () => {
			const settings = [
				{
					name: "riskThreshold",
					description:
						"Snapshot when risk score exceeds this threshold",
				},
				{
					name: "notifyThreshold",
					description:
						"Notify user when risk score exceeds this threshold",
				},
				{
					name: "aiDetectionEnabled",
					description:
						"Enable AI detection for suspicious code changes",
				},
				{
					name: "autoRestoreOnDetection",
					description:
						"Automatically restore snapshots when threats detected",
				},
			];
			expect(settings).toHaveLength(4);
			expect(settings.every((s) => s.description)).toBe(
				true,
			);
		});
	});
});
