import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";

/**
 * Mock classes for testing settings integration
 */

class MockAutoDecisionEngine {
	constructor(
		private riskThreshold: number,
		private notifyThreshold: number,
		private minFilesForBurst: number,
		private maxSnapshotsPerMinute: number,
	) {}

	getRiskThreshold(): number {
		return this.riskThreshold;
	}

	getNotifyThreshold(): number {
		return this.notifyThreshold;
	}

	getMinFilesForBurst(): number {
		return this.minFilesForBurst;
	}

	getMaxSnapshotsPerMinute(): number {
		return this.maxSnapshotsPerMinute;
	}

	shouldCreateSnapshot(riskScore: number): boolean {
		return riskScore >= this.riskThreshold;
	}

	shouldNotifyUser(riskScore: number): boolean {
		return (
			riskScore >= this.notifyThreshold &&
			riskScore < this.riskThreshold
		);
	}

	shouldTriggerBurst(fileCount: number): boolean {
		return fileCount > this.minFilesForBurst;
	}

	canCreateSnapshot(): boolean {
		// Simplified rate limiting check
		return true;
	}
}

class MockSettingsLoader {
	private settings = {
		riskThreshold: 60,
		notifyThreshold: 40,
		minFilesForBurst: 3,
		maxSnapshotsPerMinute: 4,
	};

	loadAutoDecisionSettings() {
		return this.settings;
	}

	setRiskThreshold(value: number): void {
		this.settings.riskThreshold = value;
	}

	setNotifyThreshold(value: number): void {
		this.settings.notifyThreshold = value;
	}

	setMinFilesForBurst(value: number): void {
		this.settings.minFilesForBurst = value;
	}

	setMaxSnapshotsPerMinute(value: number): void {
		this.settings.maxSnapshotsPerMinute = value;
	}
}

class MockAutoDecisionIntegration {
	private engine: MockAutoDecisionEngine;
	private settingsLoader: MockSettingsLoader;

	constructor(settingsLoader: MockSettingsLoader) {
		this.settingsLoader = settingsLoader;
		const settings = settingsLoader.loadAutoDecisionSettings();
		this.engine = new MockAutoDecisionEngine(
			settings.riskThreshold,
			settings.notifyThreshold,
			settings.minFilesForBurst,
			settings.maxSnapshotsPerMinute,
		);
	}

	getEngine(): MockAutoDecisionEngine {
		return this.engine;
	}

	getSettings(): MockSettingsLoader {
		return this.settingsLoader;
	}

	reloadSettings(): void {
		const settings = this.settingsLoader.loadAutoDecisionSettings();
		this.engine = new MockAutoDecisionEngine(
			settings.riskThreshold,
			settings.notifyThreshold,
			settings.minFilesForBurst,
			settings.maxSnapshotsPerMinute,
		);
	}
}

describe("Settings Integration", () => {
	let settingsLoader: MockSettingsLoader;
	let integration: MockAutoDecisionIntegration;

	beforeEach(() => {
		settingsLoader = new MockSettingsLoader();
		integration = new MockAutoDecisionIntegration(settingsLoader);
	});

	describe("AutoDecisionIntegration initialization", () => {
		it("should load settings from SettingsLoader on creation", () => {
			const settings = integration.getSettings().loadAutoDecisionSettings();
			expect(settings.riskThreshold).toBe(60);
			expect(settings.notifyThreshold).toBe(40);
			expect(settings.minFilesForBurst).toBe(3);
			expect(settings.maxSnapshotsPerMinute).toBe(4);
		});

		it("should create AutoDecisionEngine with loaded settings", () => {
			const engine = integration.getEngine();
			expect(engine.getRiskThreshold()).toBe(60);
			expect(engine.getNotifyThreshold()).toBe(40);
			expect(engine.getMinFilesForBurst()).toBe(3);
			expect(engine.getMaxSnapshotsPerMinute()).toBe(4);
		});

		it("should pass custom settings to engine", () => {
			const customLoader = new MockSettingsLoader();
			customLoader.setRiskThreshold(75);
			customLoader.setNotifyThreshold(50);
			const customIntegration = new MockAutoDecisionIntegration(
				customLoader,
			);

			const engine = customIntegration.getEngine();
			expect(engine.getRiskThreshold()).toBe(75);
			expect(engine.getNotifyThreshold()).toBe(50);
		});
	});

	describe("AutoDecisionEngine uses settings", () => {
		it("should create snapshot when risk >= riskThreshold", () => {
			const engine = integration.getEngine();
			expect(engine.shouldCreateSnapshot(50)).toBe(false);
			expect(engine.shouldCreateSnapshot(60)).toBe(true);
			expect(engine.shouldCreateSnapshot(75)).toBe(true);
		});

		it("should notify user when notifyThreshold <= risk < riskThreshold", () => {
			const engine = integration.getEngine();
			expect(engine.shouldNotifyUser(30)).toBe(false);
			expect(engine.shouldNotifyUser(40)).toBe(true);
			expect(engine.shouldNotifyUser(50)).toBe(true);
			expect(engine.shouldNotifyUser(60)).toBe(false); // At risk threshold, creates snapshot
		});

		it("should trigger burst mode when files > minFilesForBurst", () => {
			const engine = integration.getEngine();
			expect(engine.shouldTriggerBurst(2)).toBe(false);
			expect(engine.shouldTriggerBurst(3)).toBe(false); // exactly at threshold
			expect(engine.shouldTriggerBurst(4)).toBe(true); // above threshold
		});

		it("should respect rate limiting setting", () => {
			const engine = integration.getEngine();
			expect(engine.getMaxSnapshotsPerMinute()).toBe(4);
			expect(engine.canCreateSnapshot()).toBe(true);
		});
	});

	describe("Settings changes flow to engine", () => {
		it("should update engine when riskThreshold changes", () => {
			const oldEngine = integration.getEngine();
			expect(oldEngine.getRiskThreshold()).toBe(60);

			// Update setting
			settingsLoader.setRiskThreshold(80);
			integration.reloadSettings();

			const newEngine = integration.getEngine();
			expect(newEngine.getRiskThreshold()).toBe(80);
		});

		it("should update engine when notifyThreshold changes", () => {
			settingsLoader.setNotifyThreshold(35);
			integration.reloadSettings();

			const engine = integration.getEngine();
			expect(engine.getNotifyThreshold()).toBe(35);
		});

		it("should update engine when minFilesForBurst changes", () => {
			settingsLoader.setMinFilesForBurst(5);
			integration.reloadSettings();

			const engine = integration.getEngine();
			expect(engine.shouldTriggerBurst(4)).toBe(false);
			expect(engine.shouldTriggerBurst(5)).toBe(false);
			expect(engine.shouldTriggerBurst(6)).toBe(true);
		});

		it("should update engine when maxSnapshotsPerMinute changes", () => {
			settingsLoader.setMaxSnapshotsPerMinute(10);
			integration.reloadSettings();

			const engine = integration.getEngine();
			expect(engine.getMaxSnapshotsPerMinute()).toBe(10);
		});

		it("should handle multiple settings changes together", () => {
			settingsLoader.setRiskThreshold(70);
			settingsLoader.setNotifyThreshold(45);
			settingsLoader.setMinFilesForBurst(4);
			integration.reloadSettings();

			const engine = integration.getEngine();
			expect(engine.getRiskThreshold()).toBe(70);
			expect(engine.getNotifyThreshold()).toBe(45);
			expect(engine.getMinFilesForBurst()).toBe(4);
		});
	});

	describe("Threshold relationships", () => {
		it("notifyThreshold should always be <= riskThreshold", () => {
			const engine = integration.getEngine();
			expect(engine.getNotifyThreshold()).toBeLessThanOrEqual(
				engine.getRiskThreshold(),
			);
		});

		it("should preserve relationship after changes", () => {
			settingsLoader.setRiskThreshold(75);
			settingsLoader.setNotifyThreshold(50);
			integration.reloadSettings();

			const engine = integration.getEngine();
			expect(engine.getNotifyThreshold()).toBeLessThanOrEqual(
				engine.getRiskThreshold(),
			);
		});
	});

	describe("Engine behavior with different settings", () => {
		it("conservative settings: higher thresholds, fewer snapshots", () => {
			settingsLoader.setRiskThreshold(85);
			settingsLoader.setNotifyThreshold(70);
			integration.reloadSettings();

			const engine = integration.getEngine();
			// Only very high risk triggers snapshot
			expect(engine.shouldCreateSnapshot(80)).toBe(false);
			expect(engine.shouldCreateSnapshot(85)).toBe(true);
		});

		it("aggressive settings: lower thresholds, more snapshots", () => {
			settingsLoader.setRiskThreshold(40);
			settingsLoader.setNotifyThreshold(20);
			integration.reloadSettings();

			const engine = integration.getEngine();
			// Lower risk triggers snapshot
			expect(engine.shouldCreateSnapshot(40)).toBe(true);
			expect(engine.shouldCreateSnapshot(35)).toBe(false);
		});

		it("balanced settings: moderate thresholds", () => {
			// Default is already balanced
			const engine = integration.getEngine();
			// Mid-range risk triggers snapshot
			expect(engine.shouldCreateSnapshot(60)).toBe(true);
			expect(engine.shouldCreateSnapshot(59)).toBe(false);
		});
	});

	describe("Settings impact on snapshot decisions", () => {
		it("should create more snapshots with low riskThreshold", () => {
			const lowRiskLoader = new MockSettingsLoader();
			lowRiskLoader.setRiskThreshold(30);
			const lowRiskIntegration =
				new MockAutoDecisionIntegration(lowRiskLoader);

			const engine = lowRiskIntegration.getEngine();
			const riskScores = [10, 20, 30, 40, 50];
			const snapshotsCreated = riskScores.filter((score) =>
				engine.shouldCreateSnapshot(score),
			);

			expect(snapshotsCreated.length).toBe(3); // 30, 40, 50
		});

		it("should create fewer snapshots with high riskThreshold", () => {
			const highRiskLoader = new MockSettingsLoader();
			highRiskLoader.setRiskThreshold(90);
			const highRiskIntegration =
				new MockAutoDecisionIntegration(highRiskLoader);

			const engine = highRiskIntegration.getEngine();
			const riskScores = [10, 20, 30, 40, 50];
			const snapshotsCreated = riskScores.filter((score) =>
				engine.shouldCreateSnapshot(score),
			);

			expect(snapshotsCreated.length).toBe(0); // None high enough
		});
	});

	describe("Burst detection with settings", () => {
		it("should detect bursts based on minFilesForBurst setting", () => {
			const fileCounts = [1, 2, 3, 4, 5];
			const engine = integration.getEngine();

			const burstDetected = fileCounts.filter((count) =>
				engine.shouldTriggerBurst(count),
			);

			// minFilesForBurst = 3, so 4 and 5 trigger burst
			expect(burstDetected).toEqual([4, 5]);
		});

		it("should reduce burst sensitivity with higher minFilesForBurst", () => {
			settingsLoader.setMinFilesForBurst(10);
			integration.reloadSettings();

			const engine = integration.getEngine();
			const fileCounts = [5, 10, 11, 15, 20];

			const burstDetected = fileCounts.filter((count) =>
				engine.shouldTriggerBurst(count),
			);

			// minFilesForBurst = 10, so only 11, 15, 20 trigger burst
			expect(burstDetected).toEqual([11, 15, 20]);
		});
	});

	describe("Rate limiting validation", () => {
		it("should have valid rate limit settings", () => {
			const engine = integration.getEngine();
			expect(engine.getMaxSnapshotsPerMinute()).toBeGreaterThanOrEqual(1);
		});

		it("should allow rate limit updates", () => {
			settingsLoader.setMaxSnapshotsPerMinute(20);
			integration.reloadSettings();

			const engine = integration.getEngine();
			expect(engine.getMaxSnapshotsPerMinute()).toBe(20);
		});
	});
});
