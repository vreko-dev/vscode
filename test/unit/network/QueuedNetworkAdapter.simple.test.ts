import { describe, expect, it } from "vitest";
import { QueuedNetworkAdapter } from "@vscode/network/QueuedNetworkAdapter";

describe("QueuedNetworkAdapter Simple Test", () => {
	it("should create an instance", () => {
		const adapter = new QueuedNetworkAdapter();
		expect(adapter).toBeInstanceOf(QueuedNetworkAdapter);
		expect(adapter.getQueueSize()).toBe(0);
	});
});
