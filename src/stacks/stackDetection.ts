/**
 * Stack Detection Module
 *
 * Detects technology stacks in the workspace using file glob patterns
 * and returns active StackProfiles.
 *
 * Side-effect free: Does not modify any state, only reads workspace files.
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger.js";
import { STACK_PROFILES, type StackProfile } from "./stackProfiles.js";

/**
 * Detect active stacks in the workspace
 *
 * Scans workspace files against all stack profiles and returns those
 * where detection patterns match. Uses OR logic - if any detector
 * in a profile matches, the stack is detected.
 *
 * This is a pure function with no side effects. It only reads files
 * from the VS Code workspace.
 *
 * @param workspaceRoot - Root directory of workspace (optional, uses VS Code workspace by default)
 * @returns Array of detected StackProfiles
 *
 * @example
 * const stacks = await detectStacks();
 * // Returns: [nextjs, nodejs, typescript, docker, ...] if those stacks detected
 */
export async function detectStacks(
	workspaceRoot?: string,
): Promise<StackProfile[]> {
	try {
		const workspace =
			workspaceRoot ||
			(vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? undefined);

		if (!workspace) {
			logger.warn("No workspace root available for stack detection");
			return [];
		}

		const detected: StackProfile[] = [];

		for (const profile of STACK_PROFILES) {
			// Check each detector in the profile using OR logic
			let profileMatched = false;

			for (const detector of profile.detect) {
				try {
					// Find files matching the detector glob
					const files = await vscode.workspace.findFiles(
						new vscode.RelativePattern(workspace, detector.glob),
					);

					if (files.length > 0) {
						logger.debug(
							`Stack detector matched: ${profile.id} / ${detector.glob} (${files.length} files)`,
						);
						profileMatched = true;
						break; // Match found, no need to check other detectors
					}
				} catch (error) {
					// Log individual detector errors but continue
					logger.debug(
						`Stack detector error: ${profile.id} / ${detector.glob}`,
						error as Error,
					);
				}
			}

			if (profileMatched) {
				detected.push(profile);
			}
		}

		logger.info(`Detected ${detected.length} stacks`, {
			stacks: detected.map((s) => s.id).join(", "),
		});

		return detected;
	} catch (error) {
		logger.error("Failed to detect stacks", error as Error);
		return [];
	}
}

/**
 * Detect stacks synchronously (not recommended, but available for startup)
 * Falls back to basic heuristics without file scanning
 *
 * @param workspaceRoot - Root directory of workspace
 * @returns Array of detected StackProfiles (best guess, not guaranteed)
 */
export function detectStacksSync(_workspaceRoot: string): StackProfile[] {
	// This is a placeholder - actual implementation would use synchronous file checks
	// For now, we recommend using the async version
	logger.warn("detectStacksSync is a placeholder - use detectStacks() instead");
	return [];
}

/**
 * Check if a specific stack is detected
 * @param stackId - Stack ID to check
 * @param workspaceRoot - Root directory of workspace
 * @returns True if the stack is detected
 */
export async function isStackDetected(
	stackId: string,
	workspaceRoot?: string,
): Promise<boolean> {
	const detected = await detectStacks(workspaceRoot);
	return detected.some((s) => s.id === stackId);
}

/**
 * Get protection rules for detected stacks
 * Combines rules from all detected profiles
 *
 * @param workspaceRoot - Root directory of workspace
 * @returns Array of protection rules from all detected stacks
 */
export async function getDetectedStackRules(workspaceRoot?: string) {
	const detected = await detectStacks(workspaceRoot);
	const rules = detected.flatMap((stack) => stack.rules);

	logger.debug(
		`Combined ${rules.length} protection rules from ${detected.length} stacks`,
	);

	return rules;
}
