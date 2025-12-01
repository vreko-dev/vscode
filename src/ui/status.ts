import * as vscode from "vscode";

// export setRisk(uri, score, label); click → open Guardian report
let statusBarItem: vscode.StatusBarItem;
const riskMap = new Map<string, { score: number; label: string }>();

export function setRisk(uri: vscode.Uri, score: number, label: string) {
	// Store the risk information for the URI
	riskMap.set(uri.toString(), { score, label });

	if (!statusBarItem) {
		statusBarItem = vscode.window.createStatusBarItem(
			vscode.StatusBarAlignment.Right,
			100,
		);
		statusBarItem.command = "snapback.openReport";
	}

	// Display ⛑️ Risk: <LEVEL> (X.Y/10); click opens report
	const level = getRiskLevel(score);
	statusBarItem.text = `⛑️ Risk: ${level} (${score.toFixed(1)}/10)`;
	statusBarItem.tooltip = `SnapBack Risk Score for ${uri.fsPath}\nClick to open detailed report`;
	statusBarItem.show();
}

function getRiskLevel(score: number): string {
	if (score >= 8) return "CRITICAL";
	if (score >= 6) return "HIGH";
	if (score >= 4) return "MEDIUM";
	if (score >= 2) return "LOW";
	return "MINIMAL";
}

// Add show function to make the status bar item visible
export function show() {
	if (statusBarItem) {
		statusBarItem.show();
	}
}

// Add dispose function to clean up the status bar item
export function dispose() {
	if (statusBarItem) {
		statusBarItem.dispose();
	}
	riskMap.clear();
}
