import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGet = vi.fn().mockResolvedValue({
	ok: true,
	status: 200,
	statusText: "OK",
	data: { version: "1.0.0" },
});
const mockPost = vi.fn();

// Mock FIRST before any imports
vi.mock("../../../src/network/QueuedNetworkAdapter", () => {
	console.log("Mocking QueuedNetworkAdapter");
	return {
		QueuedNetworkAdapter: vi.fn().mockImplementation(() => {
			console.log("Creating mock QueuedNetworkAdapter instance");
			return {
				get: mockGet,
				post: mockPost,
			};
		}),
	};
});

vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import AFTER mock
import { RemoteMCPClient } from "../../../src/services/RemoteMCPClient";
import { QueuedNetworkAdapter } from "../../../src/network/QueuedNetworkAdapter";

describe("RemoteMCPClient debug", () => {
	it("should check mock", async () => {
		console.log("QueuedNetworkAdapter:", QueuedNetworkAdapter);
		const adapter = new QueuedNetworkAdapter();
		console.log("adapter:", adapter);
		console.log("adapter.get:", adapter.get);
		
		const result = await adapter.get("http://test.com/health");
		console.log("result:", result);
		
		expect(result.ok).toBe(true);
	});
	
	it("should connect", async () => {
		const client = new RemoteMCPClient({
			serverUrl: "https://test.com",
		});
		
		console.log("Client created, connecting...");
		
		// Use a timeout to see if connect resolves
		const connectPromise = client.connect();
		const timeoutPromise = new Promise((_, reject) => 
			setTimeout(() => reject(new Error("Connect timeout")), 2000)
		);
		
		try {
			await Promise.race([connectPromise, timeoutPromise]);
			console.log("Connected!");
			expect(client.isServerReady()).toBe(true);
		} catch (e) {
			console.log("Error:", e);
			throw e;
		}
	});
});
