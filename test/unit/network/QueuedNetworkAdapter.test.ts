import { describe, expect, it } from "vitest";
import { QueuedNetworkAdapter } from "../../../src/network/QueuedNetworkAdapter.js";

describe("QueuedNetworkAdapter", () => {
	it("should create an instance", () => {
		const adapter = new QueuedNetworkAdapter();
		expect(adapter).toBeDefined();
		expect(typeof adapter.request).toBe("function");
		expect(typeof adapter.get).toBe("function");
		expect(typeof adapter.post).toBe("function");
		expect(typeof adapter.isOnline).toBe("function");
	});

	it("should have queue management methods", () => {
		const adapter = new QueuedNetworkAdapter();
		expect(typeof adapter.getQueueSize).toBe("function");
		expect(typeof adapter.getPendingCount).toBe("function");
		expect(typeof adapter.clearQueue).toBe("function");
	});
});
