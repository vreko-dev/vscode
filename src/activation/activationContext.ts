import type * as vscode from "vscode";
import type { StorageManager } from "../storage/StorageManager.js";

export interface ActivationContext {
	context: vscode.ExtensionContext;
	outputChannel: vscode.OutputChannel;
	workspaceRoot: string;
	storage: StorageManager;

	// Services will be added as they're initialized
}
