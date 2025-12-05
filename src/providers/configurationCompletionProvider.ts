import * as vscode from "vscode";

export class ConfigurationCompletionProvider
	implements vscode.CompletionItemProvider
{
	provideCompletionItems(
		document: vscode.TextDocument,
		position: vscode.Position,
	): vscode.ProviderResult<vscode.CompletionItem[]> {
		if (!document.fileName.endsWith(".snapbackrc")) {
			return [];
		}

		const linePrefix = document
			.lineAt(position)
			.text.substring(0, position.character);

		if (linePrefix.includes('"pattern"')) {
			return this.getPatternCompletions();
		}

		if (linePrefix.includes('"level"')) {
			return this.getLevelCompletions();
		}

		if (linePrefix.includes('"settings"')) {
			return this.getSettingsCompletions();
		}

		return [];
	}

	private getPatternCompletions(): vscode.CompletionItem[] {
		const patterns: Array<{ label: string; detail: string }> = [
			{ label: "**/*.env*", detail: "Environment files" },
			{ label: "**/package.json", detail: "Package configuration" },
			{ label: "**/*.config.js", detail: "General configuration files" },
			{ label: "src/**/*.ts", detail: "TypeScript source files" },
			{ label: "**/*.test.ts", detail: "Test files" },
			{ label: "!node_modules/**", detail: "Exclude node_modules" },
		];

		return patterns.map((pattern) => {
			const item = new vscode.CompletionItem(
				pattern.label,
				vscode.CompletionItemKind.Value,
			);
			item.detail = pattern.detail;
			item.insertText = `"${pattern.label}"`;
			return item;
		});
	}

	private getLevelCompletions(): vscode.CompletionItem[] {
		const levels: Array<{
			label: "Watched" | "Warning" | "Protected";
			detail: string;
			documentation: string;
		}> = [
			{
				label: "Watched",
				detail: "Monitor changes",
				documentation: "Monitor file changes and capture snapshots silently.",
			},
			{
				label: "Warning",
				detail: "Require confirmation",
				documentation: "Ask for confirmation before saving protected files.",
			},
			{
				label: "Protected",
				detail: "Prevent direct modifications",
				documentation:
					"Require explicit override before saving protected files.",
			},
		];

		return levels.map((level) => {
			const item = new vscode.CompletionItem(
				level.label,
				vscode.CompletionItemKind.EnumMember,
			);
			item.detail = level.detail;
			item.documentation = new vscode.MarkdownString(level.documentation);
			item.insertText = `"${level.label}"`;
			return item;
		});
	}

	private getSettingsCompletions(): vscode.CompletionItem[] {
		const settings: Array<{
			label: string;
			detail: string;
			defaultValue: string;
			documentation: string;
		}> = [
			{
				label: "maxSnapshots",
				detail: "number",
				defaultValue: "100",
				documentation: "Maximum number of snapshots to retain.",
			},
			{
				label: "compressionEnabled",
				detail: "boolean",
				defaultValue: "true",
				documentation: "Enable compression for stored snapshots.",
			},
			{
				label: "autoSnapshotInterval",
				detail: "number",
				defaultValue: "0",
				documentation:
					"Milliseconds between automatic snapshots (0 disables automatic snapshots).",
			},
			{
				label: "defaultProtectionLevel",
				detail: "ProtectionLevel",
				defaultValue: '"Watched"',
				documentation: "Default protection level for new files.",
			},
			{
				label: "snapback.snapshot.maxSnapshots",
				detail: "number",
				defaultValue: "100",
				documentation: "Maximum number of snapshots to retain.",
			},
			{
				label: "snapback.snapshot.compressionEnabled",
				detail: "boolean",
				defaultValue: "true",
				documentation: "Enable compression for stored snapshots.",
			},
			{
				label: "snapback.snapshot.autoInterval",
				detail: "number",
				defaultValue: "0",
				documentation:
					"Milliseconds between automatic snapshots (0 disables automatic snapshots).",
			},
			{
				label: "maxSnapshots",
				detail: "number",
				defaultValue: "100",
				documentation: "Maximum number of snapshots to retain.",
			},
			{
				label: "compressionEnabled",
				detail: "boolean",
				defaultValue: "true",
				documentation: "Enable compression for stored snapshots.",
			},
			{
				label: "autoSnapshotInterval",
				detail: "number",
				defaultValue: "0",
				documentation:
					"Milliseconds between automatic snapshots (0 disables automatic snapshots).",
			},
			{
				label: "defaultProtectionLevel",
				detail: "ProtectionLevel",
				defaultValue: '"Watched"',
				documentation: "Default protection level for new files.",
			},
		];

		return settings.map((setting) => {
			const item = new vscode.CompletionItem(
				setting.label,
				vscode.CompletionItemKind.Property,
			);
			item.detail = `${setting.detail} (default: ${setting.defaultValue})`;
			item.documentation = new vscode.MarkdownString(setting.documentation);
			item.insertText = `"${setting.label}": ${setting.defaultValue}`;
			return item;
		});
	}
}
