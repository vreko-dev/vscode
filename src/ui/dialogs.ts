import * as vscode from "vscode";

export interface BlockDialogOptions {
	fileName: string;
	filePath: string;
	protectionLevel: string;
	riskScore?: number;
	reasons?: string[];
	diagnosticMessage?: string;
}

/**
 * Utility functions for showing SnapBack dialogs
 */
export namespace SnapBackDialogs {
	/**
	 * Show a blocking dialog that requires user action
	 */
	export async function showBlockDialog(
		options: BlockDialogOptions,
	): Promise<"continue" | "createSnapshot" | "cancel"> {
		const message = `Save blocked for ${options.fileName} (${options.protectionLevel} level)`;
		const detail = generateDialogDetail(options);

		// Create a custom dialog with proper ARIA attributes
		const selection = await vscode.window.showErrorMessage(
			message,
			{
				modal: true,
				detail,
			},
			"Continue",
			"Create Snapshot & Continue",
			"Cancel Save",
		);

		switch (selection) {
			case "Continue":
				return "continue";
			case "Create Snapshot & Continue":
				return "createSnapshot";
			case "Cancel Save":
				return "cancel";
			default:
				return "cancel";
		}
	}

	/**
	 * Show an override dialog that collects justification
	 */
	export async function showOverrideDialog(
		_options: BlockDialogOptions,
	): Promise<
		{ action: "override"; justification: string } | { action: "cancel" }
	> {
		// Show dialog with input box for justification
		const justification = await vscode.window.showInputBox({
			prompt: "Enter justification for overriding this protection",
			placeHolder: "Briefly explain why this change is safe...",
			ignoreFocusOut: true,
			validateInput: (value: string) => {
				if (!value || value.trim().length < 5) {
					return "Justification must be at least 5 characters";
				}
				return null;
			},
		});

		if (justification) {
			return { action: "override", justification };
		}

		return { action: "cancel" };
	}

	/**
	 * Generate detailed message for dialogs
	 */
	function generateDialogDetail(options: BlockDialogOptions): string {
		const lines: string[] = [];

		if (options.diagnosticMessage) {
			lines.push(`Issue: ${options.diagnosticMessage}`);
		}

		if (options.riskScore !== undefined) {
			lines.push(`Risk Score: ${options.riskScore}/10`);
		}

		if (options.reasons && options.reasons.length > 0) {
			lines.push(`Reasons: ${options.reasons.join(", ")}`);
		}

		lines.push("");
		lines.push("Choose an action:");
		lines.push("- Continue: Save without snapshot (not recommended)");
		lines.push(
			"- Create Snapshot & Continue: Save and create a snapshot for rollback",
		);
		lines.push("- Cancel Save: Abort this save operation");

		return lines.join("\n");
	}

	/**
	 * Show accessibility warning dialog
	 */
	export async function showAccessibilityWarning(
		message: string,
	): Promise<void> {
		await vscode.window.showWarningMessage(message, {
			modal: true,
		});
	}

	/**
	 * Create a focus-trapped modal dialog
	 * Note: VS Code's built-in dialogs already implement focus trapping
	 * This is a placeholder for potential custom implementations
	 */
	export function createFocusTrappedDialog(options: {
		title: string;
		message: string;
		buttons: string[];
	}): Thenable<string | undefined> {
		// For now, we'll use VS Code's built-in modal dialogs which already have focus trapping
		return vscode.window.showInformationMessage(
			options.title,
			{
				modal: true,
				detail: options.message,
			},
			...options.buttons,
		);
	}
}
