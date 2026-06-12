// apps/vscode/test/unit/commands/diffCommands.test.ts

import { describe, it, expect, vi, beforeEach } from "vitest";
import * as vscode from "vscode";
import { showSnapshotFileDiff } from "../../../src/commands/diffCommands";
import type { IStorageManager, SnapshotManifest } from "../../../src/storage/types";

// Mock vscode
vi.mock("vscode", () => ({
  commands: {
    executeCommand: vi.fn(),
  },
  window: {
    showErrorMessage: vi.fn(),
    showInformationMessage: vi.fn(),
  },
  workspace: {
    fs: {
      stat: vi.fn(),
    },
  },
  Uri: {
    file: vi.fn((path) => ({ fsPath: path, scheme: "file", path })),
    parse: vi.fn((uri) => ({ toString: () => uri })),
  },
  ViewColumn: {
    Active: 1,
  },
}));

describe("diffCommands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("showSnapshotFileDiff", () => {
    it("should open diff view for valid snapshot file", async () => {
      const mockManifest: SnapshotManifest = {
        id: "snap-123",
        timestamp: Date.now(),
        name: "Test Snapshot",
        trigger: "manual",
        anchorFile: "/src/index.ts",
        files: {
          "/src/index.ts": { blob: "hash", size: 100 },
        },
      };

      const storageManager = {
        getSnapshotManifest: vi.fn().mockResolvedValue(mockManifest),
      } as unknown as IStorageManager;

      // Mock file exists
      vi.mocked(vscode.workspace.fs.stat).mockResolvedValue({} as any);

      await showSnapshotFileDiff("snap-123", "/src/index.ts", storageManager);

      expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
        "vscode.diff",
        expect.anything(), // left URI
        expect.anything(), // right URI
        expect.stringContaining("index.ts"),
        expect.anything()
      );
    });

    it("should show error for non-existent snapshot", async () => {
      const storageManager = {
        getSnapshotManifest: vi.fn().mockResolvedValue(null),
      } as unknown as IStorageManager;

      await showSnapshotFileDiff("nonexistent", "/file.ts", storageManager);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("not found")
      );
      expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
    });

    it("should show error for file not in snapshot", async () => {
      const mockManifest: SnapshotManifest = {
        id: "snap-123",
        timestamp: Date.now(),
        name: "Test",
        trigger: "manual",
        anchorFile: "/src/index.ts",
        files: {
          "/src/index.ts": { blob: "h", size: 1 },
        },
      };

      const storageManager = {
        getSnapshotManifest: vi.fn().mockResolvedValue(mockManifest),
      } as unknown as IStorageManager;

      await showSnapshotFileDiff("snap-123", "/other/file.ts", storageManager);

      expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
        expect.stringContaining("not found in snapshot")
      );
    });
  });
});
