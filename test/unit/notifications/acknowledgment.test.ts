/**
 * @fileoverview Acknowledgment Tests
 *
 * Tests for NotificationAcknowledgment to ensure persistent "don't show again" state works.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { NotificationAcknowledgment } from "../../../src/notifications/acknowledgment";

describe("NotificationAcknowledgment", () => {
	let mockGlobalState: any;
	let ack: NotificationAcknowledgment;

	beforeEach(() => {
		const storage = new Map<string, any>();
		mockGlobalState = {
			get: vi.fn(
				(key: string, defaultValue?: any) => storage.get(key) ?? defaultValue,
			),
			update: vi.fn((key: string, value?: any) => {
				if (value === undefined) {
					storage.delete(key);
				} else {
					storage.set(key, value);
				}
				return Promise.resolve();
			}),
		};
		ack = new NotificationAcknowledgment(mockGlobalState);
	});

	it("should return false for unacknowledged notification", () => {
		expect(ack.isAcknowledged("test-notification")).toBe(false);
	});

	it("should return true after acknowledgment", async () => {
		await ack.acknowledge("test-notification");
		expect(ack.isAcknowledged("test-notification")).toBe(true);
	});

	it("should support scoped acknowledgments", async () => {
		await ack.acknowledge("protection-level", "/path/file.ts:warn");

		// Same notification, same scope = acknowledged
		expect(ack.isAcknowledged("protection-level", "/path/file.ts:warn")).toBe(
			true,
		);

		// Same notification, different scope = not acknowledged
		expect(ack.isAcknowledged("protection-level", "/path/file.ts:block")).toBe(
			false,
		);
		expect(ack.isAcknowledged("protection-level", "/path/other.ts:warn")).toBe(
			false,
		);
	});

	it("should reset specific acknowledgment", async () => {
		await ack.acknowledge("test-notification");
		expect(ack.isAcknowledged("test-notification")).toBe(true);

		await ack.reset("test-notification");
		expect(ack.isAcknowledged("test-notification")).toBe(false);
	});

	it("should persist across instances", async () => {
		await ack.acknowledge("test-notification");

		// Create new instance with same globalState
		const ack2 = new NotificationAcknowledgment(mockGlobalState);
		expect(ack2.isAcknowledged("test-notification")).toBe(true);
	});

	it("should reset all acknowledgments", async () => {
		await ack.acknowledge("notif-1");
		await ack.acknowledge("notif-2");
		await ack.acknowledge("notif-3", "scope-1");

		await ack.resetAll();

		expect(ack.isAcknowledged("notif-1")).toBe(false);
		expect(ack.isAcknowledged("notif-2")).toBe(false);
		expect(ack.isAcknowledged("notif-3", "scope-1")).toBe(false);
	});

	it("should get list of acknowledged notifications", async () => {
		await ack.acknowledge("notif-1");
		await ack.acknowledge("notif-2", "scope-1");

		const acknowledged = ack.getAcknowledgedNotifications();
		expect(acknowledged.length).toBeGreaterThanOrEqual(2);
		expect(acknowledged.some((k) => k.includes("notif-1"))).toBe(true);
		expect(acknowledged.some((k) => k.includes("notif-2"))).toBe(true);
	});
});
