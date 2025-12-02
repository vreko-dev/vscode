/**
 * @fileoverview TDD RED - Tests for GroupingMode types and TreeViewConfig
 *
 * This test suite validates the type system for the new TreeView architecture.
 * These tests will FAIL until we implement the types in apps/vscode/src/views/types.ts
 */

import { describe, expect, it } from "vitest";
import type {
	FileGroup,
	FileGroupedSnapshots,
	GroupedSnapshots,
	GroupingMode,
	ProblemItem,
	QuickAction,
	SnapshotDisplayItem,
	SystemGroup,
	SystemGroupedSnapshots,
	TimeGroup,
	TimeGroupedSnapshots,
	TreeViewConfig,
} from "../../../src/views/types.js";
import { DEFAULT_TREE_CONFIG } from "../../../src/views/types.js";

describe("TreeView Types (TDD RED)", () => {
	describe("GroupingMode type", () => {
		it('should allow "time" as a valid grouping mode', () => {
			const mode: GroupingMode = "time";
			expect(mode).toBe("time");
		});

		it('should allow "system" as a valid grouping mode', () => {
			const mode: GroupingMode = "system";
			expect(mode).toBe("system");
		});

		it('should allow "file" as a valid grouping mode', () => {
			const mode: GroupingMode = "file";
			expect(mode).toBe("file");
		});
	});

	describe("TreeViewConfig", () => {
		it("should have default configuration", () => {
			expect(DEFAULT_TREE_CONFIG).toBeDefined();
			expect(DEFAULT_TREE_CONFIG.groupBy).toBe("time");
			expect(DEFAULT_TREE_CONFIG.showAI).toBe(true);
			expect(DEFAULT_TREE_CONFIG.showProtection).toBe(true);
			expect(DEFAULT_TREE_CONFIG.maxPerGroup).toBe(5);
		});

		it("should create config with all required properties", () => {
			const config: TreeViewConfig = {
				groupBy: "time",
				showAI: true,
				showProtection: true,
				maxPerGroup: 10,
			};

			expect(config.groupBy).toBe("time");
			expect(config.showAI).toBe(true);
			expect(config.maxPerGroup).toBe(10);
		});

		it("should allow different grouping modes", () => {
			const configs: TreeViewConfig[] = [
				{ groupBy: "time", showAI: true, showProtection: true, maxPerGroup: 5 },
				{
					groupBy: "system",
					showAI: false,
					showProtection: true,
					maxPerGroup: 10,
				},
				{
					groupBy: "file",
					showAI: true,
					showProtection: false,
					maxPerGroup: 3,
				},
			];

			expect(configs[0].groupBy).toBe("time");
			expect(configs[1].groupBy).toBe("system");
			expect(configs[2].groupBy).toBe("file");
		});
	});

	describe("SnapshotDisplayItem", () => {
		it("should create valid display item with required fields", () => {
			const item: SnapshotDisplayItem = {
				id: "snap-123",
				name: "AI Edit (Cursor) - Button.tsx",
				timestamp: new Date("2024-01-01T12:00:00Z"),
				trigger: "ai-detected",
				fileCount: 3,
				primaryFile: "src/Button.tsx",
				description: "19m ago",
			};

			expect(item.id).toBe("snap-123");
			expect(item.trigger).toBe("ai-detected");
			expect(item.fileCount).toBe(3);
		});

		it("should allow optional aiTool and detectedSystem", () => {
			const item: SnapshotDisplayItem = {
				id: "snap-456",
				name: "Manual snapshot",
				timestamp: new Date(),
				trigger: "manual",
				fileCount: 1,
				primaryFile: "config.json",
				description: "2h ago",
				aiTool: "Cursor",
				detectedSystem: "apps/web",
			};

			expect(item.aiTool).toBe("Cursor");
			expect(item.detectedSystem).toBe("apps/web");
		});

		it("should support all trigger types", () => {
			const triggers: Array<"auto" | "manual" | "ai-detected" | "pre-save"> = [
				"auto",
				"manual",
				"ai-detected",
				"pre-save",
			];

			for (const trigger of triggers) {
				const item: SnapshotDisplayItem = {
					id: `snap-${trigger}`,
					name: "Test",
					timestamp: new Date(),
					trigger,
					fileCount: 1,
					primaryFile: "test.ts",
					description: "just now",
				};
				expect(item.trigger).toBe(trigger);
			}
		});
	});

	describe("TimeGroupedSnapshots", () => {
		it("should create time groups with all categories", () => {
			const grouped: TimeGroupedSnapshots = {
				recent: [],
				yesterday: [],
				thisWeek: [],
				older: [],
			};

			expect(grouped.recent).toEqual([]);
			expect(grouped.yesterday).toEqual([]);
			expect(grouped.thisWeek).toEqual([]);
			expect(grouped.older).toEqual([]);
		});

		it("should allow TimeGroup type values", () => {
			const groups: TimeGroup[] = ["recent", "yesterday", "this-week", "older"];

			expect(groups).toContain("recent");
			expect(groups).toContain("yesterday");
			expect(groups).toContain("this-week");
			expect(groups).toContain("older");
		});
	});

	describe("SystemGroupedSnapshots (Future)", () => {
		it("should create system group structure", () => {
			const group: SystemGroup = {
				systemId: "apps/web",
				displayName: "Web Application",
				icon: "📦",
				snapshots: [],
				fileCount: 45,
			};

			expect(group.systemId).toBe("apps/web");
			expect(group.fileCount).toBe(45);
		});

		it("should create grouped snapshots with systems and ungrouped", () => {
			const grouped: SystemGroupedSnapshots = {
				systems: [],
				ungrouped: [],
			};

			expect(grouped.systems).toEqual([]);
			expect(grouped.ungrouped).toEqual([]);
		});
	});

	describe("FileGroupedSnapshots (Future)", () => {
		it("should create file group structure", () => {
			const group: FileGroup = {
				filePath: "src/Button.tsx",
				fileName: "Button.tsx",
				snapshots: [],
			};

			expect(group.fileName).toBe("Button.tsx");
			expect(group.snapshots).toEqual([]);
		});

		it("should create grouped snapshots by file", () => {
			const grouped: FileGroupedSnapshots = {
				files: [],
			};

			expect(grouped.files).toEqual([]);
		});
	});

	describe("GroupedSnapshots union type", () => {
		it("should allow time mode", () => {
			const grouped: GroupedSnapshots = {
				mode: "time",
				data: {
					recent: [],
					yesterday: [],
					thisWeek: [],
					older: [],
				},
			};

			expect(grouped.mode).toBe("time");
			if (grouped.mode === "time") {
				expect(grouped.data.recent).toEqual([]);
			}
		});

		it("should allow system mode", () => {
			const grouped: GroupedSnapshots = {
				mode: "system",
				data: {
					systems: [],
					ungrouped: [],
				},
			};

			expect(grouped.mode).toBe("system");
			if (grouped.mode === "system") {
				expect(grouped.data.systems).toEqual([]);
			}
		});

		it("should allow file mode", () => {
			const grouped: GroupedSnapshots = {
				mode: "file",
				data: {
					files: [],
				},
			};

			expect(grouped.mode).toBe("file");
			if (grouped.mode === "file") {
				expect(grouped.data.files).toEqual([]);
			}
		});
	});

	describe("QuickAction", () => {
		it("should create action with required fields", () => {
			const action: QuickAction = {
				id: "create",
				label: "Create Snapshot",
				icon: "📷",
				command: "snapback.snapshot.create",
			};

			expect(action.id).toBe("create");
			expect(action.command).toBe("snapback.snapshot.create");
		});
	});

	describe("ProblemItem", () => {
		it("should create problem with warning severity", () => {
			const problem: ProblemItem = {
				id: "warn-1",
				severity: "warning",
				title: "Unprotected critical file",
				description: ".env file is not protected",
			};

			expect(problem.severity).toBe("warning");
			expect(problem.title).toBe("Unprotected critical file");
		});

		it("should create problem with error severity", () => {
			const problem: ProblemItem = {
				id: "err-1",
				severity: "error",
				title: "Storage initialization failed",
				description: "Cannot write to .snapback directory",
			};

			expect(problem.severity).toBe("error");
		});

		it("should allow optional action", () => {
			const problem: ProblemItem = {
				id: "warn-2",
				severity: "warning",
				title: "Missing protection",
				description: "Critical files need protection",
				action: {
					label: "Protect Files",
					command: "snapback.protection.workspace",
				},
			};

			expect(problem.action).toBeDefined();
			expect(problem.action?.command).toBe("snapback.protection.workspace");
		});
	});
});
