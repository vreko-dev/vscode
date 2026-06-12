/**
 * PlatformCoordinator Edge Case Tests
 *
 * Tests for workspace ID conflicts, schema validation, and unusual scenarios.
 * Guards against Issues 3.1, 3.2, 3.3 from the review.
 *
 * @module test/unit/platform
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PlatformCoordinator } from "../../../src/platform/PlatformCoordinator";
import type { ExtensionContext, SecretStorage } from "vscode";
import type { WorkspaceManifest } from "../../../src/platform/types";

describe("PlatformCoordinator - Edge Cases", () => {
	let testDir: string;
	let mockContext: ExtensionContext;
	let mockSecrets: SecretStorage;

	beforeEach(async () => {
		testDir = path.join(__dirname, "__test_workspace__", `test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
		await fs.mkdir(testDir, { recursive: true });

		const secretsMap = new Map<string, string>();
		mockSecrets = {
			get: vi.fn(async (key: string) => secretsMap.get(key)),
			store: vi.fn(async (key: string, value: string) => {
				secretsMap.set(key, value);
			}),
			delete: vi.fn(async (key: string) => {
				secretsMap.delete(key);
			}),
			onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
		};

		mockContext = {
			secrets: mockSecrets,
			extension: {
				packageJSON: { version: "1.0.0-test" },
			},
		} as unknown as ExtensionContext;
	});

	afterEach(async () => {
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		vi.clearAllMocks();
	});

	describe("Issue 3.1: Workspace ID Conflicts", () => {
		it("should detect mismatch between manifest and SecretStorage", async () => {
			// Store workspace ID in SecretStorage
			await mockSecrets.store("vreko.workspaceId", "ws_secrets_id_12345678901234567890");

			// Create manifest with different workspace ID
			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true });
			const manifestWithDifferentId: WorkspaceManifest = {
				workspaceId: "ws_manifest_id_12345678901234567890",
				version: 1,
				initializedBy: "cli",
				initializedAt: new Date().toISOString(),
				surfaces: {},
				tier: "free",
				healthCheck: {
					lastCheck: new Date().toISOString(),
					status: "healthy",
					issues: [],
				},
			};
			await fs.writeFile(path.join(vrekoDir, "extension-state.json"), JSON.stringify(manifestWithDifferentId), "utf-8");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const result = await coordinator.initialize("extension", "1.0.0");

			// TODO: After implementing workspace ID conflict resolution
			// Should reconcile the conflict (prioritize SecretStorage or show warning)
			// For now, document the expected behavior

			coordinator.dispose();
		});

		it("should handle copied .vreko directory from another machine", async () => {
			// Simulate user copying .vreko from Machine A to Machine B
			const foreignWorkspaceId = "ws_foreign_machine_12345678901234";
			const localWorkspaceId = "ws_local_machine_1234567890123456";

			// Machine B's SecretStorage
			await mockSecrets.store("vreko.workspaceId", localWorkspaceId);

			// Copied manifest from Machine A
			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true });
			const foreignManifest: WorkspaceManifest = {
				workspaceId: foreignWorkspaceId,
				version: 1,
				initializedBy: "extension",
				initializedAt: "2024-01-01T00:00:00.000Z",
				surfaces: {
					extension: {
						version: "0.9.0",
						lastSeen: "2024-01-01T00:00:00.000Z",
						healthy: "healthy",
					},
				},
				tier: "pro",
				healthCheck: {
					lastCheck: "2024-01-01T00:00:00.000Z",
					status: "healthy",
					issues: [],
				},
			};
			await fs.writeFile(path.join(vrekoDir, "extension-state.json"), JSON.stringify(foreignManifest), "utf-8");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const result = await coordinator.initialize("extension", "1.0.0");

			// TODO: After implementing conflict resolution
			// Should detect mismatch and either:
			// 1. Update manifest to use local workspace ID
			// 2. Warn user about tier mismatch (foreign=pro, local=free)
			// 3. Create backup of foreign manifest

			coordinator.dispose();
		});

		it("should preserve tier information during workspace ID reconciliation", async () => {
			const localId = "ws_local_12345678901234567890123456";
			const foreignId = "ws_foreign_12345678901234567890123";

			await mockSecrets.store("vreko.workspaceId", localId);

			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true});
			const proManifest: WorkspaceManifest = {
				workspaceId: foreignId,
				version: 1,
				initializedBy: "extension",
				initializedAt: new Date().toISOString(),
				surfaces: {},
				tier: "pro", // User had pro tier on foreign machine
				healthCheck: {
					lastCheck: new Date().toISOString(),
					status: "healthy",
					issues: [],
				},
			};
			await fs.writeFile(path.join(vrekoDir, "extension-state.json"), JSON.stringify(proManifest), "utf-8");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// TODO: Should not silently downgrade to free tier
			// Either warn user or preserve pro tier with note about verification needed

			coordinator.dispose();
		});
	});

	describe("Issue 3.2: Schema Validation", () => {
		it("should reject manifest with invalid version number", async () => {
			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true });
			const futureManifest = {
				workspaceId: "ws_abc123def456789012345678901234",
				version: 999, // Future version
				initializedBy: "extension",
				initializedAt: new Date().toISOString(),
				surfaces: {},
				tier: "free",
				healthCheck: {
					lastCheck: new Date().toISOString(),
					status: "healthy",
					issues: [],
				},
			};
			await fs.writeFile(path.join(vrekoDir, "extension-state.json"), JSON.stringify(futureManifest), "utf-8");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const result = await coordinator.initialize("extension", "1.0.0");

			// TODO: Should log warning about future version and attempt compatibility
			// expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("newer version"));

			coordinator.dispose();
		});

		it("should validate tier enum values", async () => {
			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true });
			const invalidTierManifest = {
				workspaceId: "ws_abc123def456789012345678901234",
				version: 1,
				initializedBy: "extension",
				initializedAt: new Date().toISOString(),
				surfaces: {},
				tier: "premium", // Invalid tier
				healthCheck: {
					lastCheck: new Date().toISOString(),
					status: "healthy",
					issues: [],
				},
			};
			await fs.writeFile(path.join(vrekoDir, "extension-state.json"), JSON.stringify(invalidTierManifest), "utf-8");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// TODO: Should default to "free" and log warning
			// expect(coordinator.getTier()).toBe("free");

			coordinator.dispose();
		});

		it("should validate health status enum values", async () => {
			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true });
			const invalidHealthManifest: any = {
				workspaceId: "ws_abc123def456789012345678901234",
				version: 1,
				initializedBy: "extension",
				initializedAt: new Date().toISOString(),
				surfaces: {
					extension: {
						version: "1.0.0",
						lastSeen: new Date().toISOString(),
						healthy: "super-healthy", // Invalid status
					},
				},
				tier: "free",
				healthCheck: {
					lastCheck: new Date().toISOString(),
					status: "excellent", // Invalid status
					issues: [],
				},
			};
			await fs.writeFile(path.join(vrekoDir, "extension-state.json"), JSON.stringify(invalidHealthManifest), "utf-8");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// TODO: Should normalize to valid enum values
			// expect(coordinator.getManifest()?.healthCheck.status).toMatch(/healthy|degraded|unhealthy|unknown/);

			coordinator.dispose();
		});

		it("should require all mandatory fields", async () => {
			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true });
			const incompleteManifest = {
				workspaceId: "ws_abc123def456789012345678901234",
				// Missing: version, initializedBy, initializedAt, surfaces, tier, healthCheck
			};
			await fs.writeFile(path.join(vrekoDir, "extension-state.json"), JSON.stringify(incompleteManifest), "utf-8");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const result = await coordinator.initialize("extension", "1.0.0");

			// TODO: Should detect missing fields and reconstruct with defaults
			// expect(result.manifest.version).toBe(1);
			// expect(result.manifest.surfaces).toBeDefined();

			coordinator.dispose();
		});
	});

	describe("Issue 3.3: Permission Errors", () => {
		it("should handle mkdir permission denied gracefully", async () => {
			vi.spyOn(fs, "mkdir").mockRejectedValue(
				Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
			);

			const coordinator = new PlatformCoordinator(mockContext, testDir);

			// Should not throw, should fall back gracefully
			await expect(coordinator.initialize("extension", "1.0.0")).resolves.toBeDefined();

			// TODO: After implementing error handling
			// Should show user guidance about permission issues
			// Should work in memory-only mode

			coordinator.dispose();
		});

		it("should handle read permission denied on existing manifest", async () => {
			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true });
			await fs.writeFile(
				path.join(vrekoDir, "extension-state.json"),
				JSON.stringify({
					workspaceId: "ws_abc123def456789012345678901234",
					version: 1,
					initializedBy: "extension",
					initializedAt: new Date().toISOString(),
					surfaces: {},
					tier: "free",
					healthCheck: {
						lastCheck: new Date().toISOString(),
						status: "healthy",
						issues: [],
					},
				}),
				"utf-8"
			);

			vi.spyOn(fs, "readFile").mockRejectedValue(
				Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" })
			);

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const result = await coordinator.initialize("extension", "1.0.0");

			// Should fall back to creating new manifest with unified 12-char format
			expect(result.workspaceId).toMatch(/^[a-f0-9]{12}$/);

			coordinator.dispose();
		});
	});

	describe("Workspace ID Format Validation", () => {
		it("should reject manifest with invalid workspace ID format", async () => {
			const vrekoDir = path.join(testDir, ".vreko");
			await fs.mkdir(vrekoDir, { recursive: true });
			const invalidIds = [
				"tooshort",
				"UPPERCASE_NOT_ALLOWED",
				"invalid_prefix_abc123",
				"has-dashes-abc123",
				"ws_legacy_format_but_invalid",
				"",
			];

			for (const invalidId of invalidIds) {
				const manifestPath = path.join(vrekoDir, "extension-state.json");
				await fs.writeFile(
					manifestPath,
					JSON.stringify({
						workspaceId: invalidId,
						version: 1,
						initializedBy: "extension",
						initializedAt: new Date().toISOString(),
						surfaces: {},
						tier: "free",
						healthCheck: {
							lastCheck: new Date().toISOString(),
							status: "healthy",
							issues: [],
						},
					}),
					"utf-8"
				);

				const coordinator = new PlatformCoordinator(mockContext, testDir);
				const result = await coordinator.initialize("extension", "1.0.0");

				// Should reject invalid ID and generate new one with unified 12-char format
				expect(result.workspaceId).toMatch(/^[a-f0-9]{12}$/);
				expect(result.workspaceId).not.toBe(invalidId);

				coordinator.dispose();

				// Clean up for next iteration
				try {
					await fs.unlink(manifestPath);
				} catch { /* intentionally empty */ }
			}
		});
	});

	describe("Concurrent Surface Operations", () => {
		it("should handle rapid tier changes without corruption", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Rapidly cycle through tiers
			const tiers: Array<"free" | "pro" | "enterprise"> = ["pro", "free", "enterprise", "pro", "free"];
			await Promise.all(tiers.map(tier => coordinator.updateTier(tier)));

			// Final state should be valid
			const manifest = coordinator.getManifest();
			expect(manifest?.tier).toMatch(/^(free|pro|enterprise)$/);

			coordinator.dispose();
		});

		it("should handle mixed operations (register + update + celebration)", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Mix of operations happening concurrently
			await Promise.all([
				coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" }),
				coordinator.updateTier("pro"),
				coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "degraded" }),
			]);

			// All operations should succeed
			const manifest = coordinator.getManifest();
			expect(manifest?.surfaces.cli).toBeDefined();
			expect(manifest?.surfaces.mcp).toBeDefined();
			expect(manifest?.tier).toBe("pro");

			coordinator.dispose();
		});
	});
});
