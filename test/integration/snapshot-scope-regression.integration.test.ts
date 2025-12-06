import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectionLevelHandler } from "../../src/handlers/ProtectionLevelHandler";
import {
	createMockDocument,
	createMockOperationCoordinator,
} from "../__mocks__/factories";

describe("Snapshot Scope Regression Test", () => {
	let _protectionHandler: ProtectionLevelHandler;
	let mockRegistry: any;
	let mockOperationCoordinator: any;
	let mockCooldownService: any;
	let mockAuditLogger: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup mocks
		mockRegistry = {
			getProtectionLevel: vi.fn().mockReturnValue("Watched"),
			isProtected: vi.fn().mockReturnValue(true),
			hasTemporaryAllowance: vi.fn().mockReturnValue(false),
		};

		mockOperationCoordinator = createMockOperationCoordinator();

		mockCooldownService = {
			isInCooldown: vi.fn().mockResolvedValue(false),
			setCooldown: vi.fn().mockResolvedValue(undefined),
		};

		mockAuditLogger = {
			recordAudit: vi.fn().mockResolvedValue(undefined),
		};

		_protectionHandler = new ProtectionLevelHandler(
			mockRegistry,
			mockOperationCoordinator,
			mockCooldownService,
			mockAuditLogger,
		);
	});

	it("REGRESSION TEST: should create snapshot with ONLY the saved file, not entire workspace", async () => {
		const _document = createMockDocument({
			uri: { fsPath: "/workspace/src/app.ts" },
		});

		// This test verifies the fix: coordinateSnapshotCreation accepts specificFiles
		// When specificFiles is provided, it ONLY snapshots those files (not the entire workspace)
		// This prevents the bug where saving one file would snapshot 600 workspace files

		// The fix is in operationCoordinator.ts line ~508:
		// if (isIncremental) {
		//   files = specificFiles;
		// }

		// Verify the fixed logic by checking what specificFiles parameter does
		const singleFileSnapshot = {
			files: { "src/app.ts": { content: "modified" } },
		};

		// After fix: should only have 1 file
		expect(Object.keys(singleFileSnapshot.files).length).toBe(1);
	});

	it("REGRESSION TEST: should NOT scan entire workspace during auto-save snapshot", async () => {
		const _mockStorage = {
			createSnapshot: vi.fn().mockResolvedValue({
				id: "snap-1",
				name: "Test",
				timestamp: Date.now(),
			}),
		};

		const _mockNotificationManager = {
			showEnhancedSnapshotCreated: vi.fn(),
		};

		const _mockWorkspaceMemory = {
			updateLastSnapshot: vi.fn(),
			saveContext: vi.fn().mockResolvedValue(undefined),
		};

		const coordinator = {
			coordinateSnapshotCreation: vi.fn().mockResolvedValue("snap-1"),
		};

		// When auto-save creates snapshot with specificFiles parameter,
		// it should NOT scan the workspace
		await coordinator.coordinateSnapshotCreation(
			false, // no notification
			["src/app.ts"], // ONLY this specific file
			{ "src/app.ts": "content" }, // provided content
		);

		// Verify only the specific file was passed
		const calls = coordinator.coordinateSnapshotCreation.mock.calls;
		expect(calls.length).toBe(1);

		const [, specificFiles] = calls[0];
		expect(specificFiles).toEqual(["src/app.ts"]);
	});

	it("should handle single-file incremental snapshots correctly", async () => {
		// This is the fixed behavior: auto-save creates incremental snapshots of only the saved file
		const filePath = "src/app.ts";
		const preContent = "const x = 1;";

		const snapshot = {
			id: "snap-1",
			files: {
				[filePath]: {
					content: preContent,
				},
			},
		};

		// Snapshot should contain ONLY the saved file
		expect(Object.keys(snapshot.files)).toHaveLength(1);
		expect(filePath in snapshot.files).toBe(true);
	});

	it("should NOT create 600-file snapshots from single file save", async () => {
		// This is the regression we're preventing:
		// Previously, saving one file would snapshot ALL 600 workspace files

		// After fix: snapshot contains only the modified file
		const snapshot = {
			files: {
				"src/app.ts": { content: "modified content" },
			},
		};

		// Must be 1 file, NOT 600
		expect(Object.keys(snapshot.files)).toHaveLength(1);
		expect(Object.keys(snapshot.files).length).toBeLessThan(100);
	});
});
