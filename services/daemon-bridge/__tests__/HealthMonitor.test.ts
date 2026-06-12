/**
 * HealthMonitor Tests
 *
 * Tests for the simplified HealthMonitor that only tracks connection liveness.
 * Health STATE classification is now handled by DaemonHealthConsumer.
 *
 * @module daemon-bridge/__tests__/HealthMonitor
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HealthMonitor } from "../HealthMonitor";

vi.mock("../../../utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("HealthMonitor", () => {
	let monitor: HealthMonitor;

	beforeEach(() => {
		monitor = new HealthMonitor();
		vi.clearAllMocks();
		vi.useFakeTimers();
	});

	afterEach(() => {
		monitor.dispose();
		vi.useRealTimers();
	});

	describe("initialization", () => {
		it("should initialize with default config", () => {
			const m = new HealthMonitor();
			expect(m).toBeDefined();
			m.dispose();
		});

		it("should initialize with custom config", () => {
			const m = new HealthMonitor({ checkIntervalMs: 10000 });
			expect(m).toBeDefined();
			m.dispose();
		});

		it("should be healthy by default", () => {
			expect(monitor.isHealthy()).toBe(true);
		});
	});

	describe("daemon version", () => {
		it("should return undefined when no version set", () => {
			expect(monitor.getDaemonVersion()).toBeUndefined();
		});

		it("should set and get daemon version", () => {
			monitor.setDaemonVersion("1.2.3");
			expect(monitor.getDaemonVersion()).toBe("1.2.3");
		});

		it("should clear version when set to undefined", () => {
			monitor.setDaemonVersion("1.2.3");
			monitor.setDaemonVersion(undefined);
			expect(monitor.getDaemonVersion()).toBeUndefined();
		});
	});

	describe("isHealthy", () => {
		it("should return true when no checks performed", () => {
			expect(monitor.isHealthy()).toBe(true);
		});

		it("should return true after successful health check", () => {
			monitor.recordSuccess();
			expect(monitor.isHealthy()).toBe(true);
		});

		it("should return false after failed health check", () => {
			monitor.recordFailure();
			expect(monitor.isHealthy()).toBe(false);
		});
	});

	describe("getStatus", () => {
		it("should return complete status object", () => {
			const status = monitor.getStatus();
			expect(status).toHaveProperty("healthy");
			expect(status).toHaveProperty("lastCheckTime");
			expect(status).toHaveProperty("consecutiveFailures");
		});

		it("should reflect current health state", () => {
			monitor.recordSuccess();
			const status = monitor.getStatus();
			expect(status.healthy).toBe(true);
			expect(status.consecutiveFailures).toBe(0);
		});

		it("should reflect failure state", () => {
			monitor.recordFailure();
			const status = monitor.getStatus();
			expect(status.healthy).toBe(false);
			expect(status.consecutiveFailures).toBe(1);
		});
	});

	describe("recordSuccess", () => {
		it("should update last check time", () => {
			monitor.recordSuccess();
			expect(monitor.getLastHealthCheckTime()).toBeInstanceOf(Date);
		});

		it("should set healthy to true after failure", () => {
			monitor.recordFailure();
			monitor.recordSuccess();
			expect(monitor.isHealthy()).toBe(true);
		});

		it("should reset consecutive failures", () => {
			monitor.recordFailure();
			monitor.recordFailure();
			monitor.recordSuccess();
			expect(monitor.getStatus().consecutiveFailures).toBe(0);
		});

		it("should set daemon version when provided", () => {
			monitor.recordSuccess("2.0.0");
			expect(monitor.getDaemonVersion()).toBe("2.0.0");
		});
	});

	describe("recordFailure", () => {
		it("should update last check time", () => {
			monitor.recordFailure();
			expect(monitor.getLastHealthCheckTime()).toBeInstanceOf(Date);
		});

		it("should set healthy to false", () => {
			monitor.recordFailure();
			expect(monitor.isHealthy()).toBe(false);
		});

		it("should increment consecutive failures", () => {
			monitor.recordFailure();
			monitor.recordFailure();
			expect(monitor.getStatus().consecutiveFailures).toBe(2);
		});
	});

	describe("start", () => {
		it("should start periodic health checks", () => {
			const callback = vi.fn().mockResolvedValue({ version: "1.0.0" });
			monitor.start(callback);
			expect(monitor["healthCheckTimer"]).not.toBeNull();
		});

		it("should call callback periodically", async () => {
			const callback = vi.fn().mockResolvedValue({ version: "1.0.0" });
			monitor.start(callback);
			await vi.advanceTimersByTimeAsync(30000);
			expect(callback).toHaveBeenCalled();
		});

		it("should record success on successful callback", async () => {
			const callback = vi.fn().mockResolvedValue({ version: "1.0.0" });
			monitor.start(callback);
			await vi.advanceTimersByTimeAsync(30000);
			expect(monitor.isHealthy()).toBe(true);
			expect(monitor.getDaemonVersion()).toBe("1.0.0");
		});

		it("should record failure on callback error", async () => {
			const callback = vi.fn().mockRejectedValue(new Error("fail"));
			monitor.start(callback);
			await vi.advanceTimersByTimeAsync(30000);
			expect(monitor.isHealthy()).toBe(false);
		});
	});

	describe("stop", () => {
		it("should stop health checks", () => {
			monitor.start(vi.fn().mockResolvedValue({}));
			monitor.stop();
			expect(monitor["healthCheckTimer"]).toBeNull();
		});

		it("should be safe to call when not started", () => {
			expect(() => monitor.stop()).not.toThrow();
		});
	});

	describe("reset", () => {
		it("should reset all state", () => {
			monitor.recordFailure();
			monitor.recordFailure();
			monitor.reset();
			expect(monitor.getLastHealthCheckTime()).toBeNull();
			expect(monitor.isHealthy()).toBe(true);
			expect(monitor.getStatus().consecutiveFailures).toBe(0);
		});
	});

	describe("dispose", () => {
		it("should stop health checks and reset state", () => {
			monitor.start(vi.fn().mockResolvedValue({}));
			monitor.recordSuccess();
			monitor.dispose();
			expect(monitor["healthCheckTimer"]).toBeNull();
			expect(monitor.getLastHealthCheckTime()).toBeNull();
		});

		it("should be safe to call multiple times", () => {
			expect(() => {
				monitor.dispose();
				monitor.dispose();
			}).not.toThrow();
		});
	});
});
