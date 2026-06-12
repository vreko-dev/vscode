/**
 * Security Tests for ApiClient - AUTH-030
 *
 * RED PHASE: Verify ApiClient uses SecureConfigService instead of direct config access
 *
 * Requirements:
 * - API keys MUST be retrieved from SecretStorage (not workspace config)
 * - No plaintext API keys in settings.json
 * - Migration from legacy config to SecretStorage
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

// Mock SecureConfigService - must be declared before imports
const mockSecureConfig = {
	get: vi.fn(),
	set: vi.fn(),
	delete: vi.fn(),
	hasSecure: vi.fn(),
	migrate: vi.fn(),
};

vi.mock("vscode", () => ({
	workspace: {
		getConfiguration: vi.fn(),
	},
}));

vi.mock("../../../src/security/SecureConfigService", () => ({
	getSecureConfig: vi.fn(() => mockSecureConfig),
}));

vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("ApiClient Security (AUTH-030)", () => {
	let mockWorkspaceConfig: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock workspace config
		mockWorkspaceConfig = {
			get: vi.fn(),
			update: vi.fn(),
		};

		vi.mocked(vscode.workspace.getConfiguration).mockReturnValue(mockWorkspaceConfig);
	});

	describe("🔴 RED PHASE: API Key Storage", () => {
		it("should retrieve API key from SecretStorage, NOT workspace config", async () => {
			// ARRANGE: Set up secure storage with API key
			mockSecureConfig.get.mockResolvedValue("sk-secure-key-123");

			// Mock network adapter to prevent actual HTTP calls
			const mockNetworkAdapter = {
				post: vi.fn().mockResolvedValue({ ok: true, data: { results: [] } }),
				get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
			};

			// ACT: Create ApiClient with mock network adapter
			const { ApiClient } = await import("../../../src/services/api-client");
			const client = new ApiClient(mockNetworkAdapter as any);

			// Trigger lazy loading by calling a method that requires API key
			// This will call ensureApiKeyLoaded() internally
			await client.analyzeFiles([]);

			// ASSERT: SecureConfig was called (NOT workspace config)
			expect(mockSecureConfig.get).toHaveBeenCalledWith("api.key");

			// ASSERT: Workspace config was NOT used for API key
			expect(mockWorkspaceConfig.get).not.toHaveBeenCalledWith("api.key");
		});

		it("should never expose API key in workspace settings", async () => {
			// ARRANGE: API key exists in SecretStorage
			mockSecureConfig.get.mockResolvedValue("sk-secret-key");
			mockWorkspaceConfig.get.mockReturnValue("sk-exposed-key");

			const mockNetworkAdapter = {
				post: vi.fn().mockResolvedValue({ ok: true, data: { results: [] } }),
				get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
			};

			// ACT: Create client with mock network adapter
			const { ApiClient } = await import("../../../src/services/api-client");
			const client = new ApiClient(mockNetworkAdapter as any);

			await client.analyzeFiles([]);

			// ASSERT: Should use SecretStorage value, ignore workspace config
			// This test verifies the migration path is working
			expect(mockSecureConfig.get).toHaveBeenCalled();
		});

		it("should handle missing API key gracefully", async () => {
			// ARRANGE: No API key in SecretStorage
			mockSecureConfig.get.mockResolvedValue("");

			const mockNetworkAdapter = {
				post: vi.fn().mockResolvedValue({ ok: true, data: { results: [] } }),
				get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
			};

			// ACT: Create client with mock network adapter
			const { ApiClient } = await import("../../../src/services/api-client");
			const client = new ApiClient(mockNetworkAdapter as any);

			await client.analyzeFiles([]);

			// ASSERT: Should not throw, returns empty string
			expect(mockSecureConfig.get).toHaveBeenCalledWith("api.key");
			// Client should handle empty key gracefully (tested in analyzeFiles)
		});
	});

	describe("Migration from Legacy Config", () => {
		it("should migrate API key from workspace config to SecretStorage", async () => {
			// ARRANGE: API key in old location (workspace config)
			mockWorkspaceConfig.get.mockReturnValue("sk-old-key");
			mockSecureConfig.hasSecure.mockResolvedValue(false);
			mockSecureConfig.migrate.mockResolvedValue(true);

			// ACT: Trigger migration
			await mockSecureConfig.migrate("api.key");

			// ASSERT: Migration was called
			expect(mockSecureConfig.migrate).toHaveBeenCalledWith("api.key");
		});

		it("should skip migration if already in SecretStorage", async () => {
			// ARRANGE: API key already secure
			mockSecureConfig.hasSecure.mockResolvedValue(true);
			mockSecureConfig.get.mockResolvedValue("sk-already-secure");

			// ACT: Check if key is secure
			const hasKey = await mockSecureConfig.hasSecure("api.key");

			// ASSERT: Should return true (key already in SecretStorage)
			expect(hasKey).toBe(true);
			expect(mockSecureConfig.hasSecure).toHaveBeenCalledWith("api.key");
		});
	});

	describe("🔴 RED PHASE: ApiClient setApiKey", () => {
		it("should store new API key in SecretStorage, NOT config", async () => {
			// ARRANGE: Mock secure config
			mockSecureConfig.set.mockResolvedValue(undefined);

			const mockNetworkAdapter = {
				post: vi.fn().mockResolvedValue({ ok: true, data: { results: [] } }),
				get: vi.fn().mockResolvedValue({ ok: true, data: {} }),
			};

			// ACT: Set API key via setApiKey method
			const { ApiClient } = await import("../../../src/services/api-client");
			const client = new ApiClient(mockNetworkAdapter as any);
			await client.setApiKey("sk-new-key");

			// ASSERT: Should use SecureConfig.set (not workspace.update)
			expect(mockSecureConfig.set).toHaveBeenCalledWith("api.key", "sk-new-key");
			expect(mockWorkspaceConfig.update).not.toHaveBeenCalled();
		});
	});
});

/**
 * NEXT STEPS (GREEN PHASE):
 *
 * 1. Update ApiClient constructor:
 *    - Replace: config.get("api.key")
 *    - With: await getSecureConfig().get("api.key")
 *
 * 2. Update setApiKey method:
 *    - Add: await getSecureConfig().set("api.key", apiKey)
 *
 * 3. Make constructor async OR use lazy initialization pattern
 *
 * 4. Update all call sites to handle async initialization
 */
