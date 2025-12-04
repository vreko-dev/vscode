import { describe, it, expect, beforeEach, vi } from "vitest";

/**
 * Mock PostHog SDK for testing
 */
class MockPostHog {
	private events: Array<{ event: string; properties: Record<string, any> }> = [];
	private identifications: Array<{ id: string; properties: Record<string, any> }> =
		[];
	private optedOut = false;
	private featureFlags: Record<string, boolean | Record<string, any>> = {};

	capture(event: string, properties?: Record<string, any>): void {
		this.events.push({ event, properties: properties ?? {} });
	}

	identify(distinctId: string, properties?: Record<string, any>): void {
		this.identifications.push({ id: distinctId, properties: properties ?? {} });
	}

	optOut(): void {
		this.optedOut = true;
	}

	optIn(): void {
		this.optedOut = false;
	}

	hasOptedOutCapturing(): boolean {
		return this.optedOut;
	}

	isFeatureEnabled(flag: string): boolean {
		const value = this.featureFlags[flag];
		return typeof value === "boolean" ? value : false;
	}

	getFeatureFlagPayload(flag: string): Record<string, any> | null {
		const value = this.featureFlags[flag];
		return typeof value === "object" ? value : null;
	}

	setFeatureFlag(flag: string, value: boolean | Record<string, any>): void {
		this.featureFlags[flag] = value;
	}

	getEvents() {
		return [...this.events];
	}

	getIdentifications() {
		return [...this.identifications];
	}

	reset() {
		this.events = [];
		this.identifications = [];
	}
}

/**
 * TelemetryCollector interfaces
 */
export interface SnapshotCreatedEvent {
	fileCount: number;
	riskScore: number;
	trigger: "auto-decision" | "manual" | "ai-detected";
	timestamp: number;
	sessionId?: string;
}

export interface ThreatDetectedEvent {
	filePath: string;
	riskScore: number;
	threats: string[];
	action: "snapshot" | "notify" | "restore" | "none";
	confidence?: number;
}

export interface ProtectionLevelChangedEvent {
	previousLevel: "watch" | "warn" | "block";
	newLevel: "watch" | "warn" | "block";
	reason: string;
	timestamp: number;
}

export interface NotificationShownEvent {
	type: "threat" | "recovery" | "threshold";
	userAction?: "click" | "dismiss";
}

/**
 * TelemetryCollector - Core analytics integration with PostHog
 */
export class TelemetryCollector {
	private postHog: MockPostHog;
	private optOutOverride: boolean | null = null;
	private eventQueue: Array<{ event: string; properties: Record<string, any> }> =
		[];

	constructor(postHog?: MockPostHog) {
		this.postHog = postHog ?? new MockPostHog();
	}

	/**
	 * Capture generic event
	 */
	async capture(
		eventName: string,
		properties?: Record<string, any>,
	): Promise<void> {
		// Respect opt-out setting
		if (this.isOptedOut()) {
			return;
		}

		// Filter properties for privacy
		const filtered = this.scrubProperties(properties ?? {});

		// Queue event for batching
		this.eventQueue.push({
			event: eventName,
			properties: filtered,
		});

		// Send immediately (could be batched in real implementation)
		this.postHog.capture(eventName, filtered);
	}

	/**
	 * Identify user (workspace)
	 */
	async identify(
		workspaceId: string,
		properties?: Record<string, any>,
	): Promise<void> {
		if (this.isOptedOut()) {
			return;
		}

		const filtered = this.scrubProperties(properties ?? {});
		this.postHog.identify(workspaceId, filtered);
	}

	/**
	 * Capture snapshot creation event
	 */
	async captureSnapshotCreated(event: SnapshotCreatedEvent): Promise<void> {
		await this.capture("snapshot.created", {
			fileCount: event.fileCount,
			riskScore: event.riskScore,
			trigger: event.trigger,
			timestamp: event.timestamp,
			sessionId: event.sessionId,
		});
	}

	/**
	 * Capture threat detection event
	 */
	async captureThreatDetected(event: ThreatDetectedEvent): Promise<void> {
		await this.capture("threat.detected", {
			filePath: this.sanitizePath(event.filePath),
			riskScore: event.riskScore,
			threats: event.threats,
			action: event.action,
			confidence: event.confidence,
		});
	}

	/**
	 * Capture protection level change
	 */
	async captureProtectionLevelChanged(
		event: ProtectionLevelChangedEvent,
	): Promise<void> {
		await this.capture("protection.level_changed", {
			previousLevel: event.previousLevel,
			newLevel: event.newLevel,
			reason: event.reason,
			timestamp: event.timestamp,
		});
	}

	/**
	 * Capture notification shown
	 */
	async captureNotificationShown(event: NotificationShownEvent): Promise<void> {
		await this.capture("notification.shown", {
			type: event.type,
			userAction: event.userAction,
		});
	}

	/**
	 * Opt user out of tracking
	 */
	async optOut(): Promise<void> {
		this.optOutOverride = true;
		this.postHog.optOut();
	}

	/**
	 * Opt user in (resume tracking)
	 */
	async optIn(): Promise<void> {
		this.optOutOverride = false;
		this.postHog.optIn();
	}

	/**
	 * Check if user has opted out
	 */
	isOptedOut(): boolean {
		if (this.optOutOverride !== null) {
			return this.optOutOverride;
		}
		return this.postHog.hasOptedOutCapturing();
	}

	/**
	 * Check if feature flag is enabled
	 */
	isFeatureEnabled(flagName: string): boolean {
		return this.postHog.isFeatureEnabled(flagName);
	}

	/**
	 * Get feature flag payload
	 */
	getFeatureFlagPayload(flagName: string): Record<string, any> | null {
		return this.postHog.getFeatureFlagPayload(flagName);
	}

	/**
	 * Get event queue for testing
	 */
	getEventQueue() {
		return [...this.eventQueue];
	}

	/**
	 * Clear event queue
	 */
	clearEventQueue() {
		this.eventQueue = [];
	}

	/**
	 * Privacy filter: Scrub sensitive properties
	 */
	private scrubProperties(props: Record<string, any>): Record<string, any> {
		const scrubbed = { ...props };

		// Remove known PII fields
		delete scrubbed.email;
		delete scrubbed.apiKey;
		delete scrubbed.password;
		delete scrubbed.token;
		delete scrubbed.credential;

		// Sanitize file paths
		if (scrubbed.filePath && typeof scrubbed.filePath === "string") {
			scrubbed.filePath = this.sanitizePath(scrubbed.filePath);
		}

		// Remove any properties that look like git commits
		for (const key in scrubbed) {
			if (typeof scrubbed[key] === "string") {
				// Redact very long strings (likely file contents)
				if (scrubbed[key].length > 500) {
					scrubbed[key] = `[redacted-${scrubbed[key].length}-chars]`;
				}
			}
		}

		return scrubbed;
	}

	/**
	 * Sanitize file paths (remove user-specific parts)
	 */
	private sanitizePath(filePath: string): string {
		// /Users/john/project/src/auth.ts → ./src/auth.ts
		// /home/alice/workspace/app/config.json → ./app/config.json
		const match = filePath.match(/\/(project|workspace|app)\/(.+)$/);
		if (match) {
			return "." + filePath.substring(filePath.indexOf(match[1]) + match[1].length);
		}
		return filePath;
	}
}

/**
 * Tests
 */
describe("TelemetryCollector", () => {
	let collector: TelemetryCollector;
	let mockPostHog: MockPostHog;

	beforeEach(() => {
		mockPostHog = new MockPostHog();
		collector = new TelemetryCollector(mockPostHog);
	});

	describe("Event Capture", () => {
		it("should capture generic event", async () => {
			await collector.capture("test.event", { property: "value" });

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0].event).toBe("test.event");
			expect(events[0].properties.property).toBe("value");
		});

		it("should queue events", async () => {
			await collector.capture("event1", {});
			await collector.capture("event2", {});

			const queue = collector.getEventQueue();
			expect(queue).toHaveLength(2);
			expect(queue[0].event).toBe("event1");
			expect(queue[1].event).toBe("event2");
		});

		it("should respect opt-out for generic events", async () => {
			await collector.optOut();
			await collector.capture("test.event", { property: "value" });

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(0);
		});

		it("should allow re-opt-in after opt-out", async () => {
			await collector.optOut();
			await collector.capture("event1", {});

			await collector.optIn();
			await collector.capture("event2", {});

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0].event).toBe("event2");
		});
	});

	describe("Snapshot Events", () => {
		it("should capture snapshot created event", async () => {
			await collector.captureSnapshotCreated({
				fileCount: 3,
				riskScore: 75,
				trigger: "auto-decision",
				timestamp: Date.now(),
				sessionId: "sess-123",
			});

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0].event).toBe("snapshot.created");
			expect(events[0].properties.fileCount).toBe(3);
			expect(events[0].properties.riskScore).toBe(75);
		});

		it("should include session ID if provided", async () => {
			const sessionId = "sess-abc-123";
			await collector.captureSnapshotCreated({
				fileCount: 5,
				riskScore: 85,
				trigger: "ai-detected",
				timestamp: Date.now(),
				sessionId,
			});

			const events = mockPostHog.getEvents();
			expect(events[0].properties.sessionId).toBe(sessionId);
		});
	});

	describe("Threat Detection Events", () => {
		it("should capture threat detected event", async () => {
			await collector.captureThreatDetected({
				filePath: "/home/user/project/src/auth.ts",
				riskScore: 85,
				threats: ["ai-detected", "critical-file"],
				action: "notify",
				confidence: 0.92,
			});

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0].event).toBe("threat.detected");
			expect(events[0].properties.riskScore).toBe(85);
			expect(events[0].properties.threats).toEqual(["ai-detected", "critical-file"]);
		});

		it("should sanitize file paths in threat events", async () => {
			await collector.captureThreatDetected({
				filePath: "/Users/johndoe/project/src/config.json",
				riskScore: 65,
				threats: ["critical-file"],
				action: "snapshot",
			});

			const events = mockPostHog.getEvents();
			expect(events[0].properties.filePath).toBe("./src/config.json");
		});

		it("should respect opt-out for threat events", async () => {
			await collector.optOut();
			await collector.captureThreatDetected({
				filePath: "/home/user/project/src/auth.ts",
				riskScore: 85,
				threats: ["ai-detected"],
				action: "notify",
			});

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(0);
		});
	});

	describe("Protection Level Change Events", () => {
		it("should capture protection level changed", async () => {
			const now = Date.now();
			await collector.captureProtectionLevelChanged({
				previousLevel: "watch",
				newLevel: "warn",
				reason: "user-settings",
				timestamp: now,
			});

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0].event).toBe("protection.level_changed");
			expect(events[0].properties.previousLevel).toBe("watch");
			expect(events[0].properties.newLevel).toBe("warn");
		});
	});

	describe("Notification Events", () => {
		it("should capture notification shown", async () => {
			await collector.captureNotificationShown({
				type: "threat",
				userAction: "click",
			});

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(1);
			expect(events[0].event).toBe("notification.shown");
			expect(events[0].properties.type).toBe("threat");
			expect(events[0].properties.userAction).toBe("click");
		});

		it("should allow optional user action", async () => {
			await collector.captureNotificationShown({
				type: "recovery",
			});

			const events = mockPostHog.getEvents();
			expect(events[0].properties.userAction).toBeUndefined();
		});
	});

	describe("User Identification", () => {
		it("should identify workspace", async () => {
			await collector.identify("workspace-123", {
				workspaceName: "my-project",
				extensionVersion: "1.2.9",
			});

			const identifications = mockPostHog.getIdentifications();
			expect(identifications).toHaveLength(1);
			expect(identifications[0].id).toBe("workspace-123");
			expect(identifications[0].properties.workspaceName).toBe("my-project");
		});

		it("should respect opt-out for identify", async () => {
			await collector.optOut();
			await collector.identify("workspace-123", { workspaceName: "test" });

			const identifications = mockPostHog.getIdentifications();
			expect(identifications).toHaveLength(0);
		});

		it("should scrub properties during identify", async () => {
			await collector.identify("workspace-123", {
				workspaceName: "my-project",
				apiKey: "secret-key-123",
				email: "user@example.com",
			});

			const identifications = mockPostHog.getIdentifications();
			expect(identifications[0].properties.apiKey).toBeUndefined();
			expect(identifications[0].properties.email).toBeUndefined();
			expect(identifications[0].properties.workspaceName).toBe("my-project");
		});
	});

	describe("Privacy Filtering", () => {
		it("should remove email from properties", async () => {
			await collector.capture("test", {
				email: "user@example.com",
				value: "keep",
			});

			const events = mockPostHog.getEvents();
			expect(events[0].properties.email).toBeUndefined();
			expect(events[0].properties.value).toBe("keep");
		});

		it("should remove API keys from properties", async () => {
			await collector.capture("test", {
				apiKey: "secret-123",
				password: "pass123",
				token: "token456",
				value: "keep",
			});

			const events = mockPostHog.getEvents();
			expect(events[0].properties.apiKey).toBeUndefined();
			expect(events[0].properties.password).toBeUndefined();
			expect(events[0].properties.token).toBeUndefined();
			expect(events[0].properties.value).toBe("keep");
		});

		it("should redact long strings (potential file contents)", async () => {
			const longString = "x".repeat(600);
			await collector.capture("test", { content: longString });

			const events = mockPostHog.getEvents();
			expect(events[0].properties.content).toContain("[redacted");
			expect(events[0].properties.content).toContain("600");
		});

		it("should sanitize file paths", async () => {
			await collector.capture("test", {
				filePath: "/Users/john/project/src/auth.ts",
			});

			const events = mockPostHog.getEvents();
			expect(events[0].properties.filePath).toBe("./src/auth.ts");
		});

		it("should sanitize paths with home directory", async () => {
			await collector.capture("test", {
				filePath: "/home/alice/workspace/app/config.json",
			});

			const events = mockPostHog.getEvents();
			expect(events[0].properties.filePath).toBe("./app/config.json");
		});
	});

	describe("Feature Flags", () => {
		it("should check if feature flag is enabled", async () => {
			mockPostHog.setFeatureFlag("new_ui", true);

			expect(collector.isFeatureEnabled("new_ui")).toBe(true);
			expect(collector.isFeatureEnabled("nonexistent")).toBe(false);
		});

		it("should get feature flag payload", async () => {
			mockPostHog.setFeatureFlag("theme_config", {
				colors: ["dark", "light"],
				default: "dark",
			});

			const payload = collector.getFeatureFlagPayload("theme_config");
			expect(payload).toEqual({ colors: ["dark", "light"], default: "dark" });
		});

		it("should return null for missing flag payload", async () => {
			expect(collector.getFeatureFlagPayload("nonexistent")).toBeNull();
		});
	});

	describe("Opt-in/Opt-out", () => {
		it("should start opted in by default", () => {
			expect(collector.isOptedOut()).toBe(false);
		});

		it("should reflect opt-out status", async () => {
			await collector.optOut();
			expect(collector.isOptedOut()).toBe(true);

			await collector.optIn();
			expect(collector.isOptedOut()).toBe(false);
		});

		it("should prevent all events when opted out", async () => {
			await collector.optOut();

			await collector.capture("event1", {});
			await collector.captureSnapshotCreated({
				fileCount: 1,
				riskScore: 50,
				trigger: "manual",
				timestamp: Date.now(),
			});
			await collector.captureThreatDetected({
				filePath: "/test/file.ts",
				riskScore: 75,
				threats: [],
				action: "none",
			});

			const events = mockPostHog.getEvents();
			expect(events).toHaveLength(0);
		});
	});

	describe("Event Queue Management", () => {
		it("should maintain event queue", async () => {
			await collector.capture("event1", { data: "1" });
			await collector.capture("event2", { data: "2" });

			const queue = collector.getEventQueue();
			expect(queue).toHaveLength(2);
			expect(queue[0].event).toBe("event1");
			expect(queue[1].event).toBe("event2");
		});

		it("should clear event queue", async () => {
			await collector.capture("event1", {});
			await collector.capture("event2", {});

			collector.clearEventQueue();
			expect(collector.getEventQueue()).toHaveLength(0);
		});

		it("should queue same event multiple times", async () => {
			await collector.capture("snapshot.created", { v: 1 });
			await collector.capture("snapshot.created", { v: 2 });
			await collector.capture("snapshot.created", { v: 3 });

			const queue = collector.getEventQueue();
			expect(queue).toHaveLength(3);
			expect(queue.every((e) => e.event === "snapshot.created")).toBe(true);
		});
	});
});
