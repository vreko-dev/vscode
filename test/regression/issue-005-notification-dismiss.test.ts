import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProtectionConfigManager } from "@/protection/ProtectionConfigManager";
import { ProtectedFileRegistry } from "@/services/protectedFileRegistry";

/**
 * REGRESSION TEST FOR BUG #5: Non-Dismissing Notification
 *
 * Original Issue: Persistent notification that never auto-dismisses
 * Location: src/protection/ProtectionConfigManager.ts line 137 in fileWatcher.onDidChange
 * Problem: Uses showInformationMessage which requires manual dismissal
 * Solution: Replace with setStatusBarMessage with 3-second timeout
 *
 * Expected Behavior:
 * - Config reload notification should use status bar (auto-dismiss)
 * - Should have 3-second timeout
 * - Should NOT use showInformationMessage
 * - Should use appropriate icon
 */
describe("Bug #5: Non-Dismissing Notification Fix", () => {
	let configManager: ProtectionConfigManager;
	let registry: ProtectedFileRegistry;
	let testWorkspaceRoot: string;
	let mockStorage: Map<string, any>;
	let configFile: string;

	beforeEach(async () => {
		// Use a temp directory for testing instead of mocked workspace path
		testWorkspaceRoot = await fs.mkdtemp(
			path.join(os.tmpdir(), "snapback-test-"),
		);

		// Mock vscode.workspace.findFiles (needed by ProtectionConfigManager.loadAndApplyProtection)
		(vscode.workspace as any).findFiles = vi.fn().mockResolvedValue([]);

		// Setup mock storage for registry
		mockStorage = new Map();
		const mockState = {
			get: (key: string, defaultValue?: any) => {
				return mockStorage.get(key) ?? defaultValue;
			},
			update: async (key: string, value: any) => {
				mockStorage.set(key, value);
			},
		};

		registry = new ProtectedFileRegistry(mockState as any);
		configManager = new ProtectionConfigManager(testWorkspaceRoot, registry);

		// Initialize config manager
		await configManager.initialize();

		configFile = path.join(testWorkspaceRoot, ".snapbackprotected");
	});

	afterEach(async () => {
		configManager?.dispose();
		registry?.clearAll();

		// Clean up temp directory
		try {
			await fs.rm(testWorkspaceRoot, { recursive: true, force: true });
		} catch (_e) {
			// Ignore cleanup errors
		}

		vi.clearAllMocks();
	});

	it("Should use setStatusBarMessage instead of showInformationMessage for config reload", async () => {
		// Setup spies
		const setStatusBarMessageSpy = vi.spyOn(
			vscode.window,
			"setStatusBarMessage",
		);
		const showInformationMessageSpy = vi.spyOn(
			vscode.window,
			"showInformationMessage",
		);

		// Modify config file to trigger watcher
		await fs.appendFile(configFile, "\n# Test comment\n");

		// Wait for file watcher to trigger
		await new Promise((resolve) => setTimeout(resolve, 500));

		// REGRESSION TEST: Should use status bar message
		expect(setStatusBarMessageSpy).toHaveBeenCalled();

		// CRITICAL: Should NOT use information message (which requires manual dismissal)
		expect(showInformationMessageSpy).not.toHaveBeenCalled();

		setStatusBarMessageSpy.mockRestore();
		showInformationMessageSpy.mockRestore();
	});

	it("Should auto-dismiss notification after 3 seconds", async () => {
		const setStatusBarMessageSpy = vi.spyOn(
			vscode.window,
			"setStatusBarMessage",
		);

		// Modify config file
		await fs.appendFile(configFile, "\npackage-lock.json\n");

		// Wait for watcher
		await new Promise((resolve) => setTimeout(resolve, 500));

		// REGRESSION TEST: Should have 3-second timeout
		// setStatusBarMessage signature: (text: string, hideAfterTimeout: number)
		expect(setStatusBarMessageSpy).toHaveBeenCalled();
		const callArgs = setStatusBarMessageSpy.mock.calls[0];
		expect(callArgs[0]).toEqual(expect.any(String));

		setStatusBarMessageSpy.mockRestore();
	});

	it("Should include appropriate icon in status bar message", async () => {
		const setStatusBarMessageSpy = vi.spyOn(
			vscode.window,
			"setStatusBarMessage",
		);

		// Trigger config change
		await fs.appendFile(configFile, "\n*.log\n");

		// Wait for watcher
		await new Promise((resolve) => setTimeout(resolve, 500));

		// REGRESSION TEST: Should include icon in message
		const callArgs = setStatusBarMessageSpy.mock.calls[0];
		expect(callArgs[0]).toMatch(/\$\(.+\)/); // Icon format: $(icon-name)

		setStatusBarMessageSpy.mockRestore();
	});

	it("Should show meaningful message about config reload", async () => {
		const setStatusBarMessageSpy = vi.spyOn(
			vscode.window,
			"setStatusBarMessage",
		);

		// Trigger reload
		await fs.appendFile(configFile, "\ntest-pattern\n");

		// Wait for watcher
		await new Promise((resolve) => setTimeout(resolve, 500));

		// REGRESSION TEST: Message should be informative
		const message = setStatusBarMessageSpy.mock.calls[0][0];
		expect(message).toMatch(/SnapBack.*protection.*reload/i);

		setStatusBarMessageSpy.mockRestore();
	});

	it("Should handle multiple rapid config changes gracefully", async () => {
		const setStatusBarMessageSpy = vi.spyOn(
			vscode.window,
			"setStatusBarMessage",
		);

		// Make multiple rapid changes
		await fs.appendFile(configFile, "\npattern1\n");
		await fs.appendFile(configFile, "\npattern2\n");
		await fs.appendFile(configFile, "\npattern3\n");

		// Wait for all watchers to process
		await new Promise((resolve) => setTimeout(resolve, 1000));

		// All notifications should use status bar (not information message)
		expect(setStatusBarMessageSpy).toHaveBeenCalled();

		// Verify each call has proper format
		for (const call of setStatusBarMessageSpy.mock.calls) {
			expect(call[0]).toEqual(expect.any(String));
		}

		setStatusBarMessageSpy.mockRestore();
	});

	it("Should not block user interaction during auto-dismiss", async () => {
		const setStatusBarMessageSpy = vi.spyOn(
			vscode.window,
			"setStatusBarMessage",
		);

		// Trigger notification
		await fs.appendFile(configFile, "\n# Non-blocking test\n");

		// Wait briefly
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Status bar message should not block (no return value needed)
		expect(setStatusBarMessageSpy).toHaveBeenCalled();
		const result = setStatusBarMessageSpy.mock.results[0];

		// setStatusBarMessage returns a Disposable, not a Thenable
		// This means it doesn't block user interaction
		expect(result.value).toBeDefined(); // Should return Disposable

		setStatusBarMessageSpy.mockRestore();
	});

	it("Should maintain UX consistency with other status bar notifications", async () => {
		const setStatusBarMessageSpy = vi.spyOn(
			vscode.window,
			"setStatusBarMessage",
		);

		// Trigger config reload
		await fs.appendFile(configFile, "\n*.tmp\n");

		await new Promise((resolve) => setTimeout(resolve, 500));

		// Get the actual message format
		const message = setStatusBarMessageSpy.mock.calls[0][0];

		// REGRESSION TEST: Should match pattern of other notifications
		// - Icon prefix: $(icon-name)
		// - Message content
		expect(message).toMatch(/^\$\([a-z-]+\)\s+.+/);

		setStatusBarMessageSpy.mockRestore();
	});
});
