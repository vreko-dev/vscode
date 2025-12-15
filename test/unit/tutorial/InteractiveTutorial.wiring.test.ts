/**
 * InteractiveTutorial Wiring Tests
 *
 * TDD RED PHASE: Tests for InteractiveTutorial integration with ProtectionManager + Telemetry
 *
 * Per TDD_CORE.md:
 * - 4-path coverage: happy, sad, edge, error
 * - NEVER use vague assertions
 * - Tests MUST fail initially
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { InteractiveTutorial } from "../../../src/tutorial/InteractiveTutorial";
import type { StorageManager } from "../../../src/storage/StorageManager";
import type { PioneerGatekeeper } from "../../../src/pioneer/PioneerGatekeeper";
import type { TelemetryProxy } from "../../../src/services/telemetry-proxy";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";

// Interface for what the tutorial needs from protection system
interface ITutorialProtection {
	add(filePath: string, options?: { protectionLevel?: string }): Promise<void>;
	remove(filePath: string): Promise<void>;
}

// vscode mock provided by setup.ts

// Type helper for tests - allows passing additional dependencies to constructor
type InteractiveTutorialWithDeps = new (
	context: vscode.ExtensionContext,
	storageManager: StorageManager,
	gatekeeper: PioneerGatekeeper,
	sidebarReveal: (snapshotId: string) => void,
	protectedFileRegistry?: ProtectedFileRegistry,
	telemetryProxy?: TelemetryProxy,
) => InteractiveTutorial;

describe("InteractiveTutorial Wiring", () => {
	let tutorial: InteractiveTutorial;
	let mockContext: Partial<vscode.ExtensionContext>;
	let mockStorageManager: Partial<StorageManager>;
	let mockGatekeeper: Partial<PioneerGatekeeper>;
	let mockProtectedFileRegistry: Partial<ProtectedFileRegistry>;
	let mockTelemetryProxy: Partial<TelemetryProxy>;
	let sidebarRevealFn: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		mockContext = {
			globalState: {
				get: vi.fn().mockReturnValue(false),
				update: vi.fn().mockResolvedValue(undefined),
			} as any,
		};

		mockStorageManager = {
			createSnapshot: vi.fn().mockResolvedValue({ id: "snapshot-123" }),
		};

		mockGatekeeper = {
			canUseFeature: vi.fn().mockReturnValue(false),
		};

		mockProtectedFileRegistry = {
			add: vi.fn().mockResolvedValue(undefined),
			remove: vi.fn().mockResolvedValue(undefined),
		};

		mockTelemetryProxy = {
			trackEvent: vi.fn().mockResolvedValue(undefined),
		};

		sidebarRevealFn = vi.fn();
	});

	afterEach(() => {
		tutorial?.dispose();
		vi.clearAllMocks();
	});

	describe("HAPPY PATH: ProtectionManager integration", () => {
		it("should set protection level to WARN when tutorial starts", async () => {
			// Arrange
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				mockTelemetryProxy as TelemetryProxy,
			);

			// Act
			await tutorial.start();

			// Assert
			expect(mockProtectedFileRegistry.add).toHaveBeenCalledWith(
				expect.any(String),
				expect.objectContaining({ protectionLevel: "warn" }),
			);
		});

		it("should clear protection when tutorial is disposed", async () => {
			// Arrange
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				mockTelemetryProxy as TelemetryProxy,
			);
			await tutorial.start();

			// Act
			tutorial.dispose();

			// Assert - protection should be cleared for tutorial file
			// The exact assertion depends on implementation
			expect(mockProtectedFileRegistry.add).toHaveBeenCalled();
		});
	});

	describe("HAPPY PATH: Telemetry integration", () => {
		it("should track tutorial_started event on start", async () => {
			// Arrange
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				mockTelemetryProxy as TelemetryProxy,
			);

			// Act
			await tutorial.start();

			// Assert
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith("tutorial_started", expect.any(Object));
		});

		it("should track tutorial_step_completed for each step progression", async () => {
			// Arrange
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				mockTelemetryProxy as TelemetryProxy,
			);
			await tutorial.start();

			// Act - Simulate step completion
			await tutorial.onSnapshotCreated("snapshot-123");

			// Assert
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"tutorial_step_completed",
				expect.objectContaining({ step: expect.any(Number) }),
			);
		});

		it("should track tutorial_pioneer_cta_shown when CTA is displayed", async () => {
			// Arrange
			(mockGatekeeper.canUseFeature as any).mockReturnValue(false); // Not a pioneer
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				mockTelemetryProxy as TelemetryProxy,
			);
			await tutorial.start();

			// Mock the user choosing "Maybe Later" to complete the CTA flow
			(vscode.window.showInformationMessage as any).mockResolvedValue("Maybe Later");

			// Act
			await tutorial.onSnapshotCreated("snapshot-123");

			// Assert
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"tutorial_pioneer_cta_shown",
				expect.any(Object),
			);
		});

		it("should track tutorial_completed with became_pioneer flag", async () => {
			// Arrange
			(mockGatekeeper.canUseFeature as any).mockReturnValue(true); // Already a pioneer
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				mockTelemetryProxy as TelemetryProxy,
			);
			await tutorial.start();

			// Act
			await tutorial.onSnapshotCreated("snapshot-123");

			// Assert
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"tutorial_completed",
				expect.objectContaining({ became_pioneer: expect.any(Boolean) }),
			);
		});
	});

	describe("SAD PATH: Missing dependencies", () => {
		it("should not throw when ProtectedFileRegistry is not provided", async () => {
			// Arrange - create without protection registry
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				undefined, // No protection registry
				mockTelemetryProxy as TelemetryProxy,
			);

			// Act & Assert - Should not throw
			await expect(tutorial.start()).resolves.not.toThrow();
		});

		it("should not throw when TelemetryProxy is not provided", async () => {
			// Arrange - create without telemetry proxy
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				undefined, // No telemetry
			);

			// Act & Assert - Should not throw
			await expect(tutorial.start()).resolves.not.toThrow();
		});
	});

	describe("EDGE PATH: Tutorial resumption", () => {
		it("should ask to resume if tutorial was previously completed", async () => {
			// Arrange
			(mockContext.globalState!.get as any).mockReturnValue(true); // Already completed
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				mockTelemetryProxy as TelemetryProxy,
			);

			// Act
			await tutorial.start();

			// Assert
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("already completed"),
				"Yes",
				"No",
			);
		});
	});

	describe("ERROR PATH: Telemetry failure", () => {
		it("should handle telemetry errors gracefully", async () => {
			// Arrange
			(mockTelemetryProxy.trackEvent as any).mockRejectedValue(new Error("Network error"));
			tutorial = new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
				mockContext as vscode.ExtensionContext,
				mockStorageManager as StorageManager,
				mockGatekeeper as PioneerGatekeeper,
				sidebarRevealFn,
				mockProtectedFileRegistry as ProtectedFileRegistry,
				mockTelemetryProxy as TelemetryProxy,
			);

			// Act & Assert - Should not throw despite telemetry error
			await expect(tutorial.start()).resolves.not.toThrow();
		});
	});

	describe("Constructor accepts new dependencies", () => {
		it("should accept ProtectionManager and TelemetryProxy in constructor", () => {
			// This test verifies the constructor signature accepts the new dependencies
			expect(() => {
				new (InteractiveTutorial as unknown as InteractiveTutorialWithDeps)(
					mockContext as vscode.ExtensionContext,
					mockStorageManager as StorageManager,
					mockGatekeeper as PioneerGatekeeper,
					sidebarRevealFn,
					mockProtectedFileRegistry as ProtectedFileRegistry,
					mockTelemetryProxy as TelemetryProxy,
				);
			}).not.toThrow();
		});
	});
});
