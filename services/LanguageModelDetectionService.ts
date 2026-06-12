/**
 * Language Model Detection Service
 *
 * Uses VS Code's stable Language Model API (vscode.lm) to detect:
 * - Active Copilot models (gpt-4o, gpt-4o-mini, o1, o1-mini, claude-3.5-sonnet)
 * - Real-time model availability (not just config file presence)
 * - Dynamic provider health status
 *
 * API stable since: VS Code 1.90 (May 2024)
 * Docs: https://code.visualstudio.com/api/extension-guides/language-model
 */

import * as vscode from "vscode";
import { logger } from "../utils/logger";

export interface DetectedLanguageModel {
	id: string;
	vendor: string;
	family: string;
	version?: string;
	maxInputTokens: number;
	available: boolean;
}

export interface LanguageModelDetectionResult {
	models: DetectedLanguageModel[];
	copilotEnabled: boolean;
	totalModels: number;
	timestamp: number;
}

/**
 * LanguageModelDetectionService - Detects active language models using vscode.lm API
 */
export class LanguageModelDetectionService {
	private static instance: LanguageModelDetectionService | null = null;
	private lastDetection: LanguageModelDetectionResult | null = null;
	private detectionCache: Map<string, DetectedLanguageModel[]> = new Map();
	private readonly CACHE_TTL = 30000; // 30 seconds

	private constructor() {
		/* intentionally empty */
	}

	/**
	 * Get the singleton instance
	 */
	static getInstance(): LanguageModelDetectionService {
		if (!LanguageModelDetectionService.instance) {
			LanguageModelDetectionService.instance = new LanguageModelDetectionService();
		}
		return LanguageModelDetectionService.instance;
	}

	/**
	 * Detect all available language models using vscode.lm API
	 *
	 * NOTE: This must be called as part of a user-initiated action (e.g., command)
	 * because Copilot models require user consent via authentication dialog.
	 */
	async detectLanguageModels(): Promise<LanguageModelDetectionResult> {
		try {
			const detectedModels: DetectedLanguageModel[] = [];

			// Check if vscode.lm API is available (VS Code 1.90+)
			if (!vscode.lm || typeof vscode.lm.selectChatModels !== "function") {
				logger.debug("VS Code Language Model API not available (requires VS Code 1.90+)");
				return {
					models: [],
					copilotEnabled: false,
					totalModels: 0,
					timestamp: Date.now(),
				};
			}

			// Detect Copilot models (vendor: 'copilot')
			const copilotModels = await this.detectCopilotModels();
			detectedModels.push(...copilotModels);

			// Future: Add detection for other vendors as they become available
			// const otherModels = await this.detectOtherVendors();
			// detectedModels.push(...otherModels);

			const result: LanguageModelDetectionResult = {
				models: detectedModels,
				copilotEnabled: copilotModels.length > 0,
				totalModels: detectedModels.length,
				timestamp: Date.now(),
			};

			this.lastDetection = result;
			logger.info("Language models detected", {
				count: result.totalModels,
				copilot: result.copilotEnabled,
			});

			return result;
		} catch (error) {
			logger.warn("Failed to detect language models", { error });
			return {
				models: [],
				copilotEnabled: false,
				totalModels: 0,
				timestamp: Date.now(),
			};
		}
	}

	/**
	 * Detect Copilot models specifically
	 */
	private async detectCopilotModels(): Promise<DetectedLanguageModel[]> {
		try {
			// Select all Copilot models (gpt-4o, gpt-4o-mini, o1, o1-mini, claude-3.5-sonnet)
			const models = await vscode.lm.selectChatModels({
				vendor: "copilot",
			});

			if (models.length === 0) {
				logger.debug("No Copilot models available (user may not have consented or no subscription)");
				return [];
			}

			// Map to our DetectedLanguageModel format
			const detectedModels: DetectedLanguageModel[] = models.map((model) => ({
				id: model.id,
				vendor: model.vendor,
				family: model.family,
				version: model.version,
				maxInputTokens: model.maxInputTokens,
				available: true,
			}));

			logger.info("Copilot models detected", {
				count: detectedModels.length,
				families: detectedModels.map((m) => m.family).join(", "),
			});

			return detectedModels;
		} catch (error) {
			if (error instanceof vscode.LanguageModelError) {
				// Handle specific language model errors
				logger.warn("Language model error during Copilot detection", {
					message: error.message,
					cause: error.cause,
				});
			} else {
				logger.error("Unexpected error detecting Copilot models", { error });
			}
			return [];
		}
	}

	/**
	 * Test a specific model by sending a simple request
	 *
	 * This verifies the model is not just available, but actually functional.
	 */
	async testModel(modelId: string): Promise<boolean> {
		try {
			const models = await vscode.lm.selectChatModels({ id: modelId });

			if (models.length === 0) {
				logger.debug("Model not found for testing", { modelId });
				return false;
			}

			const [model] = models;

			// Send a simple test request
			const testPrompt = [vscode.LanguageModelChatMessage.User("Respond with 'OK' if you can read this.")];

			const cancellationTokenSource = new vscode.CancellationTokenSource();
			const timeout = setTimeout(() => {
				cancellationTokenSource.cancel();
			}, 5000); // 5 second timeout

			try {
				const response = await model.sendRequest(testPrompt, {}, cancellationTokenSource.token);

				// Consume the stream to verify it works
				const iterator = response.text[Symbol.asyncIterator]();
				const firstChunk = await iterator.next();
				const received = !firstChunk.done;

				clearTimeout(timeout);
				return received;
			} catch (error) {
				clearTimeout(timeout);
				if (error instanceof vscode.CancellationError) {
					logger.warn("Model test timed out", { modelId });
					return false;
				}
				throw error;
			}
		} catch (error) {
			logger.warn("Model test failed", { modelId, error });
			return false;
		}
	}

	/**
	 * Get cached detection result (if recent)
	 */
	getCachedDetection(): LanguageModelDetectionResult | null {
		if (!this.lastDetection) {
			return null;
		}

		const age = Date.now() - this.lastDetection.timestamp;
		if (age > this.CACHE_TTL) {
			return null; // Cache expired
		}

		return this.lastDetection;
	}

	/**
	 * Check if a specific model family is available
	 */
	async hasModelFamily(family: string): Promise<boolean> {
		try {
			const models = await vscode.lm.selectChatModels({
				vendor: "copilot",
				family,
			});
			return models.length > 0;
		} catch (error) {
			logger.debug("Failed to check model family availability", { family, error });
			return false;
		}
	}

	/**
	 * Get recommended model for a specific task
	 *
	 * Based on VS Code docs:
	 * - gpt-4o: Performance and quality (general use)
	 * - gpt-4o-mini: Editor interactions (fast, lightweight)
	 * - o1/o1-mini: Complex reasoning tasks
	 * - claude-3.5-sonnet: Alternative quality model
	 */
	async getRecommendedModel(task: "general" | "editor" | "reasoning"): Promise<string | null> {
		const familyPreferences = {
			general: ["gpt-4o", "claude-3.5-sonnet", "gpt-4o-mini"],
			editor: ["gpt-4o-mini", "gpt-4o"],
			reasoning: ["o1", "o1-mini", "gpt-4o"],
		};

		const preferences = familyPreferences[task];

		for (const family of preferences) {
			const hasModel = await this.hasModelFamily(family);
			if (hasModel) {
				return family;
			}
		}

		return null;
	}

	/**
	 * Clear cached detection results
	 */
	clearCache(): void {
		this.lastDetection = null;
		this.detectionCache.clear();
	}
}

/**
 * Get the global LanguageModelDetectionService instance
 */
export function getLanguageModelDetectionService(): LanguageModelDetectionService {
	return LanguageModelDetectionService.getInstance();
}
