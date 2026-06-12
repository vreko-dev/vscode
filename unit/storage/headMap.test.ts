/**
 * @fileoverview HeadMap Tests - TDD Phase
 *
 * Tests for head-map.json management per spec.json requirements.
 * HeadMap is a materialized view of HEAD for fast tombstone/decision lookups.
 */

import { describe, expect, it } from "vitest";
import * as HeadMapModule from "../../../src/storage/headMap";
import type { SnapshotFileRefV2 } from "../../../src/storage/types";

describe("HeadMap - head-map.json Management", () => {
	describe("Type Exports", () => {
		it("should export HeadMap interface with required fields", () => {
			// Type check - if this compiles, the interface exists
			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 5,
				files: {
					"/src/index.ts": { blobHash: "abc123", size: 1024 },
					"/src/deleted.ts": null, // tombstone
				},
			};
			expect(headMap.schemaVersion).toBe(1);
			expect(headMap.headSeq).toBe(5);
			expect(headMap.files["/src/index.ts"]).toEqual({ blobHash: "abc123", size: 1024 });
			expect(headMap.files["/src/deleted.ts"]).toBeNull();
		});

		it("should export DEFAULT_HEAD_MAP constant", () => {
			expect(HeadMapModule).toHaveProperty("DEFAULT_HEAD_MAP");
			const defaultMap = HeadMapModule.DEFAULT_HEAD_MAP;
			expect(defaultMap.schemaVersion).toBe(1);
			expect(defaultMap.headSeq).toBe(0);
			expect(defaultMap.files).toEqual({});
		});
	});

	describe("File Operations", () => {
		it("should export setFile function to add/update file entry", () => {
			expect(HeadMapModule).toHaveProperty("setFile");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {},
			};

			HeadMapModule.setFile(headMap, "/src/new.ts", { blobHash: "hash123", size: 500 });

			expect(headMap.files["/src/new.ts"]).toEqual({ blobHash: "hash123", size: 500 });
		});

		it("should export markDeleted function to set tombstone", () => {
			expect(HeadMapModule).toHaveProperty("markDeleted");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {
					"/src/toDelete.ts": { blobHash: "existingHash", size: 100 },
				},
			};

			HeadMapModule.markDeleted(headMap, "/src/toDelete.ts");

			expect(headMap.files["/src/toDelete.ts"]).toBeNull();
		});

		it("should export getFile function to retrieve file ref", () => {
			expect(HeadMapModule).toHaveProperty("getFile");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {
					"/src/exists.ts": { blobHash: "hash", size: 200 },
					"/src/deleted.ts": null,
				},
			};

			const existing = HeadMapModule.getFile(headMap, "/src/exists.ts");
			expect(existing).toEqual({ blobHash: "hash", size: 200 });

			const deleted = HeadMapModule.getFile(headMap, "/src/deleted.ts");
			expect(deleted).toBeNull();

			const missing = HeadMapModule.getFile(headMap, "/src/nothere.ts");
			expect(missing).toBeUndefined();
		});

		it("should export isDeleted function to check tombstone status", () => {
			expect(HeadMapModule).toHaveProperty("isDeleted");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {
					"/src/alive.ts": { blobHash: "hash", size: 100 },
					"/src/dead.ts": null,
				},
			};

			expect(HeadMapModule.isDeleted(headMap, "/src/dead.ts")).toBe(true);
			expect(HeadMapModule.isDeleted(headMap, "/src/alive.ts")).toBe(false);
			expect(HeadMapModule.isDeleted(headMap, "/src/unknown.ts")).toBe(false);
		});

		it("should export hasFile function to check if file exists (not tombstone)", () => {
			expect(HeadMapModule).toHaveProperty("hasFile");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {
					"/src/exists.ts": { blobHash: "hash", size: 100 },
					"/src/tombstone.ts": null,
				},
			};

			expect(HeadMapModule.hasFile(headMap, "/src/exists.ts")).toBe(true);
			expect(HeadMapModule.hasFile(headMap, "/src/tombstone.ts")).toBe(false);
			expect(HeadMapModule.hasFile(headMap, "/src/missing.ts")).toBe(false);
		});
	});

	describe("Bulk Operations", () => {
		it("should export applySnapshot function to merge snapshot files into headMap", () => {
			expect(HeadMapModule).toHaveProperty("applySnapshot");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {
					"/src/old.ts": { blobHash: "oldHash", size: 50 },
				},
			};

			const snapshotFiles: Record<string, SnapshotFileRefV2> = {
				"/src/new.ts": { blobHash: "newHash", size: 100 },
				"/src/old.ts": { blobHash: "updatedHash", size: 75 },
			};

			HeadMapModule.applySnapshot(headMap, snapshotFiles, 2);

			expect(headMap.headSeq).toBe(2);
			expect(headMap.files["/src/new.ts"]).toEqual({ blobHash: "newHash", size: 100 });
			expect(headMap.files["/src/old.ts"]).toEqual({ blobHash: "updatedHash", size: 75 });
		});

		it("should export applyDeletions function to mark files as tombstones", () => {
			expect(HeadMapModule).toHaveProperty("applyDeletions");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {
					"/src/keep.ts": { blobHash: "keep", size: 100 },
					"/src/remove1.ts": { blobHash: "r1", size: 50 },
					"/src/remove2.ts": { blobHash: "r2", size: 60 },
				},
			};

			const deletions = ["/src/remove1.ts", "/src/remove2.ts"];

			HeadMapModule.applyDeletions(headMap, deletions);

			expect(headMap.files["/src/keep.ts"]).toEqual({ blobHash: "keep", size: 100 });
			expect(headMap.files["/src/remove1.ts"]).toBeNull();
			expect(headMap.files["/src/remove2.ts"]).toBeNull();
		});

		it("should export getActiveFiles function to list non-tombstone files", () => {
			expect(HeadMapModule).toHaveProperty("getActiveFiles");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {
					"/src/a.ts": { blobHash: "a", size: 10 },
					"/src/b.ts": null, // tombstone
					"/src/c.ts": { blobHash: "c", size: 30 },
				},
			};

			const active = HeadMapModule.getActiveFiles(headMap);
			expect(active).toHaveLength(2);
			expect(active.map((f) => f.path).sort()).toEqual(["/src/a.ts", "/src/c.ts"]);
		});

		it("should export getTombstones function to list deleted file paths", () => {
			expect(HeadMapModule).toHaveProperty("getTombstones");

			const headMap: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 1,
				files: {
					"/src/alive.ts": { blobHash: "alive", size: 100 },
					"/src/dead1.ts": null,
					"/src/dead2.ts": null,
				},
			};

			const tombstones = HeadMapModule.getTombstones(headMap);
			expect(tombstones.sort()).toEqual(["/src/dead1.ts", "/src/dead2.ts"]);
		});
	});

	describe("Validation", () => {
		it("should export isValidHeadMap function", () => {
			expect(HeadMapModule).toHaveProperty("isValidHeadMap");
		});

		it("should validate correct headMap object", () => {
			const validMap = {
				schemaVersion: 1,
				headSeq: 10,
				files: {
					"/src/file.ts": { blobHash: "hash", size: 100 },
				},
			};
			expect(HeadMapModule.isValidHeadMap(validMap)).toBe(true);
		});

		it("should validate empty files object", () => {
			const validMap = {
				schemaVersion: 1,
				headSeq: 0,
				files: {},
			};
			expect(HeadMapModule.isValidHeadMap(validMap)).toBe(true);
		});

		it("should validate files with tombstones", () => {
			const validMap = {
				schemaVersion: 1,
				headSeq: 5,
				files: {
					"/src/alive.ts": { blobHash: "hash", size: 100 },
					"/src/deleted.ts": null,
				},
			};
			expect(HeadMapModule.isValidHeadMap(validMap)).toBe(true);
		});

		it("should reject invalid schemaVersion", () => {
			const invalidMap = {
				schemaVersion: 2,
				headSeq: 0,
				files: {},
			};
			expect(HeadMapModule.isValidHeadMap(invalidMap)).toBe(false);
		});

		it("should reject missing required fields", () => {
			expect(HeadMapModule.isValidHeadMap({})).toBe(false);
			expect(HeadMapModule.isValidHeadMap(null)).toBe(false);
			expect(HeadMapModule.isValidHeadMap({ schemaVersion: 1 })).toBe(false);
		});
	});

	describe("Clone/Reset Operations", () => {
		it("should export cloneHeadMap function for safe copying", () => {
			expect(HeadMapModule).toHaveProperty("cloneHeadMap");

			const original: HeadMapModule.HeadMap = {
				schemaVersion: 1,
				headSeq: 5,
				files: {
					"/src/file.ts": { blobHash: "hash", size: 100 },
				},
			};

			const clone = HeadMapModule.cloneHeadMap(original);

			// Should be equal content
			expect(clone).toEqual(original);

			// But not same reference
			expect(clone).not.toBe(original);
			expect(clone.files).not.toBe(original.files);

			// Mutations should not affect original
			clone.files["/src/new.ts"] = { blobHash: "new", size: 50 };
			expect(original.files["/src/new.ts"]).toBeUndefined();
		});

		it("should export resetHeadMap function to create fresh map", () => {
			expect(HeadMapModule).toHaveProperty("resetHeadMap");

			const freshMap = HeadMapModule.resetHeadMap();

			expect(freshMap.schemaVersion).toBe(1);
			expect(freshMap.headSeq).toBe(0);
			expect(freshMap.files).toEqual({});
		});
	});
});
