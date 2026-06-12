/**
 * Tests for CeremonyWebViewProvider
 *
 * Verifies that the fallback indicator (_isFallback) is correctly set on
 * ceremony and session-list messages depending on the daemon connection state.
 *
 * DaemonBridge is stubbed with a minimal mock object  -  no real IPC.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
	CeremonyWebViewProvider,
	type CeremonyPayload,
	type WebViewInMessage,
} from "../../../src/webview/CeremonyWebViewProvider";
import type { DaemonBridge } from "../../../src/services/DaemonBridge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal DaemonBridge stub */
function makeDaemonBridgeStub(overrides: Partial<DaemonBridge> = {}): DaemonBridge {
	return {
		isConnected: vi.fn().mockReturnValue(false),
		getClosingCeremony: vi.fn().mockResolvedValue(null),
		listSessionCeremonies: vi.fn().mockResolvedValue({ sessions: [] }),
		onSessionStarted: vi.fn(),
		onSessionEnded: vi.fn(),
		onLearningAdded: vi.fn(),
		onSnapshotCreated: vi.fn(),
		...overrides,
	} as unknown as DaemonBridge;
}

/** Collect all postMessage calls on a provider instance */
function collectMessages(provider: CeremonyWebViewProvider): WebViewInMessage[] {
	const messages: WebViewInMessage[] = [];
	vi.spyOn(provider, "postMessage").mockImplementation((msg: WebViewInMessage) => {
		messages.push(msg);
	});
	return messages;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CeremonyWebViewProvider  -  _isFallback indicator", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("_loadCeremony()", () => {
		it("posts _isFallback: true in ceremony data when daemon is not connected", async () => {
			const bridge = makeDaemonBridgeStub({ isConnected: vi.fn().mockReturnValue(false) });
			const provider = new CeremonyWebViewProvider(vscode.Uri.file("/ext"), bridge);
			const messages = collectMessages(provider);

			// Access the private method via type cast
			await (provider as any)._loadCeremony("session-test");

			const ceremonyMsg = messages.find((m) => m.type === "ceremony") as
				| (WebViewInMessage & { type: "ceremony" })
				| undefined;

			expect(ceremonyMsg).toBeDefined();
			expect(ceremonyMsg?.data._isFallback).toBe(true);
			expect(ceremonyMsg?.data._fallbackReason).toBeTruthy();
		});

		it("posts _isFallback: false (absent) when daemon is connected and returns data", async () => {
			const daemonCeremony = {
				sessionId: "session-real",
				workspacePath: "/workspace",
				duration: 3600000,
				checkpointsCreated: 5,
				learningsCaptured: 3,
				tokensSaved: 20000,
				coherenceScore: "high" as const,
				topLearnings: [{ content: "co-change pattern", confidence: 0.9 }],
				fragileFilesInSession: ["src/auth.ts"],
			};

			const bridge = makeDaemonBridgeStub({
				isConnected: vi.fn().mockReturnValue(true),
				getClosingCeremony: vi.fn().mockResolvedValue(daemonCeremony),
			});
			const provider = new CeremonyWebViewProvider(vscode.Uri.file("/ext"), bridge);
			const messages = collectMessages(provider);

			await (provider as any)._loadCeremony("session-real");

			const ceremonyMsg = messages.find((m) => m.type === "ceremony") as
				| (WebViewInMessage & { type: "ceremony" })
				| undefined;

			expect(ceremonyMsg).toBeDefined();
			// Real data from daemon should NOT have _isFallback set
			expect(ceremonyMsg?.data._isFallback).toBeFalsy();
		});

		it("posts _isFallback: true when daemon is connected but returns null ceremony", async () => {
			const bridge = makeDaemonBridgeStub({
				isConnected: vi.fn().mockReturnValue(true),
				getClosingCeremony: vi.fn().mockResolvedValue(null),
			});
			const provider = new CeremonyWebViewProvider(vscode.Uri.file("/ext"), bridge);
			const messages = collectMessages(provider);

			await (provider as any)._loadCeremony("session-empty");

			const ceremonyMsg = messages.find((m) => m.type === "ceremony") as
				| (WebViewInMessage & { type: "ceremony" })
				| undefined;

			expect(ceremonyMsg).toBeDefined();
			expect(ceremonyMsg?.data._isFallback).toBe(true);
		});
	});

	describe("_loadSessionList()", () => {
		it("posts _isFallback: true on sessionList when daemon is not connected", async () => {
			const bridge = makeDaemonBridgeStub({ isConnected: vi.fn().mockReturnValue(false) });
			const provider = new CeremonyWebViewProvider(vscode.Uri.file("/ext"), bridge);
			const messages = collectMessages(provider);

			await (provider as any)._loadSessionList();

			const listMsg = messages.find((m) => m.type === "sessionList") as
				| (WebViewInMessage & { type: "sessionList" })
				| undefined;

			expect(listMsg).toBeDefined();
			expect(listMsg?._isFallback).toBe(true);
			expect(listMsg?._fallbackReason).toBeTruthy();
		});

		it("does NOT post _isFallback when daemon returns real sessions", async () => {
			// Mock workspace folders so the code doesn't fall into the "no workspace" branch
			const mockFolders = [{ uri: vscode.Uri.file("/workspace"), name: "workspace", index: 0 }];
			vi.spyOn(vscode.workspace, "workspaceFolders", "get").mockReturnValue(mockFolders as any);

			const bridge = makeDaemonBridgeStub({
				isConnected: vi.fn().mockReturnValue(true),
				listSessionCeremonies: vi.fn().mockResolvedValue({
					sessions: [
						{
							sessionId: "session-real",
							workspace: "/workspace",
							startedAt: Date.now() - 3600000,
							endedAt: Date.now(),
							snapshotCount: 3,
							restoreCount: 0,
							learningCount: 2,
							isLive: false,
						},
					],
				}),
			});
			const provider = new CeremonyWebViewProvider(vscode.Uri.file("/ext"), bridge);
			const messages = collectMessages(provider);

			await (provider as any)._loadSessionList();

			const listMsg = messages.find((m) => m.type === "sessionList") as
				| (WebViewInMessage & { type: "sessionList" })
				| undefined;

			expect(listMsg).toBeDefined();
			// Real sessions  -  no fallback indicator
			expect(listMsg?._isFallback).toBeFalsy();
		});
	});
});
