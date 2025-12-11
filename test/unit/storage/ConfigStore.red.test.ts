/**
 * RED PHASE TESTS for ConfigStore
 *
 * TDD WORKFLOW:
 * 1. Write test → FAIL (red)
 * 2. Implement minimal code → PASS (green)
 * 3. Refactor → PASS (keep green)
 * 4. Run gate: ./ai_dev_utils/scripts/tdd-gate.sh green
 *
 * COVERAGE REQUIREMENTS:
 * - Happy path (✅ expected behavior)
 * - Sad path (❌ error handling)
 * - Edge cases (⚠️ boundary conditions)
 * - Error cases (💥 system failures)
 */

import { describe, expect, it, beforeEach, afterEach } from "vitest";
import * as vscode from "vscode";
import * as fs from "fs/promises";
import * as path from "path";
import { ConfigStore } from "../../../src/storage/ConfigStore";
import type { ProtectionLevel } from "@snapback/contracts";

const TEST_DIR = `/tmp/snapback-test-${Date.now()}`;
const TEST_STORAGE_URI = vscode.Uri.file(TEST_DIR);

describe("ConfigStore - Red Phase", () => {
	let configStore: ConfigStore;

	beforeEach(async () => {
		// Create fresh test directory
		await fs.mkdir(TEST_DIR, { recursive: true });
		configStore = new ConfigStore(TEST_STORAGE_URI);
	});

	afterEach(async () => {
		// Cleanup test directory
		await fs.rm(TEST_DIR, { recursive: true, force: true });
	});

	describe("PHASE 1: Initialization", () => {
		it("✅ should create config.json on first run", async () => {
			await configStore.initialize();
			const configPath = path.join(TEST_DIR, "config.json");
			const exists = await fs.stat(configPath).then(() => true).catch(() => false);
			expect(exists).toBe(true);

			const content = await fs.readFile(configPath, "utf-8");
			const config = JSON.parse(content);
			expect(config).toHaveProperty("version");
			expect(config).toHaveProperty("protections");
			expect(config).toHaveProperty("engine");
		});

		it("✅ should load existing config without overwriting", async () => {
			const testData = {
				version: 1,
				protections: { "/test.ts": { level: "block" as ProtectionLevel, isAnchor: false, setAt: Date.now() } },
				engine: { maxDepth: 2, burstThreshold: 30, cooldowns: { block: 60000, warn: 30000, watch: 0 } },
			};
			const configPath = path.join(TEST_DIR, "config.json");
			await fs.writeFile(configPath, JSON.stringify(testData));

			await configStore.initialize();
			const loaded = await configStore.getProtection("/test.ts");
			expect(loaded?.level).toBe("block");
		});

		it("❌ should handle corrupted JSON gracefully", async () => {
			const configPath = path.join(TEST_DIR, "config.json");
			await fs.writeFile(configPath, "{ invalid json }");

			await expect(configStore.initialize()).rejects.toThrow();
		});

		it("❌ should reject negative maxDepth", async () => {
			await configStore.initialize();
			await expect(
				configStore.updateEngineConfig({ maxDepth: -1 })
			).rejects.toThrow("maxDepth must be >= 0");
		});
	});

	describe("PHASE 2: Protection Level Operations", () => {
		it("✅ should set protection level for new file", async () => {
			await configStore.initialize();
			await configStore.setProtection("/test/file.ts", "block");
			const entry = await configStore.getProtection("/test/file.ts");

			expect(entry).toBeDefined();
			expect(entry?.level).toBe("block");
			expect(entry?.isAnchor).toBe(false);
			expect(typeof entry?.setAt).toBe("number");
		});

		it("✅ should update existing protection level", async () => {
			await configStore.initialize();
			const now = Date.now();

			await configStore.setProtection("/file.ts", "watch");
			await new Promise(r => setTimeout(r, 10)); // Ensure time passes
			const firstTime = (await configStore.getProtection("/file.ts"))?.setAt;

			await configStore.setProtection("/file.ts", "block");
			const updated = await configStore.getProtection("/file.ts");

			expect(updated?.level).toBe("block");
			expect(updated?.setAt).toBeGreaterThanOrEqual(firstTime!);
		});

		it("✅ should return null for unprotected file", async () => {
			await configStore.initialize();
			const entry = await configStore.getProtection("/nonexistent.ts");
			expect(entry).toBeNull();
		});

		it("✅ should list all protected files", async () => {
			await configStore.initialize();
			await configStore.setProtection("/file1.ts", "watch");
			await configStore.setProtection("/file2.ts", "warn");
			await configStore.setProtection("/file3.ts", "block");

			const all = await configStore.listProtections();
			expect(all).toHaveLength(3);
			expect(all.every(e => e.filePath && e.entry)).toBe(true);
		});

		it("✅ should remove protection level", async () => {
			await configStore.initialize();
			await configStore.setProtection("/file.ts", "block");
			expect(await configStore.getProtection("/file.ts")).toBeDefined();

			await configStore.removeProtection("/file.ts");
			expect(await configStore.getProtection("/file.ts")).toBeNull();
		});

		it("❌ should handle large config files", async () => {
			await configStore.initialize();
			// Protect 100 files (smaller than 10K for test speed)
			for (let i = 0; i < 100; i++) {
				await configStore.setProtection(`/file${i}.ts`, i % 3 === 0 ? "block" : i % 3 === 1 ? "warn" : "watch");
			}

			const all = await configStore.listProtections();
			expect(all).toHaveLength(100);
		});
	});

	describe("PHASE 3: Anchor File Management", () => {
		it("✅ should mark file as cluster anchor", async () => {
			await configStore.initialize();
			await configStore.setProtection("/anchor.ts", "block", true);

			const entry = await configStore.getProtection("/anchor.ts");
			expect(entry?.isAnchor).toBe(true);
		});

		it("✅ should retrieve all anchors", async () => {
			await configStore.initialize();
			await configStore.setProtection("/anchor1.ts", "block", true);
			await configStore.setProtection("/anchor2.ts", "warn", true);
			await configStore.setProtection("/regular.ts", "watch", false);

			const anchors = await configStore.getAnchors();
			expect(anchors).toHaveLength(2);
			expect(anchors).toContain("/anchor1.ts");
			expect(anchors).toContain("/anchor2.ts");
			expect(anchors).not.toContain("/regular.ts");
		});
	});

	describe("PHASE 4: Engine Configuration", () => {
		it("✅ should get default engine config", async () => {
			await configStore.initialize();
			const config = await configStore.getEngineConfig();

			expect(config.maxDepth).toBeDefined();
			expect(config.burstThreshold).toBeDefined();
			expect(config.cooldowns).toBeDefined();
		});

		it("✅ should update engine config", async () => {
			await configStore.initialize();
			const original = await configStore.getEngineConfig();

			await configStore.updateEngineConfig({ maxDepth: 3 });
			const updated = await configStore.getEngineConfig();

			expect(updated.maxDepth).toBe(3);
			expect(updated.burstThreshold).toBe(original.burstThreshold);
		});

		it("❌ should reject invalid maxDepth", async () => {
			await configStore.initialize();
			await expect(
				configStore.updateEngineConfig({ maxDepth: -1 })
			).rejects.toThrow();
		});

		it("❌ should reject invalid cooldown values", async () => {
			await configStore.initialize();
			await expect(
				configStore.updateEngineConfig({ cooldowns: { block: -100, warn: 0, watch: 0 } })
			).rejects.toThrow();
		});

		it("❌ should reject invalid burstThreshold", async () => {
			await configStore.initialize();
			await expect(
				configStore.updateEngineConfig({ burstThreshold: -1 })
			).rejects.toThrow();
		});
	});

	describe("PHASE 5: Edge Cases", () => {
		it("⚠️ should handle very long file paths", async () => {
			await configStore.initialize();
			const longPath = "/" + "very/long/path/".repeat(20) + "file.ts";
			await configStore.setProtection(longPath, "block");

			const entry = await configStore.getProtection(longPath);
			expect(entry?.level).toBe("block");
		});

		it("⚠️ should handle special characters in paths", async () => {
			await configStore.initialize();
			const specialPath = "/path/with spaces/unicode-é-file.ts";
			await configStore.setProtection(specialPath, "warn");

			const entry = await configStore.getProtection(specialPath);
			expect(entry?.level).toBe("warn");
		});

		it("⚠️ should handle 1K+ protected files efficiently", async () => {
			await configStore.initialize();
			const start = Date.now();

			for (let i = 0; i < 1000; i++) {
				await configStore.setProtection(`/file${i}.ts`, "block");
			}

			const duration = Date.now() - start;
			const all = await configStore.listProtections();

			expect(all).toHaveLength(1000);
			expect(duration).toBeLessThan(5000); // Should complete reasonably
		});
	});
});
