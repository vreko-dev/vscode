/**
 * @fileoverview TDD Tests for WelcomePanel - Fallback onboarding for 3rd party IDEs
 *
 * 4-Path Coverage:
 * - HAPPY: Panel creates successfully with correct HTML structure
 * - SAD: Panel handles missing resources gracefully
 * - EDGE: Panel handles rapid open/close cycles
 * - ERROR: Panel handles webview message errors
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { mockVscodeWindow } from "../setup";
import { WelcomePanel } from "../../../src/welcome/WelcomePanel";

describe("WelcomePanel", () => {
	let mockPanel: {
		webview: {
			html: string;
			onDidReceiveMessage: ReturnType<typeof vi.fn>;
			asWebviewUri: ReturnType<typeof vi.fn>;
			cspSource: string;
		};
		reveal: ReturnType<typeof vi.fn>;
		onDidDispose: ReturnType<typeof vi.fn>;
		dispose: ReturnType<typeof vi.fn>;
	};

	let mockExtensionUri: vscode.Uri;
	let disposeCallback: (() => void) | null = null;
	let messageCallback: ((message: unknown) => void) | null = null;

	beforeEach(() => {
		mockExtensionUri = {
			fsPath: "/test/extension",
			scheme: "file",
			path: "/test/extension",
		} as unknown as vscode.Uri;

		mockPanel = {
			webview: {
				html: "",
				onDidReceiveMessage: vi.fn((cb) => {
					messageCallback = cb;
					return { dispose: vi.fn() };
				}),
				asWebviewUri: vi.fn((uri) => uri),
				cspSource: "vscode-webview:",
			},
			reveal: vi.fn(),
			onDidDispose: vi.fn((cb) => {
				disposeCallback = cb;
				return { dispose: vi.fn() };
			}),
			dispose: vi.fn(),
		};

		// Override createWebviewPanel to return our mock panel
		vi.mocked(mockVscodeWindow.createWebviewPanel).mockReturnValue(
			mockPanel as unknown as vscode.WebviewPanel,
		);

		// Ensure commands.executeCommand returns a promise
		vi.mocked(vscode.commands.executeCommand).mockResolvedValue(undefined);

		// Ensure env.openExternal returns a promise
		vi.mocked(vscode.env.openExternal).mockResolvedValue(true);
	});

	afterEach(() => {
		WelcomePanel.kill();
		disposeCallback = null;
		messageCallback = null;
	});

	// ============================================
	// HAPPY PATH: Panel creates correctly
	// ============================================
	describe("Happy Path", () => {
		it("should create a webview panel with correct configuration", () => {
			WelcomePanel.createOrShow(mockExtensionUri);

			expect(mockVscodeWindow.createWebviewPanel).toHaveBeenCalledWith(
				"snapback.welcomePanel",
				"Welcome to SnapBack",
				vscode.ViewColumn.One,
				expect.objectContaining({
					enableScripts: true,
					retainContextWhenHidden: true,
				}),
			);
		});

		it("should set HTML content with required elements", () => {
			WelcomePanel.createOrShow(mockExtensionUri);

			const html = mockPanel.webview.html;

			// Must have doctype and basic structure
			expect(html).toContain("<!DOCTYPE html>");
			expect(html).toContain("<html");
			expect(html).toContain("</html>");

			// Must have SnapBack branding
			expect(html).toContain("SnapBack");

			// Must have protection levels
			expect(html).toContain("Watch");
			expect(html).toContain("Warn");
			expect(html).toContain("Block");

			// Must have action buttons
			expect(html).toContain("Protect");
		});

		it("should reuse existing panel if already open", () => {
			WelcomePanel.createOrShow(mockExtensionUri);
			WelcomePanel.createOrShow(mockExtensionUri);

			expect(mockVscodeWindow.createWebviewPanel).toHaveBeenCalledTimes(1);
			expect(mockPanel.reveal).toHaveBeenCalledTimes(1);
		});

		it("should handle 'protectFile' message correctly", () => {
			WelcomePanel.createOrShow(mockExtensionUri);

			// Simulate message from webview
			messageCallback?.({ command: "protectFile" });

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"snapback.protectFile",
			);
		});

		it("should handle 'openDocs' message correctly", () => {
			WelcomePanel.createOrShow(mockExtensionUri);

			messageCallback?.({ command: "openDocs" });

			expect(vscode.env.openExternal).toHaveBeenCalledWith(
				expect.objectContaining({
					toString: expect.any(Function),
				}),
			);
		});

		it("should handle 'dismiss' message by closing panel", () => {
			WelcomePanel.createOrShow(mockExtensionUri);

			messageCallback?.({ command: "dismiss" });

			expect(mockPanel.dispose).toHaveBeenCalled();
		});
	});

	// ============================================
	// SAD PATH: Handles missing resources
	// ============================================
	describe("Sad Path", () => {
		it("should handle panel creation failure gracefully", () => {
			vi.mocked(mockVscodeWindow.createWebviewPanel).mockImplementationOnce(() => {
				throw new Error("Panel creation failed");
			});

			expect(() => WelcomePanel.createOrShow(mockExtensionUri)).not.toThrow();
			expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Failed to open welcome panel"),
			);
		});

		it("should handle undefined extensionUri", () => {
			expect(() =>
				WelcomePanel.createOrShow(undefined as unknown as vscode.Uri),
			).not.toThrow();
			expect(mockVscodeWindow.showErrorMessage).toHaveBeenCalled();
		});
	});

	// ============================================
	// EDGE PATH: Rapid operations
	// ============================================
	describe("Edge Path", () => {
		it("should handle rapid open/close cycles without crashing", () => {
			for (let i = 0; i < 5; i++) {
				WelcomePanel.createOrShow(mockExtensionUri);
				disposeCallback?.();
			}

			// Should have created panel 5 times (each dispose clears it)
			expect(mockVscodeWindow.createWebviewPanel).toHaveBeenCalledTimes(5);
		});

		it("should clean up instance reference on dispose", () => {
			WelcomePanel.createOrShow(mockExtensionUri);

			// Trigger dispose callback
			disposeCallback?.();

			// Next create should make new panel
			WelcomePanel.createOrShow(mockExtensionUri);
			expect(mockVscodeWindow.createWebviewPanel).toHaveBeenCalledTimes(2);
		});

		it("should handle empty message from webview", () => {
			WelcomePanel.createOrShow(mockExtensionUri);

			// Should not throw on empty/null messages
			expect(() => messageCallback?.({})).not.toThrow();
			expect(() => messageCallback?.(null)).not.toThrow();
			expect(() => messageCallback?.({ command: "unknown" })).not.toThrow();
		});
	});

	// ============================================
	// ERROR PATH: Message handling errors
	// ============================================
	describe("Error Path", () => {
		it("should handle command execution failure gracefully", () => {
			vi.mocked(vscode.commands.executeCommand).mockRejectedValueOnce(
				new Error("Command failed"),
			);

			WelcomePanel.createOrShow(mockExtensionUri);

			// Should not throw even if command fails
			expect(() => messageCallback?.({ command: "protectFile" })).not.toThrow();
		});

		it("should handle openExternal failure gracefully", () => {
			vi.mocked(vscode.env.openExternal).mockRejectedValueOnce(
				new Error("Failed to open URL"),
			);

			WelcomePanel.createOrShow(mockExtensionUri);

			expect(() => messageCallback?.({ command: "openDocs" })).not.toThrow();
		});
	});

	// ============================================
	// Static methods
	// ============================================
	describe("Static Methods", () => {
		it("kill() should dispose existing panel", () => {
			WelcomePanel.createOrShow(mockExtensionUri);
			WelcomePanel.kill();

			expect(mockPanel.dispose).toHaveBeenCalled();
		});

		it("kill() should be safe to call when no panel exists", () => {
			expect(() => WelcomePanel.kill()).not.toThrow();
		});
	});
});
