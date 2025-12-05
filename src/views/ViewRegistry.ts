import * as vscode from "vscode";

/**
 * Centralized registry of all View IDs used in the extension.
 * Use these constants instead of hardcoded strings to ensure consistency.
 */
export const VIEW_IDS = {
	PROTECTED_FILES: "snapback.protectedFiles",
	DASHBOARD: "snapback.dashboard",
	SESSIONS: "snapback.sessions",
	EXPLORER: "snapback.explorer",
} as const;

/**
 * A placeholder tree provider that shows a loading state.
 * Used during extension activation before the real providers are ready.
 */
class LoadingTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	constructor(private message: string) {}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): vscode.TreeItem[] {
		const item = new vscode.TreeItem(this.message);
		item.iconPath = new vscode.ThemeIcon("loading~spin");
		return [item];
	}
}

/**
 * A placeholder tree provider that shows an error state.
 * Used if extension activation fails.
 */
class ErrorTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	constructor(private error: Error) {}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): vscode.TreeItem[] {
		const item = new vscode.TreeItem("❌ Activation Failed");
		item.description = this.error.message;
		item.tooltip = new vscode.MarkdownString(
			`**Error**: ${this.error.message}\n\n` +
				`**Stack**:\n\`\`\`\n${this.error.stack}\n\`\`\``,
		);
		return [item];
	}
}

/**
 * Registers placeholder "Loading..." views for all known View IDs.
 * Call this immediately at the start of activation to ensure views are registered
 * before VS Code tries to render them.
 */
export function registerEmptyViews(context: vscode.ExtensionContext): void {
	const loadingProvider = new LoadingTreeProvider("Initializing SnapBack...");

	Object.values(VIEW_IDS).forEach((viewId) => {
		try {
			context.subscriptions.push(
				vscode.window.registerTreeDataProvider(viewId, loadingProvider),
			);
		} catch (error) {
			// Ignore "already registered" errors if hot reloading
			console.warn(`Failed to register loading view for ${viewId}:`, error);
		}
	});
}

/**
 * Updates all views to show an error message.
 * Call this if activation fails.
 */
export function showErrorInViews(
	_context: vscode.ExtensionContext,
	error: Error,
): void {
	const errorProvider = new ErrorTreeProvider(error);

	Object.values(VIEW_IDS).forEach((viewId) => {
		try {
			// We don't push to subscriptions here because we're overwriting
			// the previous registration (which is allowed for TreeDataProviders)
			vscode.window.registerTreeDataProvider(viewId, errorProvider);
		} catch (e) {
			console.error(`Failed to show error in view ${viewId}:`, e);
		}
	});
}
