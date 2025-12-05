/**
 * @fileoverview Protection Service - Central facade for protection operations
 *
 * Provides a unified interface for:
 * - Repo-level protection status computation
 * - Context key management for UI state
 * - File save permission checks
 * - Protection audits
 *
 * Phase 2 Slice 5: Centralizes protection state queries and context management
 */

import type * as vscode from "vscode";
import { logger } from "../utils/logger.js";
import type { ProtectionLevel } from "../views/types.js";
import type { AIRiskService } from "./aiRiskService.js";
import type { ProtectedFileRegistry } from "./protectedFileRegistry.js";
import type {
	ProtectionManager,
	RepoProtectionAudit,
} from "./protectionPolicy.js";

/**
 * Save permission check result
 */
export interface SaveCheckResult {
	/** Whether save is allowed */
	allowed: boolean;
	/** Protection level of the file */
	protectionLevel?: ProtectionLevel;
	/** Reason if blocked */
	reason?: string;
}

/**
 * Protection Service
 *
 * Centralizes protection operations and provides a single source of truth for:
 * - Repo-level protection status
 * - File-level save checks
 * - Context key management for VS Code UI
 *
 * This is purely advisory/observational - it does not modify registry or policy
 */
export class ProtectionService {
	constructor(
		private registry: ProtectedFileRegistry,
		private policyManager: ProtectionManager,
		private aiRiskService: AIRiskService,
		private setContext: (key: string, value: any) => Promise<void> | void,
	) {}

	/**
	 * Get current repo-level protection status
	 * Calls policy manager to compute effective status
	 *
	 * @returns Repo protection audit with status and attention items
	 */
	async getRepoStatus(): Promise<RepoProtectionAudit> {
		try {
			const audit = await this.policyManager.computeRepoStatus();
			return audit;
		} catch (error) {
			logger.error("Failed to compute repo status", error as Error);
			return {
				status: "error",
				protectedCount: 0,
				unprotectedCount: 0,
				criticalUnprotectedCount: 0,
				attentionItems: [],
				computedAt: Date.now(),
			};
		}
	}

	/**
	 * Refresh VS Code context keys based on current repo status
	 * This drives UI visibility and state in the extension
	 *
	 * Sets context keys:
	 * - snapback.protectionStatus: "unprotected" | "partial" | "complete" | "error"
	 * - snapback.attentionCount: number of items needing user attention
	 */
	async refreshContextKeys(): Promise<void> {
		try {
			const audit = await this.getRepoStatus();

			// Set protection status context
			await this.setContext("snapback.protectionStatus", audit.status);

			// Set attention count context
			const attentionCount = audit.attentionItems?.length ?? 0;
			await this.setContext("snapback.attentionCount", attentionCount);

			logger.info("Updated context keys", {
				status: audit.status,
				attentionCount,
			});
		} catch (error) {
			logger.error("Failed to refresh context keys", error as Error);
		}
	}

	/**
	 * Check if a file save is allowed
	 * Performs permission checks based on protection level and cached AI risk
	 *
	 * @param document VS Code document being saved
	 * @returns Save permission result
	 */
	async checkSaveAllowed(
		document: vscode.TextDocument,
	): Promise<SaveCheckResult> {
		const filePath = document.uri.fsPath;
		const isProtected = this.registry.isProtected(filePath);

		// Unprotected files always allowed
		if (!isProtected) {
			return { allowed: true };
		}

		const protectionLevel = this.registry.getProtectionLevel(filePath);

		// For this slice, we allow all saves
		// Future slices will implement blocking based on protection level + risk
		// This is the "hook" for future save gating logic

		// Check cached AI risk (for future gating)
		const cachedRisk = this.aiRiskService.getCachedRisk(filePath);
		if (cachedRisk) {
			logger.debug("Cached AI risk found for save check", {
				filePath,
				level: cachedRisk.level,
				score: cachedRisk.score,
			});
			// Future: could block based on cachedRisk.level and protectionLevel
		}

		return {
			allowed: true,
			protectionLevel,
		};
	}

	/**
	 * Perform full repo audit
	 * Computes status and updates all context keys
	 *
	 * Should be called:
	 * - On extension activation
	 * - When workspace changes
	 * - When protection-related commands complete
	 * - When SnapBack view becomes visible
	 *
	 * @param forceRefresh - Force recomputation even if cache is valid
	 */
	async auditRepo(forceRefresh = false): Promise<void> {
		try {
			// Get repo status with optional forced refresh
			const audit = await this.policyManager.computeRepoStatus(forceRefresh);

			// Update context keys based on audit
			await this.setContext("snapback.protectionStatus", audit.status);
			const attentionCount = audit.attentionItems?.length ?? 0;
			await this.setContext("snapback.attentionCount", attentionCount);

			logger.info("Repo audit completed", {
				status: audit.status,
				attentionCount,
			});
		} catch (error) {
			logger.error("Repo audit failed", error as Error);
		}
	}

	/**
	 * Invalidate protection audit cache
	 * Call this when protection state changes (file protected/unprotected)
	 */
	invalidateAuditCache(): void {
		this.policyManager.invalidateCache();
		logger.debug("Protection audit cache invalidated");
	}
}
