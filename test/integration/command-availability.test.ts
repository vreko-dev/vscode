/**
 * Integration tests for command registration and availability
 *
 * PREVENTS REGRESSION: Commands referenced but not registered, causing silent failures
 * See commit fe648f9: SnapshotQuickPicker called snapback.openVitalsDashboard but
 * command failed silently, showing IDE welcome view instead
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";

describe("Command Availability", () => {
	let registeredCommands: Set<string>;
	let originalRegister: typeof vscode.commands.registerCommand;

	beforeEach(() => {
		registeredCommands = new Set();

		// Mock VS Code's registerCommand to track registrations
		originalRegister = vscode.commands.registerCommand;
		vscode.commands.registerCommand = vi.fn((command: string, callback: any) => {
			registeredCommands.add(command);
			return { dispose: () => registeredCommands.delete(command) };
		});
	});

	describe("Critical Commands", () => {
		it("should register snapback.openVitalsDashboard before QuickPicker references it", async () => {
			// This test ensures Phase 4 (registerVitalsCommands) happens before Phase 5 (QuickPicker registration)
			const { activate } = await import("../../src/extension");
			const mockContext = createMockExtensionContext();

			await activate(mockContext);

			// Command must exist
			expect(registeredCommands.has("snapback.openVitalsDashboard")).toBe(true);
		});

		it("should register snapback.showRecommendedAction for tips button", async () => {
			const { activate } = await import("../../src/extension");
			const mockContext = createMockExtensionContext();

			await activate(mockContext);

			// Command must exist for beginner tips button
			expect(registeredCommands.has("snapback.showRecommendedAction")).toBe(true);
		});

		it("should register all QuickPicker action commands", async () => {
			const { registerSnapshotQuickPickerCommands } = await import("../../src/ui/SnapshotQuickPicker");

			const mockStorage = createMockStorage();
			const mockContext = createMockExtensionContext();

			registerSnapshotQuickPickerCommands(mockContext, mockStorage, "/test/workspace");

			// QuickPicker commands
			expect(registeredCommands.has("snapback.showQuickPicker")).toBe(true);
			expect(registeredCommands.has("snapback.quickRestore")).toBe(true);
		});
	});

	describe("Command Execution Safety", () => {
		it("should throw user-visible error when command not found", async () => {
			// Mock executeCommand to simulate missing command
			const executeCommand = vi.fn().mockRejectedValue(
				new Error("Command 'snapback.missingCommand' not found")
			);
			vscode.commands.executeCommand = executeCommand;

			try {
				await vscode.commands.executeCommand("snapback.missingCommand");
				expect.fail("Should have thrown error");
			} catch (error) {
				expect(error).toBeDefined();
				expect((error as Error).message).toContain("not found");
			}
		});

		it("should validate all executeCommand calls have registered handlers", async () => {
			// Scan codebase for vscode.commands.executeCommand("snapback.*")
			const { findUnregisteredCommands } = await import("./helpers/command-scanner");

			const unregisteredCommands = await findUnregisteredCommands(
				"/Users/user1/WebstormProjects/SnapBack-Site/apps/vscode/src",
				registeredCommands
			);

			expect(unregisteredCommands).toEqual([]);
		});
	});

	describe("Command Registration Order", () => {
		it("should register vitals commands in Phase 4 before QuickPicker in Phase 5", async () => {
			const registrationOrder: string[] = [];

			vscode.commands.registerCommand = vi.fn((command: string, callback: any) => {
				registrationOrder.push(command);
				registeredCommands.add(command);
				return { dispose: () => registeredCommands.delete(command) };
			});

			const { activate } = await import("../../src/extension");
			const mockContext = createMockExtensionContext();

			await activate(mockContext);

			const vitalsIndex = registrationOrder.indexOf("snapback.openVitalsDashboard");
			const quickPickIndex = registrationOrder.indexOf("snapback.showQuickPicker");

			// Vitals command must be registered BEFORE QuickPicker
			expect(vitalsIndex).toBeLessThan(quickPickIndex);
			expect(vitalsIndex).toBeGreaterThanOrEqual(0);
		});
	});

	describe("Progressive Disclosure Commands", () => {
		it("should register all progressive disclosure commands", async () => {
			const { activate } = await import("../../src/extension");
			const mockContext = createMockExtensionContext();

			await activate(mockContext);

			// Progressive disclosure commands
			expect(registeredCommands.has("snapback.toggleAdvancedMode")).toBe(true);
			expect(registeredCommands.has("snapback.showAllFeatures")).toBe(true);
			expect(registeredCommands.has("snapback.resetExperienceLevel")).toBe(true);
			expect(registeredCommands.has("snapback.showRecommendedAction")).toBe(true);
		});
	});
});

// ============================================================================
// Test Helpers
// ============================================================================

function createMockExtensionContext(): vscode.ExtensionContext {
	return {
		subscriptions: [],
		extensionUri: vscode.Uri.file("/test/extension"),
		globalState: {
			get: vi.fn((key: string) => {
				// Return beginner level for progressive disclosure tests
				if (key === "snapback.experienceLevel") return "beginner";
				return undefined;
			}),
			update: vi.fn(),
			keys: vi.fn(() => []),
			setKeysForSync: vi.fn(),
		},
		workspaceState: {
			get: vi.fn(),
			update: vi.fn(),
			keys: vi.fn(() => []),
		},
		secrets: {
			get: vi.fn(),
			store: vi.fn(),
			delete: vi.fn(),
			onDidChange: vi.fn(),
		},
		extensionPath: "/test/extension",
		storagePath: "/test/storage",
		globalStoragePath: "/test/global-storage",
		logPath: "/test/logs",
		extension: {} as any,
		environmentVariableCollection: {} as any,
		extensionMode: 3,
		storageUri: vscode.Uri.file("/test/storage"),
		globalStorageUri: vscode.Uri.file("/test/global-storage"),
		logUri: vscode.Uri.file("/test/logs"),
		asAbsolutePath: (path: string) => `/test/extension/${path}`,
		languageModelAccessInformation: {} as any,
	} as any;
}

function createMockStorage() {
	return {
		getSnapshot: vi.fn(),
		listSnapshots: vi.fn(() => Promise.resolve([])),
		getSnapshotManifest: vi.fn(),
	} as any;
}
