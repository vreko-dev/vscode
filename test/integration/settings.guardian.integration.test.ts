import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	dispose,
	getConfig,
	getPluginEnabled,
	getThresholds,
	initializeConfig,
} from "../../src/config/runtime";

// Mock vscode module
const mockWorkspaceConfig = {
	get: vi.fn(),
};

vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(() => mockWorkspaceConfig),
		onDidChangeConfiguration: vi.fn(),
	},
	Disposable: class {
		dispose() {}
	},
}));

describe("Settings honored", () => {
	beforeEach(() => {
		// Clear any existing state
		vi.clearAllMocks();

		// Set up default mock values
		mockWorkspaceConfig.get.mockImplementation((key, defaultValue) => {
			const defaults: Record<string, any> = {
				enabled: true,
				warnThreshold: 5,
				blockThreshold: 8,
				protectionLevel: "warn",
				"plugins.secretDetection": true,
				"plugins.mockReplacement": true,
				"plugins.phantomDependency": true,
				"thresholds.warn": 6,
				"thresholds.block": 8,
			};
			return defaults[key] ?? defaultValue;
		});
	});

	afterEach(() => {
		// Clean up after each test
		dispose();
	});

	it("should initialize config with default values", () => {
		initializeConfig();

		const config = getConfig();

		expect(config.enabled).toBe(true);
		expect(config.warnThreshold).toBe(5);
		expect(config.blockThreshold).toBe(8);
		expect(config.protectionLevel).toBe("warn");
		expect(config.plugins.secretDetection).toBe(true);
		expect(config.plugins.mockReplacement).toBe(true);
		expect(config.plugins.phantomDependency).toBe(true);
		expect(config.thresholds.warn).toBe(6);
		expect(config.thresholds.block).toBe(8);
	});

	it("should get thresholds correctly", () => {
		initializeConfig();

		const thresholds = getThresholds();

		expect(thresholds.warn).toBe(6);
		expect(thresholds.block).toBe(8);
	});

	it("should get plugin enabled status correctly", () => {
		initializeConfig();

		expect(getPluginEnabled("secretDetection")).toBe(true);
		expect(getPluginEnabled("mockReplacement")).toBe(true);
		expect(getPluginEnabled("phantomDependency")).toBe(true);
		expect(getPluginEnabled("unknownPlugin")).toBe(false);
	});

	it("should use custom values when provided", () => {
		// Set up custom mock values
		mockWorkspaceConfig.get.mockImplementation((key, defaultValue) => {
			const customValues: Record<string, any> = {
				enabled: false,
				warnThreshold: 3,
				blockThreshold: 7,
				protectionLevel: "block",
				"plugins.secretDetection": false,
				"plugins.mockReplacement": false,
				"plugins.phantomDependency": false,
				"thresholds.warn": 4,
				"thresholds.block": 7,
			};
			return customValues[key] ?? defaultValue;
		});

		initializeConfig();

		const config = getConfig();

		expect(config.enabled).toBe(false);
		expect(config.warnThreshold).toBe(3);
		expect(config.blockThreshold).toBe(7);
		expect(config.protectionLevel).toBe("block");
		expect(config.plugins.secretDetection).toBe(false);
		expect(config.plugins.mockReplacement).toBe(false);
		expect(config.plugins.phantomDependency).toBe(false);
		expect(config.thresholds.warn).toBe(4);
		expect(config.thresholds.block).toBe(7);

		expect(getPluginEnabled("secretDetection")).toBe(false);
		expect(getPluginEnabled("mockReplacement")).toBe(false);
		expect(getPluginEnabled("phantomDependency")).toBe(false);

		const thresholds = getThresholds();
		expect(thresholds.warn).toBe(4);
		expect(thresholds.block).toBe(7);
	});
});
