import { describe, expect, it, vi } from "vitest";
import { CheckpointTimelineProvider } from "../../src/views/checkpointTimelineProvider";

// Mock vscode module
vi.mock("vscode", async (importOriginal) => {
	const actual: any = await importOriginal();
	return {
		...actual,
		TimelineItem: class {
			constructor(label: string, timestamp: number) {
				(this as any).label = label;
				(this as any).timestamp = timestamp;
				(this as any).id = undefined;
				(this as any).description = undefined;
				(this as any).iconPath = undefined;
				(this as any).command = undefined;
			}
		},
	};
});

describe("TimelineProvider", () => {
	it("should create timeline provider instance", () => {
		const mockCheckpointSummaryProvider = {
			list: async () => [],
			read: async () => ({ id: "test", timestamp: Date.now(), meta: {} }),
			write: async () => {},
		};

		const provider = new CheckpointTimelineProvider(
			mockCheckpointSummaryProvider as any,
		);

		expect(provider).toBeDefined();
		expect(provider.id).toBe("snapback.checkpoints");
		expect(provider.label).toBe("SnapBack Snapshots");
	});

	it("should provide timeline items for a URI", async () => {
		const now = Date.now();
		const mockCheckpointSummaryProvider = {
			list: async () => [],
			read: async () => ({ id: "test", timestamp: Date.now(), meta: {} }),
			write: async () => {},
			// REQUIRED: Add forFile method that the timeline provider actually calls
			forFile: async () => [
				{
					id: "cp_test_123",
					label: "Test Checkpoint",
					createdAt: now,
					filesChanged: 2,
				},
			],
			listRecent: async () => [],
			total: async () => 1,
		};

		const provider = new CheckpointTimelineProvider(
			mockCheckpointSummaryProvider as any,
		);

		const mockUri: any = { fsPath: "/test/file.ts" };
		const mockToken: any = {};
		const mockOptions: any = {};
		const timeline = await provider.provideTimeline(
			mockUri,
			mockOptions,
			mockToken,
		);

		expect(timeline).toBeDefined();
		expect(timeline.items).toBeDefined();
		expect(timeline.items.length).toBe(1);
		expect(timeline.items[0].label).toBe("🧢 Test Checkpoint");
		// Note: source property is not part of the official Timeline interface
		// expect(timeline.source).toBe("SnapBack");
	});

	it("should refresh timeline when requested", () => {
		const mockCheckpointSummaryProvider = {
			list: async () => [],
			read: async () => ({ id: "test", timestamp: Date.now(), meta: {} }),
			write: async () => {},
		};

		const provider = new CheckpointTimelineProvider(
			mockCheckpointSummaryProvider as any,
		);

		// Should not throw when refreshing
		expect(() => provider.refresh()).not.toThrow();
	});
});
