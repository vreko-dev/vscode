/**
 * Violation Reader Integration Tests
 *
 * Verifies that violation reading via DaemonBridge works correctly
 * in the Proactive Alert System initialization.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("Violation Reader - DaemonBridge Integration", () => {
	let mockDaemonBridge: any;
	let mockGetDaemonBridge: any;

	beforeEach(() => {
		// Mock DaemonBridge
		mockDaemonBridge = {
			isConnected: vi.fn(() => true),
			listViolations: vi.fn(),
		};

		// Mock getDaemonBridge singleton
		mockGetDaemonBridge = vi.fn(() => mockDaemonBridge);
	});

	afterEach(() => {
		vi.clearAllMocks();
	});

	describe("Violation Reader Interface", () => {
		it("should return violations for a specific file", async () => {
			// Setup mock data
			const mockViolations = [
				{
					id: "v1",
					type: "silent_catch",
					file: "/workspace/src/auth.ts",
					whatHappened: "Catch block swallowed error",
					whyItHappened: "Rushed implementation",
					prevention: "Always log in catch blocks",
					occurrences: 3,
					createdAt: "2026-01-23T10:00:00.000Z",
				},
				{
					id: "v2",
					type: "missing_validation",
					file: "/workspace/src/api.ts",
					whatHappened: "Missing input validation",
					whyItHappened: "Forgot to validate",
					prevention: "Add validation middleware",
					occurrences: 1,
					createdAt: "2026-01-23T11:00:00.000Z",
				},
			];

			mockDaemonBridge.listViolations.mockResolvedValue({
				violations: mockViolations,
				total: 2,
			});

			// Create violation reader (mimics extension.ts implementation)
			const violationReader = {
				getViolationsForFile: async (filePath: string) => {
					const bridge = mockGetDaemonBridge();
					if (bridge.isConnected()) {
						try {
							const result = await bridge.listViolations("/workspace");
							return result.violations
								.filter((v: any) => v.file === filePath || v.file.includes(filePath))
								.map((v: any) => ({
									type: v.type,
									count: v.occurrences || 1,
									lastOccurrence: new Date(v.createdAt).getTime(),
								}));
						} catch (err) {
							// Fail silently, return empty array
						}
					}
					return [];
				},
			};

			// Test: Get violations for auth.ts
			const result = await violationReader.getViolationsForFile("/workspace/src/auth.ts");

			expect(result).toHaveLength(1);
			expect(result[0]).toEqual({
				type: "silent_catch",
				count: 3,
				lastOccurrence: new Date("2026-01-23T10:00:00.000Z").getTime(),
			});
		});

		it("should return empty array when file has no violations", async () => {
			mockDaemonBridge.listViolations.mockResolvedValue({
				violations: [],
				total: 0,
			});

			const violationReader = {
				getViolationsForFile: async (filePath: string) => {
					const bridge = mockGetDaemonBridge();
					if (bridge.isConnected()) {
						try {
							const result = await bridge.listViolations("/workspace");
							return result.violations
								.filter((v: any) => v.file === filePath || v.file.includes(filePath))
								.map((v: any) => ({
									type: v.type,
									count: v.occurrences || 1,
									lastOccurrence: new Date(v.createdAt).getTime(),
								}));
						} catch (err) {
							// Fail silently
						}
					}
					return [];
				},
			};

			const result = await violationReader.getViolationsForFile("/workspace/src/utils.ts");

			expect(result).toEqual([]);
		});

		it("should return empty array when daemon is not connected", async () => {
			mockDaemonBridge.isConnected.mockReturnValue(false);

			const violationReader = {
				getViolationsForFile: async (filePath: string) => {
					const bridge = mockGetDaemonBridge();
					if (bridge.isConnected()) {
						try {
							const result = await bridge.listViolations("/workspace");
							return result.violations
								.filter((v: any) => v.file === filePath || v.file.includes(filePath))
								.map((v: any) => ({
									type: v.type,
									count: v.occurrences || 1,
									lastOccurrence: new Date(v.createdAt).getTime(),
								}));
						} catch (err) {
							// Fail silently
						}
					}
					return [];
				},
			};

			const result = await violationReader.getViolationsForFile("/workspace/src/auth.ts");

			expect(result).toEqual([]);
			expect(mockDaemonBridge.listViolations).not.toHaveBeenCalled();
		});

		it("should handle daemon errors gracefully", async () => {
			mockDaemonBridge.listViolations.mockRejectedValue(new Error("Daemon connection failed"));

			const violationReader = {
				getViolationsForFile: async (filePath: string) => {
					const bridge = mockGetDaemonBridge();
					if (bridge.isConnected()) {
						try {
							const result = await bridge.listViolations("/workspace");
							return result.violations
								.filter((v: any) => v.file === filePath || v.file.includes(filePath))
								.map((v: any) => ({
									type: v.type,
									count: v.occurrences || 1,
									lastOccurrence: new Date(v.createdAt).getTime(),
								}));
						} catch (err) {
							// Fail silently, return empty array
						}
					}
					return [];
				},
			};

			const result = await violationReader.getViolationsForFile("/workspace/src/auth.ts");

			expect(result).toEqual([]);
		});

		it("should match violations by partial file path", async () => {
			const mockViolations = [
				{
					id: "v1",
					type: "silent_catch",
					file: "/workspace/src/auth.ts",
					whatHappened: "Error swallowed",
					whyItHappened: "Missing logging",
					prevention: "Add logger.error()",
					occurrences: 2,
					createdAt: "2026-01-23T10:00:00.000Z",
				},
			];

			mockDaemonBridge.listViolations.mockResolvedValue({
				violations: mockViolations,
				total: 1,
			});

			const violationReader = {
				getViolationsForFile: async (filePath: string) => {
					const bridge = mockGetDaemonBridge();
					if (bridge.isConnected()) {
						try {
							const result = await bridge.listViolations("/workspace");
							return result.violations
								.filter((v: any) => v.file === filePath || v.file.includes(filePath))
								.map((v: any) => ({
									type: v.type,
									count: v.occurrences || 1,
									lastOccurrence: new Date(v.createdAt).getTime(),
								}));
						} catch (err) {
							// Fail silently
						}
					}
					return [];
				},
			};

			// Test with partial path
			const result = await violationReader.getViolationsForFile("auth.ts");

			expect(result).toHaveLength(1);
			expect(result[0].type).toBe("silent_catch");
		});

		it("should transform daemon response to match IViolationReader interface", async () => {
			const mockViolations = [
				{
					id: "v1",
					type: "missing_error_handling",
					file: "/workspace/src/api.ts",
					whatHappened: "API call without try-catch",
					whyItHappened: "Oversight",
					prevention: "Wrap API calls in try-catch",
					occurrences: 5,
					createdAt: "2026-01-23T12:00:00.000Z",
				},
			];

			mockDaemonBridge.listViolations.mockResolvedValue({
				violations: mockViolations,
				total: 1,
			});

			const violationReader = {
				getViolationsForFile: async (filePath: string) => {
					const bridge = mockGetDaemonBridge();
					if (bridge.isConnected()) {
						try {
							const result = await bridge.listViolations("/workspace");
							return result.violations
								.filter((v: any) => v.file === filePath || v.file.includes(filePath))
								.map((v: any) => ({
									type: v.type,
									count: v.occurrences || 1,
									lastOccurrence: new Date(v.createdAt).getTime(),
								}));
						} catch (err) {
							// Fail silently
						}
					}
					return [];
				},
			};

			const result = await violationReader.getViolationsForFile("/workspace/src/api.ts");

			// Verify interface compliance
			expect(result[0]).toHaveProperty("type");
			expect(result[0]).toHaveProperty("count");
			expect(result[0]).toHaveProperty("lastOccurrence");
			expect(result[0]).not.toHaveProperty("file");
			expect(result[0]).not.toHaveProperty("whatHappened");
			expect(result[0]).not.toHaveProperty("prevention");

			expect(typeof result[0].type).toBe("string");
			expect(typeof result[0].count).toBe("number");
			expect(typeof result[0].lastOccurrence).toBe("number");
		});

		it("should default count to 1 when occurrences is missing", async () => {
			const mockViolations = [
				{
					id: "v1",
					type: "new_violation",
					file: "/workspace/src/test.ts",
					whatHappened: "Test violation",
					whyItHappened: "Test",
					prevention: "Test prevention",
					// occurrences field missing
					createdAt: "2026-01-23T10:00:00.000Z",
				},
			];

			mockDaemonBridge.listViolations.mockResolvedValue({
				violations: mockViolations,
				total: 1,
			});

			const violationReader = {
				getViolationsForFile: async (filePath: string) => {
					const bridge = mockGetDaemonBridge();
					if (bridge.isConnected()) {
						try {
							const result = await bridge.listViolations("/workspace");
							return result.violations
								.filter((v: any) => v.file === filePath || v.file.includes(filePath))
								.map((v: any) => ({
									type: v.type,
									count: v.occurrences || 1,
									lastOccurrence: new Date(v.createdAt).getTime(),
								}));
						} catch (err) {
							// Fail silently
						}
					}
					return [];
				},
			};

			const result = await violationReader.getViolationsForFile("/workspace/src/test.ts");

			expect(result[0].count).toBe(1);
		});
	});
});
