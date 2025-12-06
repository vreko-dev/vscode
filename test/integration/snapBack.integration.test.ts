import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { NotificationManager } from "../../src/notificationManager";
import { OperationCoordinator } from "../../src/operationCoordinator";
import { StorageSnapshotSummaryProvider } from "../../src/services/snapshotSummaryProvider";
import {
	confirmRestoration,
	showSnapshotSelection,
} from "../../src/snapshotSelector";
import { SnapBackTreeProvider } from "../../src/views/snapBackTreeProvider";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory";
import { createMockStorage } from "../helpers/mockStorage";
import { createMockProtectedFileRegistry } from "../helpers/protectionLevelHelpers";

vi.mock("@snapback/storage", () => ({
	FileSystemStorage: vi.fn().mockImplementation(() => ({
		create: vi.fn().mockResolvedValue({
			id: "snapshot-1",
			timestamp: Date.now(),
		}),
		retrieve: vi.fn().mockResolvedValue({
			id: "snapshot-1",
			timestamp: Date.now(),
			meta: {},
		}),
		list: vi.fn().mockResolvedValue([
			{
				id: "snapshot-1",
				timestamp: Date.now() - 1000,
				meta: { name: "updated-react" },
			},
		]),
		restore: vi.fn().mockResolvedValue({
			success: true,
			restoredFiles: ["src/index.ts"],
			conflicts: [],
		}),
	})),
}));

vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn(),
		showWarningMessage: vi.fn(),
		showErrorMessage: vi.fn(),
		showQuickPick: vi.fn(),
	},
}));

vi.mock("../../src/snapshotSelector", () => ({
	showSnapshotSelection: vi.fn(),
	confirmRestoration: vi.fn(),
}));

describe("SnapBack integration", () => {
	let coordinator: OperationCoordinator;
	let treeProvider: SnapBackTreeProvider;
	let restoreSpy: ReturnType<typeof vi.spyOn>;
	let mockStorage: any;

	beforeEach(() => {
		// Create mock storage
		mockStorage = createMockStorage();

		const workspaceMemory = new WorkspaceMemoryManager(mockStorage);
		const notificationManager = new NotificationManager();

		// Create properly mocked protected file registry with all required methods
		const mockRegistry = createMockProtectedFileRegistry();

		treeProvider = new SnapBackTreeProvider(
			new StorageSnapshotSummaryProvider(mockStorage),
			mockRegistry,
		);

		coordinator = new OperationCoordinator(
			workspaceMemory,
			notificationManager,
			mockStorage,
		);

		restoreSpy = vi
			.spyOn(coordinator, "restoreToSnapshot")
			.mockResolvedValue(true);

		vi.clearAllMocks();
	});

	it("shows snapshot picker with available snapshots", async () => {
		const mockSnapshot = {
			label: "updated-react",
			id: "snapshot-1",
			description: "2 minutes ago",
			detail: "Snapshot ID: snapshot-1",
			timestamp: Date.now() - 1000,
		};

		(showSnapshotSelection as ReturnType<typeof vi.fn>).mockResolvedValue(
			mockSnapshot,
		);

		const selection = await showSnapshotSelection(
			coordinator,
			"Select snapshot",
		);

		expect(selection?.id).toBe("snapshot-1");
		expect(showSnapshotSelection).toHaveBeenCalledWith(
			coordinator,
			"Select snapshot",
		);
	});

	it("restores snapshot and refreshes tree view", async () => {
		const snapshot = {
			label: "updated-react",
			id: "snapshot-1",
			description: "2 minutes ago",
			detail: "Snapshot ID: snapshot-1",
			timestamp: Date.now() - 1000,
		};

		(showSnapshotSelection as ReturnType<typeof vi.fn>).mockResolvedValue(
			snapshot,
		);
		(confirmRestoration as ReturnType<typeof vi.fn>).mockResolvedValue(true);

		const treeRefreshSpy = vi.spyOn(treeProvider, "refresh");

		const selection = await showSnapshotSelection(
			coordinator,
			"Select snapshot",
		);

		const confirmed = await confirmRestoration(selection?.label);
		expect(confirmed).toBe(true);

		const result = await coordinator.restoreToSnapshot(snapshot.id);
		expect(result).toBe(true);
		expect(restoreSpy).toHaveBeenCalledWith("snapshot-1");

		treeProvider.refresh();
		expect(treeRefreshSpy).toHaveBeenCalled();

		expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
			`Workspace successfully restored to snapshot "${snapshot.label}"`,
		);
	});

	it("does not restore when selection is cancelled", async () => {
		(showSnapshotSelection as ReturnType<typeof vi.fn>).mockResolvedValue(
			undefined,
		);

		const selection = await showSnapshotSelection(
			coordinator,
			"Select snapshot",
		);

		expect(selection).toBeUndefined();
		expect(restoreSpy).not.toHaveBeenCalled();
	});

	it("shows error message when restoration fails", async () => {
		const snapshot = {
			label: "updated-react",
			id: "snapshot-1",
			description: "2 minutes ago",
			detail: "Snapshot ID: snapshot-1",
			timestamp: Date.now() - 1000,
		};

		(showSnapshotSelection as ReturnType<typeof vi.fn>).mockResolvedValue(
			snapshot,
		);
		(confirmRestoration as ReturnType<typeof vi.fn>).mockResolvedValue(true);

		restoreSpy.mockResolvedValueOnce(false);

		await coordinator.restoreToSnapshot(snapshot.id);

		expect(vscode.window.showErrorMessage).toHaveBeenCalled();
	});
});
