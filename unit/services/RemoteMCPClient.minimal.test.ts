import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	RemoteMCPClient,
} from "../../../src/services/RemoteMCPClient";

const mockGet = vi.fn();
const mockPost = vi.fn();

vi.mock("../../../src/network/QueuedNetworkAdapter", () => ({
	QueuedNetworkAdapter: vi.fn().mockImplementation(() => ({
		get: mockGet,
		post: mockPost,
	})),
}));

vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

describe("RemoteMCPClient minimal", () => {
	let client: RemoteMCPClient;

	beforeEach(() => {
		vi.clearAllMocks();
		mockGet.mockResolvedValue({
			ok: true,
			status: 200,
			statusText: "OK",
			data: { version: "1.0.0" },
		});
	});

	afterEach(() => {
		if (client) {
			client.dispose();
		}
	});

	it("should create client", () => {
		client = new RemoteMCPClient({
			serverUrl: "https://test.com",
		});
		expect(client).toBeDefined();
	});

	it("should connect", async () => {
		client = new RemoteMCPClient({
			serverUrl: "https://test.com",
		});
		
		console.log("About to connect...");
		await client.connect();
		console.log("Connected!");
		
		expect(client.isServerReady()).toBe(true);
	});
});
