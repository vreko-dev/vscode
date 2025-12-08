import { beforeEach, describe, expect, it } from "vitest";
import { QueuedNetworkAdapter } from "@vscode/network/QueuedNetworkAdapter";

describe("QueuedNetworkAdapter Functional Test", () => {
	let adapter: QueuedNetworkAdapter;

	beforeEach(() => {
		adapter = new QueuedNetworkAdapter();
	});

	it("should have correct initial state", () => {
		expect(adapter.getQueueSize()).toBe(0);
		expect(adapter.getPendingCount()).toBe(0);
	});

	it("should be able to clear empty queue", () => {
		adapter.clearQueue();
		expect(adapter.getQueueSize()).toBe(0);
	});
});
