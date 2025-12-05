import * as path from "node:path";
import * as vscode from "vscode";
import type { SnapBackRCDecorator } from "../decorators/snapbackrcDecorator.js";
import type { ProtectedFileRegistry } from "../services/protectedFileRegistry.js";

export class AutoProtectConfig implements vscode.Disposable {
	private readonly configFileName = ".snapbackrc";
	private watcher: vscode.FileSystemWatcher | null = null;

	constructor(
		private readonly protectedFileRegistry: ProtectedFileRegistry,
		private readonly workspaceRoot: string,
		private readonly context: vscode.ExtensionContext,
		private readonly decorator: SnapBackRCDecorator,
	) {}

	async initialize(): Promise<void> {
		await this.protectExisting();
		this.watchForCreation();
		this.monitorProtectionChanges();
	}

	dispose(): void {
		this.watcher?.dispose();
	}

	private async protectExisting(): Promise<void> {
		const configPath = path.join(this.workspaceRoot, this.configFileName);
		const uri = vscode.Uri.file(configPath);

		try {
			await vscode.workspace.fs.stat(uri);

			const existingLevel =
				this.protectedFileRegistry.getProtectionLevel(configPath);

			if (!existingLevel) {
				await this.protectedFileRegistry.add(configPath, {
					protectionLevel: "Warning",
				});
			}

			this.decorator.updateProtectionLevel(existingLevel ?? "Warning");

			await this.showProtectionNotification();
		} catch {
			// File not present yet, start watcher
			this.decorator.updateProtectionLevel("Warning");
		}
	}

	private watchForCreation(): void {
		const pattern = new vscode.RelativePattern(
			this.workspaceRoot,
			this.configFileName,
		);
		this.watcher = vscode.workspace.createFileSystemWatcher(pattern);

		this.watcher.onDidCreate(async (uri) => {
			await new Promise((resolve) => setTimeout(resolve, 100));

			await this.protectedFileRegistry.add(uri.fsPath, {
				protectionLevel: "Warning",
			});
			this.decorator.updateProtectionLevel("Warning");

			const choice = await vscode.window.showInformationMessage(
				"\u{1f7e1} .snapbackrc created and auto-protected at Warn level",
				"Edit Configuration",
				"Learn More",
			);

			if (choice === "Edit Configuration") {
				const doc = await vscode.workspace.openTextDocument(uri);
				const editor = await vscode.window.showTextDocument(doc);
				if (doc.getText().trim() === "") {
					await this.insertConfigTemplate(editor.document);
				}
			} else if (choice === "Learn More") {
				await vscode.env.openExternal(
					vscode.Uri.parse("https://docs.snapback.dev/configuration"),
				);
			}
		});
	}

	private monitorProtectionChanges(): void {
		this.protectedFileRegistry.onProtectionChanged((uris) => {
			const configPath = path.join(this.workspaceRoot, this.configFileName);

			for (const uri of uris) {
				if (uri.fsPath !== configPath) {
					continue;
				}

				const level = this.protectedFileRegistry.getProtectionLevel(configPath);

				if (level) {
					this.decorator.updateProtectionLevel(level);
				} else {
					// Don't update decorator when file is unprotected to avoid visual inconsistency
					// Show warning message to user but don't change the visual indicator
					vscode.window
						.showWarningMessage(
							"\u{26a0} .snapbackrc should remain protected to prevent accidental changes",
							"Re-protect",
						)
						.then(async (choice) => {
							if (choice === "Re-protect") {
								await this.protectedFileRegistry.add(configPath, {
									protectionLevel: "Warning",
								});
							}
						});
				}
			}
		});
	}

	private async showProtectionNotification(): Promise<void> {
		const key = `snapback.configProtected:${this.workspaceRoot}`;
		if (this.context.workspaceState.get(key)) {
			return;
		}

		const choice = await vscode.window.showInformationMessage(
			"\u{1f7e1} .snapbackrc is protected at Warn level to prevent accidental changes",
			"Got It",
			"Don't Show Again",
		);

		if (choice === "Don't Show Again") {
			await this.context.workspaceState.update(key, true);
		}
	}

	private async insertConfigTemplate(
		document: vscode.TextDocument,
	): Promise<void> {
		const template = `{
  // SnapBack Configuration
  // Documentation: https://docs.snapback.dev/configuration

  "protection": [
    { "pattern": "**/*.env*", "level": "Protected", "reason": "Environment variables" },
    { "pattern": "**/package.json", "level": "Warning", "reason": "Dependencies" },
    { "pattern": "**/tsconfig.json", "level": "Warning", "reason": "TypeScript config" },
    { "pattern": "src/**/*.ts", "level": "Watched" }
  ],

  "ignore": [
    "node_modules/**",
    "dist/**",
    "build/**",
    ".git/**",
    "*.log",
    "*.tmp",
    ".snapback/**"
  ],

  "settings": {
    "maxSnapshots": 100,
    "compressionEnabled": true,
    "notificationDuration": 1000,
    "defaultProtectionLevel": "Watched"
  }
}`;

		const edit = new vscode.WorkspaceEdit();
		edit.insert(document.uri, new vscode.Position(0, 0), template);
		await vscode.workspace.applyEdit(edit);
	}
}
