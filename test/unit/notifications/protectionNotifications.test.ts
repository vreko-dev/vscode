/**
 * @fileoverview Protection Notifications Tests
 *
 * Tests for ProtectionNotifications to ensure proper display and acknowledgment handling.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode before importing
vi.mock("vscode", () => ({
	window: {
		showInformationMessage: vi.fn().mockResolvedValue("Got it"),
	},
}));

import * as vscode from "vscode";
import { ProtectionNotifications } from "../../../src/notifications/protectionNotifications";

describe("ProtectionNotifications", () => {
	let mockGlobalState: any;
	let notifications: ProtectionNotifications;

	beforeEach(() => {
		vi.clearAllMocks();
		const storage = new Map<string, any>();
		mockGlobalState = {
			get: vi.fn(
				(key: string, defaultValue?: any) => storage.get(key) ?? defaultValue,
			),
			update: vi.fn((key: string, value?: any) => {
				if (value === undefined) {
					storage.delete(key);
				} else {
					storage.set(key, value);
				}
				return Promise.resolve();
			}),
		};
		notifications = new ProtectionNotifications(mockGlobalState);
	});

	describe("showProtectionLevelNotification", () => {
		it("should show notification for new protection", async () => {
			await notifications.showProtectionLevelNotification(
				"/path/to/.snapbackrc",
				"Warning",
				true, // new protection
			);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining(".snapbackrc"),
				"Got it",
			);
		});

		it('should show notification with "Don\'t show again" for existing protection', async () => {
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false, // existing protection
			);

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("file.ts"),
				"Got it",
				"Don't show again",
			);
		});

		it("should not show notification if already acknowledged", async () => {
			// First call - acknowledge with "Don't show again"
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
				"Don't show again" as any,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false,
			);

			// Reset mock to verify second call doesn't happen
			vi.clearAllMocks();

			// Second call - should not show
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false,
			);
			expect(vscode.window.showInformationMessage).not.toHaveBeenCalled();
		});

		it("should always show notification for new protection regardless of acknowledgment", async () => {
			// Acknowledge existing
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
				"Don't show again" as any,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false,
			);

			vi.clearAllMocks();

			// New protection should still show (isNewProtection=true)
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				true,
			);
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});

		it("should handle different protection levels independently", async () => {
			// Acknowledge for Warning level
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
				"Don't show again" as any,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false,
			);

			vi.clearAllMocks();

			// Different level should still show
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Protected",
				false,
			);
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});
	});

	describe("showProtectionLevelChanged", () => {
		it("should show notification for level changes", async () => {
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
				"Got it" as any,
			);

			await notifications.showProtectionLevelChanged(
				"/path/file.ts",
				"Watched",
				"Warning",
			);

			// Wait for async notification to be called
			await new Promise((resolve) => setImmediate(resolve));

			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("protection changed"),
				"Got it",
			);
		});
	});

	describe("resetAcknowledgment", () => {
		it("should reset acknowledgment for specific level", async () => {
			// Acknowledge
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValueOnce(
				"Don't show again" as any,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false,
			);

			vi.clearAllMocks();

			// Reset
			await notifications.resetAcknowledgment("/path/file.ts", "Warning");

			// Should show again
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false,
			);
			expect(vscode.window.showInformationMessage).toHaveBeenCalled();
		});

		it("should reset all levels when no level specified", async () => {
			// Acknowledge multiple levels
			vi.mocked(vscode.window.showInformationMessage).mockResolvedValue(
				"Don't show again" as any,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Protected",
				false,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Watched",
				false,
			);

			vi.clearAllMocks();

			// Reset all
			await notifications.resetAcknowledgment("/path/file.ts");

			// All should show again
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				false,
			);
			expect(vscode.window.showInformationMessage).toHaveBeenCalledTimes(1);
		});
	});

	describe("emoji rendering", () => {
		it("should use correct emojis for protection levels", async () => {
			const calls: any[] = [];
			vi.mocked(vscode.window.showInformationMessage).mockImplementation(
				(message: string): Promise<any> => {
					calls.push(message);
					return Promise.resolve("Got it");
				},
			);

			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Watched",
				true,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Warning",
				true,
			);
			await notifications.showProtectionLevelNotification(
				"/path/file.ts",
				"Protected",
				true,
			);

			expect(calls[0]).toContain("👁️"); // Watched emoji
			expect(calls[1]).toContain("⚠️"); // Warning emoji
			expect(calls[2]).toContain("🛑"); // Protected emoji
		});
	});
});
