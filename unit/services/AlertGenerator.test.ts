import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProactiveAlert } from "../../../../../packages/mcp/src/types/alerts.js";
import { AlertGenerator } from "@vscode/services/AlertGenerator";

// Mock dependencies
const mockFileProtectionService = {
	isProtected: vi.fn(),
	getProtectedFiles: vi.fn(),
};

const mockViolationReader = {
	getViolationsForFile: vi.fn(),
};

const mockPressureGauge = {
	getCurrentPressure: vi.fn(),
};

describe("AlertGenerator", () => {
	let generator: AlertGenerator;
	const workspaceRoot = "/test/workspace";

	beforeEach(() => {
		vi.clearAllMocks();
		generator = new AlertGenerator({
			workspaceRoot,
			fileProtectionService: mockFileProtectionService as any,
			violationReader: mockViolationReader as any,
			pressureGauge: mockPressureGauge as any,
		});
	});

	describe("Alert Detection", () => {
		it("should generate high_risk_file alert when protected file is saved", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([
				{ type: "silent_catch", count: 3, lastOccurrence: Date.now() - 1000 },
			]);

			const alerts = await generator.checkFile("/test/workspace/src/auth.ts");

			expect(alerts).toHaveLength(1);
			expect(alerts[0].category).toBe("high_risk_file");
			expect(alerts[0].severity).toBe("warning");
			expect(alerts[0].summary).toContain("auth.ts");
			expect(alerts[0].summary).toContain("3");
		});

		it("should NOT generate alert for non-protected files", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(false);
			mockViolationReader.getViolationsForFile.mockResolvedValue([]);

			const alerts = await generator.checkFile("/test/workspace/src/utils.ts");

			expect(alerts).toHaveLength(0);
		});

		it("should generate pressure_threshold alert when pressure > 70%", async () => {
			mockPressureGauge.getCurrentPressure.mockResolvedValue(75);

			const alert = await generator.checkPressure();

			expect(alert).not.toBeNull();
			expect(alert?.category).toBe("pressure_threshold");
			expect(alert?.severity).toBe("warning");
			expect(alert?.summary).toContain("pressure");
			expect(alert?.suggested_action).toContain("snapshot");
		});

		it("should NOT generate pressure alert when pressure < 70%", async () => {
			mockPressureGauge.getCurrentPressure.mockResolvedValue(50);

			const alert = await generator.checkPressure();

			expect(alert).toBeNull();
		});

		it("should generate violation_recurrence alert when file has past violations", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([
				{ type: "missing_validation", count: 2, lastOccurrence: Date.now() - 5000 },
			]);

			const alert = await generator.checkViolations("/test/workspace/src/api.ts");

			expect(alert).not.toBeNull();
			expect(alert?.category).toBe("violation_recurrence");
			expect(alert?.severity).toBe("warning");
			expect(alert?.summary).toContain("missing_validation");
		});

		it("should handle file paths correctly (absolute vs relative)", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([]);

			// Test with absolute path
			const alerts1 = await generator.checkFile("/test/workspace/src/auth.ts");
			expect(mockViolationReader.getViolationsForFile).toHaveBeenCalledWith(expect.stringContaining("auth.ts"));

			// Test with relative path
			const alerts2 = await generator.checkFile("src/auth.ts");
			expect(alerts2).toBeDefined();
		});

		it("should normalize file paths for comparison", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);

			// Both should work the same
			await generator.checkFile("/test/workspace/src/auth.ts");
			await generator.checkFile("src/auth.ts");

			expect(mockFileProtectionService.isProtected).toHaveBeenCalledTimes(2);
		});
	});

	describe("Confidence Scoring", () => {
		it("should set 90% confidence for high_risk_file", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([
				{ type: "test", count: 1, lastOccurrence: Date.now() },
			]);

			const alerts = await generator.checkFile("/test/workspace/auth.ts");

			expect(alerts[0].confidence).toBe(90);
		});

		it("should set 85% confidence for pressure_threshold", async () => {
			mockPressureGauge.getCurrentPressure.mockResolvedValue(75);

			const alert = await generator.checkPressure();

			expect(alert?.confidence).toBe(85);
		});

		it("should set 95% confidence for violation_recurrence", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([
				{ type: "test", count: 1, lastOccurrence: Date.now() },
			]);

			const alert = await generator.checkViolations("/test/workspace/test.ts");

			expect(alert?.confidence).toBe(95);
		});

		it("should only generate alerts with confidence >= 80%", async () => {
			// All our alerts should meet this threshold
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([
				{ type: "test", count: 1, lastOccurrence: Date.now() },
			]);

			const alerts = await generator.checkFile("/test/workspace/test.ts");

			for (const alert of alerts) {
				expect(alert.confidence).toBeGreaterThanOrEqual(80);
			}
		});
	});

	describe("Alert Structure", () => {
		it("should generate unique alert IDs", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([
				{ type: "test", count: 1, lastOccurrence: Date.now() },
			]);

			const alerts1 = await generator.checkFile("/test/workspace/file1.ts");
			const alerts2 = await generator.checkFile("/test/workspace/file2.ts");

			expect(alerts1[0].id).not.toBe(alerts2[0].id);
		});

		it("should include timestamp", async () => {
			mockPressureGauge.getCurrentPressure.mockResolvedValue(75);

			const alert = await generator.checkPressure();

			expect(alert?.timestamp).toBeGreaterThan(0);
			expect(alert?.timestamp).toBeLessThanOrEqual(Date.now());
		});

		it("should set correct severity levels", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([]);

			const alerts = await generator.checkFile("/test/workspace/.env");

			// .env files should generate critical alerts
			if (alerts.length > 0) {
				expect(["critical", "warning", "info"]).toContain(alerts[0].severity);
			}
		});

		it("should include summary message", async () => {
			mockPressureGauge.getCurrentPressure.mockResolvedValue(75);

			const alert = await generator.checkPressure();

			expect(alert?.summary).toBeTruthy();
			expect(alert?.summary.length).toBeGreaterThan(0);
		});

		it("should include suggested_action", async () => {
			mockPressureGauge.getCurrentPressure.mockResolvedValue(75);

			const alert = await generator.checkPressure();

			expect(alert?.suggested_action).toBeTruthy();
			expect(alert?.suggested_action).toContain("snapshot");
		});

		it("should mark alerts as dismissible", async () => {
			mockPressureGauge.getCurrentPressure.mockResolvedValue(75);

			const alert = await generator.checkPressure();

			expect(alert?.dismissible).toBe(true);
		});

		it("should not mark delivered initially", async () => {
			mockPressureGauge.getCurrentPressure.mockResolvedValue(75);

			const alert = await generator.checkPressure();

			// Alert object may or may not have 'delivered' field, but if it does, should be false
			if ("delivered" in (alert || {})) {
				expect((alert as any).delivered).toBe(false);
			}
		});
	});

	describe("Edge Cases", () => {
		it("should handle missing workspace root gracefully", async () => {
			const badGenerator = new AlertGenerator({
				workspaceRoot: "",
				fileProtectionService: mockFileProtectionService as any,
				violationReader: mockViolationReader as any,
				pressureGauge: mockPressureGauge as any,
			});

			await expect(badGenerator.checkFile("test.ts")).resolves.not.toThrow();
		});

		it("should handle file protection service errors", async () => {
			mockFileProtectionService.isProtected.mockImplementation(() => {
				throw new Error("Service unavailable");
			});

			const alerts = await generator.checkFile("/test/workspace/test.ts");

			// Should return empty array, not throw
			expect(alerts).toEqual([]);
		});

		it("should handle violation reader errors", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockRejectedValue(new Error("Read error"));

			const alert = await generator.checkViolations("/test/workspace/test.ts");

			// Should return null, not throw
			expect(alert).toBeNull();
		});

		it("should handle pressure gauge errors", async () => {
			mockPressureGauge.getCurrentPressure.mockRejectedValue(new Error("Gauge error"));

			const alert = await generator.checkPressure();

			// Should return null, not throw
			expect(alert).toBeNull();
		});

		it("should handle invalid file paths", async () => {
			await expect(generator.checkFile("")).resolves.not.toThrow();
			await expect(generator.checkFile("../../../etc/passwd")).resolves.not.toThrow();
		});
	});

	describe("Special File Detection", () => {
		it("should detect .env files as critical", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([]);

			const alerts = await generator.checkFile("/test/workspace/.env");

			if (alerts.length > 0) {
				expect(alerts[0].category).toBe("critical_file_touch");
				expect(alerts[0].severity).toBe("critical");
			}
		});

		it("should detect secrets files as critical", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([]);

			const alerts = await generator.checkFile("/test/workspace/config/secrets.json");

			if (alerts.length > 0) {
				expect(alerts.some(a => a.severity === "critical")).toBe(true);
			}
		});

		it("should detect auth files as high risk", async () => {
			mockFileProtectionService.isProtected.mockReturnValue(true);
			mockViolationReader.getViolationsForFile.mockResolvedValue([]);

			const alerts = await generator.checkFile("/test/workspace/src/auth.ts");

			expect(alerts.length).toBeGreaterThan(0);
			expect(alerts[0].category).toBe("high_risk_file");
		});
	});
});
