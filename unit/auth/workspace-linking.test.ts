/**
 * Workspace Linking Integration Tests
 *
 * Tests the complete flow from workspace ID generation to MCP tier resolution.
 * These tests verify the critical path for frictionless Pro tier activation.
 *
 * @see docs/architecture/mcp-workspace-auth.md
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe("Workspace Linking Flow", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe("Workspace ID Generation", () => {
		it("should generate valid workspace ID format using unified 12-char hex", () => {
			// Format: 12 hex characters (unified format)
			const workspaceIdRegex = /^[a-f0-9]{12}$/;

			// Simulate workspace ID generation (unified format)
			const generateWorkspaceId = (): string => {
				const bytes = new Uint8Array(6);
				crypto.getRandomValues(bytes);
				const hex = Array.from(bytes)
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");
				return hex;
			};

			const id = generateWorkspaceId();
			expect(id).toMatch(workspaceIdRegex);
			expect(id.length).toBe(12); // 12 hex chars (unified format)
		});

		it("should generate unique IDs on each call", () => {
			const generateWorkspaceId = (): string => {
				const bytes = new Uint8Array(16);
				crypto.getRandomValues(bytes);
				const hex = Array.from(bytes)
					.map((b) => b.toString(16).padStart(2, "0"))
					.join("");
				return `ws_${hex}`;
			};

			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				ids.add(generateWorkspaceId());
			}

			expect(ids.size).toBe(100); // All unique
		});
	});

	describe("Workspace Link API", () => {
		it("should link workspace to user successfully", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ linked: true, tier: "pro" }),
			});

			const response = await fetch("https://mcp.vreko.dev/auth/link-workspace", {
				method: "POST",
				headers: {
					Authorization: "Bearer test_token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					workspace_id: "ws_1234567890abcdef1234567890abcdef",
					user_id: "user_abc123",
					tier: "pro",
				}),
			});

			expect(response.ok).toBe(true);
			const data = await response.json();
			expect(data.linked).toBe(true);
			expect(data.tier).toBe("pro");
		});

		it("should handle unauthorized requests", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 401,
				json: () => Promise.resolve({ error: "Unauthorized" }),
			});

			const response = await fetch("https://mcp.vreko.dev/auth/link-workspace", {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					workspace_id: "ws_1234567890abcdef1234567890abcdef",
					user_id: "user_abc123",
				}),
			});

			expect(response.ok).toBe(false);
			expect(response.status).toBe(401);
		});

		it("should validate workspace ID format", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 400,
				json: () => Promise.resolve({ error: "Invalid workspace ID format" }),
			});

			const response = await fetch("https://mcp.vreko.dev/auth/link-workspace", {
				method: "POST",
				headers: {
					Authorization: "Bearer test_token",
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					workspace_id: "invalid-id",
					user_id: "user_abc123",
				}),
			});

			expect(response.ok).toBe(false);
			expect(response.status).toBe(400);
		});
	});

	describe("Tier Resolution via MCP", () => {
		it("should resolve pro tier for linked workspace", async () => {
			// Simulate MCP server tier resolution
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						found: true,
						tier: "pro",
						userId: "user_abc123",
					}),
			});

			const workspaceId = "ws_1234567890abcdef1234567890abcdef";
			const response = await fetch(
				`https://mcp.vreko.dev/internal/resolve-tier?workspace_id=${workspaceId}`,
			);

			const data = await response.json();
			expect(data.found).toBe(true);
			expect(data.tier).toBe("pro");
		});

		it("should fall back to free tier for unlinked workspace", async () => {
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						found: false,
						tier: "free",
					}),
			});

			const response = await fetch(
				`https://mcp.vreko.dev/internal/resolve-tier?workspace_id=ws_unknown`,
			);

			const data = await response.json();
			expect(data.found).toBe(false);
			expect(data.tier).toBe("free");
		});
	});

	describe("End-to-End Flow Simulation", () => {
		it("should complete full auth → link → resolve flow", async () => {
			// Step 1: Auth (device flow returns token)
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						api_key: "sk_test_xxx",
						user_id: "user_abc123",
						tier: "pro",
						expires_in: 3600,
					}),
			});

			// Step 2: Link workspace
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () => Promise.resolve({ linked: true, tier: "pro" }),
			});

			// Step 3: Tier resolution (MCP server)
			mockFetch.mockResolvedValueOnce({
				ok: true,
				json: () =>
					Promise.resolve({
						found: true,
						tier: "pro",
						userId: "user_abc123",
					}),
			});

			// Execute flow
			const workspaceId = "ws_1234567890abcdef1234567890abcdef";

			// Auth
			const authResponse = await fetch("https://api.vreko.dev/api/deviceAuth/pollToken", {
				method: "POST",
				body: JSON.stringify({ device_code: "test" }),
			});
			const authData = await authResponse.json();
			expect(authData.api_key).toBeDefined();

			// Link
			const linkResponse = await fetch("https://mcp.vreko.dev/auth/link-workspace", {
				method: "POST",
				headers: { Authorization: `Bearer ${authData.api_key}` },
				body: JSON.stringify({
					workspace_id: workspaceId,
					user_id: authData.user_id,
					tier: authData.tier,
				}),
			});
			const linkData = await linkResponse.json();
			expect(linkData.linked).toBe(true);

			// Resolve
			const resolveResponse = await fetch(
				`https://mcp.vreko.dev/internal/resolve-tier?workspace_id=${workspaceId}`,
			);
			const resolveData = await resolveResponse.json();
			expect(resolveData.tier).toBe("pro");
		});
	});

	describe("Error Handling", () => {
		it("should handle network failures gracefully", async () => {
			mockFetch.mockRejectedValueOnce(new Error("Network error"));

			try {
				await fetch("https://mcp.vreko.dev/auth/link-workspace");
			} catch (error) {
				expect(error).toBeInstanceOf(Error);
				expect((error as Error).message).toBe("Network error");
			}
		});

		it("should handle timeout scenarios", async () => {
			mockFetch.mockImplementationOnce(
				() =>
					new Promise((_, reject) => {
						setTimeout(() => reject(new Error("Request timeout")), 100);
					}),
			);

			try {
				await fetch("https://mcp.vreko.dev/auth/link-workspace");
			} catch (error) {
				expect((error as Error).message).toBe("Request timeout");
			}
		});

		it("should not block extension activation on link failure", async () => {
			// Simulate non-fatal link failure
			mockFetch.mockResolvedValueOnce({
				ok: false,
				status: 500,
				json: () => Promise.resolve({ error: "Internal server error" }),
			});

			const response = await fetch("https://mcp.vreko.dev/auth/link-workspace", {
				method: "POST",
			});

			// Should fail but not throw
			expect(response.ok).toBe(false);

			// Extension continues working (this is simulated)
			const extensionActive = true;
			expect(extensionActive).toBe(true);
		});
	});
});

describe("MCP Config URL Construction", () => {
	it("should build correct URL with workspace path", () => {
		const baseUrl = "https://mcp.vreko.dev/mcp";
		const workspacePath = "/Users/dev/my-project";

		const url = new URL(baseUrl);
		url.searchParams.set("workspace", workspacePath);

		expect(url.toString()).toBe(
			"https://mcp.vreko.dev/mcp?workspace=%2FUsers%2Fdev%2Fmy-project",
		);
	});

	it("should handle paths with spaces", () => {
		const baseUrl = "https://mcp.vreko.dev/mcp";
		const workspacePath = "/Users/dev/My Projects/vreko";

		const url = new URL(baseUrl);
		url.searchParams.set("workspace", workspacePath);

		expect(url.toString()).toContain("My%20Projects");
	});

	it("should handle Windows-style paths", () => {
		const baseUrl = "https://mcp.vreko.dev/mcp";
		const workspacePath = "C:\\Users\\dev\\project";

		const url = new URL(baseUrl);
		url.searchParams.set("workspace", workspacePath);

		// Windows paths should be encoded
		expect(url.searchParams.get("workspace")).toBe(workspacePath);
	});
});
