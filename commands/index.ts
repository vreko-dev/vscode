import type * as vscode from "vscode";
import type { ServiceFederation } from "../types/core";
import { registerSnapshotQuickPickerCommands } from "../ui/SnapshotQuickPicker";
import { registerAuthCommands, registerConnectCommand, registerOpenSnapshotInWebCommand } from "./authCommands";
import { registerDecorationCommands } from "./decorationCommands";
import { registerDetectionCommands } from "./detectionCommands";
import { registerDiffCommands } from "./diffCommands";
import { registerDoctorCommand } from "./doctor";
import { registerFeedbackCommands } from "./feedbackCommands";
import { registerInitCommand } from "./init";
import { registerLocalServiceCommands } from "./localServiceCommands";
import { registerMcpCommands } from "./mcpCommands";
import { registerOfflineModeCommands } from "./offlineModeCommands";
import { registerPolicyOverrideCommands } from "./policyOverrideCommands";
import { registerProtectionCommands } from "./protectionCommands";
import { registerRecoveryCommands } from "./recoveryCommands";
import { registerSecurityCommands } from "./securityCommands";
import { registerSessionCommands } from "./sessionCommands";
import { registerSetupCommands } from "./setupCommands";
import { registerSnapshotCommands } from "./snapshotCommands";
import { registerSnapshotCreationCommands } from "./snapshotCreationCommands";
import { registerStatusBarCommands } from "./statusBarCommands";
import { registerUtilityCommands } from "./utilityCommands";
import { registerViewCommands } from "./viewCommands";
import { registerWorkflowCommands } from "./workflowCommands";

// Re-export from types.ts to maintain backward compatibility
export { type CommandContext, registerCommandSafely } from "./types";

import type { CommandContext } from "./types";

/**
 * Register only critical commands that must be available even if activation fails.
 * These commands provide diagnostics, status checking, and recovery capabilities.
 *
 * SB-264: Critical commands registered early to ensure availability during partial failures
 *
 * @param context - VS Code extension context
 * @returns Array of command disposables
 */
export function registerCriticalCommands(context: vscode.ExtensionContext): vscode.Disposable[] {
	// Only register commands that don't depend on full CommandContext
	// These provide diagnostics and basic functionality even in degraded mode
	return [
		// Auth commands (login/logout) - needed for recovery
		...registerAuthCommands(context),
		// Feedback commands - always available for user reports
		...registerFeedbackCommands(context),
		// Security commands - API key management
		...registerSecurityCommands(context),
		// Init command - thin-client wrapper for CLI init
		registerInitCommand(context),
		// Doctor command - thin-client wrapper for CLI doctor
		registerDoctorCommand(context),
	];
}

/**
 * Register all command handlers in the extension.
 *
 * Aggregates command registrations from all domain-specific modules
 * (protection, snapshots, sessions, etc.) into a single function call.
 *
 * @param context - VS Code extension context for managing disposables
 * @param commandContext - Shared context containing all required services
 *
 * @returns Array of all registered command disposables (to be added to context.subscriptions)
 *
 * @example
 * ```typescript
 * const disposables = registerAllCommands(context, commandContext);
 * disposables.forEach(d => context.subscriptions.push(d));
 * ```
 *
 * @see {@link registerProtectionCommands}
 * @see {@link registerSnapshotCommands}
 * @see {@link registerSessionCommands}
 * @see {@link registerDetectionCommands}
 */
export function registerAllCommands(
	context: vscode.ExtensionContext,
	commandContext: CommandContext,
): vscode.Disposable[] {
	// Register MCP commands - bridge handles connection state internally
	// Create a minimal ServiceFederation mock that matches the interface
	const federationMock: ServiceFederation = {
		get: <T>(_serviceId: string): T | undefined => undefined,
		register: <T>(_serviceId: string, _service: T): void => {
			// no-op mock
		},
		has: (_serviceId: string): boolean => false,
	};

	const mcpCommandDisposables = registerMcpCommands(
		context,
		federationMock,
		commandContext.operationCoordinator,
		commandContext.workflowIntegration,
		commandContext.mcpToolsService, // Wired from AppContext via CommandContext
	);

	// Note: This adds directly to context.subscriptions

	return [
		// NOTE: Auth commands already registered in registerCriticalCommands
		// Do NOT re-register them here to avoid duplicates
		...registerProtectionCommands(context, commandContext),
		...registerSnapshotCommands(context, commandContext), // 🆕 ARCHITECTURE_REFACTOR_SPEC.md Phase 1: Pass full CommandContext for service delegation
		...registerSessionCommands(context, commandContext),
		...registerViewCommands(context, commandContext),
		...registerWorkflowCommands(context, commandContext),
		...registerUtilityCommands(context, commandContext),
		...registerSnapshotCreationCommands(context, commandContext),
		...registerStatusBarCommands(context, commandContext),
		...registerOfflineModeCommands(context, commandContext),
		...registerPolicyOverrideCommands(context, commandContext),
		...registerDetectionCommands(context, commandContext),
		...registerDecorationCommands(context, commandContext), // 🆕 Register decoration commands
		...registerDiffCommands(commandContext.storage), // 🆕 Register diff commands (vreko.snapshot.showFileDiff)
		...mcpCommandDisposables, // 🆕 Register MCP commands if available
		// NOTE: Feedback/Security commands already registered in registerCriticalCommands
		// Do NOT re-register them here to avoid duplicates
		// 🆕 Register auth commands (connect, open in web)
		registerConnectCommand(context, () => commandContext.refreshViews()),
		registerOpenSnapshotInWebCommand(context),
		// 🆕 Register SnapshotQuickPicker commands (status bar → QuickPick restore flow)
		...registerSnapshotQuickPickerCommands(context, commandContext.storage, commandContext.workspaceRoot),
		// 🆕 Register local service commands (delegates to DaemonBridge)
		...registerLocalServiceCommands(context),
		// NOTE: vreko.createSnapshot is registered in registerSnapshotCreationCommands above
		// 🆕 Register recovery commands (Quick Actions, Timeline, Undo)
		...registerRecoveryCommands(context, commandContext),
		// 🆕 Register setup commands (Claude Desktop configuration)
		...registerSetupCommands(context),
	];
}
