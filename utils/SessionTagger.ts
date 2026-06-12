/**
 * @fileoverview Session Tagger (VSCode Wrapper)
 *
 * This module wraps the SDK SessionTagger and provides VSCode-specific
 * AI detection functionality.
 *
 * Spec 5.4: AI presence detected here is forwarded to the daemon via the
 * optional `reporter` callback so `aiToolsDetected` on the session record
 * is populated for intelligence-pipeline scoring.
 */

import type { BurstDetectionResult, SessionManifest, SessionTag, SessionTaggingResult } from "../types/sdk";
import { detectAIPresence } from "./AIPresenceDetector";

// Re-export types for backward compatibility
export type { SessionTag, SessionTaggingResult };

/**
 * Optional callback to forward detected tool names to the daemon.
 * Callers with DaemonBridge access should pass this to ensure the
 * session/report-ai-tool IPC is fired (spec 5.4).
 */
export type AiToolReporter = (tools: string[]) => void;

/**
 * Local session tagger replacing SDK SessionTagger
 */
function generateTags(
	manifest: SessionManifest,
	burstResult?: BurstDetectionResult,
	reporter?: AiToolReporter,
): SessionTaggingResult {
	const tags: SessionTag[] = [];
	const aiPresence = detectAIPresence();

	if (aiPresence.hasAI) {
		tags.push({ key: "ai-assisted", value: "true" });
		if (aiPresence.detectedAssistants && aiPresence.detectedAssistants.length > 0) {
			tags.push({ key: "ai-tools", value: aiPresence.detectedAssistants.join(",") });
			// Spec 5.4: forward detected tools to daemon so aiToolsDetected is populated
			reporter?.(aiPresence.detectedAssistants as string[]);
		}
	}

	if (burstResult?.isBurst) {
		tags.push({ key: "burst", value: "true" });
	}

	const fileCount = manifest.fileCount ?? 0;
	if (fileCount > 10) {
		tags.push({ key: "large-session", value: "true" });
	}

	return { tags, confidence: tags.length > 0 ? 0.8 : 0.5 };
}

export function tagSession(
	manifest: SessionManifest,
	burstResult?: BurstDetectionResult,
	reporter?: AiToolReporter,
): SessionTaggingResult {
	return generateTags(manifest, burstResult, reporter);
}

export function updateSessionWithTags(
	manifest: SessionManifest,
	burstResult?: BurstDetectionResult,
	reporter?: AiToolReporter,
): SessionManifest {
	const result = generateTags(manifest, burstResult, reporter);
	return { ...manifest, tags: result.tags };
}
