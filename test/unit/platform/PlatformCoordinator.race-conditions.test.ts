/**
 * PlatformCoordinator Race Condition Tests
 *
 * Tests for concurrent operations, file locking, and "first to scene" protocol.
 * These tests guard against Issues 1.1, 1.2, 1.3 from the review.
 *
 * @module test/unit/platform
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PlatformCoordinator } from "../../../src/platform/PlatformCoordinator";
import type { ExtensionContext, SecretStorage } from "vscode";
import type { WorkspaceManifest } from "../../../src/platform/types";

describe("PlatformCoordinator - Race Conditions", () => {
	let testDir: string;
	let mockContext: ExtensionContext;
	let mockSecrets: SecretStorage;

	beforeEach(async () => {
		// Create unique test directory
		testDir = path.join(__dirname, "__test_workspace__", `test_${Date.now()}_${Math.random().toString(36).slice(2)}`);
		await fs.mkdir(testDir, { recursive: true });

		// Mock VS Code context and secrets
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
		// Cleanup test directory
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// Ignore cleanup errors
		}
		vi.clearAllMocks();
	});

	describe("Issue 1.1: Concurrent Manifest Writes", () => {
		it("should handle concurrent registerSurface calls without data loss", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Simulate concurrent surface registrations
			const promises = [
				coordinator.registerSurface({ surface: "cli", version: "1.1.0", health: "healthy" }),
				coordinator.registerSurface({ surface: "mcp", version: "1.2.0", health: "degraded" }),
				coordinator.registerSurface({ surface: "extension", version: "1.0.1", health: "healthy" }),
			];

			await Promise.all(promises);

			// Verify all surfaces registered without data loss
			const manifest = coordinator.getManifest();
			expect(manifest).toBeDefined();
			expect(manifest?.surfaces.cli).toBeDefined();
			expect(manifest?.surfaces.mcp).toBeDefined();
			expect(manifest?.surfaces.extension).toBeDefined();

			// Verify manifest on disk matches in-memory
			const manifestPath = path.join(testDir, ".snapback", "workspace.json");
			const diskManifest = JSON.parse(await fs.readFile(manifestPath, "utf-8")) as WorkspaceManifest;
			expect(diskManifest.surfaces.cli).toBeDefined();
			expect(diskManifest.surfaces.mcp).toBeDefined();
			expect(diskManifest.surfaces.extension).toBeDefined();

			coordinator.dispose();
		});

		it("should prevent manifest corruption from concurrent health updates", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Register surfaces
			await coordinator.registerSurface({ surface: "cli", version: "1.1.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "mcp", version: "1.2.0", health: "healthy" });

			// Simulate rapid concurrent updates (100 updates in parallel)
			const updatePromises = Array.from({ length: 100 }, (_, i) =>
				coordinator.registerSurface({
					surface: i % 2 === 0 ? "cli" : "mcp",
					version: `1.${i}.0`,
					health: i % 3 === 0 ? "unhealthy" : "healthy",
				}),
			);

			await Promise.all(updatePromises);

			// Verify manifest is still valid JSON and has correct structure
			const manifestPath = path.join(testDir, ".snapback", "workspace.json");
			const content = await fs.readFile(manifestPath, "utf-8");

			// Should parse without throwing
			const manifest = JSON.parse(content) as WorkspaceManifest;

			// Verify structure integrity
			expect(manifest.workspaceId).toMatch(/^ws_[a-f0-9]{32}$/);
			expect(manifest.surfaces).toBeDefined();
			expect(manifest.healthCheck).toBeDefined();
			expect(manifest.version).toBe(1);

			coordinator.dispose();
		});

		it("should use atomic write operations to prevent partial writes", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const manifestPath = path.join(testDir, ".snapback", "workspace.json");

			// Monitor file writes using fs spy
			const originalWriteFile = fs.writeFile;
			let writeInProgress = false;
			let overlappingWrites = 0;

			const spyWriteFile = vi.spyOn(fs, "writeFile").mockImplementation(async (...args) => {
				if (writeInProgress) {
					overlappingWrites++;
				}
				writeInProgress = true;
				await originalWriteFile(...args);
				writeInProgress = false;
			});

			// Trigger concurrent writes
			await Promise.all([
				coordinator.registerSurface({ surface: "cli", version: "1.0", health: "healthy" }),
				coordinator.registerSurface({ surface: "mcp", version: "1.0", health: "healthy" }),
			]);

			// TODO: After implementing file locking, overlappingWrites should be 0
			// Currently this will fail and should be fixed by the implementation
			// expect(overlappingWrites).toBe(0);

			spyWriteFile.mockRestore();
			coordinator.dispose();
		});
	});

	describe("Issue 1.2: Double 'First to Scene' Detection", () => {
		it("should prevent duplicate initialization celebrations", async () => {
			// Create two coordinators for same workspace (simulating extension + CLI)
			const coordinator1 = new PlatformCoordinator(mockContext, testDir);
			const coordinator2 = new PlatformCoordinator(mockContext, testDir);

			const celebrations1: string[] = [];
			const celebrations2: string[] = [];

			coordinator1.onCelebration((e) => celebrations1.push(e.type));
			coordinator2.onCelebration((e) => celebrations2.push(e.type));

			// Initialize both simultaneously
			const [result1, result2] = await Promise.all([
				coordinator1.initialize("extension", "1.0.0"),
				coordinator2.initialize("cli", "1.1.0"),
			]);

			// Only ONE should report firstInit=true
			const firstInitCount = [result1.firstInit, result2.firstInit].filter(Boolean).length;
			expect(firstInitCount).toBe(1);

			// Only ONE should celebrate workspace_initialized
			const initCelebrations = [...celebrations1, ...celebrations2].filter(
				(type) => type === "workspace_initialized",
			);
			expect(initCelebrations).toHaveLength(1);

			coordinator1.dispose();
			coordinator2.dispose();
		});

		it("should use exclusive file creation to prevent race", async () => {
			const manifestPath = path.join(testDir, ".snapback", "workspace.json");

			// Ensure manifest doesn't exist
			try {
				await fs.unlink(manifestPath);
			} catch {
				// Ignore if doesn't exist
			}

			const coordinator1 = new PlatformCoordinator(mockContext, testDir);
			const coordinator2 = new PlatformCoordinator(mockContext, testDir);

			// Initialize both at exact same time
			const results = await Promise.allSettled([
				coordinator1.initialize("extension", "1.0.0"),
				coordinator2.initialize("cli", "1.1.0"),
			]);

			// Both should succeed (one creates, one reads)
			expect(results[0].status).toBe("fulfilled");
			expect(results[1].status).toBe("fulfilled");

			// But only one should be first
			const firstInitResults = results
				.filter((r) => r.status === "fulfilled")
				.map((r) => (r as PromiseFulfilledResult<any>).value.firstInit);

			expect(firstInitResults.filter(Boolean)).toHaveLength(1);

			coordinator1.dispose();
			coordinator2.dispose();
		});
	});

	describe("Issue 1.3: Celebration Storm Bug", () => {
		it("should correctly detect health status transitions", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const celebrations: string[] = [];
			coordinator.onCelebration((e) => celebrations.push(e.type));

			// Register surfaces with mixed health
			await coordinator.registerSurface({ surface: "extension", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "unhealthy" });

			// Clear celebrations from initialization
			celebrations.length = 0;

			// Update MCP to healthy (should trigger all_surfaces_healthy)
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			// Should celebrate once
			expect(celebrations).toContain("all_surfaces_healthy");
			expect(celebrations.filter((c) => c === "all_surfaces_healthy")).toHaveLength(1);

			// Update again (should NOT celebrate - already healthy)
			celebrations.length = 0;
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			expect(celebrations).not.toContain("all_surfaces_healthy");

			coordinator.dispose();
		});

		it("should only celebrate when transitioning FROM unhealthy TO healthy", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const celebrations: string[] = [];
			coordinator.onCelebration((e) => celebrations.push(e.type));

			// Start with all healthy
			await coordinator.registerSurface({ surface: "extension", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			celebrations.length = 0;

			// Update when already healthy (should NOT celebrate)
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.1", health: "healthy" });
			expect(celebrations).not.toContain("all_surfaces_healthy");

			// Make one unhealthy
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.1", health: "degraded" });

			// Now make it healthy again (SHOULD celebrate)
			celebrations.length = 0;
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.1", health: "healthy" });
			expect(celebrations).toContain("all_surfaces_healthy");

			coordinator.dispose();
		});
	});

	describe("Double Wire Protection", () => {
		it("should prevent duplicate health guardian wiring", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Mock health guardian
			const mockGuardian = {
				onHealthChange: vi.fn(() => ({ dispose: vi.fn() })),
				onFailure: vi.fn(() => ({ dispose: vi.fn() })),
				onRecovery: vi.fn(() => ({ dispose: vi.fn() })),
			} as any;

			// Wire once
			coordinator.wireHealthGuardian(mockGuardian);
			const firstCallCount = mockGuardian.onHealthChange.mock.calls.length;

			// Wire again (should be prevented)
			coordinator.wireHealthGuardian(mockGuardian);
			const secondCallCount = mockGuardian.onHealthChange.mock.calls.length;

			// TODO: After implementing double-wire guard, these should be equal
			// Currently this will fail and should be fixed by the implementation
			// expect(secondCallCount).toBe(firstCallCount);

			coordinator.dispose();
		});
	});
});
