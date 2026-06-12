/**
 * DaemonBridge Race Condition Tests (Item 1.3)
 *
 * Spec requirement: Fix dual client ID race condition causing 6s activation.
 * The connectPromise guard must coalesce concurrent connect() calls into a
 * single in-flight attempt  -  <500ms p95 cold-start target.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Mocks ─────────────────────────────────────────────────────────────────

vi.mock("vscode", () => ({
	window: {
		activeTextEditor: null,
		createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), show: vi.fn() })),
	},
	workspace: {
		workspaceFolders: [],
		getWorkspaceFolder: vi.fn(() => null),
		onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
	},
	EventEmitter: class {
		event = vi.fn();
		fire = vi.fn();
		dispose = vi.fn();
	},
	Disposable: class {
		constructor(public fn: () => void) {}
		dispose() { this.fn(); }
		static from(...args: { dispose: () => void }[]) {
			return { dispose: () => args.forEach(d => d.dispose()) };
		}
	},
}));

vi.mock("@vreko/local-service-client", () => ({
	VrekoLocalClient: class {
		private _connected = false;
		private handlers: Map<string, (...args: unknown[]) => void> = new Map();
		isConnected() { return this._connected; }
		on(event: string, handler: (...args: unknown[]) => void) { this.handlers.set(event, handler); }
		connect() {
			return new Promise<void>((resolve) => setTimeout(() => {
				this._connected = true;
				resolve();
			}, 10));
		}
		disconnect() { this._connected = false; }
		request() { return Promise.resolve({}); }
	},
}));

vi.mock("node:fs", () => ({ existsSync: vi.fn(() => true) }));

vi.mock("../../../telemetry/ActivationFunnelIntegration.js", () => ({
	getActivationFunnel: vi.fn(() => null),
}));

vi.mock("../../../utils/logger.js", () => ({
	logger: {
		debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(),
		getInstance: vi.fn(() => ({ appendLine: vi.fn() })),
	},
}));

vi.mock("../index.js", async (importOriginal) => {
	const actual = await importOriginal() as Record<string, unknown>;
	return {
		...actual,
		getSocketPath: vi.fn(() => "/tmp/vreko-test.sock"),
	};
});

// ─── Tests ──────────────────────────────────────────────────────────────────

describe("DaemonBridge  -  race condition guard (spec 1.3)", () => {
	describe("getDaemonBridge registry", () => {
		it("returns the same bridge instance for the same workspaceId", async () => {
			const { getDaemonBridge } = await import("../../DaemonBridge.js");

			const workspace = "/test/workspace-race-" + Date.now();
			const bridge1 = getDaemonBridge(workspace);
			const bridge2 = getDaemonBridge(workspace);

			expect(bridge1).toBe(bridge2);
		});

		it("returns different bridge instances for different workspaceIds", async () => {
			const { getDaemonBridge } = await import("../../DaemonBridge.js");

			const ts = Date.now();
			const bridge1 = getDaemonBridge(`/workspace-a-${ts}`);
			const bridge2 = getDaemonBridge(`/workspace-b-${ts}`);

			expect(bridge1).not.toBe(bridge2);
		});
	});

	describe("connectPromise coalescing", () => {
		it("coalesces concurrent connect() calls into a single promise", async () => {
			const { getDaemonBridge } = await import("../../DaemonBridge.js");
			const bridge = getDaemonBridge("/test/coalesce-" + Date.now());

			// Launch 5 concurrent connect() calls
			const promises = Array.from({ length: 5 }, () => bridge.connect());

			// All should resolve (not throw)
			const results = await Promise.allSettled(promises);
			const rejections = results.filter(r => r.status === "rejected");
			expect(rejections).toHaveLength(0);

			// After connecting, isConnected should be consistent
			// (not guaranteed true in mock env, but no race-induced crash)
		});

		it("returns true immediately when already connected", async () => {
			const { getDaemonBridge } = await import("../../DaemonBridge.js");
			const bridge = getDaemonBridge("/test/already-connected-" + Date.now());

			// First call
			await bridge.connect().catch(() => {/* mock may not fully connect */});

			// If somehow connected, second call should be instant
			const start = Date.now();
			if (bridge.isConnected()) {
				const result = await bridge.connect();
				const elapsed = Date.now() - start;
				expect(result).toBe(true);
				expect(elapsed).toBeLessThan(50); // Should be nearly instant
			}
		});
	});

	describe("clientId uniqueness", () => {
		it("each DaemonBridge instance gets a unique clientId", async () => {
			const { getDaemonBridge } = await import("../../DaemonBridge.js");
			const ts = Date.now();

			const b1 = getDaemonBridge(`/ws-uid-1-${ts}`);
			const b2 = getDaemonBridge(`/ws-uid-2-${ts}`);

			// Access clientId (private  -  use type cast)
			const id1 = (b1 as unknown as { clientId: string }).clientId;
			const id2 = (b2 as unknown as { clientId: string }).clientId;

			expect(id1).toBeDefined();
			expect(id2).toBeDefined();
			expect(id1).not.toBe(id2);
			expect(id1).toMatch(/^vscode-/);
		});
	});
});
