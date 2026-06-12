/**
 * PlatformCoordinator Write Isolation Test
 *
 * Asserts that the extension's PlatformCoordinator does NOT write to
 * `.vreko/workspace.json`. That path is exclusively owned by the vrekod
 * daemon emitter. The extension writes extension state to
 * `.vreko/extension-state.json`.
 *
 * This guards against the two-writer collision documented in:
 * audit-findings/workspace-json-emitter-spec-drift-2026-05-12.md
 * "BLOCKER  -  Two-writer collision on `.vreko/workspace.json`"
 *
 * @see apps/local-service/src/projections/workspace-json-emitter.ts
 * @see apps/vscode/src/platform/PlatformCoordinator.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { PlatformCoordinator } from "../../../src/platform/PlatformCoordinator";
import type { ExtensionContext, SecretStorage } from "vscode";

describe("PlatformCoordinator  -  write isolation from daemon workspace.json", () => {
	let testDir: string;
	let mockContext: ExtensionContext;

	beforeEach(async () => {
		testDir = path.join(
			__dirname,
			"__test_workspace__",
			`iso_${Date.now()}_${Math.random().toString(36).slice(2)}`,
		);
		await fs.mkdir(testDir, { recursive: true });

		const secretsMap = new Map<string, string>();
		const mockSecrets: SecretStorage = {
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
			extension: { packageJSON: { version: "1.0.0-test" } },
		} as unknown as ExtensionContext;
	});

	afterEach(async () => {
		try {
			await fs.rm(testDir, { recursive: true, force: true });
		} catch {
			// ignore cleanup errors
		}
		vi.clearAllMocks();
	});

	it("writes extension-state.json, never workspace.json, after initialize()", async () => {
		const coordinator = new PlatformCoordinator(mockContext, testDir);
		await coordinator.initialize("extension", "1.0.0");

		const vrekoDir = path.join(testDir, ".vreko");

		// The daemon-owned path must NOT exist (extension must not create it)
		await expect(
			fs.access(path.join(vrekoDir, "workspace.json")),
		).rejects.toMatchObject({ code: "ENOENT" });

		// The extension-owned path MUST exist and be valid JSON
		const raw = await fs.readFile(path.join(vrekoDir, "extension-state.json"), "utf-8");
		const manifest = JSON.parse(raw);
		expect(manifest.workspaceId).toBeDefined();
		expect(manifest.initializedBy).toBe("extension");

		coordinator.dispose();
	});

	it("does not write workspace.json after registerSurface() or updateTier()", async () => {
		const coordinator = new PlatformCoordinator(mockContext, testDir);
		await coordinator.initialize("extension", "1.0.0");

		await coordinator.registerSurface({ surface: "cli", version: "1.1.0", health: "healthy" });
		await coordinator.updateTier("pro");

		const vrekoDir = path.join(testDir, ".vreko");

		await expect(
			fs.access(path.join(vrekoDir, "workspace.json")),
		).rejects.toMatchObject({ code: "ENOENT" });

		// extension-state.json reflects the updates
		const raw = await fs.readFile(path.join(vrekoDir, "extension-state.json"), "utf-8");
		const manifest = JSON.parse(raw);
		expect(manifest.surfaces.cli).toBeDefined();
		expect(manifest.tier).toBe("pro");

		coordinator.dispose();
	});

	it("leaves a pre-existing workspace.json untouched (daemon content preserved)", async () => {
		// Simulate daemon having already written workspace.json before extension starts
		const vrekoDir = path.join(testDir, ".vreko");
		await fs.mkdir(vrekoDir, { recursive: true });

		const daemonContent = JSON.stringify({
			health: { intelligenceState: "bootstrapping", observationCount: 16 },
			files: {},
			agents: {},
			coChangeClusters: [],
		});
		await fs.writeFile(path.join(vrekoDir, "workspace.json"), daemonContent, "utf-8");

		const coordinator = new PlatformCoordinator(mockContext, testDir);
		await coordinator.initialize("extension", "1.0.0");

		// Daemon file must remain byte-for-byte identical
		const afterContent = await fs.readFile(path.join(vrekoDir, "workspace.json"), "utf-8");
		expect(afterContent).toBe(daemonContent);

		coordinator.dispose();
	});
});
