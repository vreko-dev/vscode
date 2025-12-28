/**
 * DaemonBridge Tests
 *
 * Unit tests for the VS Code extension daemon IPC client.
 * Tests the public API and core functionality using controlled mocks.
 *
 * @see https://vitest.dev/guide/mocking
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock modules before imports
vi.mock("node:net", () => {
	const EventEmitter = require("node:events");

	class MockSocket extends EventEmitter {
		writable = false;
		write = vi.fn().mockReturnValue(true);
		destroy = vi.fn();
	}

	const mockSocket = new MockSocket();

	return {
		createConnection: vi.fn((path: string) => {
			// Store the socket for test access
			(global as any).__mockSocket = mockSocket;
			return mockSocket;
		}),
		__mockSocket: mockSocket,
	};
});

vi.mock("node:fs", () => ({
	existsSync: vi.fn().mockReturnValue(false),
	readFileSync: vi.fn().mockReturnValue("12345"),
}));

vi.mock("node:os", () => ({
	homedir: vi.fn().mockReturnValue("/home/testuser"),
	platform: vi.fn().mockReturnValue("darwin"),
}));

// Mock vscode
vi.mock("vscode", () => ({
	Disposable: class {
		constructor(private callback: () => void) {}
		dispose() {
			this.callback?.();
		}
	},
	EventEmitter: class<T> {
		private handlers: Array<(e: T) => void> = [];
		event = (handler: (e: T) => void) => {
			this.handlers.push(handler);
			return { dispose: () => {} };
		};
		fire(data: T) {
			this.handlers.forEach((h) => h(data));
		}
		dispose() {
			this.handlers = [];
		}
	},
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/workspace/test" } }],
		onDidChangeWorkspaceFolders: vi.fn().mockReturnValue({ dispose: vi.fn() }),
	},
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

import { existsSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";
import {
	DaemonBridge,
	getDaemonBridge,
	disposeDaemonBridge,
} from "../../../src/services/DaemonBridge";

describe("services/DaemonBridge", () => {
	let bridge: DaemonBridge;

	beforeEach(() => {
		vi.clearAllMocks();
		bridge = new DaemonBridge();
	});

	afterEach(() => {
		bridge.dispose();
		vi.restoreAllMocks();
	});

	// =========================================================================
	// SINGLETON TESTS
	// =========================================================================

	describe("singleton pattern", () => {
		it("should export getDaemonBridge function", () => {
			expect(getDaemonBridge).toBeDefined();
			expect(typeof getDaemonBridge).toBe("function");
		});

		it("should return same instance on multiple calls", () => {
			const instance1 = getDaemonBridge();
			const instance2 = getDaemonBridge();
			expect(instance1).toBe(instance2);
			disposeDaemonBridge();
		});

		it("should export disposeDaemonBridge function", () => {
			expect(disposeDaemonBridge).toBeDefined();
			expect(typeof disposeDaemonBridge).toBe("function");
		});

		it("should create new instance after dispose", () => {
			const instance1 = getDaemonBridge();
			disposeDaemonBridge();
			const instance2 = getDaemonBridge();
			expect(instance1).not.toBe(instance2);
			disposeDaemonBridge();
		});
	});

	// =========================================================================
	// DAEMON DETECTION TESTS
	// =========================================================================

	describe("isDaemonRunning()", () => {
		it("should return false when PID file does not exist", () => {
			vi.mocked(existsSync).mockReturnValue(false);
			const result = bridge.isDaemonRunning();
			expect(result).toBe(false);
		});

		it("should return false when PID is invalid (NaN)", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue("not-a-number");
			const result = bridge.isDaemonRunning();
			expect(result).toBe(false);
		});

		it("should check if process exists when PID file is valid", () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue("12345");

			// Mock process.kill to throw (process doesn't exist) using spyOn
			const killSpy = vi.spyOn(process, "kill").mockImplementation(() => {
				throw new Error("ESRCH");
			});

			const result = bridge.isDaemonRunning();
			expect(result).toBe(false);

			killSpy.mockRestore();
		});

		it("should return true when process exists", async () => {
			// Reset modules to get fresh imports with updated mock state
			vi.resetModules();

			// Set up mocks BEFORE importing the module
			vi.doMock("node:fs", () => ({
				existsSync: vi.fn().mockReturnValue(true),
				readFileSync: vi.fn().mockReturnValue("12345"),
			}));

			vi.doMock("node:os", () => ({
				homedir: vi.fn().mockReturnValue("/home/testuser"),
				platform: vi.fn().mockReturnValue("darwin"),
			}));

			// Mock process.kill to succeed (process exists)
			const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true as never);

			// Dynamically import to get fresh module with new mocks
			const { DaemonBridge: FreshDaemonBridge } = await import(
				"../../../src/services/DaemonBridge"
			);
			const freshBridge = new FreshDaemonBridge();

			const result = freshBridge.isDaemonRunning();
			expect(result).toBe(true);

			freshBridge.dispose();
			killSpy.mockRestore();
		});
	});

	// =========================================================================
	// CONNECTION TESTS
	// =========================================================================

	describe("isConnected()", () => {
		it("should return false when not connected", () => {
			expect(bridge.isConnected()).toBe(false);
		});
	});

	describe("connect()", () => {
		it("should return false if daemon is not running", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			const result = await bridge.connect();
			expect(result).toBe(false);
			expect(createConnection).not.toHaveBeenCalled();
		});

		it("should attempt connection when daemon is running", async () => {
			// Reset modules to get fresh imports with updated mock state
			vi.resetModules();

			// Track if createConnection was called
			let connectionAttempted = false;
			const EventEmitter = require("node:events");

			class MockSocket extends EventEmitter {
				writable = false;
				write = vi.fn().mockReturnValue(true);
				destroy = vi.fn();
			}

			// Set up mocks BEFORE importing the module
			vi.doMock("node:fs", () => ({
				existsSync: vi.fn().mockReturnValue(true),
				readFileSync: vi.fn().mockReturnValue("12345"),
			}));

			vi.doMock("node:os", () => ({
				homedir: vi.fn().mockReturnValue("/home/testuser"),
				platform: vi.fn().mockReturnValue("darwin"),
			}));

			vi.doMock("node:net", () => ({
				createConnection: vi.fn(() => {
					connectionAttempted = true;
					return new MockSocket();
				}),
			}));

			// Mock process.kill to succeed
			const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true as never);

			// Dynamically import to get fresh module with new mocks
			const { DaemonBridge: FreshDaemonBridge } = await import(
				"../../../src/services/DaemonBridge"
			);
			const freshBridge = new FreshDaemonBridge();

			// Start connection (will timeout/fail since mock doesn't emit connect)
			const connectPromise = freshBridge.connect();

			// Connection will fail without emitting 'connect', but createConnection should be called
			await Promise.race([
				connectPromise,
				new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 100)),
			]);

			// Verify createConnection was called
			expect(connectionAttempted).toBe(true);

			freshBridge.dispose();
			killSpy.mockRestore();
		});

		it("should return false if already connecting", async () => {
			vi.mocked(existsSync).mockReturnValue(true);
			vi.mocked(readFileSync).mockReturnValue("12345");

			// Mock process.kill to succeed using spyOn
			const killSpy = vi.spyOn(process, "kill").mockImplementation(() => true as never);

			// Start first connection
			const connect1 = bridge.connect();

			// Try second connection while first is in progress
			const connect2 = bridge.connect();

			expect(await connect2).toBe(false);

			killSpy.mockRestore();
		});
	});

	describe("disconnect()", () => {
		it("should handle disconnect when not connected", () => {
			// Should not throw
			expect(() => bridge.disconnect()).not.toThrow();
		});

		it("should emit connectionChanged false on disconnect", () => {
			let connectionState: boolean | null = null;
			bridge.onConnectionChanged((connected) => {
				connectionState = connected;
			});

			bridge.disconnect();

			expect(connectionState).toBe(false);
		});
	});

	// =========================================================================
	// API METHOD TESTS (without connection)
	// =========================================================================

	describe("getStatus()", () => {
		it("should return connected false when not connected", async () => {
			const status = await bridge.getStatus();
			expect(status).toEqual({ connected: false });
		});
	});

	describe("getSessionStatus()", () => {
		it("should return null when not connected", async () => {
			const result = await bridge.getSessionStatus("/workspace/test");
			expect(result).toBeNull();
		});
	});

	describe("subscribeToFileWatching()", () => {
		it("should return false when daemon is not running", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			const result = await bridge.subscribeToFileWatching("/workspace/test");
			expect(result).toBe(false);
		});
	});

	describe("unsubscribeFromFileWatching()", () => {
		it("should return false when not connected", async () => {
			const result = await bridge.unsubscribeFromFileWatching("/workspace/test");
			expect(result).toBe(false);
		});
	});

	describe("recordFileModification()", () => {
		it("should return false when not connected", async () => {
			const result = await bridge.recordFileModification(
				"/workspace/test",
				"src/app.ts",
				50,
				true,
			);
			expect(result).toBe(false);
		});
	});

	// =========================================================================
	// EVENT EMITTER TESTS
	// =========================================================================

	describe("event emitters", () => {
		it("should expose onRiskDetected event", () => {
			expect(bridge.onRiskDetected).toBeDefined();
		});

		it("should expose onConnectionChanged event", () => {
			expect(bridge.onConnectionChanged).toBeDefined();
		});

		it("should expose onDaemonShuttingDown event", () => {
			expect(bridge.onDaemonShuttingDown).toBeDefined();
		});

		it("should allow subscribing to events", () => {
			const handler = vi.fn();
			const subscription = bridge.onConnectionChanged(handler);
			expect(subscription).toBeDefined();
			expect(subscription.dispose).toBeDefined();
		});
	});

	// =========================================================================
	// LIFECYCLE TESTS
	// =========================================================================

	describe("initialize()", () => {
		it("should be a function", () => {
			expect(typeof bridge.initialize).toBe("function");
		});

		it("should not throw when daemon is not running", async () => {
			vi.mocked(existsSync).mockReturnValue(false);
			await expect(bridge.initialize()).resolves.not.toThrow();
		});
	});

	describe("dispose()", () => {
		it("should be a function", () => {
			expect(typeof bridge.dispose).toBe("function");
		});

		it("should not throw when called", () => {
			expect(() => bridge.dispose()).not.toThrow();
		});

		it("should be idempotent", () => {
			bridge.dispose();
			expect(() => bridge.dispose()).not.toThrow();
		});
	});

	// =========================================================================
	// CLASS EXPORTS TESTS
	// =========================================================================

	describe("exports", () => {
		it("should export DaemonBridge class", () => {
			expect(DaemonBridge).toBeDefined();
			expect(typeof DaemonBridge).toBe("function");
		});

		it("should export getDaemonBridge function", () => {
			expect(getDaemonBridge).toBeDefined();
			expect(typeof getDaemonBridge).toBe("function");
		});

		it("should export disposeDaemonBridge function", () => {
			expect(disposeDaemonBridge).toBeDefined();
			expect(typeof disposeDaemonBridge).toBe("function");
		});
	});
});
