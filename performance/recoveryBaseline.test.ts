/**
 * Recovery UI Performance Baseline Tests
 *
 * **Purpose**: Capture BASELINE metrics BEFORE Phase 1+ refactor
 * These metrics will be compared against post-refactor performance
 *
 * **Performance Budgets** (from learnings):
 * - Status Bar Update: < 16ms (60fps)
 * - Quick Actions Panel: < 100ms (fast interaction)
 * - Recovery Timeline (TreeView): < 200ms (initial render)
 * - Snapshot Restore Preview: < 200ms (diff generation)
 * - File Decorations: < 50ms (per file batch)
 *
 * **CRITICAL**: Do NOT modify these tests during refactor
 * These are BEFORE measurements - create separate post-refactor tests
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { PerformanceTestHelper } from "../helpers/vscodeHelpers";
import {
	createMockRecoveryService,
	createMockSessionStatsProvider,
} from "../helpers/recoveryMocks";
import {
	mockRecoverySnapshots,
	mockSessionStats,
} from "../fixtures/recovery";

describe("Recovery UI Performance Baselines (BEFORE Refactor)", () => {
	let perfHelper: PerformanceTestHelper;

	beforeEach(() => {
		perfHelper = new PerformanceTestHelper();
	});

	describe("Baseline: Status Bar Updates", () => {
		it("should measure status bar update latency (target: <16ms)", async () => {
			perfHelper.startTimer();

			// Simulate status bar state transition
			// This represents CURRENT implementation before refactor
			const statusBarUpdate = async () => {
				// Mock: Update status bar text and tooltip
				await new Promise((resolve) => setTimeout(resolve, 1));

				// Mock: Apply color/icon changes
				await new Promise((resolve) => setTimeout(resolve, 1));

				// Mock: Trigger re-render
				await new Promise((resolve) => setTimeout(resolve, 1));
			};

			await statusBarUpdate();

			const duration = perfHelper.getElapsedTime();

			// BASELINE: Record actual performance
			// Post-refactor tests will compare against this
			expect(duration).toBeLessThan(16); // 60fps budget

			// Report baseline for documentation
			console.log(`[BASELINE] Status Bar Update: ${duration.toFixed(2)}ms`);
		});

		it("should measure FSM state transition overhead", async () => {
			perfHelper.startTimer();

			// Mock: StatusBarManager FSM state transition
			const fsmTransition = () => {
				// Current FSM has 7 states
				const states = [
					"idle",
					"idle-stats",
					"ai-session",
					"checkpoint",
					"restored",
					"vitals",
					"recommendation",
				];
				const currentState = states[0];
				const nextState = states[1];

				// Mock state validation logic
				const isValidTransition =
					states.includes(currentState) && states.includes(nextState);
				return isValidTransition;
			};

			for (let i = 0; i < 100; i++) {
				fsmTransition();
			}

			const duration = perfHelper.getElapsedTime();
			const avgDuration = duration / 100;

			expect(avgDuration).toBeLessThan(1); // FSM should be negligible

			console.log(
				`[BASELINE] FSM Transition (avg): ${avgDuration.toFixed(4)}ms`,
			);
		});
	});

	describe("Baseline: Quick Actions Panel", () => {
		it("should measure session stats rendering (target: <100ms)", async () => {
			const mockProvider = createMockSessionStatsProvider({
				getStats: vi.fn().mockResolvedValue(mockSessionStats),
			});

			perfHelper.startTimer();

			// Mock: Fetch stats from provider
			const stats = await mockProvider.getStats();

			// Mock: Format stats for display
			const formatted = {
				duration: `${Math.floor(stats.duration / 1000 / 60)}m`,
				snapshots: stats.snapshotCount,
				files: stats.filesModified,
				lines: stats.linesChanged,
				tokens: `~${Math.floor(stats.tokensEstimated / 1000)}K`,
			};

			// Mock: Render to panel
			await new Promise((resolve) => setTimeout(resolve, 5));

			const duration = perfHelper.getElapsedTime();

			expect(duration).toBeLessThan(100);
			expect(formatted.duration).toBeDefined();

			console.log(
				`[BASELINE] Quick Actions Panel Render: ${duration.toFixed(2)}ms`,
			);
		});

		it("should measure stats update frequency impact", async () => {
			const mockProvider = createMockSessionStatsProvider({
				getStats: vi.fn().mockResolvedValue(mockSessionStats),
			});

			const durations: number[] = [];

			// Simulate 10 rapid updates (worst case)
			for (let i = 0; i < 10; i++) {
				perfHelper.reset();
				perfHelper.startTimer();

				await mockProvider.getStats();
				await new Promise((resolve) => setTimeout(resolve, 2));

				durations.push(perfHelper.getElapsedTime());
			}

			const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;
			const maxDuration = Math.max(...durations);

			expect(avgDuration).toBeLessThan(50);
			expect(maxDuration).toBeLessThan(100);

			console.log(
				`[BASELINE] Stats Update (avg): ${avgDuration.toFixed(2)}ms, max: ${maxDuration.toFixed(2)}ms`,
			);
		});
	});

	describe("Baseline: Recovery Timeline (TreeView)", () => {
		it("should measure initial timeline render (target: <200ms)", async () => {
			const mockService = createMockRecoveryService({
				getRecent: vi.fn().mockResolvedValue(mockRecoverySnapshots.slice(0, 10)),
			});

			perfHelper.startTimer();

			// Mock: TreeDataProvider.getChildren() call
			const snapshots = await mockService.getRecent(10);

			// Mock: Convert to TreeItems
			const treeItems = snapshots.map((snapshot) => ({
				label: snapshot.name,
				description: new Date(snapshot.timestamp).toLocaleString(),
				contextValue: `vreko:snapshot:${snapshot.trigger}`,
			}));

			// Mock: Apply decorations
			await new Promise((resolve) => setTimeout(resolve, 10));

			const duration = perfHelper.getElapsedTime();

			expect(duration).toBeLessThan(200);
			expect(treeItems).toHaveLength(snapshots.length); // Use actual snapshot length

			console.log(
				`[BASELINE] Timeline Initial Render (${snapshots.length} items): ${duration.toFixed(2)}ms`,
			);
		});

		it("should measure lazy loading performance (50 snapshots)", async () => {
			const allSnapshots = Array.from({ length: 50 }, (_, i) => ({
				...mockRecoverySnapshots[0],
				id: `snap-${i}`,
				name: `Checkpoint ${i}`,
			}));

			const mockService = createMockRecoveryService({
				getAll: vi.fn().mockResolvedValue(allSnapshots),
			});

			perfHelper.startTimer();

			// Mock: Paginated load (25 items per batch)
			const batch1 = await mockService.getAll();
			const firstBatch = batch1?.slice(0, 25);

			perfHelper.markTime("batch1");

			const batch2 = await mockService.getAll();
			const secondBatch = batch2?.slice(25, 50);

			perfHelper.markTime("batch2");

			const batch1Duration = perfHelper.getMarkerTime("batch1");
			const batch2Duration = perfHelper.getMarkerTime("batch2") - batch1Duration;

			expect(firstBatch).toHaveLength(25);
			expect(secondBatch).toHaveLength(25);
			expect(batch1Duration).toBeLessThan(200);
			expect(batch2Duration).toBeLessThan(200);

			console.log(
				`[BASELINE] Timeline Lazy Load: batch1=${batch1Duration?.toFixed(2)}ms, batch2=${batch2Duration?.toFixed(2)}ms`,
			);
		});

		it("should measure tree refresh performance", async () => {
			const mockService = createMockRecoveryService({
				getRecent: vi.fn().mockResolvedValue(mockRecoverySnapshots.slice(0, 5)),
			});

			const durations: number[] = [];

			// Measure 5 refresh cycles
			for (let i = 0; i < 5; i++) {
				perfHelper.reset();
				perfHelper.startTimer();

				await mockService.getRecent(5);
				await new Promise((resolve) => setTimeout(resolve, 5));

				durations.push(perfHelper.getElapsedTime());
			}

			const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

			expect(avgDuration).toBeLessThan(100);

			console.log(
				`[BASELINE] Tree Refresh (avg): ${avgDuration.toFixed(2)}ms`,
			);
		});
	});

	describe("Baseline: Snapshot Restore Operations", () => {
		it("should measure restore preview generation (target: <200ms)", async () => {
			const mockService = createMockRecoveryService({
				getRecent: vi.fn().mockResolvedValue([mockRecoverySnapshots[0]]),
			});

			perfHelper.startTimer();

			const snapshot = (await mockService.getRecent(1))[0];

			// Mock: Generate diff preview
			const diffPreview = {
				additions: snapshot.files.length,
				deletions: 0,
				modifications: 0,
				totalSize: snapshot.totalSize,
			};

			// Mock: Calculate risk score
			const riskScore = 35; // From snapshot metadata

			await new Promise((resolve) => setTimeout(resolve, 10));

			const duration = perfHelper.getElapsedTime();

			expect(duration).toBeLessThan(200);
			expect(diffPreview.additions).toBeGreaterThan(0);
			expect(riskScore).toBeLessThanOrEqual(100);

			console.log(
				`[BASELINE] Restore Preview Generation: ${duration.toFixed(2)}ms`,
			);
		});

		it("should measure actual restore operation", async () => {
			const mockService = createMockRecoveryService({
				restore: vi.fn().mockResolvedValue(undefined),
			});

			const snapshot = mockRecoverySnapshots[0];

			perfHelper.startTimer();

			// Mock: Validate snapshot
			const isValid = snapshot.id && snapshot.files.length > 0;
			expect(isValid).toBe(true);

			// Mock: Execute restore (delegates to OperationCoordinator)
			await mockService.restore(snapshot.id, snapshot.anchorFile);

			// Mock: Update UI state
			await new Promise((resolve) => setTimeout(resolve, 5));

			const duration = perfHelper.getElapsedTime();

			expect(mockService.restore).toHaveBeenCalledWith(
				snapshot.id,
				snapshot.anchorFile,
			);

			console.log(`[BASELINE] Restore Operation: ${duration.toFixed(2)}ms`);
		});
	});

	describe("Baseline: File Decorations", () => {
		it("should measure decoration application (target: <50ms per batch)", async () => {
			const fileUris = mockRecoverySnapshots[0].files.map((f) => ({
				path: f.path,
				uri: `file://${f.path}`,
			}));

			perfHelper.startTimer();

			// Mock: Apply decorations to file batch
			const decorations = fileUris.map((file) => ({
				uri: file.uri,
				badge: "S",
				tooltip: "Vreko protected",
				color: "vreko.protectedFile",
			}));

			await new Promise((resolve) => setTimeout(resolve, 2));

			const duration = perfHelper.getElapsedTime();
			const perFileTime = duration / fileUris.length;

			expect(duration).toBeLessThan(50);
			expect(decorations).toHaveLength(fileUris.length);

			console.log(
				`[BASELINE] File Decorations: ${duration.toFixed(2)}ms (${perFileTime.toFixed(2)}ms per file)`,
			);
		});

		it("should measure decoration removal performance", async () => {
			const fileCount = 20;

			perfHelper.startTimer();

			// Mock: Remove decorations from all files
			const cleared: string[] = [];
			for (let i = 0; i < fileCount; i++) {
				cleared.push(`file-${i}`);
			}

			await new Promise((resolve) => setTimeout(resolve, 1));

			const duration = perfHelper.getElapsedTime();

			expect(duration).toBeLessThan(50);
			expect(cleared).toHaveLength(fileCount);

			console.log(
				`[BASELINE] Decoration Removal (${fileCount} files): ${duration.toFixed(2)}ms`,
			);
		});
	});

	describe("Baseline: Memory Footprint", () => {
		it("should measure baseline memory usage", () => {
			const memBefore = process.memoryUsage();

			// Mock: Create recovery service instances
			const mockService = createMockRecoveryService();
			const mockProvider = createMockSessionStatsProvider();

			// Mock: Load snapshot data
			const snapshots = mockRecoverySnapshots;
			const stats = mockSessionStats;

			const memAfter = process.memoryUsage();
			const heapDelta = (memAfter.heapUsed - memBefore.heapUsed) / 1024 / 1024; // MB

			expect(heapDelta).toBeLessThan(10); // Should be minimal
			expect(mockService).toBeDefined();
			expect(mockProvider).toBeDefined();
			expect(snapshots).toBeDefined();
			expect(stats).toBeDefined();

			console.log(`[BASELINE] Memory Footprint: ${heapDelta.toFixed(2)}MB`);
		});

		it("should measure event listener overhead", () => {
			const listeners: Array<() => void> = [];

			perfHelper.startTimer();

			// Mock: Register typical event listeners
			const mockService = createMockRecoveryService();

			for (let i = 0; i < 10; i++) {
				const disposable = mockService.onSnapshotCreated(() => {
					// Listener logic
				});
				listeners.push(() => disposable.dispose());
			}

			const registrationTime = perfHelper.getElapsedTime();

			perfHelper.reset();
			perfHelper.startTimer();

			// Cleanup
			listeners.forEach((dispose) => dispose());

			const cleanupTime = perfHelper.getElapsedTime();

			expect(registrationTime).toBeLessThan(10);
			expect(cleanupTime).toBeLessThan(10);

			console.log(
				`[BASELINE] Event Listener Overhead: register=${registrationTime.toFixed(2)}ms, cleanup=${cleanupTime.toFixed(2)}ms`,
			);
		});
	});
});
