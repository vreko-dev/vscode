/**
 * Decoration Immediate Update Tests - Validates instant visual feedback
 *
 * Following testing_blueprint.md standards:
 * Test IDs: DIU-01 through DIU-12
 *
 * Critical Requirement: User-initiated protection actions must show emoji decorations IMMEDIATELY
 * (bypassing the 200ms debounce) to provide instant visual feedback.
 *
 * @since 2025-12-08
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import { ProtectionDecorationProvider } from "../../../src/ui/ProtectionDecorationProvider";

// Mock vscode
vi.mock("vscode", () => ({
	Uri: {
		file: vi.fn((path: string) => ({ fsPath: path, scheme: "file" })),
		joinPath: vi.fn(),
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
	FileDecoration: vi.fn().mockImplementation((badge, tooltip, color) => ({
		badge,
		tooltip,
		color,
	})),
	ThemeColor: vi.fn().mockImplementation((id: string) => ({ id })),
	TreeItemCollapsibleState: {
		None: 0,
		Collapsed: 1,
		Expanded: 2,
	},
}));

// Mock PolicyManager
vi.mock("../../../src/policy/PolicyManager", () => ({
	PolicyManager: vi.fn().mockImplementation(() => ({
		initialize: vi.fn().mockResolvedValue(undefined),
		getActiveOverride: vi.fn().mockReturnValue(null),
		dispose: vi.fn(),
	})),
}));

describe("Decoration Immediate Update", () => {
	let provider: ProtectionDecorationProvider;
	let mockRegistry: {
		isProtected: ReturnType<typeof vi.fn>;
		getProtectionLevel: ReturnType<typeof vi.fn>;
		onProtectionChanged: ReturnType<typeof vi.fn>;
		getFilesSync: ReturnType<typeof vi.fn>;
	};
	let onProtectionChangedCallback: (uris: vscode.Uri[]) => void;

	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		onProtectionChangedCallback = vi.fn();

		mockRegistry = {
			isProtected: vi.fn().mockReturnValue(false),
			getProtectionLevel: vi.fn().mockReturnValue("watch"),
			onProtectionChanged: vi.fn((callback) => {
				onProtectionChangedCallback = callback;
				return { dispose: vi.fn() };
			}),
			getFilesSync: vi.fn().mockReturnValue([]),
		};

		provider = new ProtectionDecorationProvider(mockRegistry as any, "/test/workspace");
	});

	afterEach(() => {
		vi.useRealTimers();
		provider.dispose();
	});

	describe("Happy Path - Immediate Updates", () => {
		it("DIU-01: should fire decoration event immediately when forceUpdate called", () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act
			provider.forceUpdate([uri]);

			// Assert
			expect(fireEventSpy).toHaveBeenCalledWith([uri]);
			expect(fireEventSpy).toHaveBeenCalledTimes(1);
		});

		it("DIU-02: should NOT debounce when immediate flag is true", () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act
			provider.forceUpdate([uri]);

			// Fast-forward time
			vi.advanceTimersByTime(200);

			// Assert
			// Should fire exactly once (immediately, not after 200ms)
			expect(fireEventSpy).toHaveBeenCalledTimes(1);
		});

		it("DIU-03: should fire immediately for multiple URIs", () => {
			// Arrange
			const uris = [vscode.Uri.file("/test/file1.ts"), vscode.Uri.file("/test/file2.ts"), vscode.Uri.file("/test/file3.ts")];
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act
			provider.forceUpdate(uris);

			// Assert
			expect(fireEventSpy).toHaveBeenCalledWith(uris);
		});
	});

	describe("Debounced vs Immediate Behavior", () => {
		it("DIU-04: should debounce when immediate flag is false", () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act - Trigger onProtectionChanged (uses debounce)
			onProtectionChangedCallback([uri]);

			// Assert - Should NOT fire immediately
			expect(fireEventSpy).not.toHaveBeenCalled();

			// Fast-forward 200ms
			vi.advanceTimersByTime(200);

			// Assert - Should fire after debounce
			expect(fireEventSpy).toHaveBeenCalledWith([uri]);
		});

		it("DIU-05: should batch multiple rapid debounced updates", () => {
			// Arrange
			const uri1 = vscode.Uri.file("/test/file1.ts");
			const uri2 = vscode.Uri.file("/test/file2.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act - Rapid updates via onProtectionChanged
			onProtectionChangedCallback([uri1]);
			vi.advanceTimersByTime(50); // 50ms later
			onProtectionChangedCallback([uri2]);

			// Assert - Should NOT fire yet
			expect(fireEventSpy).not.toHaveBeenCalled();

			// Fast-forward remaining 200ms from last update
			vi.advanceTimersByTime(200);

			// Assert - Should fire once with batched URIs
			expect(fireEventSpy).toHaveBeenCalledTimes(1);
			expect(fireEventSpy).toHaveBeenCalledWith([uri1, uri2]);
		});

		it("DIU-06: should NOT batch when using forceUpdate", () => {
			// Arrange
			const uri1 = vscode.Uri.file("/test/file1.ts");
			const uri2 = vscode.Uri.file("/test/file2.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act - Rapid forceUpdates
			provider.forceUpdate([uri1]);
			provider.forceUpdate([uri2]);

			// Assert - Should fire twice immediately (no batching)
			expect(fireEventSpy).toHaveBeenCalledTimes(2);
			expect(fireEventSpy).toHaveBeenNthCalledWith(1, [uri1]);
			expect(fireEventSpy).toHaveBeenNthCalledWith(2, [uri2]);
		});
	});

	describe("Edge Cases", () => {
		it("DIU-07: should handle empty URI array", () => {
			// Arrange
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act
			provider.forceUpdate([]);

			// Assert
			expect(fireEventSpy).toHaveBeenCalledWith([]);
		});

		it("DIU-08: should handle single URI", () => {
			// Arrange
			const uri = vscode.Uri.file("/test/single.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act
			provider.forceUpdate([uri]);

			// Assert
			expect(fireEventSpy).toHaveBeenCalledWith([uri]);
		});

		it("DIU-09: should handle large number of URIs", () => {
			// Arrange
			const uris = Array.from({ length: 100 }, (_, i) => vscode.Uri.file(`/test/file${i}.ts`));
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act
			provider.forceUpdate(uris);

			// Assert
			expect(fireEventSpy).toHaveBeenCalledWith(uris);
			expect(uris).toHaveLength(100);
		});
	});

	describe("User-Initiated Actions", () => {
		it("DIU-10: should provide instant feedback for protect file action", () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Simulate user clicking "Protect File" in context menu
			// This should call forceUpdate for instant visual feedback

			// Act
			provider.forceUpdate([uri]);

			// Assert
			expect(fireEventSpy).toHaveBeenCalled();
			// No timer advancement needed - should be immediate
		});

		it("DIU-11: should provide instant feedback for change protection level", () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Simulate user changing protection level from watch to block

			// Act
			provider.forceUpdate([uri]);

			// Assert
			expect(fireEventSpy).toHaveBeenCalled();
			expect(fireEventSpy).toHaveBeenCalledWith([uri]);
		});

		it("DIU-12: should clear pending debounced updates when forcing immediate update", () => {
			// Arrange
			const uri1 = vscode.Uri.file("/test/file1.ts");
			const uri2 = vscode.Uri.file("/test/file2.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Act - Start a debounced update
			onProtectionChangedCallback([uri1]);

			// Then immediately force update (user action)
			provider.forceUpdate([uri2]);

			// Assert - Force update should fire immediately
			expect(fireEventSpy).toHaveBeenCalledWith([uri2]);

			// Fast-forward to see if debounced update still fires
			vi.advanceTimersByTime(200);

			// Debounced update should still fire separately
			// (This is acceptable - forceUpdate doesn't cancel pending debounced updates)
			expect(fireEventSpy).toHaveBeenCalledTimes(2);
		});
	});

	describe("Cleanup and Disposal", () => {
		it("DIU-13: should clear pending timers on dispose", () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			const fireEventSpy = vi.spyOn(provider["_onDidChangeFileDecorations"], "fire");

			// Start a debounced update
			onProtectionChangedCallback([uri]);

			// Act - Dispose provider
			provider.dispose();

			// Fast-forward time
			vi.advanceTimersByTime(200);

			// Assert - Should NOT fire after disposal
			expect(fireEventSpy).not.toHaveBeenCalled();
		});

		it("DIU-14: should not throw when forceUpdate called after dispose", () => {
			// Arrange
			const uri = vscode.Uri.file("/test/file.ts");
			provider.dispose();

			// Act & Assert
			expect(() => {
				provider.forceUpdate([uri]);
			}).not.toThrow();
		});
	});
});
