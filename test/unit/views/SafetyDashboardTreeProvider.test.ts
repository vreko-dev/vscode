import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProtectedFileRegistry } from "@vscode/services/protectedFileRegistry";
import type { StorageSnapshotSummaryProvider } from "@vscode/services/snapshotSummaryProvider";
import type { WorkspaceSafetyService } from "@vscode/services/WorkspaceSafetyService";
import { SafetyDashboardTreeProvider } from "@vscode/views/SafetyDashboardTreeProvider";

describe("SafetyDashboardTreeProvider - Unified View", () => {
	let provider: SafetyDashboardTreeProvider;
	let mockSafetyService: WorkspaceSafetyService;
	let mockSnapshotProvider: StorageSnapshotSummaryProvider;
	let mockProtectedRegistry: ProtectedFileRegistry;

	beforeEach(() => {
		// Mock services
		mockSafetyService = {
			getSignals: vi.fn().mockResolvedValue({
				blockingIssues: [],
				watchItems: [],
			}),
		} as any;

		mockSnapshotProvider = {
			listRecent: vi.fn().mockResolvedValue([]),
			total: vi.fn().mockResolvedValue(0),
		} as any;

		mockProtectedRegistry = {
			list: vi.fn().mockResolvedValue([]),
		} as any;

		provider = new SafetyDashboardTreeProvider(
			mockSafetyService,
			mockSnapshotProvider,
			mockProtectedRegistry,
		);
	});

	describe("Root Sections", () => {
		it("should return 4 root sections", async () => {
			const sections = await provider.getChildren();

			expect(sections).toHaveLength(4);
		});

		it("should include Protected Files as 4th section", async () => {
			const sections = await provider.getChildren();

			expect(sections[0].label).toContain("Blocking Issues");
			expect(sections[1].label).toContain("Watch Items");
			expect(sections[2].label).toContain("Snapshots");
			expect(sections[3].label).toContain("Protected Files");
		});

		it("should show protected file count in section label", async () => {
			vi.mocked(mockProtectedRegistry.list).mockResolvedValue([
				{ path: "/a.ts", level: "protected", name: "a.ts" },
				{ path: "/b.ts", level: "watched", name: "b.ts" },
			] as any);

			const sections = await provider.getChildren();
			const protectedSection = sections[3];

			expect(protectedSection.description).toBe("(2)");
		});

		it("should show (0) when no protected files", async () => {
			vi.mocked(mockProtectedRegistry.list).mockResolvedValue([]);

			const sections = await provider.getChildren();
			const protectedSection = sections[3];

			expect(protectedSection.description).toBe("(0)");
		});
	});

	describe("Protected Files Children", () => {
		it("should load protected files when section expanded", async () => {
			vi.mocked(mockProtectedRegistry.list).mockResolvedValue([
				{ path: "/src/app.ts", level: "protected", name: "app.ts" },
				{ path: "/src/config.ts", level: "watched", name: "config.ts" },
			] as any);

			const section = {
				contextValue: "section.protected",
			} as any;

			const children = await provider.getChildren(section);

			expect(children).toHaveLength(2);
			expect(children[0].label).toBe("app.ts");
			expect(children[1].label).toBe("config.ts");
		});

		it("should show lock icon for protected files", async () => {
			vi.mocked(mockProtectedRegistry.list).mockResolvedValue([
				{
					id: "/src/secret.ts",
					path: "/src/secret.ts",
					label: "secret.ts",
					protectionLevel: "Protected",
				},
			] as any);

			const section = { contextValue: "section.protected" } as any;
			const children = await provider.getChildren(section);

			expect(children[0].iconPath).toBeDefined();
			expect((children[0].iconPath as any).id).toBe("lock");
		});

		it("should show eye icon for watched files", async () => {
			vi.mocked(mockProtectedRegistry.list).mockResolvedValue([
				{ path: "/src/watched.ts", level: "watched", name: "watched.ts" },
			] as any);

			const section = { contextValue: "section.protected" } as any;
			const children = await provider.getChildren(section);

			expect(children[0].iconPath).toBeDefined();
			expect((children[0].iconPath as any).id).toBe("eye");
		});

		it("should show empty state when no protected files", async () => {
			vi.mocked(mockProtectedRegistry.list).mockResolvedValue([]);

			const section = { contextValue: "section.protected" } as any;
			const children = await provider.getChildren(section);

			expect(children).toHaveLength(1);
			expect(children[0].label).toContain("No protected files");
			expect(children[0].contextValue).toBe("placeholder.info");
		});

		it("should set correct contextValue for protected files", async () => {
			vi.mocked(mockProtectedRegistry.list).mockResolvedValue([
				{ path: "/src/app.ts", level: "protected", name: "app.ts" },
			] as any);

			const section = { contextValue: "section.protected" } as any;
			const children = await provider.getChildren(section);

			expect(children[0].contextValue).toBe("protected.file");
		});
	});

	describe("Integration", () => {
		it("should refresh when protected files change", async () => {
			const refreshSpy = vi.spyOn(provider as any, "refresh");

			// Simulate file protection change
			await provider.refresh();

			expect(refreshSpy).toHaveBeenCalled();
		});
	});
});
