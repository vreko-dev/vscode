import * as path from "node:path";
import * as vscode from "vscode";
import { logger } from "../utils/logger";

/**
 * Centralized registry of all View IDs used in the extension.
 * Use these constants instead of hardcoded strings to ensure consistency.
 *
 * Per communication_matrix.md Section 4:
 * - ONE sidebar view only (overlap is a bug)
 * - Structure: Status → Today → Yesterday → This Week
 */
// View IDs for Vreko sidebar components
// cockpit: Tree view for Session History and Intelligence
export const VIEW_IDS: Record<string, string> = {
	cockpit: "vreko.cockpit",
};

/**
 * A branded splash screen tree provider that shows the Vreko logo.
 * Used during extension activation before the real providers are ready.
 * Creates a professional loading experience instead of generic text.
 */
class SplashTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	private readonly _onDidChangeTreeData = new vscode.EventEmitter<vscode.TreeItem | undefined>();
	readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

	constructor(private context: vscode.ExtensionContext) {
		/* intentionally empty */
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): vscode.TreeItem[] {
		const items: vscode.TreeItem[] = [];

		// Logo item with Vreko branding
		const logoItem = new vscode.TreeItem("Vreko");
		logoItem.iconPath = this.getLogoPath();
		logoItem.description = "Loading...";
		logoItem.contextValue = "splash";
		items.push(logoItem);

		// Loading indicator
		const loadingItem = new vscode.TreeItem("Initializing...");
		loadingItem.iconPath = new vscode.ThemeIcon("loading~spin");
		loadingItem.description = "";
		items.push(loadingItem);

		return items;
	}

	private getLogoPath(): vscode.Uri {
		// Use the Vreko logo from media folder
		return vscode.Uri.file(path.join(this.context.extensionPath, "media", "vreko-logo.png"));
	}
}

/**
 * A placeholder tree provider that shows a loading state.
 * Used during extension activation before the real providers are ready.
 * @deprecated Use SplashTreeProvider for branded loading experience
 */
class _LoadingTreeProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
	constructor(private message: string) {
		/* intentionally empty */
	}

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
	constructor(private error: Error) {
		/* intentionally empty */
	}

	getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
		return element;
	}

	getChildren(): vscode.TreeItem[] {
		const item = new vscode.TreeItem("❌ Activation Failed");
		item.description = this.error.message;
		item.tooltip = new vscode.MarkdownString(
			`**Error**: ${this.error.message}

` +
				`**Stack**:
\`\`\`
${this.error.stack}
\`\`\``,
		);
		return [item];
	}
}

/**
 * Registers branded splash screen views for all known View IDs.
 * Call this immediately at the start of activation to ensure views are registered
 * before VS Code tries to render them.
 */
export function registerEmptyViews(context: vscode.ExtensionContext): void {
	const splashProvider = new SplashTreeProvider(context);

	Object.values(VIEW_IDS).forEach((viewId) => {
		try {
			context.subscriptions.push(vscode.window.registerTreeDataProvider(viewId, splashProvider));
		} catch (error) {
			// Ignore "already registered" errors if hot reloading
			logger.warn(`Failed to register splash view for ${viewId}`, { error });
		}
	});
}

/**
 * Updates all views to show an error message.
 * Call this if activation fails.
 */
export function showErrorInViews(_context: vscode.ExtensionContext, error: Error): void {
	const errorProvider = new ErrorTreeProvider(error);

	Object.values(VIEW_IDS).forEach((viewId) => {
		try {
			// We don't push to subscriptions here because we're overwriting
			// the previous registration (which is allowed for TreeDataProviders)
			vscode.window.registerTreeDataProvider(viewId, errorProvider);
		} catch (e) {
			logger.error(`Failed to show error in view ${viewId}`, e instanceof Error ? e : undefined);
		}
	});
}
