/**
 * @fileoverview Session Tagger (VSCode Wrapper)
 *
 * This module wraps the SDK SessionTagger and provides VSCode-specific
 * AI detection functionality.
 */

import {
	type AIPresenceInfo,
	type BurstDetectionResult,
	SessionTagger as SDKSessionTagger,
	type SessionManifest,
	type SessionTag,
	type SessionTaggingResult,
} from "@snapback/sdk";
import { detectAIPresence } from "./AIPresenceDetector.js";

// Re-export types for backward compatibility
export type { SessionTag, SessionTaggingResult };

/**
 * VSCode-specific session tagger instance with AI detection
 */
const vscodeSessionTagger = new SDKSessionTagger({
	aiPresenceDetector: (): AIPresenceInfo => {
		const aiPresence = detectAIPresence();
		return {
			hasAI: aiPresence.hasAI,
			detectedAssistants: aiPresence.detectedAssistants,
			assistantDetails: aiPresence.assistantDetails,
		};
	},
});

/**
 * Analyzes a session and generates appropriate tags
 *
 * @param manifest Session manifest to analyze
 * @param burstResult Optional burst detection result
 * @returns Session tagging result with tags and confidence levels
 */
export function tagSession(
	manifest: SessionManifest,
	burstResult?: BurstDetectionResult,
): SessionTaggingResult {
	return vscodeSessionTagger.tagSession(manifest, burstResult);
}

/**
 * Updates a session manifest with appropriate tags
 *
 * @param manifest Session manifest to update
 * @param burstResult Optional burst detection result
 * @returns Updated session manifest with tags
 */
export function updateSessionWithTags(
	manifest: SessionManifest,
	burstResult?: BurstDetectionResult,
): SessionManifest {
	return vscodeSessionTagger.updateSessionWithTags(manifest, burstResult);
}
