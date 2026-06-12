/**
 * PlatformCoordinator Celebration Logic Tests
 *
 * Tests for celebration event triggering, health status transitions, and tier upgrades.
 * Guards against Issue 4.1 (celebration bug) from the review.
 *
 * @module test/unit/platform
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PlatformCoordinator } from "../../../src/platform/PlatformCoordinator";
import type { ExtensionContext, SecretStorage } from "vscode";
import type { CelebrationEvent } from "../../../src/platform/types";

describe("PlatformCoordinator - Celebration Logic", () => {
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

	describe("workspace_initialized celebration", () => {
		it("should celebrate on first initialization", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			await coordinator.initialize("extension", "1.0.0");

			expect(celebrations).toHaveLength(1);
			expect(celebrations[0].type).toBe("workspace_initialized");
			expect(celebrations[0].message).toContain("🎉");
			expect(celebrations[0].data?.surface).toBe("extension");

			coordinator.dispose();
		});

		it("should NOT celebrate when loading existing manifest", async () => {
			// First initialization
			const coordinator1 = new PlatformCoordinator(mockContext, testDir);
			await coordinator1.initialize("extension", "1.0.0");
			coordinator1.dispose();

			// Second initialization (existing manifest)
			const coordinator2 = new PlatformCoordinator(mockContext, testDir);
			const celebrations: CelebrationEvent[] = [];
			coordinator2.onCelebration((e) => celebrations.push(e));

			await coordinator2.initialize("cli", "1.1.0");

			// Should NOT celebrate workspace_initialized
			expect(celebrations.filter(c => c.type === "workspace_initialized")).toHaveLength(0);

			coordinator2.dispose();
		});
	});

	describe("all_surfaces_healthy celebration", () => {
		it("should celebrate when ALL surfaces become healthy from degraded state", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			// Register surfaces with mixed health
			await coordinator.registerSurface({ surface: "extension", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "degraded" });

			celebrations.length = 0; // Clear

			// Make MCP healthy → should celebrate
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			expect(celebrations.filter(c => c.type === "all_surfaces_healthy")).toHaveLength(1);

			coordinator.dispose();
		});

		it("should NOT celebrate if only one surface exists", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			// Only extension surface exists
			await coordinator.registerSurface({ surface: "extension", version: "1.0.0", health: "healthy" });

			// Should NOT celebrate (need multiple surfaces)
			expect(celebrations.filter(c => c.type === "all_surfaces_healthy")).toHaveLength(0);

			coordinator.dispose();
		});

		it("should NOT celebrate when already healthy (no transition)", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Register all surfaces as healthy
			await coordinator.registerSurface({ surface: "extension", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			// Update MCP again (still healthy)
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.1", health: "healthy" });

			// Should NOT celebrate (no transition from unhealthy → healthy)
			expect(celebrations.filter(c => c.type === "all_surfaces_healthy")).toHaveLength(0);

			coordinator.dispose();
		});

		it("should celebrate again after degradation and recovery", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			// Setup: All healthy
			await coordinator.registerSurface({ surface: "extension", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			celebrations.length = 0;

			// Degradation
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "unhealthy" });

			// Recovery → should celebrate
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			expect(celebrations.filter(c => c.type === "all_surfaces_healthy").length).toBeGreaterThan(0);

			// Degrade again
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "degraded" });

			celebrations.length = 0;

			// Recover again → should celebrate again
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "healthy" });

			expect(celebrations.filter(c => c.type === "all_surfaces_healthy").length).toBeGreaterThan(0);

			coordinator.dispose();
		});

		it("should NOT celebrate if one surface remains unhealthy", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			// Mixed health status
			await coordinator.registerSurface({ surface: "extension", version: "1.0.0", health: "healthy" });
			await coordinator.registerSurface({ surface: "cli", version: "1.0.0", health: "unhealthy" });
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "degraded" });

			celebrations.length = 0;

			// Make MCP healthy (but CLI still unhealthy)
			await coordinator.registerSurface({ surface: "mcp", version: "1.0.0", health: "healthy" });

			// Should NOT celebrate (CLI still unhealthy)
			expect(celebrations.filter(c => c.type === "all_surfaces_healthy")).toHaveLength(0);

			coordinator.dispose();
		});
	});

	describe("mcp_recovered celebration", () => {
		it("should celebrate when MCP transitions from unhealthy to healthy", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			// Mock health guardian
			const mockHealthChange = { from: "unhealthy", to: "healthy", latencyMs: 50, timestamp: Date.now() };
			const healthGuardian = {
				onHealthChange: vi.fn((handler) => {
					// Simulate health change event
					setTimeout(() => handler(mockHealthChange), 10);
					return { dispose: vi.fn() };
				}),
				onFailure: vi.fn(() => ({ dispose: vi.fn() })),
				onRecovery: vi.fn(() => ({ dispose: vi.fn() })),
			} as any;

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			coordinator.wireHealthGuardian(healthGuardian);

			// Wait for async health change event
			await new Promise(resolve => setTimeout(resolve, 50));

			expect(celebrations.filter(c => c.type === "mcp_recovered")).toHaveLength(1);
			expect(celebrations[0].data?.from).toBe("unhealthy");
			expect(celebrations[0].data?.latencyMs).toBe(50);

			coordinator.dispose();
		});

		it("should NOT celebrate when MCP transitions from healthy to healthy", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const mockHealthChange = { from: "healthy", to: "healthy", latencyMs: 30, timestamp: Date.now() };
			const healthGuardian = {
				onHealthChange: vi.fn((handler) => {
					setTimeout(() => handler(mockHealthChange), 10);
					return { dispose: vi.fn() };
				}),
				onFailure: vi.fn(() => ({ dispose: vi.fn() })),
				onRecovery: vi.fn(() => ({ dispose: vi.fn() })),
			} as any;

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			coordinator.wireHealthGuardian(healthGuardian);

			await new Promise(resolve => setTimeout(resolve, 50));

			// Should NOT celebrate (no recovery, was already healthy)
			expect(celebrations.filter(c => c.type === "mcp_recovered")).toHaveLength(0);

			coordinator.dispose();
		});
	});

	describe("tier_upgraded celebration", () => {
		it("should celebrate upgrade from free to pro", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			await coordinator.updateTier("pro");

			expect(celebrations.filter(c => c.type === "tier_upgraded")).toHaveLength(1);
			expect(celebrations[0].message).toContain("Pro tier");
			expect(celebrations[0].data?.from).toBe("free");
			expect(celebrations[0].data?.to).toBe("pro");

			coordinator.dispose();
		});

		it("should celebrate upgrade from free to enterprise", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			await coordinator.updateTier("enterprise");

			expect(celebrations.filter(c => c.type === "tier_upgraded")).toHaveLength(1);
			expect(celebrations[0].data?.from).toBe("free");
			expect(celebrations[0].data?.to).toBe("enterprise");

			coordinator.dispose();
		});

		it("should celebrate upgrade from pro to enterprise", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");
			await coordinator.updateTier("pro");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			await coordinator.updateTier("enterprise");

			expect(celebrations.filter(c => c.type === "tier_upgraded")).toHaveLength(1);
			expect(celebrations[0].data?.from).toBe("pro");
			expect(celebrations[0].data?.to).toBe("enterprise");

			coordinator.dispose();
		});

		it("should NOT celebrate downgrade from pro to free", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");
			await coordinator.updateTier("pro");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			await coordinator.updateTier("free");

			// Should NOT celebrate downgrade
			expect(celebrations.filter(c => c.type === "tier_upgraded")).toHaveLength(0);

			coordinator.dispose();
		});

		it("should NOT celebrate same tier update", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			await coordinator.initialize("extension", "1.0.0");
			await coordinator.updateTier("pro");

			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			await coordinator.updateTier("pro");

			// Should NOT celebrate (no change)
			expect(celebrations.filter(c => c.type === "tier_upgraded")).toHaveLength(0);

			coordinator.dispose();
		});
	});

	describe("Celebration event structure", () => {
		it("should include all required fields in celebration events", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			await coordinator.initialize("extension", "1.0.0");

			const celebration = celebrations[0];
			expect(celebration).toHaveProperty("type");
			expect(celebration).toHaveProperty("message");
			expect(celebration).toHaveProperty("timestamp");
			expect(typeof celebration.type).toBe("string");
			expect(typeof celebration.message).toBe("string");
			expect(typeof celebration.timestamp).toBe("number");

			coordinator.dispose();
		});

		it("should include contextual data in celebration events", async () => {
			const coordinator = new PlatformCoordinator(mockContext, testDir);
			const celebrations: CelebrationEvent[] = [];
			coordinator.onCelebration((e) => celebrations.push(e));

			await coordinator.initialize("extension", "1.0.0");

			const celebration = celebrations[0];
			expect(celebration.data).toBeDefined();
			expect(celebration.data?.surface).toBe("extension");
			expect(celebration.data?.workspaceId).toMatch(/^[a-f0-9]{12}$/);

			coordinator.dispose();
		});
	});
});
