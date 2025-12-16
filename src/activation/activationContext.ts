import type * as vscode from "vscode";
import type { IStorageManager } from "../storage/types.js";

export interface ActivationContext {
	context: vscode.ExtensionContext;
	outputChannel: vscode.OutputChannel;
	workspaceRoot: string;
	storage: IStorageManager;

	// Services will be added as they're initialized
}
