import { describe, expect, it, vi } from "vitest";
import type * as vscode from "vscode";
import { ProtectionConfigManager } from "../../../src/protection/ProtectionConfigManager.js";

describe("Extension Protection Config Initialization", () => {
	it("calls ProtectionConfigManager.initialize during activation", async () => {
		const extension = await import("../../../src/extension");
		const vscodeModule = await import("vscode");

		// Provide minimal ExtensionMode mapping expected by logging
		if (!("ExtensionMode" in vscodeModule)) {
			(vscodeModule as any).ExtensionMode = {
				Development: 1,
				Production: 2,
				Test: 3,
				1: "Development",
				2: "Production",
				3: "Test",
			};
		}

		const initializeSpy = vi
			.spyOn(ProtectionConfigManager.prototype, "initialize")
			.mockResolvedValue();

		const mockContext = {
			subscriptions: [],
			globalState: {
				get: vi.fn().mockReturnValue([]),
				update: vi.fn().mockResolvedValue(undefined),
			},
			workspaceState: {
				get: vi.fn(),
				update: vi.fn().mockResolvedValue(undefined),
			},
			extensionUri: { fsPath: "/tmp" },
			extensionPath: "/tmp",
			extensionMode: 1,
			globalStorageUri: { fsPath: "/tmp" },
			storageUri: { fsPath: "/tmp" },
		} as unknown as vscode.ExtensionContext;

		await extension.activate(mockContext);

		expect(initializeSpy).toHaveBeenCalledTimes(1);

		initializeSpy.mockRestore();
	});
});
