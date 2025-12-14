/**
 * @fileoverview Schema V2 Tests - TDD Phase
 *
 * Tests for SnapshotManifestV2 schema compliance with spec.json requirements.
 * 
 * Missing fields per spec (to be implemented):
 * - workspaceKey: string (sha256 of sorted workspace folder URIs)
 * - OriginLabel: 'INTERACTIVE' | 'AUTOMATED'
 * - ReasonCode: stable reason codes for explainability
 * - Trigger: expanded to include 'risk-burst' | 'rollback'
 * - Compression codec support
 * - deletions field for tombstone tracking
 * - origin and reasons in metadata
 */

import { describe, expect, it } from "vitest";
import * as StorageTypes from "../../../src/storage/types";

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

	// ============================================
	// Spec Compliance Tests - Phase 1.1 Additions
	// ============================================

	describe("OriginLabel Type", () => {
		it("should export ORIGIN_LABELS constant with INTERACTIVE and AUTOMATED", () => {
			expect(StorageTypes).toHaveProperty("ORIGIN_LABELS");
			const labels = (StorageTypes as Record<string, unknown>).ORIGIN_LABELS as readonly string[];
			expect(labels).toContain("INTERACTIVE");
			expect(labels).toContain("AUTOMATED");
		});

		it("should export isOriginLabel type guard", () => {
			expect(StorageTypes).toHaveProperty("isOriginLabel");
			const isOriginLabel = (StorageTypes as Record<string, unknown>).isOriginLabel as (
				value: unknown,
			) => boolean;
			expect(isOriginLabel("INTERACTIVE")).toBe(true);
			expect(isOriginLabel("AUTOMATED")).toBe(true);
			expect(isOriginLabel("UNKNOWN")).toBe(false);
			expect(isOriginLabel(null)).toBe(false);
		});
	});

	describe("ReasonCode Type", () => {
		it("should export REASON_CODES constant with spec-defined codes", () => {
			expect(StorageTypes).toHaveProperty("REASON_CODES");
			const codes = (StorageTypes as Record<string, unknown>).REASON_CODES as readonly string[];
			expect(codes).toContain("RISK_BURST_START");
			expect(codes).toContain("RISK_LARGE_DELETE");
			expect(codes).toContain("RISK_MULTI_FILE");
			expect(codes).toContain("AI_DETECTED");
			expect(codes).toContain("MANUAL_SAVE");
			expect(codes).toContain("PRE_ROLLBACK");
			expect(codes).toContain("MANUAL_CHECKPOINT");
			expect(codes).toContain("CRITICAL_FILE");
		});

		it("should export isReasonCode type guard", () => {
			expect(StorageTypes).toHaveProperty("isReasonCode");
			const isReasonCode = (StorageTypes as Record<string, unknown>).isReasonCode as (
				value: unknown,
			) => boolean;
			expect(isReasonCode("AI_DETECTED")).toBe(true);
			expect(isReasonCode("INVALID_CODE")).toBe(false);
		});
	});

	describe("Trigger Type (Expanded)", () => {
		it("should export TRIGGER_TYPES with all spec values", () => {
			expect(StorageTypes).toHaveProperty("TRIGGER_TYPES");
			const triggers = (StorageTypes as Record<string, unknown>).TRIGGER_TYPES as readonly string[];
			// Original triggers
			expect(triggers).toContain("auto");
			expect(triggers).toContain("manual");
			expect(triggers).toContain("ai-detected");
			expect(triggers).toContain("pre-save");
			// New triggers from spec
			expect(triggers).toContain("risk-burst");
			expect(triggers).toContain("rollback");
		});

		it("should export isTrigger type guard", () => {
			expect(StorageTypes).toHaveProperty("isTrigger");
			const isTrigger = (StorageTypes as Record<string, unknown>).isTrigger as (
				value: unknown,
			) => boolean;
			expect(isTrigger("risk-burst")).toBe(true);
			expect(isTrigger("rollback")).toBe(true);
			expect(isTrigger("invalid")).toBe(false);
		});
	});

	describe("Compression Codec", () => {
		it("should export COMPRESSION_CODECS constant", () => {
			expect(StorageTypes).toHaveProperty("COMPRESSION_CODECS");
			const codecs = (StorageTypes as Record<string, unknown>).COMPRESSION_CODECS as readonly string[];
			expect(codecs).toContain("zstd");
			expect(codecs).toContain("gzip");
			expect(codecs).toContain("none");
		});
	});

	describe("V2 Manifest Metadata Extensions", () => {
		it("should accept manifest with origin in metadata", () => {
			const isSnapshotManifestV2 = (StorageTypes as Record<string, unknown>).isSnapshotManifestV2 as (
				value: unknown,
			) => boolean;

			const manifestWithOrigin = {
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
				metadata: {
					origin: "AUTOMATED",
					reasons: ["AI_DETECTED", "RISK_BURST_START"],
					riskScore: 0.85,
				},
			};

			expect(isSnapshotManifestV2(manifestWithOrigin)).toBe(true);
		});
	});
});
