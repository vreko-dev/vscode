import { beforeEach, describe, expect, it, vi } from "vitest";
import { CheckpointNavigatorProvider } from "../../../src/views/checkpointNavigatorProvider";

// Define proper types for the mocks
interface MockStorage {
	list: ReturnType<typeof vi.fn>;
}

describe("CheckpointNavigatorProvider", () => {
	let checkpointNavigatorProvider: CheckpointNavigatorProvider;
	let mockStorage: MockStorage;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create mock storage
		mockStorage = {
			list: vi.fn(),
		};

		// Create instance
		checkpointNavigatorProvider = new CheckpointNavigatorProvider(mockStorage);
	});

	describe("constructor", () => {
		it("should create an instance", () => {
			expect(checkpointNavigatorProvider).toBeDefined();
		});
	});

	describe("refresh", () => {
		it("should fire onDidChangeTreeData event", () => {
			const spy = vi.fn();
			checkpointNavigatorProvider.onDidChangeTreeData(spy);

			checkpointNavigatorProvider.refresh();

			// The event emitter is async, so we need to wait a bit
			expect(spy).toHaveBeenCalled();
		});
	});

	describe("getTreeItem", () => {
		it("should return the same element", () => {
			const mockElement = { label: "test" };
			const result = checkpointNavigatorProvider.getTreeItem(mockElement);
			expect(result).toBe(mockElement);
		});
	});

	describe("getChildren", () => {
		it("should return checkpoints when no element is provided", async () => {
			const mockCheckpoints = [
				{ id: "cp1", timestamp: Date.now(), files: ["file1.txt"] },
				{
					id: "cp2",
					timestamp: Date.now() - 1000,
					files: ["file2.txt"],
				},
			];

			mockStorage.list.mockResolvedValue(mockCheckpoints);

			const children = await checkpointNavigatorProvider.getChildren();

			expect(children).toHaveLength(2);
			expect(children[0]).toBeInstanceOf(CheckpointNode);
			expect(children[1]).toBeInstanceOf(CheckpointNode);
		});

		it("should return checkpoint files when checkpoint element is provided", async () => {
			const mockCheckpoint = {
				id: "cp1",
				timestamp: Date.now(),
				fileContents: {
					"file1.txt": "content 1",
					"file2.txt": "content 2",
				},
			};

			const checkpointNode = new CheckpointNode(mockCheckpoint);
			const children =
				await checkpointNavigatorProvider.getChildren(checkpointNode);

			expect(children).toHaveLength(2);
			expect(children[0]).toBeInstanceOf(CheckpointFileNode);
			expect(children[1]).toBeInstanceOf(CheckpointFileNode);
		});

		it("should return empty array for other element types", async () => {
			const mockElement = { label: "test" };
			const children =
				await checkpointNavigatorProvider.getChildren(mockElement);
			expect(children).toHaveLength(0);
		});

		it("should handle empty checkpoints list", async () => {
			mockStorage.list.mockResolvedValue([]);

			const children = await checkpointNavigatorProvider.getChildren();

			expect(children).toHaveLength(0);
		});

		it("should handle checkpoint with no files", async () => {
			const mockCheckpoint = {
				id: "cp1",
				timestamp: Date.now(),
			};

			const checkpointNode = new CheckpointNode(mockCheckpoint);
			const children =
				await checkpointNavigatorProvider.getChildren(checkpointNode);

			expect(children).toHaveLength(0);
		});
	});
});

describe("CheckpointNode", () => {
	it("should create a checkpoint node with correct properties", () => {
		const mockCheckpoint = {
			id: "cp1234567890",
			timestamp: Date.now(),
			files: ["file1.txt"],
		};

		const node = new CheckpointNode(mockCheckpoint);

		expect(node.label).toBe(
			`Snapshot ${new Date(mockCheckpoint.timestamp).toLocaleString()}`,
		);
		expect(node.contextValue).toBe("checkpoint");
		expect(node.iconPath).toBeDefined();
		expect(node.description).toBe("cp123456");
		expect(node.tooltip).toContain("ID: cp1234567890");
	});
});

describe("CheckpointFileNode", () => {
	it("should create a checkpoint file node with correct properties", () => {
		const node = new CheckpointFileNode("src/test.txt", "cp123");

		expect(node.label).toBe("src/test.txt");
		expect(node.contextValue).toBe("checkpointFile");
		expect(node.iconPath).toBeDefined();
		expect(node.command).toBeDefined();
		expect(node.command?.command).toBe("snapback.openCheckpointFileDiff");
	});
});
