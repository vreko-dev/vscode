/**
 * @fileoverview Unified Auth Provider (Proxy Pattern)
 *
 * This provider acts as a traffic cop between VS Code and the actual auth logic.
 * It registers ONCE with VS Code (claiming the 'snapback' ID permanently) and
 * delegates all requests to either the Real or Mock auth provider based on
 * the current test mode setting.
 *
 * This solves the "Provider Locking" limitation where VS Code doesn't allow
 * re-registering providers with the same ID.
 *
 * @see Design Pattern: Strategy/Proxy Pattern
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";
import { MockAuthProvider } from "./MockAuthProvider";
import type { SnapBackSession } from "./OAuthProvider";
import { SnapBackOAuthProvider } from "./OAuthProvider";

export class UnifiedAuthProvider implements vscode.AuthenticationProvider {
	private _delegate: vscode.AuthenticationProvider;

	// The "Main" emitter that VS Code listens to
	private _onDidChangeSessions =
		new vscode.EventEmitter<vscode.AuthenticationProviderAuthenticationSessionsChangeEvent>();

	// Track the delegate's event listener for cleanup when swapping
	private _delegateDisposable: vscode.Disposable | undefined;

	// Track current mode for logging
	private _isTestMode: boolean;

	constructor(
		private readonly context: vscode.ExtensionContext,
		initialTestMode = false,
	) {
		// DECIDE IMMEDIATELY at construction - no "default and switch later" race condition
		this._isTestMode = initialTestMode;

		if (initialTestMode) {
			console.log("🏗️ UnifiedProxy: Constructed in MOCK mode");
			logger.info("UnifiedAuthProvider initialized with MOCK provider");
			this._delegate = new MockAuthProvider();
		} else {
			console.log("🏗️ UnifiedProxy: Constructed in REAL mode");
			logger.info("UnifiedAuthProvider initialized with REAL provider");
			this._delegate = new SnapBackOAuthProvider(context);
		}
		this.bindDelegateEvents();
	}

	get onDidChangeSessions() {
		return this._onDidChangeSessions.event;
	}

	/**
	 * Hook up the delegate's events to our main emitter.
	 * When the delegate fires "Session Added", we propagate it to VS Code.
	 */
	private bindDelegateEvents() {
		// Unsubscribe from previous delegate if exists
		if (this._delegateDisposable) {
			this._delegateDisposable.dispose();
		}

		this._delegateDisposable = this._delegate.onDidChangeSessions((e) => {
			logger.info("🔔 UnifiedProxy: Delegate fired onDidChangeSessions", {
				added: e.added?.length ?? 0,
				removed: e.removed?.length ?? 0,
			});
			this._onDidChangeSessions.fire(e);
		});
	}

	/**
	 * The Switch: Swaps the auth engine at runtime.
	 *
	 * This is called when 'snapback.testMode' config changes.
	 * @param isTest - Whether to use Mock (true) or Real (false) auth
	 */
	public setTestMode(isTest: boolean): void {
		console.log(`🔀 setTestMode called: isTest=${isTest}, current=${this._isTestMode}`);

		if (isTest === this._isTestMode) {
			// No change, skip
			console.log("🔀 setTestMode: No change, skipping");
			return;
		}

		this._isTestMode = isTest;

		if (isTest) {
			console.log("🔀 Creating new MockAuthProvider...");
			logger.info("🔀 UnifiedAuthProvider: Switching to MOCK Strategy");
			this._delegate = new MockAuthProvider();
		} else {
			console.log("🔀 Creating new SnapBackOAuthProvider...");
			logger.info("🔀 UnifiedAuthProvider: Switching to REAL Strategy");
			this._delegate = new SnapBackOAuthProvider(this.context);
		}

		// Re-bind the event listeners to the new delegate
		this.bindDelegateEvents();
		console.log("🔀 setTestMode completed, delegate is now:", isTest ? "MOCK" : "REAL");

		// Force VS Code to refresh its session list
		// Firing empty event wakes up the UI
		this._onDidChangeSessions.fire({ added: [], removed: [], changed: [] });
	}

	/**
	 * Check if currently in test mode
	 */
	public get isTestMode(): boolean {
		return this._isTestMode;
	}

	// --- Delegation Methods (Pass-throughs to the active delegate) ---

	getSessions(
		scopes?: readonly string[],
		options?: vscode.AuthenticationProviderSessionOptions,
	): Thenable<vscode.AuthenticationSession[]> {
		return this._delegate.getSessions(scopes, options ?? {}) as Thenable<vscode.AuthenticationSession[]>;
	}

	createSession(
		scopes: readonly string[],
		options: vscode.AuthenticationProviderSessionOptions,
	): Thenable<SnapBackSession> {
		logger.info("🔍 UnifiedProxy: createSession called", { isTestMode: this._isTestMode });
		return (this._delegate.createSession(scopes, options) as Promise<SnapBackSession>).then((session) => {
			logger.info("✅ UnifiedProxy: Delegate created session", { sessionId: session.id });
			return session;
		});
	}

	removeSession(sessionId: string): Thenable<void> {
		return this._delegate.removeSession(sessionId);
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		this._delegateDisposable?.dispose();
		this._onDidChangeSessions.dispose();
	}
}
