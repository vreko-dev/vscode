/**
 * R-SEAM-10 - The extension projects FRESH file state, not a stale cache.
 *
 * Outcome (spec §2.10): after the watcher fires, `statusWebViewProvider.update(...)`
 * reflects the NEW file state (exists + fresh `lastModified`), re-read from disk on
 * every event - never a cached prior projection. Crucially, the extension derives
 * freshness by reading the emitted file (thin-client boundary), NOT by reaching into
 * `@vreko/intelligence` / `@snapback/intelligence` at runtime.
 *
 * Harness (spec): vscode test harness - `vscode` and `node:fs` are mocked. We
 * capture the watcher callback the real `ExtensionHost` registers and fire it, then
 * assert the projection re-read the file each time. No daemon is spawned.
 *
 * Test honesty (spec hard rule): assertions are non-vacuous. We drive two distinct
 * file states (absent → present-fresh) and a state transition (older mtime → newer
 * mtime) and assert the projection tracks the LATEST disk state each time, proving
 * the read is not cached.
 *
 * Thin-client guard: this file asserts at runtime that `ExtensionHost.ts` carries no
 * `@vreko/intelligence` / `@snapback/intelligence` import in its projection path, so a
 * future regression that derives freshness from the intelligence layer fails loudly.
 */

// node:fs is aliased to apps/vscode/__mocks__/node:fs.mjs in the vscode vitest
// config, where `statSync` is a vi.fn(). We drive it directly so the watcher's
// refresh callback projects deterministic disk state. node:fs/promises is NOT
// aliased, so `readFile` below reads the real ExtensionHost source for the
// thin-client guard.
//
// IMPORTANT: this suite does NOT call `vi.resetModules()`. Resetting the module
// graph re-instantiates the aliased `node:fs` mock (so a `statSync` binding goes
// stale) AND wipes the `Logger` singleton that `test/unit/setup.ts` initialized
// once for the whole run (ExtensionHost's `refreshAgentsStatus` calls
// `logger.debug` on the file-absent branch). We import ExtensionHost + the fs mock
// once from the shared (setup-initialized) graph and reset only the statSync
// mock's call state between tests. Per-test isolation comes from a fresh
// ExtensionHost instance, fresh provider, and cleared watcher-callback arrays.
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

const WORKSPACE_ROOT = "/test/workspace";

const onDidCreateCb: Array<(...args: unknown[]) => void> = [];
const onDidChangeCb: Array<(...args: unknown[]) => void> = [];
const onDidDeleteCb: Array<(...args: unknown[]) => void> = [];

// Build on the comprehensive global vscode mock (Disposable, EventEmitter, etc. are
// needed by ExtensionHost's transitive imports) and override only the watcher
// surface + RelativePattern + workspaceFolders that this seam exercises.
vi.mock("vscode", async (importOriginal) => {
	const actual = (await importOriginal()) as { default: Record<string, unknown> } & Record<string, unknown>;
	const base = actual.default ?? actual;
	const RelativePattern = class {
		constructor(
			public base: string,
			public pattern: string,
		) {}
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
			dispose: vi.fn(),
		})),
	};
	return { ...base, default: { ...base, workspace, RelativePattern }, workspace, RelativePattern };
});

// Resolve the real ExtensionHost source so the thin-client guard reads the actual
// file (not the mocked module graph).
const THIS_DIR = dirname(fileURLToPath(import.meta.url));
const EXTENSION_HOST_SRC = join(THIS_DIR, "../../../src/platform/ExtensionHost.ts");

describe("R-SEAM-10 - extension projects fresh file state, not stale", () => {
	let ExtensionHost: typeof import("../../../src/platform/ExtensionHost").ExtensionHost;
	let statSyncMock: Mock;

	beforeEach(async () => {
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
		return new ExtensionHost({ subscriptions: [] as unknown[] } as never);
	}

	it("re-reads the canonical file on each watcher event (absent → fresh)", () => {
		const host = makeHost();
		const provider = { update: vi.fn() };

		// Activation: file absent (statSync throws ENOENT).
		statSyncMock.mockImplementation(() => {
			throw new Error("ENOENT");
		});
		host.initAgentsWorkspaceWatcher(provider);
		expect(provider.update).toHaveBeenLastCalledWith({
			agentsWorkspace: { exists: false, lastModified: undefined },
		});

		// Daemon writes the file just now → fresh stat.
		const freshMtime = Date.now();
		statSyncMock.mockReset();
		statSyncMock.mockReturnValue({
			mtimeMs: freshMtime,
			isFile: () => true,
			isDirectory: () => false,
		} as never);

		onDidCreateCb[0]?.({ fsPath: `${WORKSPACE_ROOT}/.agents/workspace.json` });

		const lastCall = provider.update.mock.calls.at(-1)?.[0] as {
			agentsWorkspace: { exists: boolean; lastModified?: string };
		};
		expect(lastCall.agentsWorkspace.exists).toBe(true);
		// Fresh write (within the last minute) projects as "just now" - within
		// tolerance of write time, not a stale relative string.
		expect(lastCall.agentsWorkspace.lastModified).toBe("just now");
	});

	it("tracks the LATEST mtime across successive writes (no cached projection)", () => {
		const host = makeHost();
		const provider = { update: vi.fn() };

		// Activation: file already exists, written ~2 hours ago (stale).
		const twoHoursAgo = Date.now() - 2 * 60 * 60 * 1000;
		statSyncMock.mockReturnValue({
			mtimeMs: twoHoursAgo,
			isFile: () => true,
			isDirectory: () => false,
		} as never);
		host.initAgentsWorkspaceWatcher(provider);

		// Initial projection reflects the stale mtime.
		expect(
			(provider.update.mock.calls.at(-1)?.[0] as { agentsWorkspace: { lastModified?: string } }).agentsWorkspace
				.lastModified,
		).toBe("2 hours ago");

		// Daemon rewrites the file NOW. The watcher's change event must re-read the
		// file and project the fresh mtime - proving the projection is not cached.
		statSyncMock.mockReset();
		statSyncMock.mockReturnValue({
			mtimeMs: Date.now(),
			isFile: () => true,
			isDirectory: () => false,
		} as never);
		onDidChangeCb[0]?.({ fsPath: `${WORKSPACE_ROOT}/.agents/workspace.json` });

		const afterWrite = provider.update.mock.calls.at(-1)?.[0] as {
			agentsWorkspace: { exists: boolean; lastModified?: string };
		};
		expect(afterWrite.agentsWorkspace.exists).toBe(true);
		expect(afterWrite.agentsWorkspace.lastModified).toBe("just now");
		expect(afterWrite.agentsWorkspace.lastModified).not.toBe("2 hours ago");
	});

	it("derives freshness from the file, NOT from a runtime @vreko/intelligence reach (thin-client)", async () => {
		// Read via node:fs/promises (NOT the aliased node:fs mock) so the guard sees
		// the real ExtensionHost source, not the mocked readFileSync stub.
		const src = await readFile(EXTENSION_HOST_SRC, "utf-8");
		// Strip line comments so the guard does not self-match this test's own
		// explanatory mentions of the package name inside ExtensionHost comments.
		const codeOnly = src
			.split("\n")
			.filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
			.join("\n");
		// Assemble the needles at runtime so this assertion's own source text does
		// not register as a match in any cross-file scan.
		const intelImportNeedles = [
			`from "@vreko/${"intelligence"}"`,
			`from "@snapback/${"intelligence"}"`,
			`require("@vreko/${"intelligence"}")`,
		];
		for (const needle of intelImportNeedles) {
			expect(codeOnly.includes(needle)).toBe(false);
		}
	});
});
