/**
 * ActivityLog  -  output channel "Vreko Activity" for ambient event logging.
 *
 * Never auto-focuses. User can pin it via View → Output → "Vreko Activity".
 * Verbosity controlled by `vreko.ui.outputChannelVerbose` setting.
 */

import * as vscode from "vscode";

export class ActivityLog implements vscode.Disposable {
	private readonly channel: vscode.OutputChannel;

	constructor() {
		this.channel = vscode.window.createOutputChannel("Vreko Activity");
	}

	log(eventType: string, detail?: string): void {
		const verbose = vscode.workspace.getConfiguration("vreko.ui").get<boolean>("outputChannelVerbose", false);

		// In non-verbose mode, allow observation-taxonomy event kinds through
		// (session, mcp, snapshot, learning, risk)  -  everything else requires verbose mode
		const alwaysAllowed = ["session.", "mcp.", "snapshot.", "learning.", "risk."];
		if (!verbose && !alwaysAllowed.some((prefix) => eventType.startsWith(prefix))) {
			return;
		}

		const ts = new Date().toISOString().substring(11, 19); // HH:MM:SS
		this.channel.appendLine(`[${ts}] ${eventType}${detail ? ` ${detail}` : ""}`);
		// Never call this.channel.show()  -  user pins it if wanted
	}

	dispose(): void {
		this.channel.dispose();
	}
}
