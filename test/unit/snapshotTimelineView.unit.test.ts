import * as fs from "node:fs/promises";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type * as vscode from "vscode";
import { SnapBackTreeProvider } from "../../src/views/snapBackTreeProvider";
import type {
	CheckpointSummary,
	CheckpointSummaryProvider,
	ProtectedFileEntry,
	ProtectedFileProvider,
} from "../../src/views/types";
import { PROTECTION_LEVELS } from "../../src/views/types";
import { waitForEvent } from "../helpers/eventHelpers";

const createProvider = (
	checkpoints: CheckpointSummary[] = [],
	protectedFiles: ProtectedFileEntry[] = [],
): SnapBackTreeProvider => {
	const checkpointProvider: CheckpointSummaryProvider = {
		listRecent: async (limit) => checkpoints.slice(0, limit),
		total: async () => checkpoints.length,
		forFile: async () => checkpoints,
	};

	const protectedProvider: ProtectedFileProvider = {
		list: async () => protectedFiles,
		total: async () => protectedFiles.length,
		add: async () => {},
		updateProtectionLevel: async () => {},
		remove: async () => {},
		markCheckpoint: async () => {},
	};

	return new SnapBackTreeProvider(checkpointProvider, protectedProvider);
};

describe("SnapBackTreeProvider (unit)", () => {
	let tempDir: string;

	beforeEach(async () => {
		tempDir = await fs.mkdtemp(path.join(process.cwd(), "snapback-tree-"));
	});

	afterEach(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	it("returns both sections even when no data is present", async () => {
		const provider = createProvider();
		const root = await provider.getChildren();

		expect(root).toHaveLength(2);
		expect(root[0].label).toBe("Snapshots");
		expect(root[1].label).toBe("Protected Files");
	});

	it("exposes show-more entry when checkpoint total exceeds limit", async () => {
		const checkpoints: CheckpointSummary[] = Array.from({ length: 8 }).map(
			(_, index) => ({
				id: `cp-${index}`,
				label: `Checkpoint ${index}`,
				createdAt: Date.now() - index,
			}),
		);
		const provider = createProvider(checkpoints);
		const [checkpointSection] = await provider.getChildren();
		const children = await provider.getChildren(checkpointSection);

		expect(children[children.length - 1].contextValue).toBe(
			"snapback.action.showMore.checkpoints",
		);
	});

	it("provides protected file entries with normalized labels and protection metadata", async () => {
		const protectedFiles: ProtectedFileEntry[] = [
			{ id: "a", label: "package.json", path: `${tempDir}/package.json` },
		];
		const provider = createProvider([], protectedFiles);
		const [, protectedSection] = await provider.getChildren();
		const children = await provider.getChildren(protectedSection);

		expect(children).toHaveLength(1);
		const watchIcon = PROTECTION_LEVELS.watch.icon;
		expect(children[0].description?.endsWith(` ${watchIcon}`)).toBe(true);
		expect(children[0].description?.includes("package.json")).toBe(true);
		expect((children[0].iconPath as vscode.ThemeIcon | undefined)?.id).toBe(
			"shield",
		);
		const commandArg = children[0].command?.arguments?.[0] as
			| vscode.Uri
			| undefined;
		expect(commandArg).toBeDefined();
		expect(commandArg?.fsPath).toContain("package.json");
	});

	it("fires refresh events", async () => {
		const provider = createProvider();
		const payload = await waitForEvent(provider.onDidChangeTreeData, () =>
			provider.refresh(),
		);
		expect(payload).toBeUndefined();
	});
});
