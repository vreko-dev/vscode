import { describe, expect, it } from "vitest";
import { QueuedNetworkAdapter } from "../../../src/network/QueuedNetworkAdapter.js";

describe("QueuedNetworkAdapter Simple Test", () => {
	it("should create an instance", () => {
		const adapter = new QueuedNetworkAdapter();
		expect(adapter).toBeInstanceOf(QueuedNetworkAdapter);
		expect(adapter.getQueueSize()).toBe(0);
	});
});
