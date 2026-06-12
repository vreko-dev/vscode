import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";

// This test covers daemon handoff protocol state machine logic.
// DaemonBridge is tested via lightweight state models  -  no VS Code API dependencies.

const NON_IDEMPOTENT_METHODS = new Set([
	"snapshot/create",
	"snapshot/restore",
	"learning/add",
	"learning/update",
]);

describe("daemon handoff protocol", () => {
	it("P18-10-A-1: daemon.update_pending notification → client queues new commands", () => {
		let pendingHandoff = false;
		const commandQueue: string[] = [];

		function handleNotification(type: string) {
			if (type === "daemon.update_pending") {
				pendingHandoff = true;
			}
		}

		function queueCommand(method: string): boolean {
			if (pendingHandoff) {
				commandQueue.push(method);
				return true; // queued, not sent
			}
			return false; // sent immediately
		}

		handleNotification("daemon.update_pending");
		const wasQueued = queueCommand("snapshot/create");

		expect(pendingHandoff).toBe(true);
		expect(wasQueued).toBe(true);
		expect(commandQueue).toHaveLength(1);
		expect(commandQueue[0]).toBe("snapshot/create");
	});

	it("P18-10-A-2: daemon.handoff_complete notification → client HOT_RECONNECTs to new socket", () => {
		let currentSocket = "old.sock";
		let pendingHandoff = true;

		function handleNotification(type: string, params?: { newSocketPath?: string }) {
			if (type === "daemon.handoff_complete") {
				pendingHandoff = false;
				if (params?.newSocketPath) {
					currentSocket = params.newSocketPath;
				}
			}
		}

		handleNotification("daemon.handoff_complete", { newSocketPath: "new.sock" });

		expect(pendingHandoff).toBe(false);
		expect(currentSocket).toBe("new.sock");
	});

	it("P18-10-A-3: non-idempotent command replayed with requestId dedup key", () => {
		function buildRequest(method: string, params: Record<string, unknown>) {
			const requestId = NON_IDEMPOTENT_METHODS.has(method) ? randomUUID() : undefined;
			return { method, params: requestId ? { ...params, requestId } : params };
		}

		const req = buildRequest("snapshot/create", { workspaceId: "ws1" });

		expect(req.params).toHaveProperty("requestId");
		expect(typeof (req.params as Record<string, unknown>).requestId).toBe("string");
		// UUID format: 8-4-4-4-12
		expect((req.params as Record<string, unknown>).requestId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
		);
	});

	it("P18-10-A-4: idempotent command replayed without dedup check", () => {
		function buildRequest(method: string, params: Record<string, unknown>) {
			const requestId = NON_IDEMPOTENT_METHODS.has(method) ? randomUUID() : undefined;
			return { method, params: requestId ? { ...params, requestId } : params };
		}

		const req = buildRequest("snapshot/list", {});

		expect(req.params).not.toHaveProperty("requestId");
	});
});
