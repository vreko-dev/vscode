/**
 * @fileoverview StoreState Tests - TDD Phase
 *
 * Tests for state.json and index.json management per spec.json requirements.
 * Following TDD: RED phase - tests first, then implementation.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import * as StoreStateModule from "../../../src/storage/storeState";

describe("StoreState - state.json Management", () => {
	describe("Type Exports", () => {
		it("should export StoreState interface with required fields", () => {
			// Type check - if this compiles, the interface exists
			const state: StoreStateModule.StoreState = {
				schemaVersion: 1,
				lastSeq: 0,
				headId: null,
				lastUpdatedAt: Date.now(),
			};
			expect(state.schemaVersion).toBe(1);
			expect(state.lastSeq).toBe(0);
			expect(state.headId).toBeNull();
			expect(typeof state.lastUpdatedAt).toBe("number");
		});

		it("should export DEFAULT_STATE constant", () => {
			expect(StoreStateModule).toHaveProperty("DEFAULT_STATE");
			const defaultState = StoreStateModule.DEFAULT_STATE;
			expect(defaultState.schemaVersion).toBe(1);
			expect(defaultState.lastSeq).toBe(0);
			expect(defaultState.headId).toBeNull();
		});
	});

	describe("allocateSeq Function", () => {
		it("should export allocateSeq function", () => {
			expect(StoreStateModule).toHaveProperty("allocateSeq");
			expect(typeof StoreStateModule.allocateSeq).toBe("function");
		});

		it("should increment lastSeq and return new state with seq", () => {
			const state: StoreStateModule.StoreState = {
				schemaVersion: 1,
				lastSeq: 5,
				headId: "snap-123",
				lastUpdatedAt: 1000,
			};

			const result = StoreStateModule.allocateSeq(state);

			expect(result.seq).toBe(6);
			expect(result.newState.lastSeq).toBe(6);
			expect(result.newState.schemaVersion).toBe(1);
			expect(result.newState.headId).toBe("snap-123"); // unchanged
			expect(result.newState.lastUpdatedAt).toBeGreaterThan(1000);
		});

		it("should not mutate original state (immutability)", () => {
			const original: StoreStateModule.StoreState = {
				schemaVersion: 1,
				lastSeq: 10,
				headId: "snap-abc",
				lastUpdatedAt: 2000,
			};

			const result = StoreStateModule.allocateSeq(original);

			expect(original.lastSeq).toBe(10); // original unchanged
			expect(result.newState.lastSeq).toBe(11);
		});
	});

	describe("updateHead Function", () => {
		it("should export updateHead function", () => {
			expect(StoreStateModule).toHaveProperty("updateHead");
			expect(typeof StoreStateModule.updateHead).toBe("function");
		});

		it("should update headId and return new state", () => {
			const state: StoreStateModule.StoreState = {
				schemaVersion: 1,
				lastSeq: 5,
				headId: "snap-old",
				lastUpdatedAt: 1000,
			};

			const newState = StoreStateModule.updateHead(state, "snap-new");

			expect(newState.headId).toBe("snap-new");
			expect(newState.lastSeq).toBe(5); // unchanged
			expect(newState.lastUpdatedAt).toBeGreaterThan(1000);
		});
	});

	describe("isValidState Validation", () => {
		it("should export isValidState function", () => {
			expect(StoreStateModule).toHaveProperty("isValidState");
			expect(typeof StoreStateModule.isValidState).toBe("function");
		});

		it("should validate correct state object", () => {
			const validState = {
				schemaVersion: 1,
				lastSeq: 10,
				headId: "snap-123",
				lastUpdatedAt: Date.now(),
			};
			expect(StoreStateModule.isValidState(validState)).toBe(true);
		});

		it("should validate state with null headId", () => {
			const validState = {
				schemaVersion: 1,
				lastSeq: 0,
				headId: null,
				lastUpdatedAt: Date.now(),
			};
			expect(StoreStateModule.isValidState(validState)).toBe(true);
		});

		it("should reject invalid schemaVersion", () => {
			const invalidState = {
				schemaVersion: 2, // wrong version
				lastSeq: 0,
				headId: null,
				lastUpdatedAt: Date.now(),
			};
			expect(StoreStateModule.isValidState(invalidState)).toBe(false);
		});

		it("should reject missing fields", () => {
			expect(StoreStateModule.isValidState({})).toBe(false);
			expect(StoreStateModule.isValidState(null)).toBe(false);
			expect(StoreStateModule.isValidState(undefined)).toBe(false);
		});
	});
});

describe("SeqIndex - index.json Management", () => {
	describe("Type Exports", () => {
		it("should export SeqIndex interface with required fields", () => {
			const index: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: { 1: "snap-1", 2: "snap-2" },
				byId: { "snap-1": 1, "snap-2": 2 },
				rebuiltAt: Date.now(),
			};
			expect(index.schemaVersion).toBe(1);
			expect(typeof index.bySeq).toBe("object");
			expect(typeof index.byId).toBe("object");
		});

		it("should export DEFAULT_INDEX constant", () => {
			expect(StoreStateModule).toHaveProperty("DEFAULT_INDEX");
			const defaultIndex = StoreStateModule.DEFAULT_INDEX;
			expect(defaultIndex.schemaVersion).toBe(1);
			expect(defaultIndex.bySeq).toEqual({});
			expect(defaultIndex.byId).toEqual({});
		});
	});

	describe("Index Helper Functions", () => {
		it("should export getMaxSeq function", () => {
			expect(StoreStateModule).toHaveProperty("getMaxSeq");

			const index: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: { 1: "snap-1", 5: "snap-5", 3: "snap-3" },
				byId: {},
				rebuiltAt: 0,
			};
			expect(StoreStateModule.getMaxSeq(index)).toBe(5);
		});

		it("should return 0 for empty index in getMaxSeq", () => {
			const emptyIndex: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: {},
				byId: {},
				rebuiltAt: 0,
			};
			expect(StoreStateModule.getMaxSeq(emptyIndex)).toBe(0);
		});

		it("should export getIdBySeq function", () => {
			expect(StoreStateModule).toHaveProperty("getIdBySeq");

			const index: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: { 1: "snap-first", 2: "snap-second" },
				byId: {},
				rebuiltAt: 0,
			};
			expect(StoreStateModule.getIdBySeq(index, 1)).toBe("snap-first");
			expect(StoreStateModule.getIdBySeq(index, 999)).toBeUndefined();
		});

		it("should export getSeqById function", () => {
			expect(StoreStateModule).toHaveProperty("getSeqById");

			const index: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: {},
				byId: { "snap-abc": 42 },
				rebuiltAt: 0,
			};
			expect(StoreStateModule.getSeqById(index, "snap-abc")).toBe(42);
			expect(StoreStateModule.getSeqById(index, "nonexistent")).toBeUndefined();
		});

		it("should export addToIndex function (mutates in place)", () => {
			expect(StoreStateModule).toHaveProperty("addToIndex");

			const index: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: {},
				byId: {},
				rebuiltAt: 0,
			};

			StoreStateModule.addToIndex(index, 10, "snap-new");

			expect(index.bySeq[10]).toBe("snap-new");
			expect(index.byId["snap-new"]).toBe(10);
		});

		it("should export removeFromIndex function", () => {
			expect(StoreStateModule).toHaveProperty("removeFromIndex");

			const index: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: { 5: "snap-remove" },
				byId: { "snap-remove": 5 },
				rebuiltAt: 0,
			};

			StoreStateModule.removeFromIndex(index, 5, "snap-remove");

			expect(index.bySeq[5]).toBeUndefined();
			expect(index.byId["snap-remove"]).toBeUndefined();
		});

		it("should export getOrderedSeqs function", () => {
			expect(StoreStateModule).toHaveProperty("getOrderedSeqs");

			const index: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: { 5: "a", 1: "b", 10: "c", 3: "d" },
				byId: {},
				rebuiltAt: 0,
			};

			const ordered = StoreStateModule.getOrderedSeqs(index);
			expect(ordered).toEqual([1, 3, 5, 10]);
		});

		it("should export isIndexEmpty function", () => {
			expect(StoreStateModule).toHaveProperty("isIndexEmpty");

			const emptyIndex: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: {},
				byId: {},
				rebuiltAt: 0,
			};

			const nonEmptyIndex: StoreStateModule.SeqIndex = {
				schemaVersion: 1,
				bySeq: { 1: "snap" },
				byId: { snap: 1 },
				rebuiltAt: 0,
			};

			expect(StoreStateModule.isIndexEmpty(emptyIndex)).toBe(true);
			expect(StoreStateModule.isIndexEmpty(nonEmptyIndex)).toBe(false);
		});
	});

	describe("isValidIndex Validation", () => {
		it("should export isValidIndex function", () => {
			expect(StoreStateModule).toHaveProperty("isValidIndex");
		});

		it("should validate correct index object", () => {
			const validIndex = {
				schemaVersion: 1,
				bySeq: { 1: "snap-1" },
				byId: { "snap-1": 1 },
				rebuiltAt: Date.now(),
			};
			expect(StoreStateModule.isValidIndex(validIndex)).toBe(true);
		});

		it("should reject invalid schemaVersion", () => {
			const invalidIndex = {
				schemaVersion: 2,
				bySeq: {},
				byId: {},
				rebuiltAt: Date.now(),
			};
			expect(StoreStateModule.isValidIndex(invalidIndex)).toBe(false);
		});

		it("should reject missing fields", () => {
			expect(StoreStateModule.isValidIndex({})).toBe(false);
			expect(StoreStateModule.isValidIndex(null)).toBe(false);
		});
	});
});
