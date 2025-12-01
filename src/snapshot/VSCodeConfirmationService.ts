import type { IConfirmationService } from "../types/snapshot.js";

/**
 * VSCodeConfirmationService - Adapts VS Code dialog APIs to IConfirmationService interface
 *
 * This service provides user confirmation dialogs using VS Code's built-in UI,
 * implementing the IConfirmationService interface required by SnapshotManager.
 *
 * @example
 * ```typescript
 * const confirmationService = new VSCodeConfirmationService();
 * const confirmed = await confirmationService.confirm(
 *   'Delete snapshot?',
 *   'This action cannot be undone.'
 * );
 * ```
 */
export class VSCodeConfirmationService implements IConfirmationService {
	/**
	 * Show a confirmation dialog to the user
	 *
	 * @param message - Main confirmation message
	 * @param detail - Optional detailed description
	 * @returns Promise resolving to true if user confirms, false otherwise
	 */
	/**
	 * Show a confirmation dialog to the user - MVP MODAL REPLACEMENT
	 *
	 * MVP Note: This modal has been commented out for MVP and will be replaced with
	 * inline CodeLens + status-bar toast UI instead of full-screen modals.
	 *
	 * For context: Modal dialogs create interruption cost for users. The MVP approach
	 * uses inline banners with "Allow once · Mark wrong · Details" chips that store
	 * rationale without flow break.
	 */
	/*
	async confirm(message: string, detail?: string): Promise<boolean> {
		const options: vscode.MessageOptions = {
			modal: true,
			detail,
		};

		const result = await vscode.window.showWarningMessage(
			message,
			options,
			"Yes",
			"No",
		);

		return result === "Yes";
	}
	*/

	// MVP implementation uses inline CodeLens + status-bar toast instead of modals
	async confirm(_message: string, _detail?: string): Promise<boolean> {
		// In MVP, confirmation is handled via inline UI elements
		// This function is a placeholder that will be replaced with inline implementation
		throw new Error("Confirmation modal replaced with inline UI in MVP");
	}
}
