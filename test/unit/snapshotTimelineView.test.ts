import * as assert from "node:assert";
import * as vscode from "vscode";
import { SnapBackTreeProvider } from "../../src/views/snapBackTreeProvider.js";
import type {
	CheckpointSummary,
	CheckpointSummaryProvider,
	ProtectedFileEntry,
	ProtectedFileProvider,
} from "../../src/views/types";
import { PROTECTION_LEVELS } from "../../src/views/types.js";
import { waitForEvent } from "../helpers/eventHelpers.js";

const createProvider = (
	checkpoints: CheckpointSummary[],
	protectedFiles: ProtectedFileEntry[] = [],
	options?: Partial<{
		checkpointTotal: number;
		protectedTotal: number;
	}>,
) => {
	const checkpointProvider: CheckpointSummaryProvider = {
		listRecent: async (limit) => checkpoints.slice(0, limit),
		total: async () => options?.checkpointTotal ?? checkpoints.length,
		forFile: async () => checkpoints,
	};

	const protectedProvider: ProtectedFileProvider = {
		list: async () => protectedFiles,
		total: async () => options?.protectedTotal ?? protectedFiles.length,
		add: async () => {},
		updateProtectionLevel: async () => {},
		remove: async () => {},
		markCheckpoint: async () => {},
	};

	return new SnapBackTreeProvider(checkpointProvider, protectedProvider);
};

suite("SnapBackTreeProvider", () => {
	vscode.window.showInformationMessage("Start tree provider tests.");

	test("Root shows checkpoint and protected file sections", async () => {
		const provider = createProvider([
			{ id: "cp-1", label: "First", createdAt: Date.now() },
		]);
		const rootItems = await provider.getChildren();

		assert.strictEqual(rootItems.length, 2);
		assert.strictEqual(rootItems[0].label, "Snapshots");
		assert.strictEqual(rootItems[0].description, "(1)");
		assert.strictEqual(
			rootItems[0].contextValue,
			"snapback.section.checkpoints",
		);

		assert.strictEqual(rootItems[1].label, "Protected Files");
		assert.strictEqual(rootItems[1].description, "(0)");
		assert.strictEqual(rootItems[1].contextValue, "snapback.section.protected");
	});

	test("Checkpoint section limits to five recent items and adds show more", async () => {
		const items = Array.from({ length: 7 }).map((_, index) => ({
			id: `cp-${index}`,
			label: `Checkpoint ${index}`,
			createdAt: Date.now() - index * 1000,
		}));
		const provider = createProvider(items, [], { checkpointTotal: 7 });
		const [section] = await provider.getChildren();

		const children = await provider.getChildren(section);
		assert.strictEqual(children.length, 6, "Five items plus show-more entry");
		assert.strictEqual(children[0].label, "Checkpoint 0");
		assert.strictEqual(children[5].label, "Show 2 more snapshots…");
		assert.strictEqual(
			children[5].contextValue,
			"snapback.action.showMore.checkpoints",
		);
	});

	test("Protected section lists files with hat icon detail and optional show more", async () => {
		const protectedFiles: ProtectedFileEntry[] = [
			{
				id: "pkg",
				label: "package.json",
				path: "/repo/package.json",
				lastProtectedAt: new Date("2024-01-01T10:00:00Z").getTime(),
			},
			{
				id: "env",
				label: ".env",
				path: "/repo/.env",
				lastProtectedAt: new Date("2024-01-01T11:00:00Z").getTime(),
			},
		];
		const provider = createProvider([], protectedFiles);
		const [, section] = await provider.getChildren();

		const children = await provider.getChildren(section);
		assert.strictEqual(children.length, 2);
		assert.strictEqual(children[0].label, ".env");
		assert.strictEqual(children[1].label, "package.json");
		const watchIcon = PROTECTION_LEVELS.watch.icon;
		assert.ok(children[0].description?.endsWith(` ${watchIcon}`));
		assert.ok(children[0].description?.includes(".env"));
		assert.ok(children[1].description?.endsWith(` ${watchIcon}`));
		assert.ok(children[1].description?.includes("package.json"));
		assert.strictEqual(
			(children[0].iconPath as vscode.ThemeIcon | undefined)?.id,
			"shield",
		);
		const envEntry = protectedFiles.find((entry) => entry.label === ".env")!;
		assert.strictEqual(
			(children[0].command?.arguments?.[0] as vscode.Uri).fsPath,
			envEntry.path,
		);
	});

	test("Refresh emits tree change event", async () => {
		const provider = createProvider([]);
		const payload = await waitForEvent(provider.onDidChangeTreeData, () =>
			provider.refresh(),
		);
		assert.strictEqual(payload, undefined);
	});
});
