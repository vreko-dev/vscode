/**
 * @fileoverview Protection Level Notifications
 *
 * Handles notifications related to file protection levels with acknowledgment support.
 * Prevents notification spam while respecting user's "Don't show again" preferences.
 */

import * as path from "node:path";
import * as vscode from "vscode";
import type { ProtectionLevel } from "../views/types.js";
import { NotificationAcknowledgment } from "./acknowledgment.js";

/**
 * Map from extension's protection level names to notification emoji
 */
const LEVEL_EMOJI: Record<ProtectionLevel, string> = {
	Watched: "👁️",
	Warning: "⚠️",
	Protected: "🛑",
};

/**
 * Manages notifications for protection level changes and status.
 * Persists user preferences (e.g., "don't show again" selections).
 */
export class ProtectionNotifications {
	private readonly ack: NotificationAcknowledgment;

	constructor(globalState: vscode.Memento) {
		this.ack = new NotificationAcknowledgment(globalState);
	}

	/**
	 * Show notification when a file's protection level is set or detected.
	 * Respects "Don't show again" preferences persisted in globalState.
	 *
	 * @param filePath The file that is protected
	 * @param level The protection level (Watched, Warning, Protected)
	 * @param isNewProtection Whether this is newly applied (vs. existing)
	 */
	async showProtectionLevelNotification(
		filePath: string,
		level: ProtectionLevel,
		isNewProtection: boolean = false,
	): Promise<void> {
		const notificationId = "protection-level";
		const scope = `${filePath}:${level}`;

		// Check if already acknowledged for this file+level combo
		if (!isNewProtection && this.ack.isAcknowledged(notificationId, scope)) {
			return; // User said "Don't show again" for this file at this level
		}

		const fileName = path.basename(filePath);
		const levelEmoji = LEVEL_EMOJI[level];
		const message = isNewProtection
			? `${levelEmoji} "${fileName}" is now protected at ${level} level`
			: `${levelEmoji} "${fileName}" is protected at ${level} level`;

		const buttons = isNewProtection
			? ["Got it"] // New protection: just acknowledge
			: ["Got it", "Don't show again"]; // Existing: allow permanent dismiss

		const result = await vscode.window.showInformationMessage(
			message,
			...buttons,
		);

		// Handle "Don't show again" selection
		if (result === "Don't show again") {
			await this.ack.acknowledge(notificationId, scope);
		}
	}

	/**
	 * Show notification when protection level changes.
	 * Always shows (no acknowledgment check) because it's a state change.
	 */
	async showProtectionLevelChanged(
		filePath: string,
		oldLevel: ProtectionLevel,
		newLevel: ProtectionLevel,
	): Promise<void> {
		const fileName = path.basename(filePath);
		const newEmoji = LEVEL_EMOJI[newLevel];

		const message = `${newEmoji} "${fileName}" protection changed: ${oldLevel} → ${newLevel}`;

		// Always show level changes, but don't block
		void vscode.window.showInformationMessage(message, "Got it").then(() => {
			// Reset acknowledgment since level changed
			const scope = `${filePath}:${newLevel}`;
			void this.ack.reset("protection-level", scope);
		});
	}

	/**
	 * Reset acknowledgment for a specific protection notification.
	 * Used when the protection level changes or user resets preferences.
	 */
	async resetAcknowledgment(
		filePath: string,
		level?: ProtectionLevel,
	): Promise<void> {
		const notificationId = "protection-level";
		if (level) {
			const scope = `${filePath}:${level}`;
			await this.ack.reset(notificationId, scope);
		} else {
			// Reset for all levels
			for (const lv of [
				"Watched",
				"Warning",
				"Protected",
			] as ProtectionLevel[]) {
				const scope = `${filePath}:${lv}`;
				await this.ack.reset(notificationId, scope);
			}
		}
	}
}
