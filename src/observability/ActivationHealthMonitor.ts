/**
 * Activation Health Monitor
 *
 * Provides comprehensive health checks for the extension after activation.
 * Reports to Sentry and telemetry for proactive issue detection.
 *
 * @fileoverview
 * - Validates all critical components are initialized
 * - Measures activation timing and performance
 * - Reports health status to observability systems
 * - Provides diagnostic commands for troubleshooting
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";
import { addBreadcrumb, captureMessage } from "./sentry";

/** Health check result for a single component */
export interface ComponentHealthResult {
	name: string;
	status: "healthy" | "degraded" | "unhealthy" | "not_initialized";
	durationMs?: number;
	error?: string;
	details?: Record<string, unknown>;
}

/** Overall activation health report */
export interface ActivationHealthReport {
	timestamp: number;
	overallStatus: "healthy" | "degraded" | "unhealthy";
	activationDurationMs: number;
	phaseDurations: Record<string, number>;
	components: ComponentHealthResult[];
	environment: {
		vscodeVersion: string;
		extensionVersion: string;
		platform: string;
		isRemote: boolean;
		workspaceCount: number;
	};
	warnings: string[];
	errors: string[];
}

/** Health check function type */
type HealthCheckFn = () => Promise<ComponentHealthResult> | ComponentHealthResult;

/**
 * Activation Health Monitor
 *
 * Tracks health of extension components and reports issues proactively.
 */
export class ActivationHealthMonitor implements vscode.Disposable {
	private healthChecks = new Map<string, HealthCheckFn>();
	private phaseDurations: Record<string, number> = {};
	private activationStartTime = 0;
	private activationEndTime = 0;
	private readonly warnings: string[] = [];
	private readonly errors: string[] = [];

	constructor(private readonly context: vscode.ExtensionContext) {}

	/**
	 * Mark activation start time
	 */
	startActivation(): void {
		this.activationStartTime = Date.now();
	}

	/**
	 * Mark activation end time
	 */
	endActivation(): void {
		this.activationEndTime = Date.now();
	}

	/**
	 * Record phase timing
	 */
	recordPhaseTiming(phase: string, durationMs: number): void {
		this.phaseDurations[phase] = durationMs;
	}

	/**
	 * Add a warning (non-fatal issue)
	 */
	addWarning(message: string): void {
		this.warnings.push(message);
		logger.warn(`[HealthMonitor] ${message}`);
	}

	/**
	 * Add an error (critical issue)
	 */
	addError(message: string, error?: Error): void {
		this.errors.push(message);
		logger.error(`[HealthMonitor] ${message}`, error);
	}

	/**
	 * Register a health check for a component
	 */
	registerHealthCheck(componentName: string, checkFn: HealthCheckFn): void {
		this.healthChecks.set(componentName, checkFn);
	}

	/**
	 * Run all health checks and generate report
	 */
	async runHealthChecks(): Promise<ActivationHealthReport> {
		const results: ComponentHealthResult[] = [];

		for (const [name, checkFn] of this.healthChecks) {
			try {
				const result = await checkFn();
				results.push(result);
			} catch (error) {
				results.push({
					name,
					status: "unhealthy",
					error: error instanceof Error ? error.message : String(error),
				});
			}
		}

		const activationDurationMs = this.activationEndTime - this.activationStartTime;
		const overallStatus = this.calculateOverallStatus(results);

		const report: ActivationHealthReport = {
			timestamp: Date.now(),
			overallStatus,
			activationDurationMs,
			phaseDurations: { ...this.phaseDurations },
			components: results,
			environment: {
				vscodeVersion: vscode.version,
				extensionVersion: this.context.extension.packageJSON.version || "unknown",
				platform: process.platform,
				isRemote: !!vscode.env.remoteName,
				workspaceCount: vscode.workspace.workspaceFolders?.length || 0,
			},
			warnings: [...this.warnings],
			errors: [...this.errors],
		};

		// Report to Sentry
		this.reportToSentry(report);

		return report;
	}

	/**
	 * Calculate overall health status from component results
	 */
	private calculateOverallStatus(results: ComponentHealthResult[]): "healthy" | "degraded" | "unhealthy" {
		const unhealthyCount = results.filter((r) => r.status === "unhealthy").length;
		const degradedCount = results.filter((r) => r.status === "degraded").length;

		if (unhealthyCount > 0) {
			return "unhealthy";
		}
		if (degradedCount > 0 || this.warnings.length > 0) {
			return "degraded";
		}
		return "healthy";
	}

	/**
	 * Report health status to Sentry
	 */
	private reportToSentry(report: ActivationHealthReport): void {
		// Add breadcrumb with activation summary
		addBreadcrumb("Activation health check completed", "health", {
			status: report.overallStatus,
			activationMs: report.activationDurationMs,
			componentCount: report.components.length,
			unhealthyCount: report.components.filter((c) => c.status === "unhealthy").length,
			warningCount: report.warnings.length,
			errorCount: report.errors.length,
		});

		// Report unhealthy activation
		if (report.overallStatus === "unhealthy") {
			captureMessage("Extension activation unhealthy", "warning", {
				activationDurationMs: report.activationDurationMs,
				unhealthyComponents: report.components
					.filter((c) => c.status === "unhealthy")
					.map((c) => ({ name: c.name, error: c.error })),
				errors: report.errors,
			});
		}

		// Report slow activation (> 3 seconds)
		if (report.activationDurationMs > 3000) {
			captureMessage(`Slow extension activation: ${report.activationDurationMs}ms`, "warning", {
				phaseDurations: report.phaseDurations,
				slowestPhase: this.getSlowestPhase(report.phaseDurations),
			});
		}
	}

	/**
	 * Get the slowest phase from timing data
	 */
	private getSlowestPhase(durations: Record<string, number>): { name: string; durationMs: number } | null {
		let slowest: { name: string; durationMs: number } | null = null;

		for (const [name, durationMs] of Object.entries(durations)) {
			if (!slowest || durationMs > slowest.durationMs) {
				slowest = { name, durationMs };
			}
		}

		return slowest;
	}

	/**
	 * Register diagnostic command for users
	 */
	registerDiagnosticCommand(): vscode.Disposable {
		return vscode.commands.registerCommand("snapback.diagnostics.healthCheck", async () => {
			const report = await this.runHealthChecks();

			// Show results in output channel
			const output = vscode.window.createOutputChannel("SnapBack Health Check");
			output.clear();
			output.appendLine("=".repeat(60));
			output.appendLine("SnapBack Extension Health Check Report");
			output.appendLine("=".repeat(60));
			output.appendLine("");
			output.appendLine(`Overall Status: ${report.overallStatus.toUpperCase()}`);
			output.appendLine(`Activation Duration: ${report.activationDurationMs}ms`);
			output.appendLine("");
			output.appendLine("Environment:");
			output.appendLine(`  VS Code: ${report.environment.vscodeVersion}`);
			output.appendLine(`  Extension: ${report.environment.extensionVersion}`);
			output.appendLine(`  Platform: ${report.environment.platform}`);
			output.appendLine(`  Remote: ${report.environment.isRemote}`);
			output.appendLine(`  Workspaces: ${report.environment.workspaceCount}`);
			output.appendLine("");
			output.appendLine("Phase Timings:");
			for (const [phase, duration] of Object.entries(report.phaseDurations)) {
				const indicator = duration > 500 ? "⚠️" : "✅";
				output.appendLine(`  ${indicator} ${phase}: ${duration}ms`);
			}
			output.appendLine("");
			output.appendLine("Component Health:");
			for (const component of report.components) {
				const icon =
					component.status === "healthy"
						? "✅"
						: component.status === "degraded"
							? "⚠️"
							: component.status === "unhealthy"
								? "❌"
								: "⏸️";
				output.appendLine(`  ${icon} ${component.name}: ${component.status}`);
				if (component.error) {
					output.appendLine(`      Error: ${component.error}`);
				}
			}

			if (report.warnings.length > 0) {
				output.appendLine("");
				output.appendLine("Warnings:");
				for (const warning of report.warnings) {
					output.appendLine(`  ⚠️ ${warning}`);
				}
			}

			if (report.errors.length > 0) {
				output.appendLine("");
				output.appendLine("Errors:");
				for (const error of report.errors) {
					output.appendLine(`  ❌ ${error}`);
				}
			}

			output.appendLine("");
			output.appendLine("=".repeat(60));
			output.show();

			// Show summary notification
			const statusIcon =
				report.overallStatus === "healthy" ? "✅" : report.overallStatus === "degraded" ? "⚠️" : "❌";
			vscode.window.showInformationMessage(
				`${statusIcon} SnapBack Health: ${report.overallStatus.toUpperCase()} (${report.activationDurationMs}ms activation)`,
			);
		});
	}

	dispose(): void {
		this.healthChecks.clear();
	}
}

/**
 * Create default health checks for core components
 */
export function createDefaultHealthChecks(
	monitor: ActivationHealthMonitor,
	refs: {
		storage?: { isInitialized?: () => boolean } | null;
		eventBus?: { isInitialized?: () => boolean } | null;
		mcpManager?: { isConnected?: () => boolean; getState?: () => string } | null;
		authState?: { isAuthenticated?: () => Promise<boolean> } | null;
	},
): void {
	// Storage health check
	monitor.registerHealthCheck("Storage", () => ({
		name: "Storage",
		status: refs.storage ? "healthy" : "not_initialized",
		details: { available: !!refs.storage },
	}));

	// Event bus health check
	monitor.registerHealthCheck("EventBus", () => ({
		name: "EventBus",
		status: refs.eventBus ? "healthy" : "not_initialized",
		details: { available: !!refs.eventBus },
	}));

	// MCP connection health check
	monitor.registerHealthCheck("MCP", () => {
		if (!refs.mcpManager) {
			return { name: "MCP", status: "not_initialized" };
		}
		const state = refs.mcpManager.getState?.() || "unknown";
		const isConnected = state === "connected";
		return {
			name: "MCP",
			status: isConnected ? "healthy" : "degraded",
			details: { state, connected: isConnected },
		};
	});

	// Auth health check
	monitor.registerHealthCheck("Authentication", async () => {
		if (!refs.authState) {
			return { name: "Authentication", status: "not_initialized" };
		}
		try {
			const isAuth = await refs.authState.isAuthenticated?.();
			return {
				name: "Authentication",
				status: "healthy",
				details: { authenticated: isAuth },
			};
		} catch (error) {
			return {
				name: "Authentication",
				status: "degraded",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	});

	// Workspace health check
	monitor.registerHealthCheck("Workspace", () => {
		const folders = vscode.workspace.workspaceFolders;
		const isTrusted = vscode.workspace.isTrusted;
		return {
			name: "Workspace",
			status: folders && folders.length > 0 && isTrusted ? "healthy" : "degraded",
			details: {
				folderCount: folders?.length || 0,
				isTrusted,
			},
		};
	});

	// Memory health check
	monitor.registerHealthCheck("Memory", () => {
		const memUsage = process.memoryUsage();
		const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
		const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
		const heapPercent = Math.round((memUsage.heapUsed / memUsage.heapTotal) * 100);

		// Degraded if using > 80% of heap
		const status = heapPercent > 80 ? "degraded" : "healthy";

		return {
			name: "Memory",
			status,
			details: {
				heapUsedMB,
				heapTotalMB,
				heapPercent,
			},
		};
	});
}

// Singleton instance
let healthMonitorInstance: ActivationHealthMonitor | null = null;

/**
 * Initialize the health monitor singleton
 */
export function initializeHealthMonitor(context: vscode.ExtensionContext): ActivationHealthMonitor {
	if (!healthMonitorInstance) {
		healthMonitorInstance = new ActivationHealthMonitor(context);
	}
	return healthMonitorInstance;
}

/**
 * Get the health monitor instance
 */
export function getHealthMonitor(): ActivationHealthMonitor | null {
	return healthMonitorInstance;
}

/**
 * Dispose the health monitor
 */
export function disposeHealthMonitor(): void {
	if (healthMonitorInstance) {
		healthMonitorInstance.dispose();
		healthMonitorInstance = null;
	}
}
