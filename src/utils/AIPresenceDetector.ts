/**
 * @fileoverview AI Presence Detector (VSCode Wrapper)
 *
 * This module wraps the SDK AIPresenceDetector and provides VSCode-specific
 * extension provider integration.
 */

import type { AIPresenceInfo } from "@snapback/sdk";
import {
	AI_EXTENSION_IDS,
	type AIAssistantName,
	type IExtensionProvider,
	AIPresenceDetector as SDKAIPresenceDetector,
} from "@snapback/sdk";
import * as vscode from "vscode";

/**
 * VSCode-specific extension provider
 */
class VscodeExtensionProvider implements IExtensionProvider {
	getAllExtensionIds(): string[] {
		return vscode.extensions.all.map((ext) => ext.id);
	}
}

// Create singleton detector instance
const vscodeDetector = new SDKAIPresenceDetector(new VscodeExtensionProvider());

/**
 * Detects the presence of AI coding assistants
 *
 * @returns Information about detected AI assistants
 */
export function detectAIPresence(): AIPresenceInfo {
	return vscodeDetector.detectAIPresence();
}

/**
 * Checks if a specific AI assistant is installed
 *
 * @param assistantName Name of the AI assistant to check
 * @returns True if the assistant is installed
 */
export function isAIAssistantInstalled(
	assistantName: AIAssistantName,
): boolean {
	return vscodeDetector.isAIAssistantInstalled(assistantName);
}

/**
 * Gets a list of all installed AI assistants
 *
 * @returns Array of installed AI assistant names
 */
export function getInstalledAIAssistants(): AIAssistantName[] {
	return vscodeDetector.getInstalledAIAssistants();
}

// Re-export types for backward compatibility
export type { AIAssistantName, AIPresenceInfo };
export { AI_EXTENSION_IDS };
