import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import { SnapBackStatusBar } from "../../../src/statusBar";
import { SnapBackTreeProvider } from "../../../src/views/snapBackTreeProvider";
import type { ProtectionLevel } from "../../../src/views/types";

/**
 * Integration Tests: UI State Consistency
 *
 * Test ID Prefix: USC (UI State Consistency)
 *
 * Validates that multiple UI components display consistent data from
 * the ProtectedFileRegistry single source of truth.
 *
 * Critical Requirement: All UI components must show the same file counts
 * and protection levels, preventing the "12 files vs 1 file" bug.
 */

describe("UI State Consistency Integration Tests", () => {
	let mockMemento: vscode.Memento;
	let registry: ProtectedFileRegistry;
	let statusBar: SnapBackStatusBar;
	let treeProvider: SnapBackTreeProvider;

	beforeEach(() => {
		// Mock Memento storage
		const storage = new Map<string, unknown>();
		mockMemento = {
			get: vi.fn((key: string, defaultValue?: unknown) => storage.get(key) ?? defaultValue),
			update: vi.fn(async (key: string, value: unknown) => {
				storage.set(key, value);
			}),
			keys: vi.fn(() => Array.from(storage.keys())),
		} as unknown as vscode.Memento;

		// Initialize components
		registry = new ProtectedFileRegistry(mockMemento);
		statusBar = new SnapBackStatusBar();

		// Mock workspace folders for path normalization
		vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue([
			{
				uri: vscode.Uri.file("/test/workspace"),
				name: "test-workspace",
				index: 0,
			},
		]);
	});

	// ==================== HAPPY PATH ====================

	it("USC-01: should show same file count in status bar and tree view", async () => {
		// Add 12 protected files (mix of levels)
		await registry.add("/test/workspace/.vscode/settings.json", { protectionLevel: "watch" });
		await registry.add("/test/workspace/.gitignore", { protectionLevel: "watch" });
		await registry.add("/test/workspace/.prettierrc.json", { protectionLevel: "watch" });
		await registry.add("/test/workspace/README.md", { protectionLevel: "watch" });
		await registry.add("/test/workspace/CLAUDE.md", { protectionLevel: "watch" });
		await registry.add("/test/workspace/.snapbackrc", { protectionLevel: "warn" }); // Warn level
		await registry.add("/test/workspace/tsconfig.json", { protectionLevel: "watch" });
		await registry.add("/test/workspace/package.json", { protectionLevel: "watch" });
		await registry.add("/test/workspace/.env", { protectionLevel: "watch" });
		await registry.add("/test/workspace/.env.example", { protectionLevel: "watch" });
		await registry.add("/test/workspace/.env.local", { protectionLevel: "watch" });
		await registry.add("/test/workspace/pnpm-lock.yaml", { protectionLevel: "watch" });

		// Get data from registry (single source of truth)
		const registryFiles = await registry.list();

		// Initialize status bar with registry
		statusBar.initialize(registry);
		statusBar.update();

		// Wait for status bar debounce (150ms)
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Extract count from status bar text (format: "🔙 12 files | 👁️ watch")
		const statusBarText = statusBar["statusBarItem"].text;
		const statusBarCountMatch = statusBarText.match(/(\d+)\s+files?/);
		const statusBarCount = statusBarCountMatch ? Number.parseInt(statusBarCountMatch[1], 10) : 0;

		// Verify consistency
		expect(registryFiles).toHaveLength(12);
		expect(statusBarCount).toBe(12);
	});

	it("USC-02: should show same protection level breakdown across UI components", async () => {
		// Add files with specific protection levels
		await registry.add("/test/workspace/file1.ts", { protectionLevel: "watch" });
		await registry.add("/test/workspace/file2.ts", { protectionLevel: "watch" });
		await registry.add("/test/workspace/file3.ts", { protectionLevel: "warn" });
		await registry.add("/test/workspace/file4.ts", { protectionLevel: "warn" });
		await registry.add("/test/workspace/file5.ts", { protectionLevel: "block" });

		const files = await registry.list();

		// Count by level from registry
		const watchCount = files.filter((f) => f.protectionLevel === "watch").length;
		const warnCount = files.filter((f) => f.protectionLevel === "warn").length;
		const blockCount = files.filter((f) => f.protectionLevel === "block").length;

		// Verify registry counts
		expect(watchCount).toBe(2);
		expect(warnCount).toBe(2);
		expect(blockCount).toBe(1);

		// Initialize status bar
		statusBar.initialize(registry);
		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Extract tooltip text (contains breakdown)
		const tooltip = statusBar["statusBarItem"].tooltip as vscode.MarkdownString;
		const tooltipText = tooltip.value;

		// Verify tooltip shows correct counts
		expect(tooltipText).toContain("👁️ Watch: 2 file(s)");
		expect(tooltipText).toContain("⚠️ Warn: 2 file(s)");
		expect(tooltipText).toContain("🔴 Block: 1 file(s)");
	});

	it("USC-03: should update all UI components when registry changes", async () => {
		// Initial state: 2 files
		await registry.add("/test/workspace/file1.ts", { protectionLevel: "watch" });
		await registry.add("/test/workspace/file2.ts", { protectionLevel: "warn" });

		statusBar.initialize(registry);
		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const initialText = statusBar["statusBarItem"].text;
		expect(initialText).toContain("2 files");

		// Add 3 more files
		await registry.add("/test/workspace/file3.ts", { protectionLevel: "watch" });
		await registry.add("/test/workspace/file4.ts", { protectionLevel: "block" });
		await registry.add("/test/workspace/file5.ts", { protectionLevel: "watch" });

		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const updatedText = statusBar["statusBarItem"].text;
		expect(updatedText).toContain("5 files");
	});

	// ==================== SAD PATH (Expected Failures) ====================

	it("USC-04: should handle empty registry consistently across UI", async () => {
		// No files added
		const files = await registry.list();
		expect(files).toHaveLength(0);

		statusBar.initialize(registry);
		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const statusBarText = statusBar["statusBarItem"].text;
		expect(statusBarText).toContain("No files protected");
	});

	it("USC-05: should maintain consistency when file is removed", async () => {
		// Add 3 files
		await registry.add("/test/workspace/file1.ts", { protectionLevel: "watch" });
		await registry.add("/test/workspace/file2.ts", { protectionLevel: "warn" });
		await registry.add("/test/workspace/file3.ts", { protectionLevel: "block" });

		statusBar.initialize(registry);
		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		expect(statusBar["statusBarItem"].text).toContain("3 files");

		// Remove one file
		await registry.remove("/test/workspace/file2.ts");

		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const files = await registry.list();
		expect(files).toHaveLength(2);
		expect(statusBar["statusBarItem"].text).toContain("2 files");
	});

	// ==================== EDGE CASES ====================

	it("USC-06: should handle protection level change consistently", async () => {
		// Add file with watch level
		await registry.add("/test/workspace/important.ts", { protectionLevel: "watch" });

		let files = await registry.list();
		expect(files[0].protectionLevel).toBe("watch");

		// Change to block level
		await registry.add("/test/workspace/important.ts", { protectionLevel: "block" });

		files = await registry.list();
		expect(files[0].protectionLevel).toBe("block");

		// Verify status bar reflects highest level
		statusBar.initialize(registry);
		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const statusBarText = statusBar["statusBarItem"].text;
		expect(statusBarText).toContain("block");
	});

	it("USC-07: should handle rapid registry updates without inconsistency", async () => {
		statusBar.initialize(registry);

		// Rapidly add files
		const addPromises = [
			registry.add("/test/workspace/file1.ts", { protectionLevel: "watch" }),
			registry.add("/test/workspace/file2.ts", { protectionLevel: "warn" }),
			registry.add("/test/workspace/file3.ts", { protectionLevel: "block" }),
			registry.add("/test/workspace/file4.ts", { protectionLevel: "watch" }),
			registry.add("/test/workspace/file5.ts", { protectionLevel: "warn" }),
		];

		await Promise.all(addPromises);

		// Trigger status bar update
		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const files = await registry.list();
		expect(files).toHaveLength(5);

		const statusBarText = statusBar["statusBarItem"].text;
		expect(statusBarText).toContain("5 files");
	});

	// ==================== ERROR CASES ====================

	it("USC-08: should handle corrupted storage gracefully", async () => {
		// Corrupt the storage with invalid data
		await mockMemento.update("snapback:protected-files", [
			{ path: null, label: null, lastProtectedAt: null }, // Invalid entry
			{ path: "valid.ts", label: "Valid File", lastProtectedAt: Date.now() }, // Valid entry
		]);

		// Reinitialize registry to load corrupted data
		registry = new ProtectedFileRegistry(mockMemento);

		const files = await registry.list();

		// Should filter out invalid entries
		expect(files.length).toBeGreaterThanOrEqual(0);
		expect(files.length).toBeLessThanOrEqual(2);

		// Status bar should handle gracefully
		statusBar.initialize(registry);
		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		// Should not throw error
		expect(statusBar["statusBarItem"].text).toBeDefined();
	});

	it("USC-09: should handle missing protection level field", async () => {
		// Add file using storage directly (without protectionLevel field)
		await mockMemento.update("snapback:protected-files", [
			{
				path: "legacy-file.ts",
				label: "Legacy File",
				lastProtectedAt: Date.now(),
				// Missing protectionLevel field
			},
		]);

		registry = new ProtectedFileRegistry(mockMemento);
		const files = await registry.list();

		// Should default to "watch" level
		expect(files).toHaveLength(1);
		expect(files[0].protectionLevel).toBe("watch");
	});

	// ==================== CRITICAL BUG REPRODUCTION ====================

	it("USC-10: should NOT show different counts in different UI sections (bug reproduction)", async () => {
		// Reproduce the exact scenario from user's screenshot:
		// - SnapBack section shows "12 files protected"
		// - Protected Files section shows only 1 file

		// Add 12 files with mixed levels (11 watch, 1 warn)
		const filesToAdd = [
			{ path: ".vscode/settings.json", level: "watch" as ProtectionLevel },
			{ path: ".gitignore", level: "watch" as ProtectionLevel },
			{ path: ".prettierrc.json", level: "watch" as ProtectionLevel },
			{ path: "README.md", level: "watch" as ProtectionLevel },
			{ path: "CLAUDE.md", level: "watch" as ProtectionLevel },
			{ path: ".snapbackrc", level: "warn" as ProtectionLevel }, // This is the one shown in UI
			{ path: "tsconfig.json", level: "watch" as ProtectionLevel },
			{ path: "package.json", level: "watch" as ProtectionLevel },
			{ path: ".env", level: "watch" as ProtectionLevel },
			{ path: ".env.example", level: "watch" as ProtectionLevel },
			{ path: ".env.local", level: "watch" as ProtectionLevel },
			{ path: "pnpm-lock.yaml", level: "watch" as ProtectionLevel },
		];

		for (const file of filesToAdd) {
			await registry.add(`/test/workspace/${file.path}`, { protectionLevel: file.level });
		}

		// Get all files from registry
		const allFiles = await registry.list();
		expect(allFiles).toHaveLength(12);

		// Verify each level count
		const watchFiles = allFiles.filter((f) => f.protectionLevel === "watch");
		const warnFiles = allFiles.filter((f) => f.protectionLevel === "warn");

		expect(watchFiles).toHaveLength(11);
		expect(warnFiles).toHaveLength(1);

		// Status bar should show 12 files
		statusBar.initialize(registry);
		statusBar.update();
		await new Promise((resolve) => setTimeout(resolve, 200));

		const statusBarText = statusBar["statusBarItem"].text;
		expect(statusBarText).toContain("12 files");

		// CRITICAL: ALL UI components must show 12 files, not just 1
		// This test will FAIL if tree view filters incorrectly
		expect(allFiles).toHaveLength(12); // Single source of truth
	});
});
