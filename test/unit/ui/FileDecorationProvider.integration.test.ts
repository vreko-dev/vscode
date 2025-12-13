/**
 * FileDecorationProvider Integration Tests
 *
 * TDD RED PHASE: Tests for FileDecorationProvider wiring with ProtectedFileRegistry
 *
 * Per TDD_CORE.md:
 * - 4-path coverage: happy, sad, edge, error
 * - NEVER use vague assertions
 * - Tests MUST fail initially
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { FileDecorationProvider } from "../../../src/ui/fileDecorations";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import type { ProtectionLevel } from "../../../src/styles/designTokens";

// Type helper for tests - allows passing registry to constructor
// This will fail at runtime until we implement the feature
type FileDecorationProviderWithRegistry = new (registry?: ProtectedFileRegistry) => FileDecorationProvider;

// Mock vscode module
vi.mock("vscode", () => {
	class MockEventEmitter {
		private listener: any = null;

		get event() {
			return (callback: any) => {
				this.listener = callback;
				return { dispose: vi.fn() };
			};
		}

		fire(data: any) {
			this.listener?.(data);
		}

		dispose() {
			this.listener = null;
		}
	}

	class MockFileDecoration {
		constructor(public badge?: string, public tooltip?: string, public color?: any) {}
	}

	class MockThemeColor {
		constructor(public id: string) {}
	}

	return {
		Uri: {
			file: (path: string) => ({ fsPath: path, scheme: "file" }),
		},
		EventEmitter: MockEventEmitter,
		ThemeColor: MockThemeColor,
		FileDecoration: MockFileDecoration,
	};
});

describe("FileDecorationProvider Integration", () => {
	let provider: FileDecorationProvider;
	let mockRegistry: Partial<ProtectedFileRegistry>;

	beforeEach(() => {
		// Create mock ProtectedFileRegistry with proper disposable return
		mockRegistry = {
			getProtectionLevel: vi.fn(),
			onProtectionChanged: vi.fn().mockReturnValue({ dispose: vi.fn() }),
		};
	});

	afterEach(() => {
		provider?.dispose();
		vi.clearAllMocks();
	});

	describe("HAPPY PATH: Protected file decoration", () => {
		it("should return WATCH decoration for files with watch protection level", () => {
			// Arrange
			(mockRegistry.getProtectionLevel as any).mockReturnValue("watch");
			provider = new (FileDecorationProvider as unknown as FileDecorationProviderWithRegistry)(mockRegistry as ProtectedFileRegistry);
			const uri = vscode.Uri.file("/workspace/src/index.ts");

			// Act
			const decoration = provider.provideFileDecoration(uri);

			// Assert
			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟢"); // Actual icon from DesignTokens
			expect(decoration?.tooltip).toContain("Watch");
			expect(mockRegistry.getProtectionLevel).toHaveBeenCalledWith(uri.fsPath);
		});

		it("should return WARN decoration for files with warn protection level", () => {
			// Arrange
			(mockRegistry.getProtectionLevel as any).mockReturnValue("warn");
			provider = new (FileDecorationProvider as unknown as FileDecorationProviderWithRegistry)(mockRegistry as ProtectedFileRegistry);
			const uri = vscode.Uri.file("/workspace/src/config.ts");

			// Act
			const decoration = provider.provideFileDecoration(uri);

			// Assert
			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🟡"); // Actual icon from DesignTokens
			expect(decoration?.tooltip).toContain("Warning");
		});

		it("should return BLOCK decoration for files with block protection level", () => {
			// Arrange
			(mockRegistry.getProtectionLevel as any).mockReturnValue("block");
			provider = new (FileDecorationProvider as unknown as FileDecorationProviderWithRegistry)(mockRegistry as ProtectedFileRegistry);
			const uri = vscode.Uri.file("/workspace/src/critical.ts");

			// Act
			const decoration = provider.provideFileDecoration(uri);

			// Assert
			expect(decoration).toBeDefined();
			expect(decoration?.badge).toBe("🔴"); // Actual icon from DesignTokens
			expect(decoration?.tooltip).toContain("Protected");
		});
	});

	describe("SAD PATH: Unprotected files", () => {
		it("should return undefined for files without protection", () => {
			// Arrange
			(mockRegistry.getProtectionLevel as any).mockReturnValue(undefined);
			provider = new (FileDecorationProvider as unknown as FileDecorationProviderWithRegistry)(mockRegistry as ProtectedFileRegistry);
			const uri = vscode.Uri.file("/workspace/src/unprotected.ts");

			// Act
			const decoration = provider.provideFileDecoration(uri);

			// Assert
			expect(decoration).toBeUndefined();
			expect(mockRegistry.getProtectionLevel).toHaveBeenCalledWith(uri.fsPath);
		});
	});

	describe("EDGE PATH: Registry events", () => {
		it("should refresh decorations when protection changes", () => {
			// Arrange
			let subscribedCallback: any = null;
			(mockRegistry as any).onProtectionChanged = (callback: any) => {
				subscribedCallback = callback;
				return { dispose: vi.fn() };
			};
			provider = new (FileDecorationProvider as unknown as FileDecorationProviderWithRegistry)(mockRegistry as ProtectedFileRegistry);
			const refreshSpy = vi.spyOn(provider, "refresh");

			// Act - Simulate protection change event
			if (subscribedCallback) {
				(subscribedCallback as Function)([vscode.Uri.file("/workspace/src/changed.ts")]);
			}

			// Assert
			expect(refreshSpy).toHaveBeenCalled();
		});
	});

	describe("ERROR PATH: Registry not available", () => {
		it("should handle gracefully when created without registry", () => {
			// Arrange & Act
			provider = new (FileDecorationProvider as unknown as FileDecorationProviderWithRegistry)();
			const uri = vscode.Uri.file("/workspace/src/test.ts");

			// Assert - Should not throw and return undefined
			expect(() => provider.provideFileDecoration(uri)).not.toThrow();
			expect(provider.provideFileDecoration(uri)).toBeUndefined();
		});
	});

	describe("Constructor injection", () => {
		it("should accept ProtectedFileRegistry in constructor", () => {
			// This test verifies the constructor signature accepts the registry
			expect(() => {
				new (FileDecorationProvider as unknown as FileDecorationProviderWithRegistry)(mockRegistry as ProtectedFileRegistry);
			}).not.toThrow();
		});

		it("should subscribe to onProtectionChanged event", () => {
			// Arrange
			const subscriptionDisposable = { dispose: vi.fn() };
			let subscribedCallback: any = null;
			(mockRegistry as any).onProtectionChanged = (callback: any) => {
				subscribedCallback = callback;
				return subscriptionDisposable;
			};

			// Act
			provider = new (FileDecorationProvider as unknown as FileDecorationProviderWithRegistry)(mockRegistry as ProtectedFileRegistry);

			// Assert
			expect(subscribedCallback).not.toBeNull();
		});
	});
});
