import * as vscode from "vscode";
import { logger } from "../utils/logger";
import type { SnapBackSession } from "./OAuthProvider";

/**
 * Mock Authentication Provider for E2E Testing
 *
 * Simulates a successful SnapBack authentication flow without
 * requiring browser interaction or a real backend.
 */
export class MockAuthProvider implements vscode.AuthenticationProvider {
	private static readonly AUTH_PROVIDER_ID = "snapback";
	private static readonly AUTH_PROVIDER_LABEL = "SnapBack (Mock)";

	private _onDidChangeSessions =
		new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();
	public readonly onDidChangeSessions = this._onDidChangeSessions.event;

	private _currentSession: SnapBackSession | undefined;

	async getSessions(
		_scopes?: readonly string[],
		_options?: vscode.AuthenticationProviderSessionOptions,
	): Promise<vscode.AuthenticationSession[]> {
		if (this._currentSession) {
			return [this._currentSession];
		}
		return [];
	}

	async createSession(
		scopes: readonly string[],
		_options?: vscode.AuthenticationProviderSessionOptions,
	): Promise<SnapBackSession> {
		console.log("🎭 MockAuthProvider.createSession called!", { scopes });
		logger.info("[MockAuth] Creating mock session", { scopes });

		// Create a fake session immediately
		const session: SnapBackSession = {
			id: "mock-session-id",
			accessToken: "mock-access-token",
			refreshToken: "mock-refresh-token",
			expiresAt: Date.now() + 3600 * 1000, // 1 hour
			account: {
				id: "mock-user-id",
				label: "Test User (Mock)",
			},
			scopes: scopes as string[],
		};

		this._currentSession = session;

		this._onDidChangeSessions.fire({
			added: [session],
			removed: [],
			changed: [],
		});

		logger.info("[MockAuth] Mock session created successfully");
		return session;
	}

	async removeSession(sessionId: string): Promise<void> {
		logger.info("[MockAuth] Removing mock session", { sessionId });

		if (this._currentSession?.id === sessionId) {
			const previousSession = this._currentSession;
			this._currentSession = undefined;

			this._onDidChangeSessions.fire({
				added: [],
				removed: [previousSession],
				changed: [],
			});
		}
	}

	static register(context: vscode.ExtensionContext): vscode.Disposable {
		const provider = new MockAuthProvider();

		// Register with the SAME ID as the real provider so other components don't care
		const disposable = vscode.authentication.registerAuthenticationProvider(
			MockAuthProvider.AUTH_PROVIDER_ID,
			MockAuthProvider.AUTH_PROVIDER_LABEL,
			provider,
			{
				supportsMultipleAccounts: false,
			},
		);

		context.subscriptions.push(disposable);
		logger.info("SnapBack MOCK OAuth provider registered");

		return disposable;
	}
}
