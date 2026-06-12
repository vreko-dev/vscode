/**
 * SetupGateMonitor Unit Tests
 *
 * Covers all 5 gate evaluators, lifecycle (activate/dispose),
 * event-driven re-evaluation, and Promise.allSettled isolation.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DaemonBridge } from "../../../src/services/DaemonBridge";
import { SetupGateMonitor } from "../../../src/signals/SetupGateMonitor";
import type { StatusFlagManager } from "../../../src/signals/StatusFlagManager";

// ============================================================================
// Helpers
// ============================================================================

function makeSecrets(values: Record<string, string | undefined> = {}) {
	return {
		get: vi.fn(async (key: string) => values[key]),
		store: vi.fn(),
		delete: vi.fn(),
		onDidChange: vi.fn(() => ({ dispose: vi.fn() })),
	};
}

function makeGlobalState(values: Record<string, unknown> = {}) {
	const store = { ...values };
	return {
		get: vi.fn(<T>(key: string, defaultValue?: T): T => (key in store ? (store[key] as T) : (defaultValue as T))),
		update: vi.fn(async (key: string, value: unknown) => {
			store[key] = value;
		}),
		keys: vi.fn(() => Object.keys(store)),
		setKeysForSync: vi.fn(),
	};
}

function makeContext(
	secrets: ReturnType<typeof makeSecrets> = makeSecrets(),
	globalState: ReturnType<typeof makeGlobalState> = makeGlobalState(),
) {
	return { secrets, globalState } as unknown as import("vscode").ExtensionContext;
}

function makeFlagManager() {
	return {
		setFlag: vi.fn(),
		clearFlag: vi.fn(),
		hasFlag: vi.fn(() => false),
	} as unknown as StatusFlagManager;
}

function makeDaemonBridge(state: string = "disconnected") {
	const listeners: Array<() => void> = [];
	return {
		getState: vi.fn(() => state),
		getOnboardingStatus: vi.fn(async () => ({ phase: "ready" as const, progress: 100 })),
		onStateChange: vi.fn((cb: () => void) => {
			listeners.push(cb);
			return { dispose: () => listeners.splice(listeners.indexOf(cb), 1) };
		}),
		_fireStateChange: () => listeners.forEach((l) => l()),
	} as unknown as DaemonBridge & { _fireStateChange: () => void };
}

// Mock CLIResolver at module level
vi.mock("../../../src/cli/CLIResolver", () => ({
	CLIResolver: vi.fn().mockImplementation(() => ({
		resolve: vi.fn(async () => ({ status: "found" as const, binaryPath: "/usr/local/bin/vreko" })),
	})),
}));

// Mock vscode workspace folders
const mockWorkspaceFolders: { uri: { fsPath: string } }[] = [{ uri: { fsPath: "/workspace" } }];

vi.mock("vscode", async () => {
	const actual = await vi.importActual<typeof import("vscode")>("vscode");
	return {
		...actual,
		workspace: {
			...((actual as { workspace?: unknown }).workspace ?? {}),
			workspaceFolders: mockWorkspaceFolders,
			onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
		},
	};
});

// ============================================================================
// Tests
// ============================================================================

describe("SetupGateMonitor", () => {
	let flagManager: ReturnType<typeof makeFlagManager>;
	let daemonBridge: ReturnType<typeof makeDaemonBridge>;
	let monitor: SetupGateMonitor;

	beforeEach(() => {
		vi.clearAllMocks();
		flagManager = makeFlagManager();
		daemonBridge = makeDaemonBridge("connected");
	});

	afterEach(() => {
		monitor?.dispose();
	});

	// =========================================================================
	// CLI Gate
	// =========================================================================

	describe("CLI gate", () => {
		it("clears CLI_NOT_INSTALLED when CLI is found", async () => {
			const { CLIResolver } = await import("../../../src/cli/CLIResolver");
			vi.mocked(CLIResolver).mockImplementation(() => ({
				resolve: vi.fn(async () => ({ status: "found" as const, binaryPath: "/usr/local/bin/vreko" })),
			}));

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("CLI_NOT_INSTALLED");
			expect(flagManager.setFlag).not.toHaveBeenCalledWith("CLI_NOT_INSTALLED");
		});

		it("sets CLI_NOT_INSTALLED when status is not-found", async () => {
			const { CLIResolver } = await import("../../../src/cli/CLIResolver");
			vi.mocked(CLIResolver).mockImplementation(() => ({
				resolve: vi.fn(async () => ({ status: "not-found" as const })),
			}));

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("CLI_NOT_INSTALLED");
		});

		it("sets CLI_NOT_INSTALLED when status is invalid-version", async () => {
			const { CLIResolver } = await import("../../../src/cli/CLIResolver");
			vi.mocked(CLIResolver).mockImplementation(() => ({
				resolve: vi.fn(async () => ({ status: "invalid-version" as const })),
			}));

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("CLI_NOT_INSTALLED");
		});

		it("sets CLI_NOT_INSTALLED when CLIResolver throws", async () => {
			const { CLIResolver } = await import("../../../src/cli/CLIResolver");
			vi.mocked(CLIResolver).mockImplementation(() => ({
				resolve: vi.fn(async () => {
					throw new Error("resolver error");
				}),
			}));

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("CLI_NOT_INSTALLED");
		});
	});

	// =========================================================================
	// Daemon Gate
	// =========================================================================

	describe("Daemon gate", () => {
		it("clears DAEMON_NOT_RUNNING when daemon is connected", async () => {
			daemonBridge = makeDaemonBridge("connected");
			flagManager.hasFlag = vi.fn(() => false); // CLI present

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("DAEMON_NOT_RUNNING");
		});

		it("sets DAEMON_NOT_RUNNING when state is disconnected and CLI present", async () => {
			daemonBridge = makeDaemonBridge("disconnected");
			flagManager.hasFlag = vi.fn((key: string) => key !== "CLI_NOT_INSTALLED"); // CLI present

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("DAEMON_NOT_RUNNING");
		});

		it("sets DAEMON_NOT_RUNNING when state is cli_missing and CLI present", async () => {
			daemonBridge = makeDaemonBridge("cli_missing");
			flagManager.hasFlag = vi.fn(() => false); // CLI not flagged (resolved)

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("DAEMON_NOT_RUNNING");
		});

		it("does NOT set DAEMON_NOT_RUNNING when CLI_NOT_INSTALLED is active", async () => {
			daemonBridge = makeDaemonBridge("disconnected");
			flagManager.hasFlag = vi.fn((key: string) => key === "CLI_NOT_INSTALLED");

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.setFlag).not.toHaveBeenCalledWith("DAEMON_NOT_RUNNING");
		});

		it("clears DAEMON_NOT_RUNNING when daemon becomes connected", async () => {
			daemonBridge = makeDaemonBridge("connected");

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("DAEMON_NOT_RUNNING");
		});

		it("clears DAEMON_NOT_RUNNING when getState throws", async () => {
			daemonBridge.getState = vi.fn(() => {
				throw new Error("ipc error");
			});

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("DAEMON_NOT_RUNNING");
		});
	});

	// =========================================================================
	// Auth Gate
	// =========================================================================

	describe("Auth gate", () => {
		it("sets NOT_AUTHENTICATED when both secrets are absent", async () => {
			const context = makeContext(makeSecrets({}));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("NOT_AUTHENTICATED");
		});

		it("clears NOT_AUTHENTICATED when apiKey is present", async () => {
			const context = makeContext(makeSecrets({ "vreko.apiKey": "sk-test-key" }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("NOT_AUTHENTICATED");
		});

		it("clears NOT_AUTHENTICATED when oauth session is present", async () => {
			const context = makeContext(makeSecrets({ "vreko.oauth.session": '{"token":"abc"}' }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("NOT_AUTHENTICATED");
		});

		it("clears NOT_AUTHENTICATED (does not block) when secrets API throws", async () => {
			const secrets = makeSecrets();
			secrets.get = vi.fn(async () => {
				throw new Error("secrets unavailable");
			});
			const context = makeContext(secrets);

			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("NOT_AUTHENTICATED");
			expect(flagManager.setFlag).not.toHaveBeenCalledWith("NOT_AUTHENTICATED");
		});
	});

	// =========================================================================
	// Workspace Gate
	// =========================================================================

	describe("Workspace gate", () => {
		it("sets WORKSPACE_NOT_INIT when phase is idle", async () => {
			daemonBridge.getOnboardingStatus = vi.fn(async () => ({ phase: "idle" as const, progress: 0 }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("WORKSPACE_NOT_INIT");
		});

		it("sets WORKSPACE_NOT_INIT when phase is fingerprinting", async () => {
			daemonBridge.getOnboardingStatus = vi.fn(async () => ({ phase: "fingerprinting" as const, progress: 10 }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("WORKSPACE_NOT_INIT");
		});

		it("clears WORKSPACE_NOT_INIT when phase is ready", async () => {
			daemonBridge.getOnboardingStatus = vi.fn(async () => ({ phase: "ready" as const, progress: 100 }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("WORKSPACE_NOT_INIT");
		});

		it("clears WORKSPACE_NOT_INIT when no workspace folders are open", async () => {
			const vscode = await import("vscode");
			const original = vscode.workspace.workspaceFolders;
			// @ts-expect-error override for test
			vscode.workspace.workspaceFolders = undefined;

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("WORKSPACE_NOT_INIT");
			// @ts-expect-error restore
			vscode.workspace.workspaceFolders = original;
		});

		it("clears WORKSPACE_NOT_INIT (does not block) when getOnboardingStatus throws", async () => {
			daemonBridge.getOnboardingStatus = vi.fn(async () => {
				throw new Error("rpc error");
			});
			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("WORKSPACE_NOT_INIT");
			expect(flagManager.setFlag).not.toHaveBeenCalledWith("WORKSPACE_NOT_INIT");
		});
	});

	// =========================================================================
	// MCP Gate
	// =========================================================================

	describe("MCP gate", () => {
		it("sets MCP_NOT_CONFIGURED when both keys are absent", async () => {
			const context = makeContext(makeSecrets(), makeGlobalState({}));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("MCP_NOT_CONFIGURED");
		});

		it("sets MCP_NOT_CONFIGURED when globalState key is false", async () => {
			const context = makeContext(makeSecrets(), makeGlobalState({ "vreko.mcpConfigured": false }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.setFlag).toHaveBeenCalledWith("MCP_NOT_CONFIGURED");
		});

		it("clears MCP_NOT_CONFIGURED when vreko.mcpConfigured is true", async () => {
			const context = makeContext(makeSecrets(), makeGlobalState({ "vreko.mcpConfigured": true }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("MCP_NOT_CONFIGURED");
		});

		it("clears MCP_NOT_CONFIGURED when legacy mcp.configured key is true (existing users)", async () => {
			const context = makeContext(makeSecrets(), makeGlobalState({ "mcp.configured": true }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("MCP_NOT_CONFIGURED");
			expect(flagManager.setFlag).not.toHaveBeenCalledWith("MCP_NOT_CONFIGURED");
		});

		it("clears MCP_NOT_CONFIGURED when globalState throws", async () => {
			const globalState = makeGlobalState();
			globalState.get = vi.fn(() => {
				throw new Error("state error");
			});
			const context = makeContext(makeSecrets(), globalState);

			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			expect(flagManager.clearFlag).toHaveBeenCalledWith("MCP_NOT_CONFIGURED");
		});
	});

	// =========================================================================
	// Lifecycle  -  activate / dispose
	// =========================================================================

	describe("Lifecycle", () => {
		it("calls evaluateAll on activate", async () => {
			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			const spy = vi.spyOn(monitor, "evaluateAll").mockResolvedValue();

			monitor.activate();
			await vi.runAllTimersAsync();

			expect(spy).toHaveBeenCalledTimes(1);
		});

		it("calls evaluateAll on DaemonBridge state change", async () => {
			const bridge = makeDaemonBridge("connected");
			monitor = new SetupGateMonitor(flagManager, bridge, makeContext());

			const spy = vi.spyOn(monitor, "evaluateAll").mockResolvedValue();
			monitor.activate();
			await vi.runAllTimersAsync();
			spy.mockClear();

			bridge._fireStateChange();
			await vi.runAllTimersAsync();

			expect(spy).toHaveBeenCalledTimes(1);
		});

		it("disposes all listeners on dispose", () => {
			const disposeSpy = vi.fn();
			daemonBridge.onStateChange = vi.fn(() => ({ dispose: disposeSpy }));

			const vscode = require("vscode");
			vscode.workspace.onDidChangeWorkspaceFolders = vi.fn(() => ({ dispose: disposeSpy }));

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			monitor.activate();
			monitor.dispose();

			expect(disposeSpy).toHaveBeenCalledTimes(2);
		});
	});

	// =========================================================================
	// Isolation  -  one gate failing does not suppress others
	// =========================================================================

	describe("Gate isolation", () => {
		it("evaluates remaining gates even when one throws", async () => {
			const { CLIResolver } = await import("../../../src/cli/CLIResolver");
			vi.mocked(CLIResolver).mockImplementation(() => ({
				resolve: vi.fn(async () => {
					throw new Error("CLI resolution failed");
				}),
			}));

			// Auth gate should still run
			const context = makeContext(makeSecrets({ "vreko.apiKey": "key" }));
			monitor = new SetupGateMonitor(flagManager, daemonBridge, context);
			await monitor.evaluateAll();

			// CLI gate set the flag (catch path)
			expect(flagManager.setFlag).toHaveBeenCalledWith("CLI_NOT_INSTALLED");
			// Auth gate still ran and cleared
			expect(flagManager.clearFlag).toHaveBeenCalledWith("NOT_AUTHENTICATED");
		});
	});

	// =========================================================================
	// CLI gate runs before daemon gate (ordering guarantee)
	// =========================================================================

	describe("Gate ordering", () => {
		it("CLI gate completes before daemon gate checks hasFlag", async () => {
			const callOrder: string[] = [];

			const { CLIResolver } = await import("../../../src/cli/CLIResolver");
			vi.mocked(CLIResolver).mockImplementation(() => ({
				resolve: vi.fn(async () => {
					callOrder.push("cli-resolve");
					return { status: "not-found" as const };
				}),
			}));

			flagManager.setFlag = vi.fn((key: string) => {
				callOrder.push(`setFlag(${key})`);
			});
			flagManager.clearFlag = vi.fn((key: string) => {
				callOrder.push(`clearFlag(${key})`);
			});
			flagManager.hasFlag = vi.fn((key: string) => {
				callOrder.push(`hasFlag(${key})`);
				return key === "CLI_NOT_INSTALLED";
			});

			daemonBridge = makeDaemonBridge("disconnected");

			monitor = new SetupGateMonitor(flagManager, daemonBridge, makeContext());
			await monitor.evaluateAll();

			const cliIndex = callOrder.indexOf("setFlag(CLI_NOT_INSTALLED)");
			const hasFlagIndex = callOrder.indexOf("hasFlag(CLI_NOT_INSTALLED)");

			expect(cliIndex).toBeGreaterThanOrEqual(0);
			expect(hasFlagIndex).toBeGreaterThanOrEqual(0);
			expect(cliIndex).toBeLessThan(hasFlagIndex);
		});
	});
});
