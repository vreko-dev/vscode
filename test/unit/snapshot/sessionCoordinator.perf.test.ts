import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	getSessionPerfMonitor,
	initializeSessionPerfMonitor,
	resetSessionPerfData,
} from "@vscode/performance/sessionPerfMonitor";
import { SessionCoordinator } from "@vscode/snapshot/SessionCoordinator";

// Mock SqliteStorageAdapter
const mockStorageAdapter = {
	// Add any methods that might be called
} as any;

describe("SessionCoordinator Performance", () => {
	beforeEach(() => {
		// Reset performance monitoring
		resetSessionPerfData();
		initializeSessionPerfMonitor();
	});

	it("should finalize sessions within performance budget", async () => {
		const sessionCoordinator = new SessionCoordinator(mockStorageAdapter);

		// Add some candidates
		sessionCoordinator.addCandidate("file1.ts", "snapshot1");
		sessionCoordinator.addCandidate("file2.ts", "snapshot2");

		// Mock the storeSessionManifest method to avoid actual storage operations
		const storeSessionManifestSpy = vi
			.spyOn(sessionCoordinator as any, "storeSessionManifest")
			.mockResolvedValue(undefined);

		// Finalize the session and measure performance
		const startTime = performance.now();
		const sessionId = await sessionCoordinator.finalizeSession("manual");
		const endTime = performance.now();

		const duration = endTime - startTime;

		// Verify the session was created
		expect(sessionId).toBeTruthy();
		expect(storeSessionManifestSpy).toHaveBeenCalled();

		// Check that the operation completed within a reasonable time
		// Note: This is a basic check, more detailed performance monitoring
		// is handled by the performance monitor
		expect(duration).toBeLessThan(200); // Should complete within 200ms

		storeSessionManifestSpy.mockRestore();
	});

	it("should track performance metrics during session finalization", async () => {
		const sessionCoordinator = new SessionCoordinator(mockStorageAdapter);

		// Add some candidates
		sessionCoordinator.addCandidate("file1.ts", "snapshot1");
		sessionCoordinator.addCandidate("file2.ts", "snapshot2");

		// Mock the storeSessionManifest method
		const storeSessionManifestSpy = vi
			.spyOn(sessionCoordinator as any, "storeSessionManifest")
			.mockResolvedValue(undefined);

		// Finalize the session
		await sessionCoordinator.finalizeSession("manual");

		// Check that performance metrics were recorded
		const perfMonitor = getSessionPerfMonitor();
		expect(perfMonitor).toBeDefined();

		if (perfMonitor) {
			const timings = perfMonitor.getTimings();
			expect(timings.length).toBeGreaterThan(0);

			// Should have recorded session finalization timing
			const finalizeTimings = timings.filter(
				(timing) =>
					timing.operationName === "sessionCoordinator.finalizeSession",
			);
			expect(finalizeTimings.length).toBeGreaterThan(0);

			// Should have recorded manifest creation timing
			const manifestTimings = timings.filter(
				(timing) =>
					timing.operationName === "sessionCoordinator.createSessionManifest",
			);
			expect(manifestTimings.length).toBeGreaterThan(0);

			// Should have recorded storage timing
			const storageTimings = timings.filter(
				(timing) =>
					timing.operationName === "sessionCoordinator.storeSessionManifest",
			);
			expect(storageTimings.length).toBeGreaterThan(0);
		}

		storeSessionManifestSpy.mockRestore();
	});

	it("should collect performance data for session operations", async () => {
		const sessionCoordinator = new SessionCoordinator(mockStorageAdapter);

		// Mock the storeSessionManifest method
		const storeSessionManifestSpy = vi
			.spyOn(sessionCoordinator as any, "storeSessionManifest")
			.mockResolvedValue(undefined);

		// Create multiple sessions with candidates
		const sessionIds = [];
		for (let i = 0; i < 3; i++) {
			// Add candidates for each session
			sessionCoordinator.addCandidate(`file${i}.ts`, `snapshot${i}`, {
				added: i * 2,
				deleted: i,
			});

			const sessionId = await sessionCoordinator.finalizeSession("manual");
			if (sessionId) {
				sessionIds.push(sessionId);
			}

			// Reset session state for next iteration
			(sessionCoordinator as any).candidates.clear();
		}

		// Verify that sessions were created
		expect(sessionIds.length).toBe(3);

		// Verify that we collected timing data
		const perfMonitor = getSessionPerfMonitor();
		expect(perfMonitor).toBeDefined();

		if (perfMonitor) {
			const timings = perfMonitor.getTimings();
			// Should have at least one timing entry per session finalization
			// (3 finalizations * at least 1 operation each)
			expect(timings.length).toBeGreaterThanOrEqual(3);

			// Should have recorded session finalization timings
			const finalizeTimings = timings.filter(
				(timing) =>
					timing.operationName === "sessionCoordinator.finalizeSession",
			);
			expect(finalizeTimings.length).toBeGreaterThanOrEqual(3);
		}

		storeSessionManifestSpy.mockRestore();
	});
});
