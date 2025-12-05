import * as vscode from "vscode";

/**
 * Consent modal for SnapBack extension
 * Handles first-run consent flow and privacy settings
 */
interface ConsentSettings {
	privacyConsent: boolean;
	clipboardConsent: boolean;
	watcherConsent: boolean;
	gitWrapperConsent: boolean;
	lastReminded: Date | null;
}

export namespace ConsentModal {
	/**
	 * Show the consent modal to the user
	 * @returns Promise resolving to whether consent was given
	 */
	export async function showConsentModal(): Promise<boolean> {
		const message = "Welcome to SnapBack - Intelligent Code Protection";

		const detail = `SnapBack helps protect your code by:
• Monitoring file changes for security risks
• Creating snapshots of your work
• Providing AI-powered code analysis

To function properly, SnapBack needs permission to:
• Access clipboard content (for AI context)
• Watch file system changes
• Integrate with Git workflows

You can change these settings anytime in VS Code Settings.`;

		const consentButton = "I Understand and Consent";
		const remindLaterButton = "Remind Me Later";
		const cancelButton = "Cancel";

		const selection = await vscode.window.showInformationMessage(
			message,
			{ modal: true, detail },
			consentButton,
			remindLaterButton,
			cancelButton,
		);

		switch (selection) {
			case consentButton:
				await saveConsentSettings({
					privacyConsent: true,
					clipboardConsent: true,
					watcherConsent: true,
					gitWrapperConsent: true,
					lastReminded: null,
				});
				return true;

			case remindLaterButton:
				await saveConsentSettings({
					privacyConsent: false,
					clipboardConsent: false,
					watcherConsent: false,
					gitWrapperConsent: false,
					lastReminded: new Date(),
				});
				return false;
			default:
				return false;
		}
	}

	/**
	 * Check if user has given consent
	 * @returns Promise resolving to consent status
	 */
	export async function hasGivenConsent(): Promise<boolean> {
		const config = vscode.workspace.getConfiguration("snapback.privacy");
		return config.get("consent", false);
	}

	/**
	 * Check if reminder is needed (user selected "Remind Me Later")
	 * @returns Promise resolving to whether reminder is needed
	 */
	export async function isReminderNeeded(): Promise<boolean> {
		const lastReminded = await getLastReminded();
		if (!lastReminded) {
			return false;
		}

		// Remind every 7 days
		const sevenDaysAgo = new Date();
		sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

		return lastReminded < sevenDaysAgo;
	}

	/**
	 * Get the last reminded date
	 * @returns Promise resolving to last reminded date or null
	 */
	export async function getLastReminded(): Promise<Date | null> {
		const config = vscode.workspace.getConfiguration("snapback.privacy");
		const dateString = config.get<string>("lastReminded");
		return dateString ? new Date(dateString) : null;
	}

	/**
	 * Save consent settings to workspace configuration
	 * @param settings Consent settings to save
	 */
	export async function saveConsentSettings(
		settings: ConsentSettings,
	): Promise<void> {
		const config = vscode.workspace.getConfiguration("snapback.privacy");

		await config.update(
			"consent",
			settings.privacyConsent,
			vscode.ConfigurationTarget.Global,
		);
		await config.update(
			"clipboard",
			settings.clipboardConsent,
			vscode.ConfigurationTarget.Global,
		);
		await config.update(
			"watcher",
			settings.watcherConsent,
			vscode.ConfigurationTarget.Global,
		);
		await config.update(
			"gitWrapper",
			settings.gitWrapperConsent,
			vscode.ConfigurationTarget.Global,
		);

		if (settings.lastReminded) {
			await config.update(
				"lastReminded",
				settings.lastReminded.toISOString(),
				vscode.ConfigurationTarget.Global,
			);
		} else {
			await config.update(
				"lastReminded",
				undefined,
				vscode.ConfigurationTarget.Global,
			);
		}
	}

	/**
	 * Get current consent settings
	 * @returns Promise resolving to current consent settings
	 */
	export async function getConsentSettings(): Promise<ConsentSettings> {
		const config = vscode.workspace.getConfiguration("snapback.privacy");

		return {
			privacyConsent: config.get("consent", false),
			clipboardConsent: config.get("clipboard", false),
			watcherConsent: config.get("watcher", false),
			gitWrapperConsent: config.get("gitWrapper", false),
			lastReminded: await getLastReminded(),
		};
	}

	/**
	 * Show feature-specific consent for clipboard access
	 * @returns Promise resolving to whether consent was given
	 */
	export async function showClipboardConsent(): Promise<boolean> {
		const message = "SnapBack Clipboard Access";
		const detail =
			"SnapBack needs access to your clipboard to provide context-aware AI assistance. This helps analyze code snippets and provide better protection recommendations.";

		const allowButton = "Allow Clipboard Access";
		const denyButton = "Deny";

		const selection = await vscode.window.showWarningMessage(
			message,
			{ modal: true, detail },
			allowButton,
			denyButton,
		);

		const consent = selection === allowButton;

		const config = vscode.workspace.getConfiguration("snapback.privacy");
		await config.update(
			"clipboard",
			consent,
			vscode.ConfigurationTarget.Global,
		);

		return consent;
	}

	/**
	 * Show feature-specific consent for file watcher
	 * @returns Promise resolving to whether consent was given
	 */
	export async function showWatcherConsent(): Promise<boolean> {
		const message = "SnapBack File Watching";
		const detail =
			"SnapBack needs to watch your file system to monitor changes and provide real-time protection. This helps detect potential security issues as you work.";

		const allowButton = "Allow File Watching";
		const denyButton = "Deny";

		const selection = await vscode.window.showWarningMessage(
			message,
			{ modal: true, detail },
			allowButton,
			denyButton,
		);

		const consent = selection === allowButton;

		const config = vscode.workspace.getConfiguration("snapback.privacy");
		await config.update("watcher", consent, vscode.ConfigurationTarget.Global);

		return consent;
	}

	/**
	 * Show feature-specific consent for Git wrapper
	 * @returns Promise resolving to whether consent was given
	 */
	export async function showGitWrapperConsent(): Promise<boolean> {
		const message = "SnapBack Git Integration";
		const detail =
			"SnapBack can integrate with Git to provide commit-time protection and workflow enhancements. This helps ensure your code is protected before it's committed.";

		const allowButton = "Allow Git Integration";
		const denyButton = "Deny";

		const selection = await vscode.window.showWarningMessage(
			message,
			{ modal: true, detail },
			allowButton,
			denyButton,
		);

		const consent = selection === allowButton;

		const config = vscode.workspace.getConfiguration("snapback.privacy");
		await config.update(
			"gitWrapper",
			consent,
			vscode.ConfigurationTarget.Global,
		);

		return consent;
	}
}
