import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SaveHandler } from "../../../src/handlers/SaveHandler";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";

const WORKSPACE_ROOT = "/test/workspace";

function createMockContext(): vscode.ExtensionContext {
	return { subscriptions: [] } as any;
}

describe("SaveHandler warn level behavior", () => {
	let registry: ProtectedFileRegistry;
	let saveHandler: SaveHandler;
	let mockCoordinator: {
		coordinateCheckpointCreation: ReturnType<typeof vi.fn>;
		restoreToCheckpoint: ReturnType<typeof vi.fn>;
	};
	let context: vscode.ExtensionContext;
	let onWillSaveHandlers: Array<(event: any) => void>;
	let showInfoSpy: ReturnType<typeof vi.spyOn>;
	let statusBarSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		onWillSaveHandlers = [];
		(vscode.workspace as any).workspaceFolders = [
			{ uri: { fsPath: WORKSPACE_ROOT } },
		];

		// Mock diagnostic collection for AnalysisCoordinator
		if (!(vscode as any).languages) {
			(vscode as any).languages = {};
		}
		(vscode as any).languages.createDiagnosticCollection = vi
			.fn()
			.mockReturnValue({
				set: vi.fn(),
				delete: vi.fn(),
				dispose: vi.fn(),
			});

		vi.spyOn(vscode.workspace, "onWillSaveTextDocument").mockImplementation(
			(handler: any) => {
				onWillSaveHandlers.push(handler);
				return { dispose: vi.fn() };
			},
		);
		vi.spyOn(vscode.workspace, "applyEdit").mockResolvedValue(true);
		vi.spyOn(vscode.workspace.fs, "readFile").mockResolvedValue(
			Buffer.from("/* disk state */", "utf8"),
		);

		const state = new Map<string, any>();
		const mockMemento = {
			get: (key: string, fallback: any) => state.get(key) ?? fallback,
			update: async (key: string, value: any) => {
				state.set(key, value);
			},
		};
		registry = new ProtectedFileRegistry(mockMemento as any);

		mockCoordinator = {
			coordinateSnapshotCreation: vi.fn(async () => "checkpoint-123"),
			restoreToSnapshot: vi.fn(async () => true),
		};

		statusBarSpy = vi
			.spyOn(vscode.window, "setStatusBarMessage")
			.mockReturnValue({ dispose: vi.fn() } as any);
		showInfoSpy = vi
			.spyOn(vscode.window, "showInformationMessage")
			.mockResolvedValue(undefined);

		context = createMockContext();
		saveHandler = new SaveHandler(registry, mockCoordinator as any);
		saveHandler.register(context);
	});

	afterEach(async () => {
		saveHandler.dispose();
		await registry.clearAll();
		vi.restoreAllMocks();
	});

	async function triggerSave(event: any) {
		for (const handler of onWillSaveHandlers) {
			handler(event);
		}
		expect(event.waitUntil).toHaveBeenCalled();
		const promise = event.waitUntil.mock.calls[0][0];
		await promise;
	}

	it("creates warn-level snapshot and shows notification", async () => {
		const filePath = `${WORKSPACE_ROOT}/warn-file.ts`;
		await registry.add(filePath, { protectionLevel: "Warning" });

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(filePath),
				getText: vi.fn().mockReturnValue("const warn = true;"),
				fileName: filePath,
			},
			waitUntil: vi.fn(),
		};

		await triggerSave(saveEvent);

		expect(mockCoordinator.coordinateSnapshotCreation).toHaveBeenCalledWith(
			false,
			["warn-file.ts"],
			expect.objectContaining({ "warn-file.ts": expect.any(String) }),
			expect.any(String),
		);
		expect(statusBarSpy).toHaveBeenCalledWith(
			expect.stringContaining("Snapshot captured"),
			5000,
		);
		expect(showInfoSpy).toHaveBeenCalledWith(
			expect.stringContaining("SnapBack captured a snapshot"),
			"Restore Snapshot",
		);
	});

	it("restores warn-level snapshot when user selects restore", async () => {
		showInfoSpy.mockResolvedValue("Restore Snapshot" as any);

		const filePath = `${WORKSPACE_ROOT}/warn-file.ts`;
		await registry.add(filePath, { protectionLevel: "Warning" });

		const saveEvent = {
			document: {
				uri: vscode.Uri.file(filePath),
				getText: vi.fn().mockReturnValue("const warn = true;"),
				fileName: filePath,
			},
			waitUntil: vi.fn(),
		};

		await triggerSave(saveEvent);
		// allow the promise chain to resolve
		await Promise.resolve();
		await Promise.resolve();

		expect(mockCoordinator.restoreToSnapshot).toHaveBeenCalledWith(
			"checkpoint-123",
			expect.objectContaining({ files: ["warn-file.ts"] }),
		);
	});
});
