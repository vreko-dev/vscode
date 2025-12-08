/**
 * AuthService Unit Tests
 *
 * Tests for the authentication service covering:
 * - Token lifecycle (get, set, refresh, clear)
 * - Automatic token refresh on expiration
 * - User and workspace information retrieval
 * - Error handling and edge cases
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "@vscode/auth/AuthService";
import type {
	CredentialsManager,
	ExtensionCredentials,
} from "@vscode/auth/credentials";

// Mock logger
vi.mock("@snapback/infrastructure", () => ({
	logger: {
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("AuthService", () => {
	let authService: AuthService;
	let credentialsManager: CredentialsManager;

	const mockToken = {
		accessToken:
			"eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiMTIzIn0.sig",
		refreshToken: "refresh_token_123",
		expiresAt: Date.now() + 900000, // 15 minutes
		user: {
			id: "user_123",
			email: "user@example.com",
			name: "Test User",
		},
		workspace: {
			id: "ws_456",
			name: "Test Workspace",
			plan: "free" as const,
		},
	};

	beforeEach(() => {
		// Reset all mocks
		vi.clearAllMocks();

		// Create mock credentials manager
		credentialsManager = {
			getCredentials: vi.fn(),
			setCredentials: vi.fn(),
			clearCredentials: vi.fn(),
			isAccessTokenExpired: vi.fn(),
		};

		// Create auth service
		authService = new AuthService(
			credentialsManager,
			"https://api.snapback.dev",
		);
	});

	describe("getToken", () => {
		it("should return null when not authenticated", async () => {
			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(null);

			const token = await authService.getToken();

			expect(token).toBeNull();
		});

		it("should return token when authenticated and not expired", async () => {
			const credentials: ExtensionCredentials = {
				accessToken: mockToken.accessToken,
				refreshToken: mockToken.refreshToken,
				expiresAt: mockToken.expiresAt,
				user: mockToken.user,
				workspace: mockToken.workspace,
			};

			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(
				credentials,
			);
			vi.mocked(credentialsManager.isAccessTokenExpired).mockResolvedValueOnce(
				false,
			);

			const token = await authService.getToken();

			expect(token).toEqual(mockToken);
		});
	});

	describe("setToken", () => {
		it("should store token in credentials manager", async () => {
			await authService.setToken(mockToken);

			expect(credentialsManager.setCredentials).toHaveBeenCalledWith({
				accessToken: mockToken.accessToken,
				refreshToken: mockToken.refreshToken,
				expiresAt: mockToken.expiresAt,
				user: mockToken.user,
				workspace: mockToken.workspace,
			});
		});

		it("should handle token without workspace", async () => {
			const tokenWithoutWorkspace = { ...mockToken, workspace: undefined };

			await authService.setToken(tokenWithoutWorkspace);

			expect(credentialsManager.setCredentials).toHaveBeenCalledWith({
				accessToken: mockToken.accessToken,
				refreshToken: mockToken.refreshToken,
				expiresAt: mockToken.expiresAt,
				user: mockToken.user,
				workspace: undefined,
			});
		});
	});

	describe("refreshToken", () => {
		it("should refresh access token successfully", async () => {
			const credentials: ExtensionCredentials = {
				accessToken: "old_token",
				refreshToken: mockToken.refreshToken,
				expiresAt: Date.now() - 1000,
				user: mockToken.user,
				workspace: mockToken.workspace,
			};

			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(
				credentials,
			);

			global.fetch = vi.fn(() =>
				Promise.resolve(
					new Response(
						JSON.stringify({
							accessToken: mockToken.accessToken,
							expiresIn: 900,
						}),
						{ status: 200, headers: { "Content-Type": "application/json" } },
					),
				),
			) as any;

			await authService.refreshToken();

			expect(credentialsManager.setCredentials).toHaveBeenCalledWith(
				expect.objectContaining({
					accessToken: mockToken.accessToken,
					expiresAt: expect.any(Number),
				}),
			);
		});

		it("should clear credentials when refresh fails", async () => {
			const credentials: ExtensionCredentials = {
				accessToken: "old_token",
				refreshToken: "invalid_token",
				expiresAt: Date.now(),
				user: mockToken.user,
				workspace: mockToken.workspace,
			};

			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(
				credentials,
			);

			global.fetch = vi.fn(() =>
				Promise.resolve(
					new Response(JSON.stringify({ error: "invalid_grant" }), {
						status: 401,
						headers: { "Content-Type": "application/json" },
					}),
				),
			) as any;

			await expect(authService.refreshToken()).rejects.toThrow(
				"Session expired - please sign in again",
			);
			expect(credentialsManager.clearCredentials).toHaveBeenCalled();
		});

		it("should throw when no credentials to refresh", async () => {
			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(null);

			await expect(authService.refreshToken()).rejects.toThrow(
				"No credentials to refresh",
			);
		});
	});

	describe("clearToken", () => {
		it("should clear credentials", async () => {
			await authService.clearToken();

			expect(credentialsManager.clearCredentials).toHaveBeenCalled();
		});
	});

	describe("isAuthenticated", () => {
		it("should return true when credentials exist", async () => {
			const credentials: ExtensionCredentials = {
				accessToken: mockToken.accessToken,
				refreshToken: mockToken.refreshToken,
				expiresAt: mockToken.expiresAt,
				user: mockToken.user,
				workspace: mockToken.workspace,
			};

			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(
				credentials,
			);

			const isAuth = await authService.isAuthenticated();

			expect(isAuth).toBe(true);
		});

		it("should return false when not authenticated", async () => {
			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(null);

			const isAuth = await authService.isAuthenticated();

			expect(isAuth).toBe(false);
		});
	});

	describe("getCurrentUser", () => {
		it("should return current user info when authenticated", async () => {
			const credentials: ExtensionCredentials = {
				accessToken: mockToken.accessToken,
				refreshToken: mockToken.refreshToken,
				expiresAt: mockToken.expiresAt,
				user: mockToken.user,
				workspace: mockToken.workspace,
			};

			vi.mocked(credentialsManager.getCredentials)
				.mockResolvedValueOnce(credentials)
				.mockResolvedValueOnce(credentials);
			vi.mocked(credentialsManager.isAccessTokenExpired).mockResolvedValueOnce(
				false,
			);

			const user = await authService.getCurrentUser();

			expect(user).toEqual(mockToken.user);
		});

		it("should return null when not authenticated", async () => {
			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(null);

			const user = await authService.getCurrentUser();

			expect(user).toBeNull();
		});
	});

	describe("getCurrentWorkspace", () => {
		it("should return workspace info when authenticated", async () => {
			const credentials: ExtensionCredentials = {
				accessToken: mockToken.accessToken,
				refreshToken: mockToken.refreshToken,
				expiresAt: mockToken.expiresAt,
				user: mockToken.user,
				workspace: mockToken.workspace,
			};

			vi.mocked(credentialsManager.getCredentials)
				.mockResolvedValueOnce(credentials)
				.mockResolvedValueOnce(credentials);
			vi.mocked(credentialsManager.isAccessTokenExpired).mockResolvedValueOnce(
				false,
			);

			const workspace = await authService.getCurrentWorkspace();

			expect(workspace).toEqual(mockToken.workspace);
		});

		it("should return null when workspace not available", async () => {
			const credentials: ExtensionCredentials = {
				accessToken: mockToken.accessToken,
				refreshToken: mockToken.refreshToken,
				expiresAt: mockToken.expiresAt,
				user: mockToken.user,
				workspace: undefined,
			};

			vi.mocked(credentialsManager.getCredentials)
				.mockResolvedValueOnce(credentials)
				.mockResolvedValueOnce(credentials);
			vi.mocked(credentialsManager.isAccessTokenExpired).mockResolvedValueOnce(
				false,
			);

			const workspace = await authService.getCurrentWorkspace();

			expect(workspace).toBeNull();
		});

		it("should return null when not authenticated", async () => {
			vi.mocked(credentialsManager.getCredentials).mockResolvedValueOnce(null);

			const workspace = await authService.getCurrentWorkspace();

			expect(workspace).toBeNull();
		});
	});
});
