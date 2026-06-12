/**
 * Regression tests: installCLI command behavior
 *
 * Coverage:
 * 1. Shell Integration (SI) success path  → autoConfigureMCP called immediately (not after toast)
 * 2. Shell Integration failure path       → error message shown, autoConfigureMCP NOT called
 * 3. Fallback path (SI timeout)           → terminal.sendText called when SI unavailable
 * 4. autoConfigureMCP does not block the info toast
 *
 * @see apps/vscode/src/commands/setupCommands.ts
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { createMockExtensionContext } from "../setup";
import { registerSetupCommands } from "../../../src/commands/setupCommands";

// ---------------------------------------------------------------------------
// Mock autoConfigureMCP so we can assert it is called without spawning processes
// ---------------------------------------------------------------------------

vi.mock("../../../src/mcp/auto-configure", () => ({
	autoConfigureMCP: vi.fn().mockResolvedValue(undefined),
	AGENT_RESTART_INSTRUCTIONS: {},
	buildAgentConfigResultMessage: vi.fn(() => ({ toast: "", restartLines: [] })),
}));

// ---------------------------------------------------------------------------
// Mock CLIResolver (used internally by spawnCLICommand, not by installCLI directly)
// ---------------------------------------------------------------------------

vi.mock("../../../src/cli/CLIResolver", () => ({
	CLIResolver: vi.fn().mockImplementation(() => ({
		resolve: vi.fn().mockResolvedValue({ status: "not-found" }),
	})),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the registered handler for a specific command from registerCommand mock calls.
 * registerCommandSafely calls vscode.commands.registerCommand(commandId, handler).
 */
function getCommandHandler(commandId: string): (() => Promise<void>) | undefined {
	const calls = vi.mocked(vscode.commands.registerCommand).mock.calls;
	const found = calls.find(([id]) => id === commandId);
	return found?.[1] as (() => Promise<void>) | undefined;
}

/**
 * Simulate Shell Integration activating for the terminal.
 * Extracts the listener registered via onDidChangeTerminalShellIntegration and fires it.
 */
function fireShellIntegration(terminal: vscode.Terminal): {
	shellIntegration: vscode.TerminalShellIntegration;
	mockExecution: vscode.TerminalShellExecution;
} {
	const mockExecution = {} as vscode.TerminalShellExecution;

	const shellIntegration: vscode.TerminalShellIntegration = {
		cwd: vscode.Uri.file("/workspace"),
		executeCommand: vi.fn(() => mockExecution),
	};

	const onDidChange = vi.mocked(vscode.window.onDidChangeTerminalShellIntegration);
	const lastCall = onDidChange.mock.calls[onDidChange.mock.calls.length - 1];
	if (lastCall) {
		// The handler is the first arg; invoke it with { terminal, shellIntegration }
		(lastCall[0] as (e: { terminal: vscode.Terminal; shellIntegration: vscode.TerminalShellIntegration }) => void)({
			terminal,
			shellIntegration,
		});
	}

	return { shellIntegration, mockExecution };
}

/**
 * Simulate a shell execution ending with the given exit code.
 * Extracts the listener from onDidEndTerminalShellExecution and fires it.
 */
function fireExecutionEnd(execution: vscode.TerminalShellExecution, exitCode: number | undefined) {
	const onDidEnd = vi.mocked(vscode.window.onDidEndTerminalShellExecution);
	const lastCall = onDidEnd.mock.calls[onDidEnd.mock.calls.length - 1];
	if (lastCall) {
		(lastCall[0] as (e: vscode.TerminalShellExecutionEndEvent) => void)({
			terminal: {} as vscode.Terminal,
			execution,
			exitCode,
			shellIntegration: {} as vscode.TerminalShellIntegration,
		});
	}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("installCLI command behavior", () => {
	let context: vscode.ExtensionContext;
	let autoConfigureMCP: ReturnType<typeof vi.fn>;
	let installCLIHandler: (() => Promise<void>) | undefined;

	beforeEach(async () => {
		vi.clearAllMocks();
		vi.useFakeTimers();

		context = createMockExtensionContext();
		const { autoConfigureMCP: mock } = await import("../../../src/mcp/auto-configure");
		autoConfigureMCP = vi.mocked(mock);

		// Register commands  -  this wires up all command handlers
		registerSetupCommands(context);

		// Extract the installCLI handler directly (mock's executeCommand doesn't invoke it)
		installCLIHandler = getCommandHandler("vreko.installCLI");
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("Shell Integration happy path (exit code 0)", () => {
		it("creates a terminal named 'Vreko Install' and shows it", async () => {
			await installCLIHandler?.();

			const terminal = vi.mocked(vscode.window.createTerminal).mock.results[0]?.value;
			expect(vscode.window.createTerminal).toHaveBeenCalledWith(
				expect.objectContaining({ name: expect.stringContaining("Install") }),
			);
			expect(terminal?.show).toHaveBeenCalled();
		});

		it("calls autoConfigureMCP immediately when exit code is 0", async () => {
			await installCLIHandler?.();

			const terminal = vi.mocked(vscode.window.createTerminal).mock.results[0]?.value;
			const { mockExecution } = fireShellIntegration(terminal);
			fireExecutionEnd(mockExecution, 0);

			expect(autoConfigureMCP).toHaveBeenCalledTimes(1);
			expect(autoConfigureMCP).toHaveBeenCalledWith(context);
		});

		it("shows info toast alongside autoConfigureMCP (not waiting for it)", async () => {
			await installCLIHandler?.();

			const terminal = vi.mocked(vscode.window.createTerminal).mock.results[0]?.value;
			const { mockExecution } = fireShellIntegration(terminal);
			fireExecutionEnd(mockExecution, 0);

			// Both must fire in the same synchronous tick  -  not chained via .then()
			expect(autoConfigureMCP).toHaveBeenCalled();
			expect(vscode.window.showInformationMessage).toHaveBeenCalledWith(
				expect.stringMatching(/installed|configuring/i),
			);
		});
	});

	describe("Shell Integration failure path (non-zero exit code)", () => {
		it("shows an error message when exit code is non-zero", async () => {
			await installCLIHandler?.();

			const terminal = vi.mocked(vscode.window.createTerminal).mock.results[0]?.value;
			const { mockExecution } = fireShellIntegration(terminal);
			fireExecutionEnd(mockExecution, 1);

			expect(vscode.window.showErrorMessage).toHaveBeenCalledWith(
				expect.stringMatching(/failed|exit/i),
			);
		});

		it("does NOT call autoConfigureMCP on non-zero exit", async () => {
			await installCLIHandler?.();

			const terminal = vi.mocked(vscode.window.createTerminal).mock.results[0]?.value;
			const { mockExecution } = fireShellIntegration(terminal);
			fireExecutionEnd(mockExecution, 127);

			expect(autoConfigureMCP).not.toHaveBeenCalled();
		});
	});

	describe("Fallback path (Shell Integration timeout after 3s)", () => {
		it("calls terminal.sendText when shell integration does NOT activate within 3s", async () => {
			await installCLIHandler?.();

			const terminal = vi.mocked(vscode.window.createTerminal).mock.results[0]?.value;

			// Advance past the 3s fallback timer without firing shell integration
			vi.advanceTimersByTime(3001);

			expect(terminal.sendText).toHaveBeenCalledWith(expect.stringContaining("install"));
		});

		it("fallback does NOT send text when shell integration activated before timeout", async () => {
			await installCLIHandler?.();

			const terminal = vi.mocked(vscode.window.createTerminal).mock.results[0]?.value;

			// Fire SI *before* the timer expires
			fireShellIntegration(terminal);

			// Advance past what the fallback timer would have been
			vi.advanceTimersByTime(3001);

			// sendText should NOT have been called via the fallback (SI cleared the timer)
			expect(terminal.sendText).not.toHaveBeenCalled();
		});
	});
});
