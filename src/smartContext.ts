import type { WorkspaceMemoryManager } from "./workspaceMemory.js";

export interface SmartContext {
	projectType: "javascript" | "typescript" | "python" | "java" | "unknown";
	framework: string | null;
	riskPatterns: string[];
	sensitiveFiles: string[];
	activeDevelopmentAreas: string[];
	predictedNextAction: string | null;
}

export class SmartContextDetector {
	private workspaceMemory: WorkspaceMemoryManager;

	constructor(workspaceMemory: WorkspaceMemoryManager) {
		this.workspaceMemory = workspaceMemory;
	}

	/**
	 * Analyze the workspace and detect smart context
	 */
	async detectContext(): Promise<SmartContext> {
		const context: SmartContext = {
			projectType: "unknown",
			framework: null,
			riskPatterns: [],
			sensitiveFiles: [],
			activeDevelopmentAreas: [],
			predictedNextAction: null,
		};

		// Detect project type based on files in workspace
		context.projectType = this.detectProjectType();

		// Detect framework based on dependencies
		context.framework = this.detectFramework();

		// Identify risk patterns based on recent actions
		context.riskPatterns = this.identifyRiskPatterns();

		// Identify sensitive files
		context.sensitiveFiles = this.identifySensitiveFiles();

		// Determine active development areas
		context.activeDevelopmentAreas = this.determineActiveAreas();

		// Predict next action
		context.predictedNextAction = this.predictNextAction(context);

		return context;
	}

	/**
	 * Detect project type based on workspace files
	 */
	private detectProjectType():
		| "javascript"
		| "typescript"
		| "python"
		| "java"
		| "unknown" {
		// In a real implementation, we would scan the workspace for specific files
		// For now, we'll return a default value
		return "typescript";
	}

	/**
	 * Detect framework based on dependencies
	 */
	private detectFramework(): string | null {
		// In a real implementation, we would check package.json or other config files
		// For now, we'll return a default value
		return "vscode-extension";
	}

	/**
	 * Identify risk patterns based on recent actions
	 */
	private identifyRiskPatterns(): string[] {
		const context = this.workspaceMemory.getContext();
		const patterns: string[] = [];

		// Check for rapid file changes
		const recentActions = context.recentActions.slice(0, 10);
		const fileChangeActions = recentActions.filter(
			(a) => a.action === "file_opened",
		);

		if (fileChangeActions.length > 5) {
			patterns.push("rapid_file_changes");
		}

		// Check for branch changes
		const branchChangeActions = recentActions.filter(
			(a) => a.action === "branch_changed",
		);

		if (branchChangeActions.length > 2) {
			patterns.push("frequent_branch_switching");
		}

		return patterns;
	}

	/**
	 * Identify sensitive files
	 */
	private identifySensitiveFiles(): string[] {
		// In a real implementation, we would scan for files with sensitive patterns
		// For now, we'll return a default value
		return [".env", "config.json", "secrets.json"];
	}

	/**
	 * Determine active development areas
	 */
	private determineActiveAreas(): string[] {
		const context = this.workspaceMemory.getContext();

		// For now, we'll just return the directories of recent files
		const areas = new Set<string>();

		for (const file of context.recentFiles) {
			const parts = file.split("/");
			if (parts.length > 1) {
				areas.add(parts[parts.length - 2]); // Parent directory
			}
		}

		return Array.from(areas);
	}

	/**
	 * Predict next action based on context
	 */
	private predictNextAction(context: SmartContext): string | null {
		// Simple prediction logic based on context
		if (context.riskPatterns.includes("rapid_file_changes")) {
			return "create_snapshot";
		}

		if (context.activeDevelopmentAreas.length > 0) {
			return `focus_on_${context.activeDevelopmentAreas[0]}`;
		}

		return null;
	}
}
