import * as vscode from "vscode";

// read workspace.getConfiguration('snapback.guardian'); expose onDidChange + getters

export interface GuardianConfig {
	enabled: boolean;
	warnThreshold: number;
	blockThreshold: number;
	protectionLevel: "none" | "warn" | "block";
	plugins: {
		secretDetection: boolean;
		mockReplacement: boolean;
		phantomDependency: boolean;
	};
	thresholds: {
		warn: number;
		block: number;
	};
}

let config: GuardianConfig;
let configChangeListener: vscode.Disposable;

export function initializeConfig() {
	updateConfig();

	configChangeListener = vscode.workspace.onDidChangeConfiguration((e) => {
		if (e.affectsConfiguration("snapback.guardian")) {
			updateConfig();
		}
	});
}

function updateConfig() {
	const workspaceConfig =
		vscode.workspace.getConfiguration("snapback.guardian");
	config = {
		enabled: workspaceConfig.get("enabled", true),
		warnThreshold: workspaceConfig.get("warnThreshold", 5),
		blockThreshold: workspaceConfig.get("blockThreshold", 8),
		protectionLevel: workspaceConfig.get("protectionLevel", "warn"),
		plugins: {
			secretDetection: workspaceConfig.get("plugins.secretDetection", true),
			mockReplacement: workspaceConfig.get("plugins.mockReplacement", true),
			phantomDependency: workspaceConfig.get("plugins.phantomDependency", true),
		},
		thresholds: {
			warn: workspaceConfig.get("thresholds.warn", 6),
			block: workspaceConfig.get("thresholds.block", 8),
		},
	};
}

export function getConfig(): GuardianConfig {
	return config;
}

// Add the required exports
export function getThresholds() {
	return config.thresholds;
}

export function getPluginEnabled(pluginName: string): boolean {
	switch (pluginName) {
		case "secretDetection":
			return config.plugins.secretDetection;
		case "mockReplacement":
			return config.plugins.mockReplacement;
		case "phantomDependency":
			return config.plugins.phantomDependency;
		default:
			return false;
	}
}

export function onDidChange(_listener: () => void): vscode.Disposable {
	return configChangeListener;
}

export function dispose() {
	if (configChangeListener) {
		configChangeListener.dispose();
	}
}
