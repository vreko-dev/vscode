import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConsentModal } from "../../src/onboarding/consent-modal";
import { VSCodeMockFactory } from "../helpers/vscodeHelpers";

// vscode mock provided by setup.ts

import * as vscode from "vscode";

describe("Consent Flow Tests", () => {
	let mockFactory: VSCodeMockFactory;
	let _mockContext: any;

	beforeEach(() => {
		mockFactory = VSCodeMockFactory.getInstance();
		_mockContext = mockFactory.createExtensionContext();

		// Clear all mocks before each test
		vi.clearAllMocks();
	});

	afterEach(() => {
		mockFactory.reset();
	});

	// consent-001: First-run consent flow persists
	it("should show consent modal and save settings when user consents", async () => {
		// Mock the showInformationMessage to return the consent button
		const mockShowInfo = vi
			.spyOn(vscode.window, "showInformationMessage")
			.mockResolvedValue("I Understand and Consent" as any);

		// Mock workspace configuration
		const mockConfig = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "snapback.privacy.consent") return false;
				return undefined;
			}),
			update: vi.fn().mockResolvedValue(undefined),
		};

		vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue(
			mockConfig as any,
		);

		// Test the consent flow
		const result = await ConsentModal.showConsentModal();

		// Verify the modal was shown
		expect(mockShowInfo).toHaveBeenCalled();

		// Verify consent was given
		expect(result).toBe(true);

		// Verify settings were saved
		expect(mockConfig.update).toHaveBeenCalledWith(
			"consent",
			true,
			vscode.ConfigurationTarget.Global,
		);
		expect(mockConfig.update).toHaveBeenCalledWith(
			"clipboard",
			true,
			vscode.ConfigurationTarget.Global,
		);
		expect(mockConfig.update).toHaveBeenCalledWith(
			"watcher",
			true,
			vscode.ConfigurationTarget.Global,
		);
		expect(mockConfig.update).toHaveBeenCalledWith(
			"gitWrapper",
			true,
			vscode.ConfigurationTarget.Global,
		);
		expect(mockConfig.update).toHaveBeenCalledWith(
			"lastReminded",
			undefined,
			vscode.ConfigurationTarget.Global,
		);
	});

	// consent-002: Remind later functionality works
	it("should save remind later setting and return false", async () => {
		// Mock the showInformationMessage to return the remind later button
		const mockShowInfo = vi
			.spyOn(vscode.window, "showInformationMessage")
			.mockResolvedValue("Remind Me Later" as any);

		// Mock workspace configuration
		const mockConfig = {
			get: vi.fn().mockImplementation((key: string) => {
				if (key === "snapback.privacy.consent") return false;
				return undefined;
			}),
			update: vi.fn().mockResolvedValue(undefined),
		};

		vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue(
			mockConfig as any,
		);

		// Test the consent flow
		const result = await ConsentModal.showConsentModal();

		// Verify the modal was shown
		expect(mockShowInfo).toHaveBeenCalled();

		// Verify consent was not given
		expect(result).toBe(false);

		// Verify settings were saved with remind later
		expect(mockConfig.update).toHaveBeenCalledWith(
			"consent",
			false,
			vscode.ConfigurationTarget.Global,
		);
		expect(mockConfig.update).toHaveBeenCalledWith(
			"clipboard",
			false,
			vscode.ConfigurationTarget.Global,
		);
		expect(mockConfig.update).toHaveBeenCalledWith(
			"watcher",
			false,
			vscode.ConfigurationTarget.Global,
		);
		expect(mockConfig.update).toHaveBeenCalledWith(
			"gitWrapper",
			false,
			vscode.ConfigurationTarget.Global,
		);
		expect(mockConfig.update).toHaveBeenCalled();
	});

	// consent-003: Feature toggles flip live
	it("should respect feature toggles based on consent", async () => {
		// Mock workspace configuration
		const mockGetConfiguration = vi.spyOn(vscode.workspace, "getConfiguration");

		// Test with consent given
		mockGetConfiguration.mockImplementation((section: string) => {
			if (section === "snapback.privacy") {
				return {
					get: vi.fn().mockImplementation((key: string) => {
						switch (key) {
							case "consent":
								return true;
							case "clipboard":
								return true;
							case "watcher":
								return true;
							case "gitWrapper":
								return true;
							default:
								return undefined;
						}
					}),
				} as any;
			}
			return {
				get: vi.fn(),
			} as any;
		});

		// Import the config module to test feature toggle functions
		const configModule = await import("../../src/config");

		// Verify features are enabled when consent is given
		expect(configModule.hasPrivacyConsent()).toBe(true);
		expect(configModule.isFeatureEnabled("clipboard")).toBe(true);
		expect(configModule.isFeatureEnabled("watcher")).toBe(true);
		expect(configModule.isFeatureEnabled("gitWrapper")).toBe(true);

		// Test with consent not given
		mockGetConfiguration.mockImplementation((section: string) => {
			if (section === "snapback.privacy") {
				return {
					get: vi.fn().mockImplementation((key: string) => {
						switch (key) {
							case "consent":
								return false;
							case "clipboard":
								return true; // Even if individually enabled
							case "watcher":
								return true;
							case "gitWrapper":
								return true;
							default:
								return undefined;
						}
					}),
				} as any;
			}
			return {
				get: vi.fn(),
			} as any;
		});

		// Verify features are disabled when no overall consent
		expect(configModule.hasPrivacyConsent()).toBe(false);
		expect(configModule.isFeatureEnabled("clipboard")).toBe(false);
		expect(configModule.isFeatureEnabled("watcher")).toBe(false);
		expect(configModule.isFeatureEnabled("gitWrapper")).toBe(false);
	});

	// consent-004: UI actions complete within ui_action_ms
	it("should complete consent flow within performance budget", async () => {
		// Mock the showInformationMessage to return immediately
		vi.spyOn(vscode.window, "showInformationMessage").mockResolvedValue(
			"I Understand and Consent" as any,
		);

		// Mock workspace configuration
		const mockConfig = {
			get: vi.fn().mockReturnValue(false),
			update: vi.fn().mockResolvedValue(undefined),
		};

		vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue(
			mockConfig as any,
		);

		// Measure performance
		const startTime = performance.now();
		await ConsentModal.showConsentModal();
		const endTime = performance.now();

		const duration = endTime - startTime;

		// Verify performance budget (should be well under 300ms)
		expect(duration).toBeLessThan(300);
	});
});
