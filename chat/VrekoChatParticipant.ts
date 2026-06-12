/**
 * Vreko Chat Participant - AI-powered assistant for Vreko
 *
 * Provides natural language interface to Vreko features:
 * - "@vreko show activity from today"
 * - "@vreko what files changed in the last session?"
 * - "@vreko protect this file"
 * - "@vreko show status"
 *
 * @module chat/VrekoChatParticipant
 */

import * as path from "node:path";
import * as vscode from "vscode";
import type { ActivityPersistenceService } from "../services/ActivityPersistenceService";
import type { IStorageManager } from "../storage/types";
import { logger } from "../utils/logger";

/**
 * Chat result metadata
 */
interface VrekoChatResult extends vscode.ChatResult {
	metadata: {
		command?: string;
	};
}

/**
 * Vreko Chat Participant
 *
 * Integrates with GitHub Copilot Chat via the Chat Participant API.
 * Users invoke with @vreko in the chat input.
 */
export class VrekoChatParticipant implements vscode.Disposable {
	public static readonly participantId = "vreko";
	public static readonly displayName = "Vreko";

	private disposables: vscode.Disposable[] = [];
	private participant: vscode.ChatParticipant | undefined;

	constructor(
		private readonly context: vscode.ExtensionContext,
		private readonly storageManager: IStorageManager,
		private readonly activityPersistenceService?: ActivityPersistenceService,
	) {
		/* intentionally empty */
	}

	/**
	 * Register the chat participant
	 */
	register(): void {
		try {
			// Check if chat API is available (VS Code 1.90+)
			if (!vscode.chat?.createChatParticipant) {
				logger.warn("Chat Participant API not available (requires VS Code 1.90+)");
				return;
			}

			this.participant = vscode.chat.createChatParticipant(
				VrekoChatParticipant.participantId,
				this.handleRequest.bind(this),
			);

			this.participant.iconPath = vscode.Uri.joinPath(this.context.extensionUri, "media", "icon.png");

			this.participant.followupProvider = {
				provideFollowups: this.provideFollowups.bind(this),
			};

			this.disposables.push(this.participant);

			logger.info("Vreko Chat Participant registered");
		} catch (error) {
			logger.error("Failed to register Chat Participant:", error as Error);
		}
	}

	/**
	 * Handle chat requests
	 */
	private async handleRequest(
		request: vscode.ChatRequest,
		_chatContext: vscode.ChatContext,
		stream: vscode.ChatResponseStream,
		_token: vscode.CancellationToken,
	): Promise<VrekoChatResult> {
		const prompt = request.prompt.toLowerCase().trim();

		// Show progress indicator
		stream.progress("Thinking...");

		try {
			// Route to appropriate handler based on intent
			if (this.isActivityQuery(prompt)) {
				return await this.handleActivityQuery(prompt, stream);
			}

			if (this.isStatusQuery(prompt)) {
				return await this.handleStatusQuery(stream);
			}

			if (this.isProtectCommand(prompt)) {
				return await this.handleProtectCommand(prompt, stream);
			}

			if (this.isSnapshotQuery(prompt)) {
				return await this.handleSnapshotQuery(prompt, stream);
			}

			// Default: provide help
			return await this.handleHelp(stream);
		} catch (error) {
			logger.error("Chat request failed:", error as Error);
			stream.markdown("❌ Sorry, I encountered an error processing your request.\n\n");
			stream.markdown(`Error: ${(error as Error).message}`);
			return { metadata: {} };
		}
	}

	/**
	 * Check if prompt is asking about activity
	 */
	private isActivityQuery(prompt: string): boolean {
		const activityKeywords = [
			"activity",
			"what happened",
			"show events",
			"timeline",
			"recent",
			"today",
			"yesterday",
			"this week",
		];
		return activityKeywords.some((kw) => prompt.includes(kw));
	}

	/**
	 * Check if prompt is asking about status
	 */
	private isStatusQuery(prompt: string): boolean {
		const statusKeywords = ["status", "how am i doing", "workspace health", "protection status"];
		return statusKeywords.some((kw) => prompt.includes(kw));
	}

	/**
	 * Check if prompt is a protect command
	 */
	private isProtectCommand(prompt: string): boolean {
		const protectKeywords = ["protect", "add protection", "watch this file", "block changes"];
		return protectKeywords.some((kw) => prompt.includes(kw));
	}

	/**
	 * Check if prompt is asking about snapshots
	 */
	private isSnapshotQuery(prompt: string): boolean {
		const snapshotKeywords = ["snapshot", "backup", "versions", "history", "what changed", "files changed"];
		return snapshotKeywords.some((kw) => prompt.includes(kw));
	}

	/**
	 * Handle activity queries
	 */
	private async handleActivityQuery(prompt: string, stream: vscode.ChatResponseStream): Promise<VrekoChatResult> {
		if (!this.activityPersistenceService) {
			stream.markdown("📊 Activity tracking is not available.\n\n");
			stream.markdown("Make sure the Vreko extension is fully initialized.");
			return { metadata: { command: "activity" } };
		}

		const events = this.activityPersistenceService.getEvents();

		// Filter based on time context
		const now = Date.now();
		let filteredEvents = events;

		if (prompt.includes("today")) {
			const todayStart = new Date().setHours(0, 0, 0, 0);
			filteredEvents = events.filter((e) => e.timestamp >= todayStart);
			stream.markdown("📅 **Today's Activity**\n\n");
		} else if (prompt.includes("yesterday")) {
			const todayStart = new Date().setHours(0, 0, 0, 0);
			const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
			filteredEvents = events.filter((e) => e.timestamp >= yesterdayStart && e.timestamp < todayStart);
			stream.markdown("📅 **Yesterday's Activity**\n\n");
		} else if (prompt.includes("week")) {
			const weekStart = now - 7 * 24 * 60 * 60 * 1000;
			filteredEvents = events.filter((e) => e.timestamp >= weekStart);
			stream.markdown("📅 **This Week's Activity**\n\n");
		} else {
			stream.markdown("📅 **Recent Activity**\n\n");
		}

		if (filteredEvents.length === 0) {
			stream.markdown("No activity recorded for this period.\n\n");
			stream.markdown("Activity will appear here when you create snapshots or restore files.");
		} else {
			stream.markdown(`Found ${filteredEvents.length} events:\n\n`);

			// Show last 10 events
			const recentEvents = filteredEvents.slice(0, 10);
			for (const event of recentEvents) {
				const time = new Date(event.timestamp).toLocaleTimeString();
				const icon = this.getEventIcon(event.type);
				stream.markdown(`${icon} **${time}** - ${event.type}: ${event.file}\n`);
			}

			if (filteredEvents.length > 10) {
				stream.markdown(`\n... and ${filteredEvents.length - 10} more events`);
			}
		}

		return { metadata: { command: "activity" } };
	}

	/**
	 * Handle status queries
	 */
	private async handleStatusQuery(stream: vscode.ChatResponseStream): Promise<VrekoChatResult> {
		stream.markdown("🛡️ **Vreko Status**\n\n");

		try {
			const snapshots = await this.storageManager.listSnapshots();

			stream.markdown(`📸 **${snapshots.length}** snapshots stored\n`);
			stream.markdown("🔒 Protection active\n\n");

			// Show recent snapshot info
			if (snapshots.length > 0) {
				const latest = snapshots[snapshots.length - 1];
				const timeAgo = this.formatTimeAgo(latest.timestamp);
				stream.markdown(`Last snapshot: **${timeAgo}**\n`);
			}

			stream.markdown("\n---\n\n");
			stream.markdown("💡 **Quick Actions:**\n");
			stream.button({
				command: "vreko.createSnapshot",
				title: "📸 Create Snapshot",
			});
			stream.button({
				command: "vreko.openDashboard",
				title: "📊 Open Dashboard",
			});
		} catch (_error) {
			stream.markdown("⚠️ Unable to retrieve status. The extension may still be initializing.");
		}

		return { metadata: { command: "status" } };
	}

	/**
	 * Handle protect commands
	 */
	private async handleProtectCommand(_prompt: string, stream: vscode.ChatResponseStream): Promise<VrekoChatResult> {
		stream.markdown("🛡️ **File Protection**\n\n");

		// Get active editor
		const activeEditor = vscode.window.activeTextEditor;
		if (!activeEditor) {
			stream.markdown("⚠️ No file is currently open.\n\n");
			stream.markdown("Open a file first, then ask me to protect it.");
			return { metadata: { command: "protect" } };
		}

		const filePath = activeEditor.document.uri.fsPath;
		const fileName = path.basename(filePath);

		stream.markdown(`Protecting **${fileName}**...\n\n`);

		// Execute protect command
		try {
			await vscode.commands.executeCommand("vreko.protectFile", filePath);
			stream.markdown(`✅ **${fileName}** is now protected!\n\n`);
			stream.markdown("I'll watch for changes and create snapshots automatically.");
		} catch (error) {
			stream.markdown(`❌ Failed to protect file: ${(error as Error).message}`);
		}

		return { metadata: { command: "protect" } };
	}

	/**
	 * Handle snapshot queries
	 */
	private async handleSnapshotQuery(_prompt: string, stream: vscode.ChatResponseStream): Promise<VrekoChatResult> {
		stream.markdown("📸 **Snapshot History**\n\n");

		try {
			const snapshots = await this.storageManager.listSnapshots();

			if (snapshots.length === 0) {
				stream.markdown("No snapshots yet. Create your first snapshot to get started!\n\n");
				stream.button({
					command: "vreko.createSnapshot",
					title: "📸 Create Snapshot",
				});
			} else {
				stream.markdown(`You have **${snapshots.length}** snapshots:\n\n`);

				// Show recent snapshots
				const recentSnapshots = snapshots.slice(-5).reverse();
				for (const snapshot of recentSnapshots) {
					const time = this.formatTimeAgo(snapshot.timestamp);
					const fileCount = "fileCount" in snapshot ? (snapshot.fileCount as number) : 0;
					stream.markdown(`• **${time}** - ${fileCount} files\n`);
				}

				stream.markdown("\n---\n\n");
				stream.button({
					command: "vreko.openRecovery",
					title: "🔄 Open Recovery",
				});
			}
		} catch (_error) {
			stream.markdown("⚠️ Unable to retrieve snapshots.");
		}

		return { metadata: { command: "snapshots" } };
	}

	/**
	 * Handle help/default
	 */
	private async handleHelp(stream: vscode.ChatResponseStream): Promise<VrekoChatResult> {
		stream.markdown("🛡️ **Vreko - Code Safety Assistant**\n\n");

		stream.markdown("I can help you with:\n\n");

		stream.markdown("📅 **Activity**\n");
		stream.markdown('• "Show activity from today"\n');
		stream.markdown('• "What happened yesterday?"\n');
		stream.markdown('• "Show this week\'s timeline"\n\n');

		stream.markdown("📸 **Snapshots**\n");
		stream.markdown('• "Show my snapshots"\n');
		stream.markdown('• "What files changed recently?"\n\n');

		stream.markdown("🛡️ **Protection**\n");
		stream.markdown('• "Protect this file" (protects currently open file)\n\n');

		stream.markdown("📊 **Status**\n");
		stream.markdown('• "Show status"\n');
		stream.markdown('• "How am I doing?"\n\n');

		stream.markdown("---\n\n");
		stream.markdown("💡 **Tip:** You can also use the Vreko sidebar for visual timeline and quick actions.");

		return { metadata: { command: "help" } };
	}

	/**
	 * Provide follow-up suggestions
	 */
	private provideFollowups(
		result: VrekoChatResult,
		_chatContext: vscode.ChatContext,
		_token: vscode.CancellationToken,
	): vscode.ChatFollowup[] {
		const command = result.metadata?.command;

		switch (command) {
			case "activity":
				return [
					{ prompt: "Show yesterday's activity", label: "📅 Yesterday" },
					{ prompt: "Show this week's activity", label: "📊 This Week" },
					{ prompt: "Show status", label: "🛡️ Status" },
				];
			case "status":
				return [
					{ prompt: "Show my snapshots", label: "📸 Snapshots" },
					{ prompt: "Show recent activity", label: "📅 Activity" },
				];
			case "protect":
				return [
					{ prompt: "Show status", label: "🛡️ Check Status" },
					{ prompt: "Show my snapshots", label: "📸 View Snapshots" },
				];
			default:
				return [
					{ prompt: "Show status", label: "🛡️ Status" },
					{ prompt: "Show recent activity", label: "📅 Activity" },
				];
		}
	}

	/**
	 * Get icon for event type
	 */
	private getEventIcon(type: string): string {
		const icons: Record<string, string> = {
			"auto-snapshot": "📸",
			"manual-snapshot": "📷",
			restore: "🔄",
			"service-protection": "🛡️",
			"risk-detected": "⚠️",
			"ai-detected": "🤖",
		};
		return icons[type] || "•";
	}

	/**
	 * Format timestamp as relative time
	 */
	private formatTimeAgo(timestamp: number): string {
		const seconds = Math.floor((Date.now() - timestamp) / 1000);

		if (seconds < 60) {
			return "just now";
		}
		if (seconds < 3600) {
			return `${Math.floor(seconds / 60)}m ago`;
		}
		if (seconds < 86400) {
			return `${Math.floor(seconds / 3600)}h ago`;
		}
		return `${Math.floor(seconds / 86400)}d ago`;
	}

	/**
	 * Dispose resources
	 */
	dispose(): void {
		for (const disposable of this.disposables) {
			disposable.dispose();
		}
		this.disposables = [];
	}
}
