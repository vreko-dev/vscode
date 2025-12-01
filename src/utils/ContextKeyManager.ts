/**
 * @fileoverview Context Key Manager - Manages VS Code context keys for when-clauses
 *
 * This module provides utilities for managing VS Code context keys that can be
 * used in when-clauses for commands, views, and other UI elements. This enables
 * adaptive UI based on user experience tier and other factors.
 */

import * as vscode from "vscode";
import type { ExperienceTier } from "./ExperienceClassifier.js";
import { logger } from "./logger.js";

/**
 * Context key names used by SnapBack
 */
export const CONTEXT_KEYS = {
	/** User experience tier */
	EXPERIENCE_TIER: "snapback.experienceTier",

	/** Whether user is an explorer */
	IS_EXPLORER: "snapback.isExplorer",

	/** Whether user is intermediate */
	IS_INTERMEDIATE: "snapback.isIntermediate",

	/** Whether user is a power user */
	IS_POWER: "snapback.isPower",

	/** Whether AI checkpointing is enabled */
	AI_CHECKPOINTING_ENABLED: "snapback.aiCheckpointingEnabled",

	/** Whether any AI assistant is detected */
	AI_DETECTED: "snapback.aiDetected",

	/** Whether GitHub Copilot is detected */
	GITHUB_COPILOT_DETECTED: "snapback.githubCopilotDetected",

	/** Whether Claude is detected */
	CLAUDE_DETECTED: "snapback.claudeDetected",

	/** Whether Tabnine is detected */
	TABNINE_DETECTED: "snapback.tabnineDetected",

	/** Whether Codeium is detected */
	CODEIUM_DETECTED: "snapback.codeiumDetected",

	/** Whether extension is active */
	IS_ACTIVE: "snapback.isActive",

	/** Whether user has protected files */
	HAS_PROTECTED_FILES: "snapback.hasProtectedFiles",

	/** Whether user has snapshots */
	HAS_SNAPSHOTS: "snapback.hasSnapshots",

	/** Whether user has sessions */
	HAS_SESSIONS: "snapback.hasSessions",

	/** Whether user has policy overrides */
	HAS_POLICY_OVERRIDES: "snapback.hasPolicyOverrides",

	/** Whether offline mode is enabled */
	OFFLINE_MODE: "snapback.offlineMode",

	/** Whether telemetry is enabled */
	TELEMETRY_ENABLED: "snapback.telemetryEnabled",
} as const;

/**
 * Context Key Manager - Manages VS Code context keys for when-clauses
 */
export class ContextKeyManager {
	/**
	 * Sets a context key value
	 *
	 * @param key - Context key name
	 * @param value - Value to set
	 */
	setContextKey(key: string, value: unknown): void {
		vscode.commands.executeCommand("setContext", key, value).then(
			() => {
				logger.debug("Context key set", { key, value });
			},
			(error) => {
				logger.error("Failed to set context key", error as Error, {
					key,
					value,
				});
			},
		);
	}

	/**
	 * Sets experience tier context keys
	 *
	 * @param tier - User experience tier
	 */
	setExperienceTier(tier: ExperienceTier): void {
		this.setContextKey(CONTEXT_KEYS.EXPERIENCE_TIER, tier);
		this.setContextKey(CONTEXT_KEYS.IS_EXPLORER, tier === "explorer");
		this.setContextKey(CONTEXT_KEYS.IS_INTERMEDIATE, tier === "intermediate");
		this.setContextKey(CONTEXT_KEYS.IS_POWER, tier === "power");
	}

	/**
	 * Sets AI-related context keys
	 *
	 * @param aiInfo - AI presence information
	 */
	setAIPresence(aiInfo: {
		hasAI: boolean;
		detectedAssistants: string[];
		assistantDetails: Record<string, string>;
	}): void {
		this.setContextKey(CONTEXT_KEYS.AI_DETECTED, aiInfo.hasAI);
		this.setContextKey(
			CONTEXT_KEYS.GITHUB_COPILOT_DETECTED,
			aiInfo.detectedAssistants.includes("GITHUB_COPILOT"),
		);
		this.setContextKey(
			CONTEXT_KEYS.CLAUDE_DETECTED,
			aiInfo.detectedAssistants.includes("CLAUDE"),
		);
		this.setContextKey(
			CONTEXT_KEYS.TABNINE_DETECTED,
			aiInfo.detectedAssistants.includes("TABNINE"),
		);
		this.setContextKey(
			CONTEXT_KEYS.CODEIUM_DETECTED,
			aiInfo.detectedAssistants.includes("CODEIUM"),
		);
	}

	/**
	 * Sets AI checkpointing enabled context key
	 *
	 * @param enabled - Whether AI checkpointing is enabled
	 */
	setAICheckpointingEnabled(enabled: boolean): void {
		this.setContextKey(CONTEXT_KEYS.AI_CHECKPOINTING_ENABLED, enabled);
	}

	/**
	 * Sets extension active context key
	 *
	 * @param active - Whether extension is active
	 */
	setExtensionActive(active: boolean): void {
		this.setContextKey(CONTEXT_KEYS.IS_ACTIVE, active);
	}

	/**
	 * Sets protected files context key
	 *
	 * @param hasProtectedFiles - Whether user has protected files
	 */
	setHasProtectedFiles(hasProtectedFiles: boolean): void {
		this.setContextKey(CONTEXT_KEYS.HAS_PROTECTED_FILES, hasProtectedFiles);
	}

	/**
	 * Sets snapshots context key
	 *
	 * @param hasSnapshots - Whether user has snapshots
	 */
	setHasSnapshots(hasSnapshots: boolean): void {
		this.setContextKey(CONTEXT_KEYS.HAS_SNAPSHOTS, hasSnapshots);
	}

	/**
	 * Sets sessions context key
	 *
	 * @param hasSessions - Whether user has sessions
	 */
	setHasSessions(hasSessions: boolean): void {
		this.setContextKey(CONTEXT_KEYS.HAS_SESSIONS, hasSessions);
	}

	/**
	 * Sets policy overrides context key
	 *
	 * @param hasPolicyOverrides - Whether user has policy overrides
	 */
	setHasPolicyOverrides(hasPolicyOverrides: boolean): void {
		this.setContextKey(CONTEXT_KEYS.HAS_POLICY_OVERRIDES, hasPolicyOverrides);
	}

	/**
	 * Sets offline mode context key
	 *
	 * @param offlineMode - Whether offline mode is enabled
	 */
	setOfflineMode(offlineMode: boolean): void {
		this.setContextKey(CONTEXT_KEYS.OFFLINE_MODE, offlineMode);
	}

	/**
	 * Sets telemetry enabled context key
	 *
	 * @param telemetryEnabled - Whether telemetry is enabled
	 */
	setTelemetryEnabled(telemetryEnabled: boolean): void {
		this.setContextKey(CONTEXT_KEYS.TELEMETRY_ENABLED, telemetryEnabled);
	}

	/**
	 * Resets all context keys (for testing)
	 */
	resetAllContextKeys(): void {
		for (const key of Object.values(CONTEXT_KEYS)) {
			this.setContextKey(key, undefined);
		}

		logger.info("All context keys reset");
	}

	/**
	 * Initializes context keys with default values
	 */
	initializeContextKeys(): void {
		// Set default values for context keys
		this.setContextKey(CONTEXT_KEYS.EXPERIENCE_TIER, "unknown");
		this.setContextKey(CONTEXT_KEYS.IS_EXPLORER, false);
		this.setContextKey(CONTEXT_KEYS.IS_INTERMEDIATE, false);
		this.setContextKey(CONTEXT_KEYS.IS_POWER, false);
		this.setContextKey(CONTEXT_KEYS.AI_CHECKPOINTING_ENABLED, false);
		this.setContextKey(CONTEXT_KEYS.AI_DETECTED, false);
		this.setContextKey(CONTEXT_KEYS.GITHUB_COPILOT_DETECTED, false);
		this.setContextKey(CONTEXT_KEYS.CLAUDE_DETECTED, false);
		this.setContextKey(CONTEXT_KEYS.TABNINE_DETECTED, false);
		this.setContextKey(CONTEXT_KEYS.CODEIUM_DETECTED, false);
		this.setContextKey(CONTEXT_KEYS.IS_ACTIVE, false);
		this.setContextKey(CONTEXT_KEYS.HAS_PROTECTED_FILES, false);
		this.setContextKey(CONTEXT_KEYS.HAS_SNAPSHOTS, false);
		this.setContextKey(CONTEXT_KEYS.HAS_SESSIONS, false);
		this.setContextKey(CONTEXT_KEYS.HAS_POLICY_OVERRIDES, false);
		this.setContextKey(CONTEXT_KEYS.OFFLINE_MODE, false);
		this.setContextKey(CONTEXT_KEYS.TELEMETRY_ENABLED, true);

		logger.info("Context keys initialized");
	}
}
