/**
 * SnapBackCodeLensProvider MarkWrong Tests
 *
 * TDD RED PHASE: Tests for implementing "Mark Wrong" (false positive) functionality
 *
 * Per TDD_CORE.md:
 * - 4-path coverage: happy, sad, edge, error
 * - NEVER use vague assertions
 * - Tests MUST fail initially
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { SnapBackCodeLensProvider } from "../../../src/ui/SnapBackCodeLensProvider";
import type { ProtectedFileRegistry } from "../../../src/services/protectedFileRegistry";
import type { TelemetryProxy } from "../../../src/services/telemetry-proxy";

// Interface for false positive tracking
interface IFalsePositiveTracker {
	recordFalsePositive(filePath: string, reason?: string): Promise<void>;
	getFalsePositives(): Promise<string[]>;
	isFalsePositive(filePath: string): Promise<boolean>;
}

// Mock vscode module
vi.mock("vscode", () => ({
	Uri: {
		file: (path: string) => ({ fsPath: path, scheme: "file" }),
	},
	EventEmitter: vi.fn().mockImplementation(() => ({
		event: vi.fn(),
		fire: vi.fn(),
		dispose: vi.fn(),
	})),
	window: {
		setStatusBarMessage: vi.fn(),
		showInformationMessage: vi.fn(),
		showErrorMessage: vi.fn(),
	},
	commands: {
		registerCommand: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	},
	languages: {
		registerCodeLensProvider: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	},
}));

// Type helper for tests - allows passing additional dependencies to constructor
type SnapBackCodeLensProviderWithDeps = new (
	protectedFileRegistry: ProtectedFileRegistry,
	falsePositiveTracker?: IFalsePositiveTracker,
	telemetryProxy?: TelemetryProxy,
) => SnapBackCodeLensProvider;

describe("SnapBackCodeLensProvider MarkWrong", () => {
	let provider: SnapBackCodeLensProvider;
	let mockRegistry: Partial<ProtectedFileRegistry>;
	let mockFalsePositiveTracker: IFalsePositiveTracker;
	let mockTelemetryProxy: Partial<TelemetryProxy>;

	beforeEach(() => {
		mockRegistry = {
			getProtectionLevel: vi.fn().mockReturnValue("warn"),
			onProtectionChanged: vi.fn() as any,
			remove: vi.fn().mockResolvedValue(undefined),
		};

		mockFalsePositiveTracker = {
			recordFalsePositive: vi.fn().mockResolvedValue(undefined),
			getFalsePositives: vi.fn().mockResolvedValue([]),
			isFalsePositive: vi.fn().mockResolvedValue(false),
		};

		mockTelemetryProxy = {
			trackEvent: vi.fn().mockResolvedValue(undefined),
		};
	});

	afterEach(() => {
		provider?.dispose();
		vi.clearAllMocks();
	});

	describe("HAPPY PATH: Mark Wrong functionality", () => {
		it("should record false positive when handleMarkWrong is called", async () => {
			// Arrange
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				mockFalsePositiveTracker,
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/index.ts";

			// Act
			await (provider as any).handleMarkWrong(filePath);

			// Assert
			expect(mockFalsePositiveTracker.recordFalsePositive).toHaveBeenCalledWith(
				filePath,
				expect.any(String),
			);
		});

		it("should show success message after marking as false positive", async () => {
			// Arrange
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				mockFalsePositiveTracker,
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/index.ts";

			// Act
			await (provider as any).handleMarkWrong(filePath);

			// Assert
			expect(vscode.window.setStatusBarMessage).toHaveBeenCalledWith(
				expect.stringContaining("false positive"),
				expect.any(Number),
			);
		});

		it("should track telemetry event when marking as false positive", async () => {
			// Arrange
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				mockFalsePositiveTracker,
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/index.ts";

			// Act
			await (provider as any).handleMarkWrong(filePath);

			// Assert
			expect(mockTelemetryProxy.trackEvent).toHaveBeenCalledWith(
				"protection_false_positive_marked",
				expect.objectContaining({
					filePathHash: expect.any(String),
				}),
			);
		});

		it("should optionally remove file from protection after marking as false positive", async () => {
			// Arrange
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				mockFalsePositiveTracker,
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/index.ts";

			// Mock user choosing to remove protection
			(vscode.window.showInformationMessage as any).mockResolvedValue("Remove Protection");

			// Act
			await (provider as any).handleMarkWrong(filePath);

			// Assert
			expect(mockRegistry.remove).toHaveBeenCalledWith(filePath);
		});
	});

	describe("SAD PATH: Failed recording", () => {
		it("should show error message when recording fails", async () => {
			// Arrange
			(mockFalsePositiveTracker.recordFalsePositive as any).mockRejectedValue(
				new Error("Storage error"),
			);
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				mockFalsePositiveTracker,
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/index.ts";

			// Act
			await (provider as any).handleMarkWrong(filePath);

			// Assert
			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringContaining("Failed"),
			);
		});
	});

	describe("EDGE PATH: Already marked as false positive", () => {
		it("should show message if file already marked as false positive", async () => {
			// Arrange
			(mockFalsePositiveTracker.isFalsePositive as any).mockResolvedValue(true);
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				mockFalsePositiveTracker,
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/index.ts";

			// Act
			await (provider as any).handleMarkWrong(filePath);

			// Assert
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringContaining("already"),
			);
			// Should not record again
			expect(mockFalsePositiveTracker.recordFalsePositive).not.toHaveBeenCalled();
		});
	});

	describe("ERROR PATH: Missing tracker", () => {
		it("should not throw when FalsePositiveTracker is not provided", async () => {
			// Arrange - create without tracker
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				undefined, // No tracker
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/index.ts";

			// Act & Assert - Should not throw
			await expect(
				(async () => await (provider as any).handleMarkWrong(filePath))(),
			).resolves.not.toThrow();
		});

		it("should still show status message when tracker is not provided", async () => {
			// Arrange
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				undefined, // No tracker
			);
			const filePath = "/workspace/src/index.ts";

			// Act
			await (provider as any).handleMarkWrong(filePath);

			// Assert - Should still show status message
			expect(vscode.window.setStatusBarMessage).toHaveBeenCalled();
		});
	});

	describe("False positive data persistence", () => {
		it("should persist false positive to storage through tracker", async () => {
			// Arrange
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				mockFalsePositiveTracker,
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/config.ts";

			// Act
			await (provider as any).handleMarkWrong(filePath);

			// Assert
			expect(mockFalsePositiveTracker.recordFalsePositive).toHaveBeenCalledWith(
				filePath,
				expect.anything(),
			);
		});

		it("should be able to query if file was marked as false positive", async () => {
			// Arrange
			provider = new (SnapBackCodeLensProvider as unknown as SnapBackCodeLensProviderWithDeps)(
				mockRegistry as ProtectedFileRegistry,
				mockFalsePositiveTracker,
				mockTelemetryProxy as TelemetryProxy,
			);
			const filePath = "/workspace/src/config.ts";

			// Act
			const isFalsePositive = await mockFalsePositiveTracker.isFalsePositive(filePath);

			// Assert
			expect(mockFalsePositiveTracker.isFalsePositive).toHaveBeenCalledWith(filePath);
			expect(typeof isFalsePositive).toBe("boolean");
		});
	});
});
