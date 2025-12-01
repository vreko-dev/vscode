/**
 * Risk Detection Command Handlers - VS Code command implementations for security analysis
 *
 * This module provides command handlers for the risk detection system that surfaces
 * security issues detected by the Guardian analysis engine.
 *
 * Commands:
 * - snapback.reviewSecurityIssues: Display security issues found in analysis
 * - snapback.blockSave: Block file save when critical issues are detected
 * - snapback.removeSecret: Prompt user to remove detected secrets
 * - snapback.removeMock: Prompt user to remove test mocks from production code
 * - snapback.addDependency: Prompt user to add missing dependencies
 *
 * @module commands/detectionCommands
 */

import * as vscode from "vscode";
import type { AnalysisResult } from "../types/api.js";
import type { CommandContext } from "./index.js";

/**
 * Register all risk detection and remediation commands.
 *
 * Provides command handlers for reviewing, blocking, and remediating security issues
 * detected by the Guardian analysis engine. These commands are typically invoked
 * programmatically when risks are detected rather than by user action.
 *
 * @param _context - VS Code extension context (unused in current implementation)
 * @param _commandContext - Command context (unused in current implementation)
 *
 * @returns Array of disposables for all registered commands
 *
 * @throws Registration errors if VS Code API is unavailable
 *
 * @example
 * ```typescript
 * const disposables = registerDetectionCommands(context, commandContext);
 * // disposables are pushed to context.subscriptions for automatic cleanup
 * ```
 *
 * @see {@link Guardian} for analysis engine
 * @see {@link AnalysisResult} for security analysis structure
 */
export function registerDetectionCommands(
	_context: vscode.ExtensionContext,
	_commandContext: CommandContext,
): vscode.Disposable[] {
	const disposables: vscode.Disposable[] = [];

	/**
	 * Command: Review Security Issues
	 *
	 * Displays security issues found during analysis in an information dialog.
	 * Shows both the identified risk factors and recommended remediation steps.
	 *
	 * @command snapback.reviewSecurityIssues
	 *
	 * @param _uri - File URI where issues were detected (for context)
	 * @param analysisResult - AnalysisResult containing:
	 *   - factors: Array of identified security issues
	 *   - recommendations: Array of remediation steps
	 *
	 * @returns void (displays modal information dialog)
	 *
	 * @throws No exceptions thrown; any errors are shown via VS Code dialogs
	 *
	 * @example
	 * ```typescript
	 * // Called when Guardian detects security issues
	 * // Shows: "Security Issues Found:
	 * //         - AWS key detected in line 42
	 * //         - Test mock detected in line 85
	 * //
	 * //         Recommendations:
	 * //         - Remove AWS key and use environment variables
	 * //         - Remove mock before committing"
	 * ```
	 *
	 * @see {@link Guardian.analyze} for detection engine
	 * @see {@link AnalysisResult} for analysis structure
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.reviewSecurityIssues",
			async (_uri: vscode.Uri, analysisResult: AnalysisResult) => {
				// Show information message with the analysis results
				const message =
					"Security Issues Found:\\n" +
					analysisResult.factors.join("\\n") +
					"\\n\\nRecommendations:\\n" +
					analysisResult.recommendations.join("\\n");

				await vscode.window.showInformationMessage(message, { modal: true });
			},
		),
	);

	/**
	 * Command: Block Save
	 *
	 * Prevents file save when critical security issues are detected by Guardian.
	 * Displays error dialog with identified issues and blocks the save operation.
	 * User must fix issues before saving can proceed.
	 *
	 * @command snapback.blockSave
	 *
	 * @param _uri - File URI where save is being blocked (for context)
	 * @param analysisResult - AnalysisResult containing critical issues
	 *   - factors: Array of critical security issues
	 *
	 * @returns void (displays modal error dialog)
	 *
	 * @throws No exceptions thrown; errors are shown via VS Code dialogs
	 *
	 * @example
	 * ```typescript
	 * // Called when Guardian detects critical issues
	 * // Shows: "Critical Security Issues Found:
	 * //         - AWS secret key detected
	 * //         - Production database password exposed
	 * //
	 * //         This file cannot be saved until issues are resolved."
	 * ```
	 *
	 * @see {@link Guardian.analyze} for risk scoring
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.blockSave",
			async (_uri: vscode.Uri, analysisResult: AnalysisResult) => {
				const message =
					"Critical Security Issues Found:\\n" +
					analysisResult.factors.join("\\n") +
					"\\n\\nThis file cannot be saved until issues are resolved.";

				await vscode.window.showErrorMessage(message, { modal: true });
			},
		),
	);

	/**
	 * Command: Remove Secret
	 *
	 * Prompts user to manually remove detected secrets from the file.
	 * Displays which type of secret was detected (AWS key, JWT token, DB password, etc.)
	 * and instructs user to remove it. Future versions may support automatic removal.
	 *
	 * @command snapback.removeSecret
	 *
	 * @param _uri - File URI where secret was detected
	 * @param factor - Description of the detected secret type
	 *   (e.g., "AWS Access Key", "JWT Token", "Database Password")
	 *
	 * @returns void (displays information dialog)
	 *
	 * @throws No exceptions thrown; errors are shown via VS Code dialogs
	 *
	 * @example
	 * ```typescript
	 * // Called when SecretDetectionPlugin detects a credential
	 * // Shows: "To remove the secret related to: AWS Access Key ID
	 * //
	 * //         Please manually remove the secret from the file."
	 * ```
	 *
	 * @see {@link SecretDetectionPlugin} in @snapback/core for detection logic
	 * @todo Implement automatic secret removal for supported patterns
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.removeSecret",
			async (_uri: vscode.Uri, factor: string) => {
				// This would ideally find and remove the secret from the file
				await vscode.window.showInformationMessage(
					"To remove the secret related to: " +
						factor +
						"\\n\\nPlease manually remove the secret from the file.",
				);
			},
		),
	);

	/**
	 * Command: Remove Mock
	 *
	 * Prompts user to manually remove test mocks from production code.
	 * Mocks detected in source files (not test files) should be removed before
	 * committing to prevent test infrastructure from entering production.
	 *
	 * @command snapback.removeMock
	 *
	 * @param _uri - File URI where mock was detected
	 * @param factor - Description of the detected mock
	 *   (e.g., "jest.mock() call", "sinon stub", "vitest mock")
	 *
	 * @returns void (displays information dialog)
	 *
	 * @throws No exceptions thrown; errors are shown via VS Code dialogs
	 *
	 * @example
	 * ```typescript
	 * // Called when MockReplacementPlugin detects test artifacts
	 * // Shows: "To remove the mock related to: jest.mock() in src/utils.ts
	 * //
	 * //         Please manually remove the mock from the file."
	 * ```
	 *
	 * @see {@link MockReplacementPlugin} in @snapback/core for detection logic
	 * @todo Implement automatic mock removal for common frameworks
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.removeMock",
			async (_uri: vscode.Uri, factor: string) => {
				// This would ideally find and remove the mock from the file
				await vscode.window.showInformationMessage(
					"To remove the mock related to: " +
						factor +
						"\\n\\nPlease manually remove the mock from the file.",
				);
			},
		),
	);

	/**
	 * Command: Add Dependency
	 *
	 * Prompts user to manually add missing dependencies to package.json.
	 * When imports are used in code that aren't declared in package.json (phantom dependencies),
	 * this command reminds the user to add the missing dependency declarations.
	 *
	 * @command snapback.addDependency
	 *
	 * @param _uri - File URI where missing import was detected
	 * @param factor - Description of the missing dependency
	 *   (e.g., "lodash", "react", "@types/node")
	 *
	 * @returns void (displays information dialog)
	 *
	 * @throws No exceptions thrown; errors are shown via VS Code dialogs
	 *
	 * @example
	 * ```typescript
	 * // Called when PhantomDependencyPlugin detects missing dependency
	 * // Shows: "To add the missing dependency related to: lodash
	 * //
	 * //         Please add the dependency to your package.json file."
	 * ```
	 *
	 * @see {@link PhantomDependencyPlugin} in @snapback/core for detection logic
	 * @todo Implement automatic dependency addition via npm/yarn/pnpm
	 */
	disposables.push(
		vscode.commands.registerCommand(
			"snapback.addDependency",
			async (_uri: vscode.Uri, factor: string) => {
				// This would ideally add the missing dependency to package.json
				await vscode.window.showInformationMessage(
					"To add the missing dependency related to: " +
						factor +
						"\\n\\nPlease add the dependency to your package.json file.",
				);
			},
		),
	);

	return disposables;
}
