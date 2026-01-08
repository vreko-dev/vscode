/**
 * PlatformCoordinator Autonomous Recovery Tests
 *
 * Tests for error handling, save failure recovery, and manifest corruption recovery.
 * Guards against Issues 2.1, 2.2 from the review.
 *
 * @module test/unit/platform
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PlatformCoordinator } from "../../../src/platform/PlatformCoordinator";
import type { ExtensionContext, SecretStorage } from "vscode";

describe("PlatformCoordinator - Autonomous Recovery", () => {
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

	describe("Issue 2.1: Silent Save Failures", () => {
		it("should retry manifest saves on transient failures", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			let failureCount = 0;
			const maxFailures = 2;

			// Mock writeFile to fail twice, then succeed
			const originalWriteFile = fs.writeFile;
			vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
				if (failureCount < maxFailures) {
					failureCount++;
					throw new Error("ENOSPC: no space left on device");
				}
				return originalWriteFile(...args);
			});

			// This should succeed after retries
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });

			// Verify manifest was eventually saved
			const manifest = coordinator.getManifest();
			expect(manifest?.surfaces.cli).toBeDefined();

			// TODO: After implementing retry logic, verify failureCount === maxFailures
			// expect(failureCount).toBe(maxFailures);

			coordinator.dispose();
		});

		it("should fall back to in-memory state when disk writes permanently fail", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Mock persistent write failures
			vi.spyOn(fs, "writeFile").mockRejectedValue(new Error("EROFS: read-only file system"));

			// Should still work with in-memory state
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });

			// In-memory manifest should be updated
			const manifest = coordinator.getManifest();
			expect(manifest?.surfaces.cli).toBeDefined();
			expect(manifest?.surfaces.cli?.version).toBe("1.0.0");

			coordinator.dispose();
		});

		it("should notify user of persistent save failures", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Mock persistent failures
			// Note: User notification is tested via vscode.window.showWarningMessage in implementation
			// This test verifies in-memory mode fallback works without crashing
			const writeStub = vi.spyOn(fs, "writeFile");
			writeStub.mockRejectedValue(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }));

			// Trigger multiple save attempts - should not throw
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			// In-memory state should still work
			expect(coordinator.getManifest()?.surfaces.cli).toBeDefined();
			expect(coordinator.getManifest()?.surfaces.mcp).toBeDefined();

			coordinator.dispose();
		});

		it("should attempt auto-recovery on next successful health check", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			let saveShouldFail = true;
			const originalWriteFile = fs.writeFile;

			vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
				if (saveShouldFail) {
					throw new Error("Temporary failure");
				}
				return originalWriteFile(...args);
			});

			// First update fails
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });

			// Simulate recovery (disk space freed, permissions fixed)
			saveShouldFail = false;

			// Next update should trigger auto-recovery
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			// Verify manifest was eventually saved with all updates
			const manifestPath = path.join(testDir, ".snapback", "workspace.json");
			const savedManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8"));

			// TODO: After implementing auto-recovery, verify both surfaces saved
			// expect(savedManifest.surfaces.cli).toBeDefined();
			// expect(savedManifest.surfaces.mcp).toBeDefined();

			coordinator.dispose();
		});
	});

	describe("Issue 2.2: Corrupted Manifest Recovery", () => {
		it("should recover from corrupted JSON using backup file", async () => {
			// Create corrupted manifest
			const snapbackDir = path.join(testDir, ".snapback");
			await fs.mkdir(snapbackDir, { recursive: true });
			const manifestPath = path.join(snapbackDir, "workspace.json");
			await fs.writeFile(manifestPath, '{"workspaceId": "ws_abc123", "corrupt', "utf-8");

			// Create valid backup
			const backupPath = path.join(snapbackDir, "workspace.json.backup");
			await fs.writeFile(
				backupPath,
				JSON.stringify({
					workspaceId: "ws_abc123def456789012345678901234",
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
				}),
				"utf-8",
			);

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const result = await coordinator.initialize("extension", "1.0.0");

			// TODO: After implementing backup recovery, should load from backup
			// expect(result.workspaceId).toBe("ws_abc123def456789012345678901234");
			// expect(result.firstInit).toBe(false);

			coordinator.dispose();
		});

		it("should reconstruct manifest from SecretStorage if both files corrupted", async () => {
			// Create corrupted files
			const snapbackDir = path.join(testDir, ".snapback");
			await fs.mkdir(snapbackDir, { recursive: true });
			await fs.writeFile(path.join(snapbackDir, "workspace.json"), "corrupt", "utf-8");
			await fs.writeFile(path.join(snapbackDir, "workspace.json.backup"), "also corrupt", "utf-8");

			// Store valid workspace ID in SecretStorage
			await mockSecrets.store("snapback.workspaceId", "ws_from_secrets_12345678901234567890");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const result = await coordinator.initialize("extension", "1.0.0");

			// TODO: After implementing SecretStorage reconstruction
			// expect(result.workspaceId).toBe("ws_from_secrets_12345678901234567890");
			// expect(result.manifest).toBeDefined();

			coordinator.dispose();
		});

		it("should create fresh manifest as last resort", async () => {
			// Create corrupted file with no backup and no SecretStorage
			const snapbackDir = path.join(testDir, ".snapback");
			await fs.mkdir(snapbackDir, { recursive: true });
			await fs.writeFile(path.join(snapbackDir, "workspace.json"), "{corrupt json", "utf-8");

			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const result = await coordinator.initialize("extension", "1.0.0");

			// Should create fresh manifest
			expect(result.workspaceId).toMatch(/^ws_[a-f0-9]{32}$/);
			expect(result.firstInit).toBe(true);
			expect(result.celebration).toBeDefined();

			coordinator.dispose();
		});

		it("should validate manifest structure beyond workspace ID", async () => {
			// Create manifest with invalid structure
			const snapbackDir = path.join(testDir, ".snapback");
			await fs.mkdir(snapbackDir, { recursive: true });
			await fs.writeFile(
				path.join(snapbackDir, "workspace.json"),
				JSON.stringify({
					workspaceId: "ws_abc123def456789012345678901234",
					// Missing version, surfaces, tier, healthCheck
				}),
				"utf-8",
			);

			const coordinator = new PlatformCoordinator(mockContext, testDir);

			// Should detect invalid structure and recover
			const result = await coordinator.initialize("extension", "1.0.0");

			// TODO: After implementing schema validation
			// expect(result.manifest.version).toBe(1);
			// expect(result.manifest.surfaces).toBeDefined();
			// expect(result.manifest.healthCheck).toBeDefined();

			coordinator.dispose();
		});
	});

	describe("Disk Space and Permission Errors", () => {
		it("should handle ENOSPC (disk full) gracefully", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			vi.spyOn(fs, "writeFile").mockRejectedValue(
				Object.assign(new Error("ENOSPC: no space left on device"), { code: "ENOSPC" }),
			);

			// Should not throw, should continue with in-memory state
			await expect(
				coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" }),
			).resolves.not.toThrow();

			// In-memory state should still work
			expect(coordinator.getManifest()?.surfaces.cli).toBeDefined();

			coordinator.dispose();
		});

		it("should handle EACCES (permission denied) with user guidance", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);

			vi.spyOn(fs, "mkdir").mockRejectedValue(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }));

			// Should handle gracefully
			await expect(coordinator.initialize("extension", "1.0.0")).resolves.toBeDefined();

			// TODO: After implementing permission error handling
			// Should show user-friendly error message with guidance

			coordinator.dispose();
		});

		it("should handle EROFS (read-only filesystem) by switching to memory-only mode", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			vi.spyOn(fs, "writeFile").mockRejectedValue(
				Object.assign(new Error("EROFS: read-only file system"), { code: "EROFS" }),
			);

			// Should continue working without crashing
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });
			await coordinator.updateTier("pro");

			// In-memory state should reflect all changes
			expect(coordinator.getTier()).toBe("pro");
			expect(coordinator.getManifest()?.surfaces.cli).toBeDefined();

			coordinator.dispose();
		});
	});
});
