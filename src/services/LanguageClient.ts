/**
 * SnapBack Language Client
 *
 * Spawns and communicates with the language server for heavy compute operations.
 * Only activated when advanced features are needed.
 *
 * @module languageClient
 */

import * as path from "node:path";
import * as vscode from "vscode";
import {
	LanguageClient,
	type LanguageClientOptions,
	type ServerOptions,
	TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

/**
 * Activate the language server (lazy-loaded)
 */
export async function activateLanguageServer(context: vscode.ExtensionContext): Promise<void> {
	if (client) {
		return; // Already activated
	}

	// Path to the server module (will be bundled separately by esbuild)
	const serverModule = context.asAbsolutePath(path.join("dist", "server", "index.js"));

	// Server options for run and debug modes
	const serverOptions: ServerOptions = {
		run: { module: serverModule, transport: TransportKind.ipc },
		debug: {
			module: serverModule,
			transport: TransportKind.ipc,
			options: { execArgv: ["--nolazy", "--inspect=6009"] }, // Allow debugging
		},
	};

	// Client options
	const clientOptions: LanguageClientOptions = {
		// Document selector - we handle all file types for workspace analysis
		documentSelector: [{ scheme: "file", pattern: "**/*" }],
		synchronize: {
			// Notify server of .snapback config changes
			fileEvents: vscode.workspace.createFileSystemWatcher("**/.snapbackrc"),
		},
	};

	// Create and start the language client
	client = new LanguageClient("snapbackLanguageServer", "SnapBack Language Server", serverOptions, clientOptions);

	await client.start();
	console.log("SnapBack Language Server started");
}

/**
 * Deactivate the language server
 */
export async function deactivateLanguageServer(): Promise<void> {
	if (!client) {
		return;
	}

	await client.stop();
	client = undefined;
	console.log("SnapBack Language Server stopped");
}

/**
 * Get the language client (if active)
 */
export function getLanguageClient(): LanguageClient | undefined {
	return client;
}

/**
 * Check if the language server is active
 */
export function isLanguageServerActive(): boolean {
	return client !== undefined;
}

/**
 * Send a custom request to the language server
 */
export async function sendRequest<P, R>(method: string, params: P): Promise<R> {
	if (!client) {
		throw new Error("Language server not active");
	}

	return client.sendRequest(method, params);
}

/**
 * Validate code using the language server
 */
export async function validateCode(
	code: string,
	filePath: string,
): Promise<{
	success: boolean;
	result?: unknown;
	error?: string;
}> {
	return sendRequest("snapback/validate", { code, filePath });
}

/**
 * Get workspace vitals from the language server
 */
export async function getWorkspaceVitals(): Promise<{
	success: boolean;
	vitals?: unknown;
	guidance?: unknown;
	snapshotDecision?: unknown;
	error?: string;
}> {
	return sendRequest("snapback/vitals", {});
}
