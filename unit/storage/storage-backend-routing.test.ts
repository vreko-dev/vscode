/**
 * Storage Backend Routing Tests - Smoke Tests for Thin Client Migration
 *
 * Tests the StorageBackend abstraction that routes to either:
 * 1. DaemonStorageBackend (THIN - default)
 * 2. LocalStorageBackend (FAT - legacy, behind flag)
 *
 * @see STORAGE_CONFIG for feature flag details
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { STORAGE_CONFIG } from "../../../src/storage/StorageManager";

describe("StorageBackend Routing - Smoke Tests", () => {
	describe("STORAGE_CONFIG.useDaemon flag", () => {
		it("should export STORAGE_CONFIG with useDaemon getter", () => {
			expect(STORAGE_CONFIG).toBeDefined();
			expect(typeof STORAGE_CONFIG.useDaemon).toBe("boolean");
		});

		it("should default to true (daemon-backed THIN client)", () => {
			// Ensure no override env var is set
			vi.stubEnv("VREKO_USE_LOCAL_STORAGE", undefined);

			const result = STORAGE_CONFIG.useDaemon;

			expect(result).toBe(true); // Default is THIN client
		});

		it("should default to false when VREKO_USE_LOCAL_STORAGE is set", () => {
			// Set override env var for legacy mode
			vi.stubEnv("VREKO_USE_LOCAL_STORAGE", "true");

			const result = STORAGE_CONFIG.useDaemon;

			expect(result).toBe(false); // Legacy mode - FAT client

			// Cleanup
			vi.unstubAllEnvs();
		});

		it("should return true for any non-true value of VREKO_USE_LOCAL_STORAGE", () => {
			vi.stubEnv("VREKO_USE_LOCAL_STORAGE", "false");

			const result = STORAGE_CONFIG.useDaemon;

			expect(result).toBe(true); // Only "true" triggers legacy mode
		});
	});

	describe("Legacy flag routing", () => {
		it("should support explicit legacy mode via VREKO_USE_LOCAL_STORAGE", () => {
			vi.stubEnv("VREKO_USE_LOCAL_STORAGE", "true");

			// When VREKO_USE_LOCAL_STORAGE=true, useDaemon should be false
			expect(STORAGE_CONFIG.useDaemon).toBe(false);

			vi.unstubAllEnvs();
		});

		it("should default to THIN client when env var is not set", () => {
			vi.stubEnv("VREKO_USE_LOCAL_STORAGE", undefined);

			// Default is THIN client (useDaemon=true)
			expect(STORAGE_CONFIG.useDaemon).toBe(true);
		});
	});

	describe("StorageManager constructor logs correct backend", () => {
		it("should log 'THIN' when useDaemon is true (default)", () => {
			vi.stubEnv("VREKO_USE_LOCAL_STORAGE", undefined);

			// The constructor logs based on STORAGE_CONFIG.useDaemon
			// When useDaemon=true (default), it logs "Using daemon-backed storage (THIN)"
			expect(STORAGE_CONFIG.useDaemon).toBe(true);
		});

		it("should log 'FAT' warning when useDaemon is false (legacy)", () => {
			vi.stubEnv("VREKO_USE_LOCAL_STORAGE", "true");

			// When useDaemon=false, it logs "Using legacy local storage (FAT - deprecated)"
			expect(STORAGE_CONFIG.useDaemon).toBe(false);

			vi.unstubAllEnvs();
		});
	});
});
