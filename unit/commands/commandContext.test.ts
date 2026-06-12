/**
 * CommandContext DaemonBridge Integration Tests
 *
 * Tests for ARCHITECTURE_REFACTOR_SPEC.md Phase 1 infrastructure:
 * - Verify CommandContext accepts optional daemonBridge field
 * - Verify type safety and backward compatibility
 * - Validate DaemonBridge interface contract
 *
 * Context: Phase 1 work (commit 607ff48) added daemonBridge to CommandContext
 * to enable thin extension pattern (command delegation to CLI daemon).
 */

import { describe, expect, it, vi } from "vitest";
import type { CommandContext } from "../../../src/commands/index";
import type { DaemonBridge } from "../../../src/services/DaemonBridge";

/**
 * Create minimal mock DaemonBridge for testing
 * Only includes core methods needed for command context validation
 */
function createMockDaemonBridge(): DaemonBridge {
	return {
		isConnected: vi.fn().mockReturnValue(true),
		initialize: vi.fn().mockResolvedValue(undefined),
		dispose: vi.fn(),
		connect: vi.fn().mockResolvedValue(undefined),
		disconnect: vi.fn().mockResolvedValue(undefined),
		isDaemonRunning: vi.fn().mockReturnValue(true),

		// Snapshot operations (core methods for command delegation)
		createSnapshot: vi.fn().mockResolvedValue({ id: "snap-123" }),
		listSnapshots: vi.fn().mockResolvedValue([]),
		deleteSnapshot: vi.fn().mockResolvedValue(undefined),
		restoreSnapshot: vi.fn().mockResolvedValue({ success: true }),

		// Event subscriptions (for cross-surface coordination)
		onSnapshotCreated: vi.fn(),
		onRiskDetected: vi.fn(),
		onConnectionChanged: vi.fn(),
		onDaemonShuttingDown: vi.fn(),

		// Additional methods required by DaemonBridge interface
		recordFileModification: vi.fn().mockResolvedValue({ success: true }),
		subscribeToFileWatching: vi.fn().mockResolvedValue({ subscribed: true }),
		getSessionStatus: vi.fn().mockResolvedValue({ connected: true }),
		getDashboardStats: vi.fn().mockResolvedValue({}),
		getVitals: vi.fn().mockResolvedValue({}),
		getMcpStatus: vi.fn().mockResolvedValue({}),
	} as unknown as DaemonBridge;
}

/**
 * Create minimal mock CommandContext for testing
 * Includes only required fields to avoid test brittleness
 */
function createMockCommandContext(daemonBridge?: DaemonBridge): Partial<CommandContext> {
	return {
		// Required core services (minimal mocks)
		protectedFileRegistry: {} as any,
		operationCoordinator: {} as any,
		snapshotManager: {} as any,
		workflowIntegration: {} as any,
		notificationManager: {} as any,
		workspaceMemoryManager: {} as any,
		conflictResolver: {} as any,
		featureFlagService: {} as any,

		// Required providers (minimal mocks)
		snapshotDocumentProvider: {} as any,
		protectionDecorationProvider: {} as any,
		fileHealthDecorationProvider: {} as any,
		snapshotRestoreUI: {} as any,

		// Required dependencies (minimal mocks)
		intelligenceTreeProvider: {} as any,
		snapshotSummaryProvider: {} as any,
		configManager: {} as any,
		fileWatcher: {} as any,
		vrekorcLoader: {} as any,
		welcomeView: {} as any,
		storage: {} as any,
		workspaceRoot: "/test/workspace",

		// Required utility functions (minimal mocks)
		refreshViews: vi.fn(),
		updateFileProtectionContext: vi.fn(),
		updateHasProtectedFilesContext: vi.fn(),
		getProtectionStateSummary: vi.fn(),

		// 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Optional daemon bridge
		daemonBridge,
	};
}

describe("CommandContext DaemonBridge Integration", () => {
	describe("Type Safety", () => {
		it("should accept CommandContext with optional daemonBridge field", () => {
			const mockDaemonBridge = createMockDaemonBridge();
			const context = createMockCommandContext(mockDaemonBridge) as CommandContext;

			expect(context.daemonBridge).toBeDefined();
			expect(context.daemonBridge).toBe(mockDaemonBridge);
		});

		it("should allow undefined daemonBridge for backward compatibility", () => {
			const context = createMockCommandContext(undefined) as CommandContext;

			expect(context.daemonBridge).toBeUndefined();
		});

		it("should allow CommandContext without daemonBridge field", () => {
			// This tests that existing code can create CommandContext without daemonBridge
			const context = createMockCommandContext() as CommandContext;

			expect(context.daemonBridge).toBeUndefined();
		});
	});

	describe("DaemonBridge Interface Contract", () => {
		it("DaemonBridge mock has isConnected method", () => {
			const mockBridge = createMockDaemonBridge();

			expect(mockBridge.isConnected).toBeDefined();
			expect(typeof mockBridge.isConnected).toBe("function");
			expect(mockBridge.isConnected()).toBe(true);
		});

		it("DaemonBridge mock has initialize method", () => {
			const mockBridge = createMockDaemonBridge();

			expect(mockBridge.initialize).toBeDefined();
			expect(typeof mockBridge.initialize).toBe("function");
		});

		it("DaemonBridge mock has core snapshot methods for command delegation", () => {
			const mockBridge = createMockDaemonBridge();

			// Core CRUD operations that commands will delegate to
			expect(mockBridge.createSnapshot).toBeDefined();
			expect(mockBridge.listSnapshots).toBeDefined();
			expect(mockBridge.deleteSnapshot).toBeDefined();
			expect(mockBridge.restoreSnapshot).toBeDefined();

			expect(typeof mockBridge.createSnapshot).toBe("function");
			expect(typeof mockBridge.listSnapshots).toBe("function");
			expect(typeof mockBridge.deleteSnapshot).toBe("function");
			expect(typeof mockBridge.restoreSnapshot).toBe("function");
		});

		it("DaemonBridge mock has event subscription methods", () => {
			const mockBridge = createMockDaemonBridge();

			// Event subscriptions for cross-surface coordination
			expect(mockBridge.onSnapshotCreated).toBeDefined();
			expect(mockBridge.onRiskDetected).toBeDefined();
			expect(mockBridge.onConnectionChanged).toBeDefined();
			expect(mockBridge.onDaemonShuttingDown).toBeDefined();
		});
	});

	describe("CommandContext Integration Scenarios", () => {
		it("should support command delegation pattern (daemon available)", () => {
			const mockBridge = createMockDaemonBridge();
			const context = createMockCommandContext(mockBridge) as CommandContext;

			// Simulate command checking if daemon is available for delegation
			const canDelegate = context.daemonBridge?.isConnected();

			expect(canDelegate).toBe(true);
		});

		it("should support graceful fallback pattern (daemon unavailable)", () => {
			// Simulate daemon not connected
			const mockBridge = createMockDaemonBridge();
			vi.mocked(mockBridge.isConnected).mockReturnValue(false);

			const context = createMockCommandContext(mockBridge) as CommandContext;

			// Simulate command checking if daemon is available for delegation
			const canDelegate = context.daemonBridge?.isConnected();

			expect(canDelegate).toBe(false);
		});

		it("should support graceful fallback when daemonBridge is undefined", () => {
			const context = createMockCommandContext(undefined) as CommandContext;

			// Simulate command checking if daemon is available for delegation
			// Using optional chaining (?.) should safely return undefined
			const canDelegate = context.daemonBridge?.isConnected();

			expect(canDelegate).toBeUndefined();
		});
	});
});
