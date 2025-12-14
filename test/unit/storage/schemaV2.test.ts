/**
 * @fileoverview Schema V2 Tests - TDD RED Phase
 *
 * Tests for SnapshotManifestV2 schema compliance.
 * Per gap analysis, the following fields are missing from current V1 schema:
 * - schemaVersion: 2
 * - seq: number (sequential snapshot ID)
 * - parentSeq: number | null (for chaining)
 * - parentId: string | null (for chaining)
 * - type: CheckpointType ('POST' | 'PRE' | 'PRE_ROLLBACK')
 *
 * These tests should FAIL in RED phase, then pass after implementation.
 */

import { describe, expect, it } from "vitest";
import * as StorageTypes from "@vscode/storage/types";

describe("Schema V2 - SnapshotManifestV2", () => {
	describe("Type Export Existence", () => {
		it("should export CHECKPOINT_TYPES constant with POST, PRE, PRE_ROLLBACK", () => {
			// RED: This should fail because CHECKPOINT_TYPES doesn't exist yet
			expect(StorageTypes).toHaveProperty("CHECKPOINT_TYPES");

			const types = (StorageTypes as Record<string, unknown>).CHECKPOINT_TYPES as readonly string[];
			expect(types).toContain("POST");
			expect(types).toContain("PRE");
			expect(types).toContain("PRE_ROLLBACK");
		});

		it("should export SCHEMA_VERSION_V2 constant equal to 2", () => {
			// RED: This should fail because SCHEMA_VERSION_V2 doesn't exist yet
			expect(StorageTypes).toHaveProperty("SCHEMA_VERSION_V2");

			const version = (StorageTypes as Record<string, unknown>).SCHEMA_VERSION_V2;
			expect(version).toBe(2);
		});

		it("should export isCheckpointType type guard function", () => {
			// RED: This should fail because isCheckpointType doesn't exist yet
			expect(StorageTypes).toHaveProperty("isCheckpointType");
			expect(typeof (StorageTypes as Record<string, unknown>).isCheckpointType).toBe("function");
		});

		it("should export isSnapshotManifestV2 type guard function", () => {
			// RED: This should fail because isSnapshotManifestV2 doesn't exist yet
			expect(StorageTypes).toHaveProperty("isSnapshotManifestV2");
			expect(typeof (StorageTypes as Record<string, unknown>).isSnapshotManifestV2).toBe("function");
		});
	});

	describe("CheckpointType Validation", () => {
		it("should validate 'POST' as valid CheckpointType", () => {
			const isCheckpointType = (StorageTypes as Record<string, unknown>).isCheckpointType as (
				value: unknown,
			) => boolean;

			expect(isCheckpointType("POST")).toBe(true);
		});

		it("should validate 'PRE' as valid CheckpointType", () => {
			const isCheckpointType = (StorageTypes as Record<string, unknown>).isCheckpointType as (
				value: unknown,
			) => boolean;

			expect(isCheckpointType("PRE")).toBe(true);
		});

		it("should validate 'PRE_ROLLBACK' as valid CheckpointType", () => {
			const isCheckpointType = (StorageTypes as Record<string, unknown>).isCheckpointType as (
				value: unknown,
			) => boolean;

			expect(isCheckpointType("PRE_ROLLBACK")).toBe(true);
		});

		it("should reject invalid checkpoint types", () => {
			const isCheckpointType = (StorageTypes as Record<string, unknown>).isCheckpointType as (
				value: unknown,
			) => boolean;

			expect(isCheckpointType("INVALID")).toBe(false);
			expect(isCheckpointType("auto")).toBe(false);
			expect(isCheckpointType("manual")).toBe(false);
			expect(isCheckpointType(null)).toBe(false);
			expect(isCheckpointType(undefined)).toBe(false);
		});
	});

	describe("SnapshotManifestV2 Validation", () => {
		it("should identify V2 manifest by schemaVersion field", () => {
			const isSnapshotManifestV2 = (StorageTypes as Record<string, unknown>).isSnapshotManifestV2 as (
				value: unknown,
			) => boolean;

			const v2Manifest = {
				schemaVersion: 2,
				id: "snap-test",
				seq: 1,
				parentSeq: null,
				parentId: null,
				timestamp: Date.now(),
				name: "Test",
				type: "POST",
				anchorFile: "/file.ts",
				files: {},
			};

			expect(isSnapshotManifestV2(v2Manifest)).toBe(true);
		});

		it("should reject V1 manifest (missing schemaVersion)", () => {
			const isSnapshotManifestV2 = (StorageTypes as Record<string, unknown>).isSnapshotManifestV2 as (
				value: unknown,
			) => boolean;

			const v1Manifest = {
				id: "snap-v1",
				timestamp: Date.now(),
				name: "V1 Snapshot",
				trigger: "auto",
				anchorFile: "/file.ts",
				files: {},
			};

			expect(isSnapshotManifestV2(v1Manifest)).toBe(false);
		});

		it("should validate V2 manifest has required seq field", () => {
			const isSnapshotManifestV2 = (StorageTypes as Record<string, unknown>).isSnapshotManifestV2 as (
				value: unknown,
			) => boolean;

			const manifestWithoutSeq = {
				schemaVersion: 2,
				id: "snap-test",
				// missing seq
				parentSeq: null,
				parentId: null,
				timestamp: Date.now(),
				name: "Test",
				type: "POST",
				anchorFile: "/file.ts",
				files: {},
			};

			expect(isSnapshotManifestV2(manifestWithoutSeq)).toBe(false);
		});

		it("should validate V2 manifest has required type field", () => {
			const isSnapshotManifestV2 = (StorageTypes as Record<string, unknown>).isSnapshotManifestV2 as (
				value: unknown,
			) => boolean;

			const manifestWithoutType = {
				schemaVersion: 2,
				id: "snap-test",
				seq: 1,
				parentSeq: null,
				parentId: null,
				timestamp: Date.now(),
				name: "Test",
				// missing type
				anchorFile: "/file.ts",
				files: {},
			};

			expect(isSnapshotManifestV2(manifestWithoutType)).toBe(false);
		});
	});

	describe("Snapshot Chaining Semantics", () => {
		it("should allow null parentSeq and parentId for root snapshots", () => {
			const isSnapshotManifestV2 = (StorageTypes as Record<string, unknown>).isSnapshotManifestV2 as (
				value: unknown,
			) => boolean;

			const rootManifest = {
				schemaVersion: 2,
				id: "snap-root",
				seq: 1,
				parentSeq: null,
				parentId: null,
				timestamp: Date.now(),
				name: "Root",
				type: "POST",
				anchorFile: "/file.ts",
				files: {},
			};

			expect(isSnapshotManifestV2(rootManifest)).toBe(true);
		});

		it("should validate parentSeq is less than seq for child snapshots", () => {
			const isSnapshotManifestV2 = (StorageTypes as Record<string, unknown>).isSnapshotManifestV2 as (
				value: unknown,
			) => boolean;

			const validChild = {
				schemaVersion: 2,
				id: "snap-child",
				seq: 5,
				parentSeq: 4,
				parentId: "snap-parent",
				timestamp: Date.now(),
				name: "Child",
				type: "POST",
				anchorFile: "/file.ts",
				files: {},
			};

			expect(isSnapshotManifestV2(validChild)).toBe(true);
		});
	});
});
