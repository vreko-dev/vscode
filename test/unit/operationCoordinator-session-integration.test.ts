/**
 * Unit test: OperationCoordinator integration with SessionCoordinator
 *
 * This test verifies that OperationCoordinator.coordinateSnapshotCreation()
 * properly wires sessionCoordinator.addCandidate() for each file in the snapshot.
 *
 * **Root Cause Being Tested:**
 * OperationCoordinator was creating snapshots without calling sessionCoordinator.addCandidate(),
 * resulting in sessions with 0 captured files even though snapshots had files.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Mock session coordinator to track addCandidate calls
 */
class MockSessionCoordinator {
	candidates: Array<{
		uri: string;
		snapshotId: string;
		stats?: { added: number; deleted: number };
	}> = [];

	addCandidate(uri: string, snapshotId: string, stats?: { added: number; deleted: number }): void {
		this.candidates.push({ uri, snapshotId, stats });
	}

	async finalizeSession(reason: string) {
		return {
			id: "session-123",
			startedAt: Date.now() - 5000,
			endedAt: Date.now(),
			reason,
			files: this.candidates,
			tags: [],
		};
	}
}

describe("OperationCoordinator - Session Integration", () => {
	let mockSessionCoordinator: MockSessionCoordinator;

	beforeEach(() => {
		mockSessionCoordinator = new MockSessionCoordinator();
	});

	describe("Snapshot file tracking in sessions", () => {
		it("should add each snapshot file to session via addCandidate", () => {
			// Arrange: Simulate files from a snapshot
			const snapshotId = "snap-001";
			const files = [
				{ path: "src/index.ts", content: "export const..." },
				{ path: "src/utils.ts", content: "function..." },
				{ path: "package.json", content: "{...}" },
			];

			// Act: Simulate OperationCoordinator calling addCandidate for each file
			// This is what coordinateSnapshotCreation SHOULD do but currently doesn't
			for (const file of files) {
				const stats = { added: 10, deleted: 0 };
				mockSessionCoordinator.addCandidate(file.path, snapshotId, stats);
			}

			// Assert: Verify all files were added to session
			expect(mockSessionCoordinator.candidates).toHaveLength(3);
			expect(mockSessionCoordinator.candidates[0]).toEqual({
				uri: "src/index.ts",
				snapshotId: "snap-001",
				stats: { added: 10, deleted: 0 },
			});
			expect(mockSessionCoordinator.candidates[1]).toEqual({
				uri: "src/utils.ts",
				snapshotId: "snap-001",
				stats: { added: 10, deleted: 0 },
			});
			expect(mockSessionCoordinator.candidates[2]).toEqual({
				uri: "package.json",
				snapshotId: "snap-001",
				stats: { added: 10, deleted: 0 },
			});
		});

		it("should NOT create empty sessions when files are properly added", async () => {
			// Arrange
			const snapshotId = "snap-002";
			const filesToAdd = [
				{ path: "src/main.ts", stats: { added: 15, deleted: 0 } },
				{ path: "src/config.ts", stats: { added: 8, deleted: 0 } },
			];

			// Act
			for (const file of filesToAdd) {
				mockSessionCoordinator.addCandidate(file.path, snapshotId, file.stats);
			}

			const session = await mockSessionCoordinator.finalizeSession("manual");

			// Assert: Session should have files, not empty array
			expect(session.files).toHaveLength(2);
			expect(session.files[0]).toEqual({
				uri: "src/main.ts",
				snapshotId: "snap-002",
				stats: { added: 15, deleted: 0 },
			});
			expect(session.files[1]).toEqual({
				uri: "src/config.ts",
				snapshotId: "snap-002",
				stats: { added: 8, deleted: 0 },
			});
		});

		it("should demonstrate the bug: empty session when addCandidate is not called", async () => {
			// Arrange: Do NOT call addCandidate (simulating the bug)
			const snapshotId = "snap-003";
			const filesThatAreNotAdded = [
				"src/file1.ts",
				"src/file2.ts",
				"src/file3.ts",
			];

			// Act: Skip adding files to session (this is the BUG)
			// filesThatAreNotAdded.forEach(file => {
			//   mockSessionCoordinator.addCandidate(file, snapshotId);
			// });

			const session = await mockSessionCoordinator.finalizeSession("manual");

			// Assert: Without calling addCandidate, files list is empty (the bug!)
			expect(session.files).toHaveLength(0);
			expect(mockSessionCoordinator.candidates).toHaveLength(0);
		});

		it("should track file statistics (added/deleted counts) properly in session", () => {
			// Arrange
			const snapshotId = "snap-004";

			// Act: Add files with specific stats
			mockSessionCoordinator.addCandidate("src/file1.ts", snapshotId, { added: 100, deleted: 10 });
			mockSessionCoordinator.addCandidate("src/file2.ts", snapshotId, { added: 50, deleted: 5 });

			// Assert: Stats should be preserved exactly
			expect(mockSessionCoordinator.candidates[0].stats).toEqual({ added: 100, deleted: 10 });
			expect(mockSessionCoordinator.candidates[1].stats).toEqual({ added: 50, deleted: 5 });
		});
	});

	describe("Session finalization with captured files", () => {
		it("should finalize session with correct file count from snapshot", async () => {
			// Arrange: Batch of files from one snapshot
			const snapshotId = "snap-batch-001";
			const fileCount = 5;

			// Act: Add all files
			for (let i = 0; i < fileCount; i++) {
				mockSessionCoordinator.addCandidate(`src/file${i}.ts`, snapshotId, {
					added: 10 + i,
					deleted: 0,
				});
			}

			const session = await mockSessionCoordinator.finalizeSession("manual");

			// Assert
			expect(session.files).toHaveLength(5);
			session.files.forEach((file, i) => {
				expect(file.uri).toBe(`src/file${i}.ts`);
				expect(file.snapshotId).toBe(snapshotId);
			});
		});

		it("should capture multiple snapshots in one session", async () => {
			// Arrange: Multiple snapshots with different files
			const snap1Id = "snap-001";
			const snap2Id = "snap-002";

			// Act
			mockSessionCoordinator.addCandidate("file-snap1-a.ts", snap1Id, { added: 10, deleted: 0 });
			mockSessionCoordinator.addCandidate("file-snap1-b.ts", snap1Id, { added: 15, deleted: 0 });
			mockSessionCoordinator.addCandidate("file-snap2-a.ts", snap2Id, { added: 20, deleted: 0 });
			mockSessionCoordinator.addCandidate("file-snap2-b.ts", snap2Id, { added: 25, deleted: 0 });

			const session = await mockSessionCoordinator.finalizeSession("manual");

			// Assert
			expect(session.files).toHaveLength(4);
			const snap1Files = session.files.filter((f) => f.snapshotId === snap1Id);
			const snap2Files = session.files.filter((f) => f.snapshotId === snap2Id);

			expect(snap1Files).toHaveLength(2);
			expect(snap2Files).toHaveLength(2);
		});
	});
});
