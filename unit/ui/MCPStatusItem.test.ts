import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { MCPStatusItem } from "../../../src/ui/MCPStatusItem";

// Mock DaemonBridge
const mockBridge = {
	getState: vi.fn().mockReturnValue("disconnected" as const),
	getDaemonVersion: vi.fn().mockReturnValue(undefined),
	isConnected: vi.fn().mockReturnValue(false),
	onStateChange: vi.fn().mockReturnValue({ dispose: vi.fn() }),
};

vi.mock("../../../src/services/DaemonBridge", () => ({
	getDaemonBridge: vi.fn(() => mockBridge),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("MCPStatusItem", () => {
	let statusItem: MCPStatusItem;

	beforeEach(() => {
		vi.clearAllMocks();

		// Reset bridge mock defaults
		mockBridge.getState.mockReturnValue("disconnected");
		mockBridge.getDaemonVersion.mockReturnValue(undefined);
		mockBridge.isConnected.mockReturnValue(false);
		mockBridge.onStateChange.mockReturnValue({ dispose: vi.fn() });

		// Mock event registrations to return disposables
		vi.mocked(vscode.workspace.onDidChangeWorkspaceFolders).mockReturnValue({ dispose: vi.fn() } as any);
		vi.mocked(vscode.window.onDidChangeActiveTextEditor).mockReturnValue({ dispose: vi.fn() } as any);

		// Mock workspace folders
		vi.mocked(vscode.workspace).workspaceFolders = [
			{
				uri: { fsPath: "/test/workspace", toString: () => "file:///test/workspace" },
				name: "test",
				index: 0,
			},
		] as any;
	});

	afterEach(() => {
		if (statusItem) {
			statusItem.dispose();
		}
	});

	describe("Construction", () => {
		it("should construct without parameters (deprecated API)", () => {
			statusItem = new MCPStatusItem();
			expect(statusItem).toBeDefined();
		});

		it("should implement Disposable", () => {
			statusItem = new MCPStatusItem();
			expect(typeof statusItem.dispose).toBe("function");
		});
	});

	describe("State Delegation", () => {
		it("should delegate getState() to DaemonBridge", () => {
			mockBridge.getState.mockReturnValue("connected");
			statusItem = new MCPStatusItem();

			const state = statusItem.getState();
			expect(state).toBe("connected");
		});

		it("should return disconnected when no workspace is active", () => {
			vi.mocked(vscode.workspace).workspaceFolders = [] as any;

			statusItem = new MCPStatusItem();

			expect(statusItem.getState()).toBe("disconnected");
		});

		it("should delegate isConnected() to DaemonBridge", () => {
			mockBridge.isConnected.mockReturnValue(true);
			statusItem = new MCPStatusItem();

			expect(statusItem.isConnected()).toBe(true);
		});

		it("should return false for isConnected when no workspace", () => {
			vi.mocked(vscode.workspace).workspaceFolders = [] as any;

			statusItem = new MCPStatusItem();

			expect(statusItem.isConnected()).toBe(false);
		});

		it("should reflect connected state from DaemonBridge", () => {
			mockBridge.getState.mockReturnValue("connected");
			statusItem = new MCPStatusItem();
			expect(statusItem.getState()).toBe("connected");
		});

		it("should reflect degraded state from DaemonBridge", () => {
			mockBridge.getState.mockReturnValue("degraded");
			statusItem = new MCPStatusItem();
			expect(statusItem.getState()).toBe("degraded");
		});

		it("should reflect reconnecting state from DaemonBridge", () => {
			mockBridge.getState.mockReturnValue("reconnecting");
			statusItem = new MCPStatusItem();
			expect(statusItem.getState()).toBe("reconnecting");
		});

		it("should reflect cli_missing state from DaemonBridge", () => {
			mockBridge.getState.mockReturnValue("cli_missing");
			statusItem = new MCPStatusItem();
			expect(statusItem.getState()).toBe("cli_missing");
		});
	});

	describe("Workspace Tracking", () => {
		it("should subscribe to daemon state changes for active workspace", () => {
			statusItem = new MCPStatusItem();
			expect(mockBridge.onStateChange).toHaveBeenCalled();
		});

		it("should not subscribe when no workspace folders exist", () => {
			vi.mocked(vscode.workspace).workspaceFolders = [] as any;
			statusItem = new MCPStatusItem();
			// onStateChange should not be called since no workspace
			expect(mockBridge.onStateChange).not.toHaveBeenCalled();
		});
	});

	describe("Disposal", () => {
		it("should clean up disposables on dispose", () => {
			statusItem = new MCPStatusItem();
			// Should not throw
			expect(() => statusItem.dispose()).not.toThrow();
		});

		it("should dispose state change subscription", () => {
			const mockDispose = vi.fn();
			mockBridge.onStateChange.mockReturnValue({ dispose: mockDispose });

			statusItem = new MCPStatusItem();
			statusItem.dispose();

			expect(mockDispose).toHaveBeenCalled();
		});
	});
});
