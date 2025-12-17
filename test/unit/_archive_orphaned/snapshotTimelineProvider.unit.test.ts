import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { CheckpointTimelineProvider } from "../../src/views/checkpointTimelineProvider";
import type { CheckpointSummaryProvider } from "../../src/views/types";
import { PROTECTION_LEVELS } from "../../src/views/types";

// Simple mock for VS Code Uri
const mockUri = {
	file: (path: string) => ({
		fsPath: path,
		toString: () => path,
	}),
};

describe("CheckpointTimelineProvider", () => {
	it("returns timeline items for a file", async () => {
		const checkpoints = [
			{
				id: "cp-2",
				label: "Before refactor",
				createdAt: 2000,
				filesChanged: 3,
			},
			{
				id: "cp-1",
				label: "Initial checkpoint",
				createdAt: 1000,
				filesChanged: 1,
			},
		];

		const checkpointProvider: CheckpointSummaryProvider = {
			listRecent: vi.fn(),
			total: vi.fn(),
			forFile: vi.fn().mockResolvedValue(checkpoints),
		};

		const provider = new CheckpointTimelineProvider(checkpointProvider);
		const timeline = await provider.provideTimeline(
			mockUri.file("/repo/src/index.ts") as any,
			{},
		);

		expect(timeline.items).toHaveLength(2);
		const watchMeta = PROTECTION_LEVELS.watch;
		expect(timeline.items[0].label).toBe(`${watchMeta.icon} Before refactor`);
		expect(timeline.items[0].command?.command).toBe(
			"snapback.restoreFileFromCheckpoint",
		);
		// Check the arguments separately
		expect(timeline.items[0].command?.arguments?.[0]).toBe("cp-2");
		expect(timeline.items[0].command?.arguments?.[1].fsPath).toBe(
			"/repo/src/index.ts",
		);
		expect(
			(timeline.items[0].iconPath as vscode.ThemeIcon | undefined)?.id,
		).toBe("history");
		expect((timeline.items[0].iconPath as vscode.ThemeIcon).id).toBe("history");
	});

	it("returns empty timeline when there are no checkpoints", async () => {
		const checkpointProvider: CheckpointSummaryProvider = {
			listRecent: vi.fn(),
			total: vi.fn(),
			forFile: vi.fn().mockResolvedValue([]),
		};

		const provider = new CheckpointTimelineProvider(checkpointProvider);
		const timeline = await provider.provideTimeline(
			mockUri.file("/repo/src/index.ts") as any,
			{},
		);

		expect(timeline.items).toHaveLength(0);
	});
});
