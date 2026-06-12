/**
 * Workspace ID Unit Tests (TDD)
 *
 * RED-GREEN-REFACTOR approach for workspace ID management
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearWorkspaceId,
	generateWorkspaceId,
	getOrCreateWorkspaceId,
	getWorkspaceId,
	isValidWorkspaceId,
	WORKSPACE_ID_LENGTH,
	WORKSPACE_ID_PATTERN,
} from "../../../src/auth/workspace-id";

// Mock secrets storage
function createMockSecrets(initialStore: Map<string, string> = new Map()) {
	const store = new Map(initialStore);
	return {
		get: vi.fn(async (key: string) => store.get(key)),
		store: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
		delete: vi.fn(async (key: string) => {
			store.delete(key);
		}),
		onDidChange: vi.fn(),
		_getStore: () => store, // Test helper
	};
}

describe("workspace-id", () => {
	describe("generateWorkspaceId", () => {
		it("should generate ID with ws_ prefix", () => {
			const id = generateWorkspaceId();
			expect(id.startsWith("ws_")).toBe(true);
		});

		it("should generate ID with correct length (35 chars)", () => {
			const id = generateWorkspaceId();
			expect(id.length).toBe(WORKSPACE_ID_LENGTH);
		});

		it("should generate ID matching pattern ws_[32 hex chars]", () => {
			const id = generateWorkspaceId();
			expect(WORKSPACE_ID_PATTERN.test(id)).toBe(true);
		});

		it("should generate unique IDs", () => {
			const ids = new Set<string>();
			for (let i = 0; i < 100; i++) {
				ids.add(generateWorkspaceId());
			}
			// All 100 IDs should be unique
			expect(ids.size).toBe(100);
		});

		it("should use only lowercase hex characters after prefix", () => {
			const id = generateWorkspaceId();
			const hexPart = id.slice(3); // Remove 'ws_'
			expect(hexPart).toMatch(/^[a-f0-9]{32}$/);
		});
	});

	describe("isValidWorkspaceId", () => {
		it("should return true for valid workspace ID", () => {
			const validId = "ws_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
			expect(isValidWorkspaceId(validId)).toBe(true);
		});

		it("should return false for undefined", () => {
			expect(isValidWorkspaceId(undefined)).toBe(false);
		});

		it("should return false for empty string", () => {
			expect(isValidWorkspaceId("")).toBe(false);
		});

		it("should return false for missing prefix", () => {
			expect(isValidWorkspaceId("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")).toBe(false);
		});

		it("should return false for wrong prefix", () => {
			expect(isValidWorkspaceId("wk_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")).toBe(false);
		});

		it("should return false for too short hex part", () => {
			expect(isValidWorkspaceId("ws_a1b2c3d4")).toBe(false);
		});

		it("should return false for too long hex part", () => {
			expect(isValidWorkspaceId("ws_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6abcd")).toBe(false);
		});

		it("should return false for uppercase hex characters", () => {
			expect(isValidWorkspaceId("ws_A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6")).toBe(false);
		});

		it("should return false for non-hex characters", () => {
			expect(isValidWorkspaceId("ws_g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6")).toBe(false);
		});
	});

	describe("getOrCreateWorkspaceId", () => {
		let mockSecrets: ReturnType<typeof createMockSecrets>;

		beforeEach(() => {
			mockSecrets = createMockSecrets();
		});

		it("should create new workspace ID if none exists", async () => {
			const id = await getOrCreateWorkspaceId(mockSecrets as any);

			expect(isValidWorkspaceId(id)).toBe(true);
			expect(mockSecrets.store).toHaveBeenCalledWith("vreko.workspaceId", id);
		});

		it("should return existing workspace ID if valid", async () => {
			const existingId = "ws_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
			mockSecrets = createMockSecrets(new Map([["vreko.workspaceId", existingId]]));

			const id = await getOrCreateWorkspaceId(mockSecrets as any);

			expect(id).toBe(existingId);
			expect(mockSecrets.store).not.toHaveBeenCalled();
		});

		it("should regenerate if existing ID is invalid", async () => {
			const invalidId = "invalid_workspace_id";
			mockSecrets = createMockSecrets(new Map([["vreko.workspaceId", invalidId]]));

			const id = await getOrCreateWorkspaceId(mockSecrets as any);

			expect(isValidWorkspaceId(id)).toBe(true);
			expect(id).not.toBe(invalidId);
			expect(mockSecrets.store).toHaveBeenCalled();
		});

		it("should be idempotent - return same ID on subsequent calls", async () => {
			const id1 = await getOrCreateWorkspaceId(mockSecrets as any);
			const id2 = await getOrCreateWorkspaceId(mockSecrets as any);

			expect(id1).toBe(id2);
		});
	});

	describe("getWorkspaceId", () => {
		it("should return existing valid workspace ID", async () => {
			const existingId = "ws_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
			const mockSecrets = createMockSecrets(new Map([["vreko.workspaceId", existingId]]));

			const id = await getWorkspaceId(mockSecrets as any);

			expect(id).toBe(existingId);
		});

		it("should return undefined if no workspace ID exists", async () => {
			const mockSecrets = createMockSecrets();

			const id = await getWorkspaceId(mockSecrets as any);

			expect(id).toBeUndefined();
		});

		it("should return undefined if workspace ID is invalid", async () => {
			const mockSecrets = createMockSecrets(new Map([["vreko.workspaceId", "invalid"]]));

			const id = await getWorkspaceId(mockSecrets as any);

			expect(id).toBeUndefined();
		});

		it("should NOT create new ID (unlike getOrCreateWorkspaceId)", async () => {
			const mockSecrets = createMockSecrets();

			await getWorkspaceId(mockSecrets as any);

			expect(mockSecrets.store).not.toHaveBeenCalled();
		});
	});

	describe("clearWorkspaceId", () => {
		it("should delete workspace ID from storage", async () => {
			const mockSecrets = createMockSecrets(
				new Map([["vreko.workspaceId", "ws_a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"]]),
			);

			await clearWorkspaceId(mockSecrets as any);

			expect(mockSecrets.delete).toHaveBeenCalledWith("vreko.workspaceId");
		});

		it("should not throw if workspace ID doesn't exist", async () => {
			const mockSecrets = createMockSecrets();

			await expect(clearWorkspaceId(mockSecrets as any)).resolves.not.toThrow();
		});
	});

	describe("Security properties", () => {
		it("should have 128 bits of entropy (16 bytes = 32 hex chars)", () => {
			// ws_ (3 chars) + 32 hex chars = 35 chars total
			// 32 hex chars = 16 bytes = 128 bits
			const id = generateWorkspaceId();
			const hexPart = id.slice(3);
			expect(hexPart.length).toBe(32); // 32 hex = 128 bits
		});

		it("should generate cryptographically random IDs", () => {
			// Generate many IDs and check distribution
			const ids = [];
			for (let i = 0; i < 1000; i++) {
				ids.push(generateWorkspaceId());
			}

			// No duplicates in 1000 IDs (collision probability ~= 0)
			const unique = new Set(ids);
			expect(unique.size).toBe(1000);

			// All characters should appear roughly equally
			const charCounts = new Map<string, number>();
			for (const id of ids) {
				const hex = id.slice(3);
				for (const char of hex) {
					charCounts.set(char, (charCounts.get(char) || 0) + 1);
				}
			}

			// Each hex char (0-9, a-f) should appear roughly 1/16 of the time
			// With 1000 IDs * 32 chars = 32000 chars total
			// Expected per char: 32000 / 16 = 2000 (±400 for statistical variance)
			for (const count of charCounts.values()) {
				expect(count).toBeGreaterThan(1500);
				expect(count).toBeLessThan(2500);
			}
		});
	});
});
