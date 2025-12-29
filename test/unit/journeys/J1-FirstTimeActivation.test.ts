/**
 * J1 First-Time Activation Journey Tests
 *
 * Spec Reference: unified_ux_spec_UPDATED.md §3.2
 *
 * Edge Cases Covered:
 *   - J1-E07: Corporate proxy blocks OAuth (✅ Implemented)
 *   - J1-E10: VS Code Remote (SSH/Container/WSL) (✅ Implemented)
 *   - J1-E03: Network drops mid-OAuth (Partial)
 *   - J1-E04: VS Code restarts during activation (Partial)
 *
 * TDD Approach: Tests written FIRST (RED), then implementation (GREEN), then refactor.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock vscode module
vi.mock("vscode", () => ({
	window: {
		showInputBox: vi.fn(),
		showWarningMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		showQuickPick: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	commands: {
		executeCommand: vi.fn(),
	},
	env: {
		remoteName: undefined,
		uiKind: 1, // Desktop
		asExternalUri: vi.fn((uri: unknown) => Promise.resolve(uri)),
		openExternal: vi.fn(() => Promise.resolve(true)),
	},
	Uri: {
		parse: (str: string) => ({ toString: () => str, fsPath: str }),
	},
	EventEmitter: vi.fn(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace" } }],
	},
	authentication: {
		registerAuthenticationProvider: vi.fn(() => ({ dispose: vi.fn() })),
	},
	UIKind: {
		Desktop: 1,
		Web: 2,
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

import * as vscode from "vscode";
import {
	ManualTokenAuthProvider,
	type ManualTokenAuthResult,
} from "../../../src/auth/ManualTokenAuthProvider";
import {
	RemoteEnvironmentDetector,
	type RemoteEnvironmentInfo,
} from "../../../src/auth/RemoteEnvironmentDetector";

describe("J1 First-Time Activation Journey", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("J1-E07: Corporate proxy blocks OAuth - Manual Token Entry", () => {
		let manualTokenAuth: ManualTokenAuthProvider;

		beforeEach(() => {
			manualTokenAuth = new ManualTokenAuthProvider("https://api.snapback.dev");
		});

		it("should detect proxy environment from environment variables", async () => {
			// Setup: Set proxy environment variables
			const originalEnv = process.env;
			process.env = {
				...originalEnv,
				HTTPS_PROXY: "http://proxy.corp.example.com:8080",
			};

			const result = await manualTokenAuth.detectProxyEnvironment();

			expect(result.hasProxy).toBe(true);
			expect(result.proxyUrl).toBe("http://proxy.corp.example.com:8080");
			expect(result.likelyBlocked).toBe(true);

			// Cleanup
			process.env = originalEnv;
		});

		it("should not report proxy when NO_PROXY includes snapback.dev", async () => {
			const originalEnv = process.env;
			process.env = {
				...originalEnv,
				HTTPS_PROXY: "http://proxy.corp.example.com:8080",
				NO_PROXY: "localhost,snapback.dev,.internal",
			};

			const result = await manualTokenAuth.detectProxyEnvironment();

			expect(result.hasProxy).toBe(true);
			expect(result.likelyBlocked).toBe(false);

			process.env = originalEnv;
		});

		it("should prompt for manual token with validation", async () => {
			vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(
				"sb_test_token_12345678901234567890",
			);

			const token = await manualTokenAuth.promptForManualToken();

			expect(token).toBe("sb_test_token_12345678901234567890");
			expect(vscode.window.showInputBox).toHaveBeenCalledWith(
				expect.objectContaining({
					title: "SnapBack Manual Authentication",
					password: true,
					validateInput: expect.any(Function),
				}),
			);
		});

		it("should validate token format in input box", async () => {
			let validateFn: ((value: string) => string | undefined) | undefined;

			vi.mocked(vscode.window.showInputBox).mockImplementation(async (options) => {
				validateFn = options?.validateInput as
					| ((value: string) => string | undefined)
					| undefined;
				return "sb_valid_token_1234567890";
			});

			await manualTokenAuth.promptForManualToken();

			// Test validation function
			expect(validateFn).toBeDefined();
			expect(validateFn!("")).toBe("Token is required");
			expect(validateFn!("invalid")).toBe('Token should start with "sb_"');
			expect(validateFn!("sb_short")).toBe("Token appears too short");
			expect(validateFn!("sb_valid_token_1234567890")).toBeUndefined();
		});

		it("should validate token with API successfully", async () => {
			// Mock successful API response
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					user_id: "user_123",
					email: "test@example.com",
				}),
			});

			const result = await manualTokenAuth.validateToken("sb_valid_token_12345");

			expect(result.success).toBe(true);
			expect(result.session?.accessToken).toBe("sb_valid_token_12345");
			expect(result.session?.account.id).toBe("user_123");
			expect(result.session?.account.label).toBe("test@example.com");
		});

		it("should handle invalid token response", async () => {
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: false,
				status: 401,
				statusText: "Unauthorized",
			});

			const result = await manualTokenAuth.validateToken("sb_invalid_token");

			expect(result.success).toBe(false);
			expect(result.error).toBe("Invalid or expired token");
		});

		it("should handle network errors during validation", async () => {
			global.fetch = vi.fn().mockRejectedValueOnce(new Error("Network timeout"));

			const result = await manualTokenAuth.validateToken("sb_valid_token");

			expect(result.success).toBe(false);
			expect(result.error).toContain("Network error");
		});

		it("should complete full manual auth flow", async () => {
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce("Enter Token" as never);
			vi.mocked(vscode.window.showInputBox).mockResolvedValueOnce(
				"sb_valid_token_12345678901234567890",
			);
			global.fetch = vi.fn().mockResolvedValueOnce({
				ok: true,
				json: async () => ({
					user_id: "user_123",
					email: "test@example.com",
				}),
			});

			const result = await manualTokenAuth.authenticate();

			expect(result.success).toBe(true);
			expect(result.session?.accessToken).toBe("sb_valid_token_12345678901234567890");
		});

		it("should allow user to retry OAuth instead", async () => {
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce("Try OAuth Again" as never);

			const result = await manualTokenAuth.authenticate();

			expect(result.success).toBe(false);
			expect(result.error).toBe("User chose to retry OAuth");
		});

		it("should offer manual auth when proxy likely blocks", async () => {
			const originalEnv = process.env;
			process.env = {
				...originalEnv,
				HTTPS_PROXY: "http://proxy.corp.example.com:8080",
			};

			const shouldOffer = await manualTokenAuth.shouldOfferManualAuth();

			expect(shouldOffer).toBe(true);

			process.env = originalEnv;
		});
	});

	describe("J1-E10: VS Code Remote (SSH/Container/WSL)", () => {
		let remoteDetector: RemoteEnvironmentDetector;

		beforeEach(() => {
			remoteDetector = new RemoteEnvironmentDetector();
			// Reset remoteName
			vi.mocked(vscode.env).remoteName = undefined;
		});

		it("should detect SSH remote environment", () => {
			vi.mocked(vscode.env).remoteName = "ssh-remote";

			const result = remoteDetector.detect();

			expect(result.isRemote).toBe(true);
			expect(result.remoteType).toBe("ssh");
			expect(result.limitations).toContain("OAuth browser redirect may not work");
			expect(result.workarounds).toContain("Use manual token authentication");
		});

		it("should detect container remote environment", () => {
			vi.mocked(vscode.env).remoteName = "dev-container";

			const result = remoteDetector.detect();

			expect(result.isRemote).toBe(true);
			expect(result.remoteType).toBe("container");
			expect(result.limitations).toContain("Storage is ephemeral unless volume mounted");
		});

		it("should detect WSL remote environment", () => {
			vi.mocked(vscode.env).remoteName = "wsl";

			const result = remoteDetector.detect();

			expect(result.isRemote).toBe(true);
			expect(result.remoteType).toBe("wsl");
			expect(result.limitations).toContain("OAuth browser may open in Windows instead of WSL");
		});

		it("should report not remote for local environment", () => {
			vi.mocked(vscode.env).remoteName = undefined;

			const result = remoteDetector.detect();

			expect(result.isRemote).toBe(false);
			expect(result.limitations).toHaveLength(0);
		});

		it("should report OAuth not available for SSH", () => {
			vi.mocked(vscode.env).remoteName = "ssh-remote";

			const canUse = remoteDetector.canUseOAuth();

			expect(canUse).toBe(false);
		});

		it("should report OAuth available for WSL", () => {
			vi.mocked(vscode.env).remoteName = "wsl";

			const canUse = remoteDetector.canUseOAuth();

			expect(canUse).toBe(true);
		});

		it("should report OAuth available for local", () => {
			vi.mocked(vscode.env).remoteName = undefined;

			const canUse = remoteDetector.canUseOAuth();

			expect(canUse).toBe(true);
		});

		it("should show remote limitations warning", async () => {
			vi.mocked(vscode.env).remoteName = "ssh-remote";
			vi.mocked(vscode.window.showWarningMessage).mockResolvedValueOnce("Use Manual Auth" as never);

			const result = await remoteDetector.showRemoteLimitationsWarning();

			expect(result).toBe("manual");
			expect(vscode.window.showWarningMessage).toHaveBeenCalledWith(
				expect.stringContaining("ssh"),
				expect.objectContaining({ modal: true }),
				"Continue",
				"Use Manual Auth",
				"Cancel",
			);
		});

		it("should get recommendations for SSH environment", () => {
			vi.mocked(vscode.env).remoteName = "ssh-remote";

			const recommendations = remoteDetector.getRecommendations();

			expect(recommendations).toContain("Use manual token authentication");
			expect(recommendations.length).toBeGreaterThan(0);
		});

		it("should identify ephemeral storage in containers", () => {
			vi.mocked(vscode.env).remoteName = "dev-container";

			const isEphemeral = remoteDetector.isStoragePotentiallyEphemeral();

			expect(isEphemeral).toBe(true);
		});

		it("should not identify ephemeral storage in SSH", () => {
			vi.mocked(vscode.env).remoteName = "ssh-remote";

			const isEphemeral = remoteDetector.isStoragePotentiallyEphemeral();

			expect(isEphemeral).toBe(false);
		});
	});
});
