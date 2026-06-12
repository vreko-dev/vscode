/**
 * R-SEAM-9 - The extension watcher fires on the CANONICAL `workspace.json` glob.
 *
 * Outcome (spec §2.9): `ExtensionHost.initAgentsWorkspaceWatcher()` keys its
 * FileSystemWatcher to `RelativePattern(<workspaceRoot>/.agents, "workspace.json")`
 * (the canonical name per ARCH-05 / spec §0.1) and, when that file is written,
 * the registered refresh callback runs and projects into the status provider.
 *
 * R-FIX-2 (carried by this seam): the silent fallback read of the legacy
 * `agents.workspace.json` was removed from `refreshAgentsStatus()`. This test
 * asserts the watcher's glob is the canonical name and that a create/change event
 * drives a real `provider.update(...)` call - not a no-op.
 *
 * Harness (spec): vscode test harness - `vscode` and `node:fs` are mocked. We
 * capture the watcher callbacks the real `ExtensionHost` registers, fire one, and
 * assert the projection ran. No daemon is spawned (per the daemon-spawn discipline,
 * only the golden path spawns a daemon).
 *
 * Test honesty (spec hard rule): every assertion is non-vacuous. The watcher glob
 * is asserted to be exactly `workspace.json`; the create callback is asserted to
 * actually fire `provider.update` with concrete data. Nothing silently returns.
 */

// node:fs is aliased to apps/vscode/__mocks__/node:fs.mjs in the vscode vitest
// config, where `statSync` is a vi.fn(). We drive it directly so the watcher's
// refresh callback projects deterministic disk state. ExtensionHost imports
// `* as fs from "node:fs"` and calls `fs.statSync`, which resolves to the same
// mock module instance.
//
// IMPORTANT: this suite does NOT call `vi.resetModules()`. Resetting the module
// graph re-instantiates the aliased `node:fs` mock (so a `statSync` binding goes
// stale) AND wipes the `Logger` singleton that `test/unit/setup.ts` initialized
// once for the whole run (ExtensionHost's `refreshAgentsStatus` calls
// `logger.debug` on the file-absent branch). We instead import ExtensionHost +
// the fs mock once from the shared (setup-initialized) graph and reset only the
// statSync mock's call state between tests. Per-test isolation comes from a fresh
// ExtensionHost instance, fresh provider, and cleared watcher-callback arrays.
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// ---------------------------------------------------------------------------
// vscode mock - capture the watcher's registered callbacks + the RelativePattern
// the extension constructs, so we can assert the canonical glob and fire events.
// The global __mocks__/vscode.mjs FileSystemWatcher does not expose
// onDidCreate/onDidChange/onDidDelete, so this file provides a focused override.
// ---------------------------------------------------------------------------

const WORKSPACE_ROOT = "/test/workspace";

let createdRelativePattern: { base: string; pattern: string } | undefined;
const onDidCreateCb: Array<(...args: unknown[]) => void> = [];
const onDidChangeCb: Array<(...args: unknown[]) => void> = [];
const onDidDeleteCb: Array<(...args: unknown[]) => void> = [];
const watcherDispose = vi.fn();

// Build on the comprehensive global vscode mock (Disposable, EventEmitter, etc. are
// needed by ExtensionHost's transitive imports) and override only the watcher
// surface + RelativePattern + workspaceFolders that this seam exercises.
vi.mock("vscode", async (importOriginal) => {
	const actual = (await importOriginal()) as { default: Record<string, unknown> } & Record<string, unknown>;
	const base = actual.default ?? actual;
	const RelativePattern = class {
		base: string;
		pattern: string;
		constructor(base: string, pattern: string) {
			this.base = base;
			this.pattern = pattern;
			createdRelativePattern = { base, pattern };
		}
	};
	const workspace = {
		...(base.workspace as Record<string, unknown>),
		workspaceFolders: [{ uri: { fsPath: WORKSPACE_ROOT } }],
		createFileSystemWatcher: vi.fn(() => ({
			onDidCreate: (cb: (...args: unknown[]) => void) => {
				onDidCreateCb.push(cb);
				return { dispose: vi.fn() };
			},
			onDidChange: (cb: (...args: unknown[]) => void) => {
				onDidChangeCb.push(cb);
				return { dispose: vi.fn() };
			},
			onDidDelete: (cb: (...args: unknown[]) => void) => {
				onDidDeleteCb.push(cb);
				return { dispose: vi.fn() };
			},
			dispose: watcherDispose,
		})),
	};
	return { ...base, default: { ...base, workspace, RelativePattern }, workspace, RelativePattern };
});

describe("R-SEAM-9 - watcher fires on the canonical workspace.json glob (R-FIX-2)", () => {
	let ExtensionHost: typeof import("../../../src/platform/ExtensionHost").ExtensionHost;
	let statSyncMock: Mock;

	beforeEach(async () => {
		createdRelativePattern = undefined;
		onDidCreateCb.length = 0;
		onDidChangeCb.length = 0;
		onDidDeleteCb.length = 0;
		// Acquire the live mock from the same (cached, setup-initialized) module
		// graph ExtensionHost imports. No resetModules - see header note.
		const fsMod = (await import("node:fs")) as unknown as { statSync: Mock };
		statSyncMock = fsMod.statSync;
		statSyncMock.mockReset();
		const mod = await import("../../../src/platform/ExtensionHost");
		ExtensionHost = mod.ExtensionHost;
	});

	function makeHost(): InstanceType<typeof ExtensionHost> {
		const ctx = { subscriptions: [] as unknown[] } as never;
		return new ExtensionHost(ctx);
	}

	it("keys the watcher to the canonical .agents/workspace.json glob (not the legacy name)", () => {
		const host = makeHost();
		// statSync returns "not found" on the initial activation refresh.
		statSyncMock.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		const provider = { update: vi.fn() };

		host.initAgentsWorkspaceWatcher(provider);

		// The watcher glob MUST be the canonical name. A regression back to the
		// legacy `agents.workspace.json` glob fails here loudly.
		expect(createdRelativePattern).toBeDefined();
		expect(createdRelativePattern?.pattern).toBe("workspace.json");
		expect(createdRelativePattern?.pattern).not.toBe("agents.workspace.json");
		expect(createdRelativePattern?.base).toContain(".agents");

		// A create/change/delete handler was actually registered (non-vacuous).
		expect(onDidCreateCb.length).toBe(1);
		expect(onDidChangeCb.length).toBe(1);
		expect(onDidDeleteCb.length).toBe(1);
	});

	it("invokes the refresh callback with real data when the canonical file is written", () => {
		const host = makeHost();
		const writeTimeMs = Date.now();

		// Initial activation refresh: file not present yet (statSync throws ENOENT).
		statSyncMock.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		const provider = { update: vi.fn() };
		host.initAgentsWorkspaceWatcher(provider);

		// provider.update was called once on activation (file absent → exists:false).
		expect(provider.update).toHaveBeenCalledTimes(1);
		expect(provider.update).toHaveBeenLastCalledWith({
			agentsWorkspace: { exists: false, lastModified: undefined },
		});

		// Now the daemon writes .agents/workspace.json - statSync resolves to a real stat.
		statSyncMock.mockReset();
		statSyncMock.mockReturnValue({
			mtimeMs: writeTimeMs,
			isFile: () => true,
			isDirectory: () => false,
		} as never);

		// Fire the canonical watcher's create event (what VS Code does on file write).
		expect(onDidCreateCb.length).toBe(1);
		onDidCreateCb[0]?.({ fsPath: `${WORKSPACE_ROOT}/.agents/workspace.json` });

		// The callback actually fired the projection with exists:true and a fresh
		// lastModified - proving the watcher→refresh path is wired, not a no-op.
		expect(provider.update).toHaveBeenCalledTimes(2);
		const lastCall = provider.update.mock.calls.at(-1)?.[0] as {
			agentsWorkspace: { exists: boolean; lastModified?: string };
		};
		expect(lastCall.agentsWorkspace.exists).toBe(true);
		expect(lastCall.agentsWorkspace.lastModified).toBe("just now");
	});
});
