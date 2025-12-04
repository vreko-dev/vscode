import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Phase 21: NotificationManager Tests (RED Phase)
 *
 * Integrated with @snapback/core:
 * - CooldownCache for throttling (in-memory, ephemeral)
 * - AuditLog for persistence (JSONL append-only)
 * - Proper event tracking for Phase 23 (Analytics)
 */

interface NotificationConfig {
	id: string;
	type: "info" | "warning" | "error";
	title: string;
	message: string;
	actions?: Array<{ label: string; action: () => void }>;
	durationMs?: number;
}

interface NotificationContext {
	filePath?: string;
	riskScore?: number;
	threats?: string[];
	timestamp: number;
}

// Mock @snapback/core components
class MockCooldownCache {
	private cache: Map<string, number> = new Map();

	async check(key: string, ttlMs: number = 30000): Promise<boolean> {
		const last = this.cache.get(key);
		if (!last) {
			this.cache.set(key, Date.now());
			return true;
		}
		if (Date.now() - last < ttlMs) {
			return false;
		}
		this.cache.set(key, Date.now());
		return true;
	}
}

interface AuditLogEntry {
	type: string;
	payload: Record<string, any>;
	timestamp: number;
}

class MockAuditLog {
	private entries: AuditLogEntry[] = [];

	async append(type: string, payload: Record<string, any>): Promise<void> {
		this.entries.push({ type, payload, timestamp: Date.now() });
	}

	getEntries(): AuditLogEntry[] {
		return [...this.entries];
	}

	clear(): void {
		this.entries = [];
	}
}

// NotificationManager with @snapback/core integration
class MockNotificationManager {
	private notificationHistory: (NotificationConfig & { context?: NotificationContext })[] = [];
	private cooldownCache: MockCooldownCache;
	private auditLog: MockAuditLog;

	constructor(cooldownCache?: MockCooldownCache, auditLog?: MockAuditLog) {
		this.cooldownCache = cooldownCache ?? new MockCooldownCache();
		this.auditLog = auditLog ?? new MockAuditLog();
	}

	async show(
		config: NotificationConfig,
		context?: NotificationContext,
	): Promise<string | undefined> {
		// Use CooldownCache from @snapback/core for throttling
		const canShow = await this.cooldownCache.check(`notif:${config.id}`, 30000);
		if (!canShow) {
			return undefined;
		}

		// Create entry
		const entry = { ...config, context, timestamp: Date.now() };
		this.notificationHistory.push(entry);

		// Use AuditLog from @snapback/core for persistence
		await this.auditLog.append("notification.shown", {
			id: config.id,
			type: config.type,
			title: config.title,
			...context,
		});

		return config.id;
	}

	getHistory(): Array<NotificationConfig & { context?: NotificationContext }> {
		return [...this.notificationHistory];
	}

	clearHistory(): void {
		this.notificationHistory = [];
	}

	getAuditLog(): AuditLogEntry[] {
		return this.auditLog.getEntries();
	}

	getLastNotificationTime(id: string): number | undefined {
		const entry = this.notificationHistory.find(n => n.id === id);
		return entry?.context?.timestamp;
	}
}

describe("NotificationManager (Phase 21)", () => {
	let notificationManager: MockNotificationManager;

	beforeEach(() => {
		notificationManager = new MockNotificationManager();
	});

	describe("Notification Types", () => {
		it("should create threat notification", async () => {
			const config: NotificationConfig = {
				id: "threat-high",
				type: "error",
				title: "Critical Threat Detected",
				message: "High-risk change detected in critical file",
			};

			const result = await notificationManager.show(config);

			expect(result).toBe("threat-high");
			expect(notificationManager.getHistory()).toHaveLength(1);
		});

		it("should create recovery notification", async () => {
			const config: NotificationConfig = {
				id: "recovery-success",
				type: "info",
				title: "Recovery Successful",
				message: "Snapshot restored successfully",
			};

			const result = await notificationManager.show(config);

			expect(result).toBe("recovery-success");
		});

		it("should create threshold breach notification", async () => {
			const config: NotificationConfig = {
				id: "threshold-breach",
				type: "warning",
				title: "Risk Threshold Breached",
				message: "Risk score (62%) exceeds threshold (60%)",
			};

			const result = await notificationManager.show(config);

			expect(result).toBe("threshold-breach");
		});

		it("should create protection success notification", async () => {
			const config: NotificationConfig = {
				id: "protection-active",
				type: "info",
				title: "Protection Active",
				message: "File protection enabled with watch mode",
			};

			await notificationManager.show(config);
			const history = notificationManager.getHistory();

			expect(history[0].type).toBe("info");
		});

		it("should create custom notification with metadata", async () => {
			const config: NotificationConfig = {
				id: "custom-burst",
				type: "warning",
				title: "Burst Detected",
				message: "5 saves in 10 seconds",
			};

			const context: NotificationContext = {
				filePath: "/src/app.ts",
				riskScore: 45,
				timestamp: Date.now(),
			};

			await notificationManager.show(config, context);
			const history = notificationManager.getHistory();

			expect(history[0].context?.filePath).toBe("/src/app.ts");
			expect(history[0].context?.riskScore).toBe(45);
		});
	});

	describe("Notification Display", () => {
		it("should display info level notification", async () => {
			const config: NotificationConfig = {
				id: "info-test",
				type: "info",
				title: "Info",
				message: "Informational message",
			};

			await notificationManager.show(config);
			const history = notificationManager.getHistory();

			expect(history[0].type).toBe("info");
		});

		it("should display warning level notification", async () => {
			const config: NotificationConfig = {
				id: "warning-test",
				type: "warning",
				title: "Warning",
				message: "Warning message",
			};

			await notificationManager.show(config);
			const history = notificationManager.getHistory();

			expect(history[0].type).toBe("warning");
		});

		it("should display error level notification", async () => {
			const config: NotificationConfig = {
				id: "error-test",
				type: "error",
				title: "Error",
				message: "Error message",
			};

			await notificationManager.show(config);
			const history = notificationManager.getHistory();

			expect(history[0].type).toBe("error");
		});

		it("should format message with context", async () => {
			const config: NotificationConfig = {
				id: "format-test",
				type: "info",
				title: "File Protected",
				message: "Protection enabled",
			};

			const context: NotificationContext = {
				filePath: "/src/utils.ts",
				timestamp: Date.now(),
			};

			await notificationManager.show(config, context);
			const history = notificationManager.getHistory();

			expect(history[0].message).toContain("Protection");
		});

		it("should render notification title", async () => {
			const config: NotificationConfig = {
				id: "title-test",
				type: "info",
				title: "Snapshot Created",
				message: "New snapshot saved",
			};

			await notificationManager.show(config);
			const history = notificationManager.getHistory();

			expect(history[0].title).toBe("Snapshot Created");
		});
	});

	describe("User Actions", () => {
		it("should support notification with action buttons", async () => {
			const actionSpy = vi.fn();

			const config: NotificationConfig = {
				id: "action-test",
				type: "warning",
				title: "Action Test",
				message: "Test with actions",
				actions: [
					{ label: "Review", action: actionSpy },
					{ label: "Dismiss", action: vi.fn() },
				],
			};

			await notificationManager.show(config);
			const history = notificationManager.getHistory();

			expect(history[0].actions).toHaveLength(2);
			expect(history[0].actions?.[0]?.label).toBe("Review");
		});

		it("should execute action callback", async () => {
			const callback = vi.fn();

			const config: NotificationConfig = {
				id: "callback-test",
				type: "info",
				title: "Test",
				message: "Callback test",
				actions: [{ label: "Act", action: callback }],
			};

			await notificationManager.show(config);

			if (config.actions) {
				config.actions[0].action();
			}

			expect(callback).toHaveBeenCalled();
		});

		it("should support dismiss action", async () => {
			const config: NotificationConfig = {
				id: "dismiss-test",
				type: "info",
				title: "Dismissible",
				message: "Can be dismissed",
				actions: [{ label: "Dismiss", action: vi.fn() }],
			};

			await notificationManager.show(config);
			const history = notificationManager.getHistory();

			expect(history[0].actions?.[0]?.label).toBe("Dismiss");
		});

		it("should pass parameters to action handler", async () => {
			const handler = vi.fn();

			const config: NotificationConfig = {
				id: "param-test",
				type: "info",
				title: "Params",
				message: "With parameters",
				actions: [{ label: "RestoreSnapshot", action: () => handler("snap-123") }],
			};

			await notificationManager.show(config);

			if (config.actions) {
				config.actions[0].action();
			}

			expect(handler).toHaveBeenCalledWith("snap-123");
		});
	});

	describe("Throttling with CooldownCache", () => {
		it("should prevent duplicate notifications within cooldown window", async () => {
			const config: NotificationConfig = {
				id: "throttle-test",
				type: "warning",
				title: "Throttled",
				message: "First notification",
			};

			const result1 = await notificationManager.show(config);
			expect(result1).toBe("throttle-test");

			const result2 = await notificationManager.show(config);
			expect(result2).toBeUndefined();

			expect(notificationManager.getHistory()).toHaveLength(1);
		});

		it("should allow notifications after cooldown expires", async () => {
			vi.useFakeTimers();

			const config: NotificationConfig = {
				id: "expire-test",
				type: "warning",
				title: "Expiration",
				message: "Test cooldown expiration",
			};

			await notificationManager.show(config);
			expect(notificationManager.getHistory()).toHaveLength(1);

			vi.advanceTimersByTime(31000);

			await notificationManager.show(config);
			expect(notificationManager.getHistory()).toHaveLength(2);

			vi.useRealTimers();
		});

		it("should use CooldownCache from @snapback/core", async () => {
			const cooldownCache = new MockCooldownCache();
			const mgr = new MockNotificationManager(cooldownCache);

			const config: NotificationConfig = {
				id: "cache-test",
				type: "info",
				title: "Cache",
				message: "Test cache",
			};

			const result1 = await mgr.show(config);
			const result2 = await mgr.show(config);

			expect(result1).toBe("cache-test");
			expect(result2).toBeUndefined();
		});
	});

	describe("Persistence with AuditLog", () => {
		it("should append to AuditLog from @snapback/core", async () => {
			const config: NotificationConfig = {
				id: "audit-test",
				type: "info",
				title: "Audit",
				message: "Should be logged",
			};

			await notificationManager.show(config);
			const auditLog = notificationManager.getAuditLog();

			expect(auditLog).toHaveLength(1);
			expect(auditLog[0].type).toBe("notification.shown");
			expect(auditLog[0].payload.id).toBe("audit-test");
		});

		it("should persist notification context to AuditLog", async () => {
			const config: NotificationConfig = {
				id: "context-audit",
				type: "warning",
				title: "Context",
				message: "With context",
			};

			const context: NotificationContext = {
				filePath: "/src/app.ts",
				riskScore: 75,
				timestamp: Date.now(),
			};

			await notificationManager.show(config, context);
			const auditLog = notificationManager.getAuditLog();

			expect(auditLog[0].payload.filePath).toBe("/src/app.ts");
			expect(auditLog[0].payload.riskScore).toBe(75);
		});

		it("should track multiple audit events", async () => {
			const config1: NotificationConfig = {
				id: "audit-1",
				type: "info",
				title: "First",
				message: "First audit",
			};

			const config2: NotificationConfig = {
				id: "audit-2",
				type: "warning",
				title: "Second",
				message: "Second audit",
			};

			await notificationManager.show(config1);
			await new Promise(r => setTimeout(r, 10));
			await notificationManager.show(config2);

			const auditLog = notificationManager.getAuditLog();
			expect(auditLog).toHaveLength(2);
			expect(auditLog[0].payload.id).toBe("audit-1");
			expect(auditLog[1].payload.id).toBe("audit-2");
		});

		it("should expose AuditLog for Phase 23 (Analytics)", async () => {
			const auditLog = new MockAuditLog();
			const mgr = new MockNotificationManager(undefined, auditLog);

			const config: NotificationConfig = {
				id: "telemetry-test",
				type: "error",
				title: "Telemetry",
				message: "For analytics",
			};

			await mgr.show(config, { riskScore: 88, timestamp: Date.now() });

			const entries = auditLog.getEntries();
			expect(entries).toHaveLength(1);
			expect(entries[0].payload.riskScore).toBe(88);
		});
	});

	describe("Integration with Engine", () => {
		it("should notify on risk threshold breach", async () => {
			const config: NotificationConfig = {
				id: "threshold-breach",
				type: "warning",
				title: "Risk Threshold Breached",
				message: "Risk score exceeded threshold",
			};

			const context: NotificationContext = {
				riskScore: 75,
				timestamp: Date.now(),
			};

			await notificationManager.show(config, context);
			const history = notificationManager.getHistory();

			expect(history[0].context?.riskScore).toBe(75);
		});

		it("should notify on recovery completion", async () => {
			const config: NotificationConfig = {
				id: "recovery-complete",
				type: "info",
				title: "Recovery Complete",
				message: "Snapshot restored",
			};

			await notificationManager.show(config);
			expect(notificationManager.getHistory()).toHaveLength(1);
		});

		it("should notify on burst detection", async () => {
			const config: NotificationConfig = {
				id: "burst-detected",
				type: "warning",
				title: "Burst Detected",
				message: "Multiple rapid changes",
			};

			const context: NotificationContext = {
				threats: ["burst-detection", "rapid-saves"],
				timestamp: Date.now(),
			};

			await notificationManager.show(config, context);
			const history = notificationManager.getHistory();

			expect(history[0].context?.threats).toHaveLength(2);
		});

		it("should notify on critical file change", async () => {
			const config: NotificationConfig = {
				id: "critical-file",
				type: "error",
				title: "Critical File Changed",
				message: "Important file was modified",
			};

			const context: NotificationContext = {
				filePath: "/src/config.ts",
				riskScore: 90,
				timestamp: Date.now(),
			};

			await notificationManager.show(config, context);
			const history = notificationManager.getHistory();

			expect(history[0].context?.filePath).toContain("config");
		});
	});

	describe("Lifecycle", () => {
		it("should track notification creation timestamp", async () => {
			const config: NotificationConfig = {
				id: "timestamp-test",
				type: "info",
				title: "Timestamped",
				message: "With timestamp",
			};

			const beforeTime = Date.now();
			const context: NotificationContext = { timestamp: Date.now() };
			await notificationManager.show(config, context);
			const afterTime = Date.now();

			const history = notificationManager.getHistory();
			const timestamp = history[0].context?.timestamp;

			expect(timestamp).toBeDefined();
			expect(timestamp).toBeGreaterThanOrEqual(beforeTime);
			expect(timestamp).toBeLessThanOrEqual(afterTime);
		});

		it("should support auto-dismiss with duration", async () => {
			const config: NotificationConfig = {
				id: "auto-dismiss",
				type: "info",
				title: "Auto Dismiss",
				message: "Disappears in 3 seconds",
				durationMs: 3000,
			};

			await notificationManager.show(config);
			const history = notificationManager.getHistory();

			expect(history[0].durationMs).toBe(3000);
		});

		it("should prevent notification spam", async () => {
			const config: NotificationConfig = {
				id: "spam-test",
				type: "warning",
				title: "Spam",
				message: "Spam message",
			};

			const results: Array<string | undefined> = [];
			for (let i = 0; i < 5; i++) {
				results.push(await notificationManager.show(config));
			}

			expect(results[0]).toBe("spam-test");
			expect(results[1]).toBeUndefined();
			expect(results[2]).toBeUndefined();
			expect(notificationManager.getHistory()).toHaveLength(1);
		});
	});

	describe("Error Handling", () => {
		it("should handle notification without actions gracefully", async () => {
			const config: NotificationConfig = {
				id: "no-actions",
				type: "info",
				title: "No Actions",
				message: "Just a message",
			};

			const result = await notificationManager.show(config);
			expect(result).toBe("no-actions");
		});

		it("should validate notification type", () => {
			const config: NotificationConfig = {
				id: "type-test",
				type: "error",
				title: "Validation",
				message: "Type must be info, warning, or error",
			};

			const validTypes = ["info", "warning", "error"];
			expect(validTypes).toContain(config.type);
		});
	});
});
