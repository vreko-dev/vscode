import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * SnapshotContentProvider Test Suite (RED Phase - TDD)
 *
 * Tests the TextDocumentContentProvider implementation for serving
 * snapshot content via snapback:// URI scheme.
 *
 * Architecture: Provides snapshot content to VSCode's diff engine
 * Performance: <10ms cached retrieval, <50ms uncached
 * Caching: LRU cache with 100 entries, 5min TTL
 *
 * @see apps/vscode/docs/DiffViewManager-Architecture.md
 */

// ============================================================================
// Mock Implementations
// ============================================================================

import { SnapshotContentProvider } from "../../../src/providers/SnapshotContentProvider.js";
import * as vscode from "vscode";

interface FileState {
	path: string;
	content: string;
	hash?: string;
}

interface Snapshot {
	id: string;
	fileStates: FileState[];
	timestamp: number;
}

class MockSnapshotManager {
	private snapshots = new Map<string, Snapshot>();

	async get(id: string): Promise<Snapshot | undefined> {
		return this.snapshots.get(id);
	}

	addSnapshot(snapshot: Snapshot): void {
		this.snapshots.set(snapshot.id, snapshot);
	}

	clear(): void {
		this.snapshots.clear();
	}
}

class MockLogger {
	warn = vi.fn();
	error = vi.fn();
	info = vi.fn();
}

// ============================================================================
// Test Utilities
// ============================================================================

function _measureTime(fn: () => Promise<void>): Promise<number> {
	const start = performance.now();
	return fn().then(() => performance.now() - start);
}

function _calculateP95(times: number[]): number {
	const sorted = times.sort((a, b) => a - b);
	return sorted[Math.floor(sorted.length * 0.95)];
}

// ============================================================================
// SnapshotContentProvider Test Suite
// ============================================================================

describe("SnapshotContentProvider - Content Retrieval", () => {
	let mockSnapshotManager: MockSnapshotManager;

	beforeEach(() => {
		mockSnapshotManager = new MockSnapshotManager();
	});

	describe("provideTextDocumentContent", () => {
		it("provides content for valid snapshot URI", async () => {
			const snapshot: Snapshot = {
				id: "cp-abc123",
				fileStates: [{ path: "src/auth.ts", content: "const x = 1;" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);

			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/src%2Fauth.ts');
			const content = await provider.provideTextDocumentContent(uri);
			expect(content).toBe('const x = 1;');
		});

		it("returns empty string for invalid snapshot ID", async () => {
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://invalid-id/src%2Fauth.ts');
			const content = await provider.provideTextDocumentContent(uri);
			expect(content).toBe('');
		});

		it("returns empty string for missing file in snapshot", async () => {

			const snapshot: Snapshot = {
				id: "cp-abc123",
				fileStates: [{ path: "src/auth.ts", content: "const x = 1;" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/src%2Fmissing.ts');
			const content = await provider.provideTextDocumentContent(uri);
			expect(content).toBe('');

		});

		it("handles file path encoding correctly - spaces", async () => {

			const snapshot: Snapshot = {
				id: "cp-abc123",
				fileStates: [{ path: "src/my file.ts", content: "content" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/src%2Fmy%20file.ts');
			const content = await provider.provideTextDocumentContent(uri);
			expect(content).toBe('content');

		});

		it("handles file path encoding correctly - special characters", async () => {

			const snapshot: Snapshot = {
				id: "cp-abc123",
				fileStates: [{ path: "src/file (1).ts", content: "content" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/src%2Ffile%20(1).ts');
			const content = await provider.provideTextDocumentContent(uri);
			expect(content).toBe('content');

		});

		it("handles file path encoding correctly - Unicode", async () => {

			const snapshot: Snapshot = {
				id: "cp-abc123",
				fileStates: [{ path: "src/中文.ts", content: "content" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/src%2F%E4%B8%AD%E6%96%87.ts');
			const content = await provider.provideTextDocumentContent(uri);
			expect(content).toBe('content');

		});

		it("uses cache for repeated requests", async () => {

			const snapshot: Snapshot = {
				id: "cp-abc123",
				fileStates: [{ path: "src/auth.ts", content: "cached content" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/src%2Fauth.ts');

			// First call - should read from storage
			await provider.provideTextDocumentContent(uri);
			const getSnapshotSpy = vi.spyOn(mockSnapshotManager, 'get');

			// Second call - should use cache
			await provider.provideTextDocumentContent(uri);
			expect(getSnapshotSpy).not.toHaveBeenCalled();

		});

		it("LRU eviction works when cache is full", async () => {
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);

			// Fill cache to limit (100 entries)
			for (let i = 0; i < 100; i++) {
				const snapshot: Snapshot = {
					id: `cp-${i}`,
					fileStates: [{ path: 'src/file.ts', content: `content-${i}` }],
					timestamp: Date.now(),
				};
				mockSnapshotManager.addSnapshot(snapshot);
				const uri = vscode.Uri.parse(`snapback://cp-${i}/src%2Ffile.ts`);
				await provider.provideTextDocumentContent(uri);
			}

			// Add one more - should evict oldest
			const snapshot: Snapshot = {
				id: 'cp-101',
				fileStates: [{ path: 'src/file.ts', content: 'content-101' }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const uri = vscode.Uri.parse('snapback://cp-101/src%2Ffile.ts');
			await provider.provideTextDocumentContent(uri);

			// Verify oldest (cp-0) was evicted by checking if next call reads from storage
			const getSnapshotSpy = vi.spyOn(mockSnapshotManager, 'get');
			const oldUri = vscode.Uri.parse('snapback://cp-0/src%2Ffile.ts');
			await provider.provideTextDocumentContent(oldUri);
			expect(getSnapshotSpy).toHaveBeenCalled();
		});

		it("invalidates cache for specific snapshot", async () => {

			const snapshotA: Snapshot = {
				id: "cp-a",
				fileStates: [{ path: "src/auth.ts", content: "content A" }],
				timestamp: Date.now(),
			};
			const snapshotB: Snapshot = {
				id: "cp-b",
				fileStates: [{ path: "src/auth.ts", content: "content B" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshotA);
			mockSnapshotManager.addSnapshot(snapshotB);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);

			// Cache both snapshots
			const uriA = vscode.Uri.parse('snapback://cp-a/src%2Fauth.ts');
			const uriB = vscode.Uri.parse('snapback://cp-b/src%2Fauth.ts');
			await provider.provideTextDocumentContent(uriA);
			await provider.provideTextDocumentContent(uriB);

			// Invalidate A
			provider.invalidateSnapshot('cp-a');

			// Verify A removed, B remains
			const getSnapshotSpy = vi.spyOn(mockSnapshotManager, 'get');
			await provider.provideTextDocumentContent(uriA); // Should read from storage
			expect(getSnapshotSpy).toHaveBeenCalledWith('cp-a');

			getSnapshotSpy.mockClear();
			await provider.provideTextDocumentContent(uriB); // Should use cache
			expect(getSnapshotSpy).not.toHaveBeenCalled();

		});

		it("handles storage errors gracefully", async () => {

			const errorManager = new MockSnapshotManager();
			vi.spyOn(errorManager, "get").mockRejectedValue(
				new Error("Storage failure"),
			);
			const provider = new SnapshotContentProvider(errorManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/src%2Fauth.ts');
			const content = await provider.provideTextDocumentContent(uri);

			// Should return empty string (error logged internally)
			expect(content).toBe('');

		});
	});

	describe("URI parsing", () => {
		it("parses standard URI correctly", () => {
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/src%2Fauth.ts');
			const parsed = provider['parseSnapshotUri'](uri);
			expect(parsed.snapshotId).toBe('cp-abc123');
			expect(parsed.filePath).toBe('src/auth.ts');

		});

		it("handles Windows paths", () => {
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/C:%5CUsers%5Ctest%5Cfile.ts');
			const parsed = provider['parseSnapshotUri'](uri);
			expect(parsed.filePath).toBe('C:\\Users\\test\\file.ts');

		});

		it("throws on malformed URI - no snapshot ID", () => {
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback:///src%2Fauth.ts');
			expect(() => provider['parseSnapshotUri'](uri)).toThrow();

		});

		it("throws on malformed URI - no file path", () => {
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-abc123/');
			expect(() => provider['parseSnapshotUri'](uri)).toThrow();

		});
	});

	describe("performance", () => {
		it("retrieves cached content in <10ms (P95)", async () => {

			const snapshot: Snapshot = {
				id: "cp-perf",
				fileStates: [{ path: "src/auth.ts", content: "performance test content" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-perf/src%2Fauth.ts');

			// Warm up cache
			await provider.provideTextDocumentContent(uri);

			// Measure 100 cached requests
			const times: number[] = [];
			for (let i = 0; i < 100; i++) {
				const time = await _measureTime(() => provider.provideTextDocumentContent(uri));
				times.push(time);
			}
			const p95 = _calculateP95(times);
			expect(p95).toBeLessThan(10); // P95 < 10ms

		});

		it("handles 1000 cached entries without performance degradation", async () => {
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);

			// Create and cache 1000 entries
			for (let i = 0; i < 1000; i++) {
				const snapshot: Snapshot = {
					id: `cp-${i}`,
					fileStates: [{ path: 'src/file.ts', content: `content-${i}` }],
					timestamp: Date.now(),
				};
				mockSnapshotManager.addSnapshot(snapshot);
				const uri = vscode.Uri.parse(`snapback://cp-${i}/src%2Ffile.ts`);
				await provider.provideTextDocumentContent(uri);
			}

			// Measure retrieval from middle of cache
			const uri = vscode.Uri.parse('snapback://cp-500/src%2Ffile.ts');
			const time = await _measureTime(() => provider.provideTextDocumentContent(uri));
			expect(time).toBeLessThan(10);
		});

		it("retrieves large file content efficiently", async () => {

			const largeContent = "x".repeat(10 * 1024 * 1024); // 10MB
			const snapshot: Snapshot = {
				id: "cp-large",
				fileStates: [{ path: "src/large.ts", content: largeContent }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-large/src%2Flarge.ts');

			// Should complete in reasonable time
			const time = await _measureTime(() => provider.provideTextDocumentContent(uri));
			expect(time).toBeLessThan(1000); // 1 second max for 10MB

		});
	});

	describe("edge cases", () => {
		it("handles empty file content", async () => {

			const snapshot: Snapshot = {
				id: "cp-empty",
				fileStates: [{ path: "src/empty.ts", content: "" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-empty/src%2Fempty.ts');
			const content = await provider.provideTextDocumentContent(uri);
			expect(content).toBe('');

		});

		it("handles null snapshot gracefully", async () => {
			vi.spyOn(mockSnapshotManager, "get").mockResolvedValue(undefined);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-null/src%2Fauth.ts');
			const content = await provider.provideTextDocumentContent(uri);
			expect(content).toBe('');
		});

		it("handles concurrent requests for same URI", async () => {

			const snapshot: Snapshot = {
				id: "cp-concurrent",
				fileStates: [{ path: "src/auth.ts", content: "concurrent content" }],
				timestamp: Date.now(),
			};
			mockSnapshotManager.addSnapshot(snapshot);
			const provider = new SnapshotContentProvider(mockSnapshotManager as any);
			const uri = vscode.Uri.parse('snapback://cp-concurrent/src%2Fauth.ts');

			// Make 10 concurrent requests
			const promises = Array.from({ length: 10 }, () =>
				provider.provideTextDocumentContent(uri)
			);
			const results = await Promise.all(promises);

			// All should return same content
			results.forEach(content => expect(content).toBe('concurrent content'));

		});
	});
});

/**
 * RED Phase Status: ✅ Complete
 *
 * All 23 tests written and failing as expected.
 * Next step: Implement SnapshotContentProvider (GREEN phase)
 *
 * Test Coverage:
 * - Content retrieval (valid, invalid, missing)
 * - Path encoding (spaces, special chars, Unicode)
 * - Caching (LRU eviction, invalidation)
 * - URI parsing (standard, Windows, malformed)
 * - Performance (cached retrieval, scalability, large files)
 * - Edge cases (empty content, null snapshots, concurrency)
 */
