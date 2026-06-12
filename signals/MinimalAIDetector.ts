/**
 * MinimalAIDetector - IP-Safe Client-Side AI Detection
 *
 * SECURITY NOTE:
 * This detector is intentionally minimal to protect proprietary algorithms.
 * It ONLY checks for known extension IDs (which is public information anyway).
 *
 * Full detection capabilities (velocity analysis, pattern matching, confidence scoring)
 * are server-side only via the Vreko API.
 *
 * This fallback is used when:
 * - User is offline
 * - API key not configured
 * - Server request fails/times out
 *
 * @module MinimalAIDetector
 */

/**
 * Known AI coding assistant extension IDs.
 *
 * This list is intentionally public knowledge - these are the same IDs
 * anyone can find by searching the VS Code marketplace. No IP exposure here.
 */
const KNOWN_AI_EXTENSION_IDS: ReadonlySet<string> = new Set([
	// GitHub Copilot
	"github.copilot",
	"github.copilot-nightly",
	"github.copilot-chat",
	// Cursor (when running as extension)
	"cursor.cursor",
	// Claude / Anthropic
	"anthropic.claude",
	"anthropic.claude-dev",
	"saoudrizwan.claude-dev",
	// Tabnine
	"tabnine.tabnine-vscode",
	// Codeium
	"codeium.codeium",
	// Amazon Q / CodeWhisperer
	"amazonwebservices.aws-toolkit-vscode",
	"amazonwebservices.codewhisperer-for-command-line-companion",
	// JetBrains AI
	"jetbrains.jetbrains-ai",
	// Sourcegraph Cody
	"sourcegraph.cody-ai",
	// Continue.dev
	"continue.continue",
	// Blackbox AI
	"blackboxapp.blackbox",
	// Windsurf
	"codeium.windsurf",
	// Supermaven
	"supermaven.supermaven",
	// Aider
	"aider.aider",
	// Pieces
	"meshintelligenttechnologiesinc.pieces-vscode",
]);

/**
 * Display names for known AI tools (for UI purposes only).
 * No proprietary detection logic here - just a lookup table.
 */
const AI_TOOL_DISPLAY_NAMES: Record<string, string> = {
	"github.copilot": "GitHub Copilot",
	"github.copilot-nightly": "GitHub Copilot (Nightly)",
	"github.copilot-chat": "GitHub Copilot Chat",
	"cursor.cursor": "Cursor",
	"anthropic.claude": "Claude",
	"anthropic.claude-dev": "Claude Dev",
	"saoudrizwan.claude-dev": "Claude Dev",
	"tabnine.tabnine-vscode": "Tabnine",
	"codeium.codeium": "Codeium",
	"amazonwebservices.aws-toolkit-vscode": "Amazon Q",
	"amazonwebservices.codewhisperer-for-command-line-companion": "Amazon Q CLI",
	"jetbrains.jetbrains-ai": "JetBrains AI",
	"sourcegraph.cody-ai": "Sourcegraph Cody",
	"continue.continue": "Continue",
	"blackboxapp.blackbox": "Blackbox AI",
	"codeium.windsurf": "Windsurf",
	"supermaven.supermaven": "Supermaven",
	"aider.aider": "Aider",
	"meshintelligenttechnologiesinc.pieces-vscode": "Pieces",
};

/**
 * Minimal detection input - only what's needed for extension ID matching.
 */
export interface MinimalDetectionInput {
	/** List of installed extension IDs */
	extensionIds: string[];
}

/**
 * Minimal detection result - no confidence scores or detailed indicators.
 */
export interface MinimalDetectionResult {
	/** Whether an AI tool was detected */
	detected: boolean;
	/** Display name of detected tool (null if not detected) */
	tool: string | null;
	/** Detection method - always "extension" for minimal detector */
	method: "extension" | null;
}

/**
 * MinimalAIDetector - IP-safe client-side AI detection.
 *
 * This class provides a minimal fallback for AI detection when the server
 * is unavailable. It ONLY checks for known extension IDs, which is public
 * information that doesn't expose any proprietary algorithms.
 *
 * @example
 * ```typescript
 * import * as vscode from 'vscode';
 * const detector = new MinimalAIDetector();
 * const result = detector.detect({
 *   extensionIds: vscode.extensions.all.map(e => e.id)
 * });
 * if (result.detected) {
 *   // output:(`AI tool detected: ${result.tool}`);
 * }
 * ```
 */
export class MinimalAIDetector {
	/**
	 * Detect AI coding assistants by extension ID.
	 *
	 * SECURITY: This method is intentionally simple and does NOT include:
	 * - Velocity-based detection
	 * - Content pattern matching
	 * - Confidence scoring algorithms
	 * - Combined signal weighting
	 *
	 * Those features are proprietary and only available server-side.
	 *
	 * @param input - Object containing array of extension IDs
	 * @returns Detection result with tool name if detected
	 */
	detect(input: MinimalDetectionInput): MinimalDetectionResult {
		// Simple extension ID matching - no proprietary logic here
		for (const extId of input.extensionIds) {
			const normalizedId = extId.toLowerCase();
			if (KNOWN_AI_EXTENSION_IDS.has(normalizedId)) {
				return {
					detected: true,
					tool: AI_TOOL_DISPLAY_NAMES[normalizedId] || "AI Assistant",
					method: "extension",
				};
			}
		}

		return {
			detected: false,
			tool: null,
			method: null,
		};
	}

	/**
	 * Check if a specific extension ID is a known AI tool.
	 *
	 * @param extensionId - Extension ID to check
	 * @returns True if the extension is a known AI tool
	 */
	isKnownAIExtension(extensionId: string): boolean {
		return KNOWN_AI_EXTENSION_IDS.has(extensionId.toLowerCase());
	}

	/**
	 * Get display name for an AI tool by extension ID.
	 *
	 * @param extensionId - Extension ID
	 * @returns Display name or null if not a known AI tool
	 */
	getToolDisplayName(extensionId: string): string | null {
		const normalizedId = extensionId.toLowerCase();
		return AI_TOOL_DISPLAY_NAMES[normalizedId] || null;
	}
}

/**
 * Singleton instance for convenience.
 * Use this when you don't need to manage the detector lifecycle.
 */
export const minimalAIDetector = new MinimalAIDetector();
