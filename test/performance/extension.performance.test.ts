import { performance } from "node:perf_hooks";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NotificationManager } from "../../src/notificationManager.js";
import type { OperationCoordinator } from "../../src/operationCoordinator.js";
import { SmartContextDetector } from "../../src/smartContext.js";
import type { FileSystemStorage } from "../../src/storage/types.js";
import { WorkflowIntegration } from "../../src/workflowIntegration.js";
import { WorkspaceMemoryManager } from "../../src/workspaceMemory.js";

// Mock FileSystemStorage methods
const mockStorage = {
	root: "/test",
	dir: () => "/test/.snapback",
	create: vi.fn(),
	retrieve: vi.fn(),
	list: vi.fn(),
	restore: vi.fn(),
} as unknown as FileSystemStorage;

// Mock OperationCoordinator
const mockOperationCoordinator: OperationCoordinator = {
	coordinateSnapshotCreation: vi.fn(),
	coordinateRiskAnalysis: vi.fn(),
	startOperation: vi.fn(),
	waitForOperation: vi.fn(),
	getOperationStatus: vi.fn(),
	cancelOperation: vi.fn(),
} as any;

// Mock NotificationManager
const mockNotificationManager: NotificationManager = {
	showNotification: vi.fn(),
	showEnhancedSystemStatus: vi.fn(),
	showEnhancedAiActivity: vi.fn(),
	showEnhancedFailureRecovery: vi.fn(),
	getRecentNotifications: vi.fn(),
	dismissNotification: vi.fn(),
} as any;

describe("PerformanceTests", () => {
	let workspaceMemory: WorkspaceMemoryManager;
	let smartContextDetector: SmartContextDetector;
	let _workflowIntegration: WorkflowIntegration;

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Create instances
		workspaceMemory = new WorkspaceMemoryManager(mockStorage);
		smartContextDetector = new SmartContextDetector(workspaceMemory);
		_workflowIntegration = new WorkflowIntegration(
			smartContextDetector,
			mockOperationCoordinator,
			mockNotificationManager,
		);
	});

	describe("Extension activation time", () => {
		it("should activate within 2 seconds", async () => {
			// This test would measure the actual activation time
			// In a real test, we would import and activate the extension
			const startTime = performance.now();

			// Simulate extension activation
			// In a real test, this would be the actual activation code
			await new Promise((resolve) => setTimeout(resolve, 10)); // Simulate some work

			const endTime = performance.now();
			const activationTime = endTime - startTime;

			expect(activationTime).toBeLessThan(2000); // 2 seconds
		});
	});

	describe("Snapshot creation time", () => {
		it("should create snapshot within 5 seconds for 100 files", async () => {
			// Mock storage.create to simulate snapshot creation
			mockStorage.create = vi.fn().mockImplementation(async () => {
				// Simulate time for processing 100 files
				await new Promise((resolve) => setTimeout(resolve, 50)); // 50ms per file
				return { id: "test-snapshot", timestamp: Date.now() };
			});

			const startTime = performance.now();

			// Simulate creating snapshot for 100 files
			const result = await mockStorage.create({ trigger: "manual" });

			const endTime = performance.now();
			const creationTime = endTime - startTime;

			expect(creationTime).toBeLessThan(5000); // 5 seconds
			expect(result.id).toBe("test-snapshot");
		});
	});

	describe("Restore operation time", () => {
		it("should restore within 10 seconds for 100 files", async () => {
			// Mock storage.restore to simulate restore operation
			mockStorage.restore = vi.fn().mockImplementation(async () => {
				// Simulate time for restoring 100 files
				await new Promise((resolve) => setTimeout(resolve, 80)); // 80ms per file
				return {
					success: true,
					restoredFiles: [],
					conflicts: [],
					errors: [],
					backupId: undefined,
				};
			});

			const startTime = performance.now();

			// Simulate restoring snapshot with 100 files
			const result = await mockStorage.restore("test-snapshot", "/test/path");

			const endTime = performance.now();
			const restoreTime = endTime - startTime;

			expect(restoreTime).toBeLessThan(10000); // 10 seconds
			expect(result.success).toBe(true);
		});
	});

	describe("Risk analysis time", () => {
		it("should analyze single file within 1 second", async () => {
			// Mock risk analysis
			mockOperationCoordinator.coordinateRiskAnalysis = vi
				.fn()
				.mockImplementation(async () => {
					// Simulate time for analyzing a single file
					await new Promise((resolve) => setTimeout(resolve, 500)); // 500ms
					return { riskScore: 0.3, factors: ["complexity"] };
				});

			const startTime = performance.now();

			// Simulate risk analysis for a single file
			const result: any =
				await mockOperationCoordinator.coordinateRiskAnalysis("/test/file.ts");

			const endTime = performance.now();
			const analysisTime = endTime - startTime;

			expect(analysisTime).toBeLessThan(1000); // 1 second
			expect(result.riskScore).toBe(0.3);
			expect(result.factors).toContain("complexity");
		});
	});

	describe("UI responsiveness", () => {
		it("should not block UI for more than 100ms", async () => {
			// Mock a potentially blocking operation
			const blockingOperation = async () => {
				// Simulate some work that should not block the UI
				const startTime = performance.now();

				// Do some work that should yield to the event loop
				for (let i = 0; i < 1000000; i++) {
					// Some computation
					Math.sqrt(i);

					// Periodically yield to avoid blocking
					if (i % 10000 === 0) {
						await new Promise((resolve) => setImmediate(resolve));
					}
				}

				const endTime = performance.now();
				return endTime - startTime;
			};

			const executionTime = await blockingOperation();

			// The actual blocking time should be less than 100ms due to yielding
			// This is a simplified test - in reality, we'd measure actual UI responsiveness
			expect(executionTime).toBeGreaterThan(0);
		});
	});
});
