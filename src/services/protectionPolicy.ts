/**
 * Protection Policy Model and Manager
 *
 * Phase 2 Introduction: Explicit protection policy abstraction layer
 * Separates policy definition (what rules apply) from enforcement (how they're applied)
 *
 * This module provides:
 * 1. ProtectionRule - Individual protection rule definition
 * 2. ProtectionPolicy - Complete merged policy object with metadata
 * 3. ProtectionManager - Service that computes effective policy and repo status
 * 4. RepoProtectionStatus - Status enumeration for repo-level protection
 */

import type { ProtectionLevel } from "../types/protection.js";
import type { SnapBackRC } from "../types/snapbackrc.types";
import { logger } from "../utils/logger.js";
import type { ProtectedFileRegistry } from "./protectedFileRegistry.js";

/**
 * Individual protection rule definition
 * Specifies a pattern and the protection level that applies to files matching it
 */
export interface ProtectionRule {
	/** Glob pattern to match files (e.g., "package.json", "*.env.*") */
	pattern: string;
	/** Protection level to apply when rule matches */
	level: ProtectionLevel;
	/** Optional: Category for UI organization */
	category?: string;
	/** Optional: Description of why this rule exists */
	description?: string;
}

/**
 * Repo-level protection status
 * Used to communicate overall repo protection state to UI/commands
 */
export type RepoProtectionStatus =
	| "unprotected"
	| "partial"
	| "complete"
	| "error";

/**
 * Item that needs attention in the protection audit
 * Examples: unprotected critical files, high-risk changes, missing snapshots
 */
export interface AttentionItem {
	type: "unprotected_critical" | "high_risk" | "missing_snapshot";
	filePath: string;
	message: string;
	severity: "info" | "warning" | "error";
	/** Optional action command to fix this item */
	action?: string;
}

/**
 * Result of a repo-wide protection status audit
 * Computed on demand by ProtectionManager
 */
export interface RepoProtectionAudit {
	status: RepoProtectionStatus;
	protectedCount: number;
	unprotectedCount: number;
	criticalUnprotectedCount: number;
	attentionItems: AttentionItem[];
	computedAt: number;
}

/**
 * Effective protection policy
 * Represents the merged, active protection rules and configuration
 *
 * This is created by ProtectionManager after:
 * 1. Loading default rules
 * 2. Merging user .snapbackrc config
 * 3. Detecting active stack profiles (future enhancement)
 */
export interface ProtectionPolicy {
	/** Version of the policy schema */
	version: "1.0";

	/** Effective protection rules (defaults + user overrides + stacks) */
	rules: ProtectionRule[];

	/** Stack profiles that are active in this workspace (populated by stack detection) */
	stacks?: Array<{ id: string; name: string }>;

	/** Audit information about where the policy came from */
	audit: {
		/** When the policy was last computed */
		loadedAt: number;
		/** Source of the policy ("defaults" | "snapbackrc" | "merged") */
		source: "defaults" | "snapbackrc" | "merged";
		/** Number of rules in the policy */
		rulesCount: number;
		/** Number of rules from defaults */
		defaultRulesCount: number;
		/** Number of rules from user .snapbackrc */
		userRulesCount: number;
	};
}

/**
 * ProtectionManager
 *
 * Service that:
 * 1. Computes effective protection policy from defaults + merged config + stack detection
 * 2. Audits repo-wide protection status
 * 3. Identifies files/items that need attention
 *
 * This is a data/logic service - it does NOT modify registry or files.
 * It's purely observational and advisory.
 */
export class ProtectionManager {
	private effectivePolicy: ProtectionPolicy | null = null;
	private cachedAudit: RepoProtectionAudit | null = null;
	private lastAuditTime: number = 0;
	private readonly AUDIT_CACHE_TTL = 5000; // 5 seconds

	constructor(
		private readonly registry: ProtectedFileRegistry,
		private readonly getMergedConfig: () => SnapBackRC | null,
		private readonly workspaceRoot?: string,
	) {}

	/**
	 * Get the effective protection policy
	 * Builds or returns cached policy from merged config + stack detection
	 *
	 * @returns Current effective policy or null if no config loaded
	 */
	async getEffectivePolicy(): Promise<ProtectionPolicy | null> {
		const mergedConfig = this.getMergedConfig();

		if (!mergedConfig) {
			return null;
		}

		// Rebuild policy if config changed or cache expired
		if (
			!this.effectivePolicy ||
			this.effectivePolicy.audit.loadedAt < Date.now() - 60000
		) {
			this.effectivePolicy = await this.buildPolicy(mergedConfig);
		}

		return this.effectivePolicy;
	}

	/**
	 * Compute repo-wide protection status
	 * Performs an audit of which files are protected vs unprotected
	 *
	 * This is a heavier operation - results are cached for AUDIT_CACHE_TTL
	 *
	 * @param forceRefresh - Force recomputation even if cache is valid
	 * @returns Audit result with status, counts, and attention items
	 */
	async computeRepoStatus(forceRefresh = false): Promise<RepoProtectionAudit> {
		try {
			// Check cache
			const now = Date.now();
			if (
				!forceRefresh &&
				this.cachedAudit &&
				now - this.lastAuditTime < this.AUDIT_CACHE_TTL
			) {
				logger.debug("Returning cached protection audit");
				return this.cachedAudit;
			}

			const policy = await this.getEffectivePolicy();

			if (!policy) {
				logger.warn(
					"No protection policy available for repo status computation",
				);
				return this.createErrorAudit();
			}

			// Get all protected files from registry
			const allProtected = await this.registry.list();
			const protectedCount = allProtected.length;

			// Build attention items (expensive operation)
			const attentionItems = await this.computeAttentionItems(
				policy,
				allProtected,
			);

			// Count critical unprotected files
			const criticalUnprotectedCount = attentionItems.filter(
				(i) => i.type === "unprotected_critical",
			).length;

			// Determine overall status
			let status: RepoProtectionStatus = "unprotected";
			if (protectedCount === 0 && criticalUnprotectedCount === 0) {
				status = "unprotected"; // No files protected yet
			} else if (criticalUnprotectedCount === 0 && protectedCount > 0) {
				status = "complete"; // All critical files protected
			} else if (protectedCount > 0) {
				status = "partial"; // Some files protected, but critical files missing
			}

			const audit: RepoProtectionAudit = {
				status,
				protectedCount,
				unprotectedCount: criticalUnprotectedCount, // Only count critical unprotected
				criticalUnprotectedCount,
				attentionItems,
				computedAt: now,
			};

			// Cache result
			this.cachedAudit = audit;
			this.lastAuditTime = now;

			logger.info("Protection audit completed", {
				status,
				protectedCount,
				attentionCount: attentionItems.length,
			});

			return audit;
		} catch (error) {
			logger.error("Failed to compute repo status", error as Error);
			return this.createErrorAudit();
		}
	}

	/**
	 * Invalidate cached audit
	 * Call this when protection state changes (e.g., file protected/unprotected)
	 */
	invalidateCache(): void {
		this.cachedAudit = null;
		this.lastAuditTime = 0;
		logger.debug("Protection audit cache invalidated");
	}

	/**
	 * Build a ProtectionPolicy from merged config + stack detection
	 */
	private async buildPolicy(
		mergedConfig: SnapBackRC,
	): Promise<ProtectionPolicy> {
		const protection = mergedConfig.protection || [];
		const now = Date.now();

		// Detect stacks and get their rules (async operation)
		let stacks: Array<{ id: string; name: string }> = [];
		let stackRules: typeof protection = [];

		try {
			// Import stack detection dynamically to avoid circular deps
			const { detectStacks } = await import("../stacks/stackDetection.js");
			const detectedStacks = await detectStacks(this.workspaceRoot);

			stacks = detectedStacks.map((s) => ({ id: s.id, name: s.name }));
			stackRules = detectedStacks.flatMap((s) => s.rules);

			logger.info(`Detected ${stacks.length} stacks for protection policy`, {
				stacks: stacks.map((s) => s.id).join(", "),
			});
		} catch (error) {
			logger.warn("Stack detection failed, using config only", error as Error);
		}

		// Merge rules: config rules take precedence over stack rules
		const allRules = [...protection, ...stackRules];

		// Estimate defaults vs user rules (heuristic)
		const defaultRulesCount = stackRules.length;
		const userRulesCount = protection.length;

		return {
			version: "1.0",
			rules: allRules,
			stacks,
			audit: {
				loadedAt: now,
				source: stacks.length > 0 ? "merged" : "snapbackrc",
				rulesCount: allRules.length,
				defaultRulesCount,
				userRulesCount,
			},
		};
	}

	/**
	 * Compute items that need user attention
	 * Scans workspace for critical files that are unprotected or insufficiently protected
	 */
	private async computeAttentionItems(
		policy: ProtectionPolicy,
		protectedFiles: Array<{ path: string; protectionLevel?: string }>,
	): Promise<AttentionItem[]> {
		const items: AttentionItem[] = [];

		try {
			// Import vscode only when needed
			const vscode = await import("vscode");

			// Get workspace root
			const workspaceRoot =
				this.workspaceRoot ||
				vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

			if (!workspaceRoot) {
				logger.warn("No workspace root for attention item computation");
				return [];
			}

			// Create map of protected file paths to their protection levels for quick lookup
			const protectedMap = new Map(
				protectedFiles.map((p) => [p.path, p.protectionLevel || "Watched"]),
			);

			// Helper to compare protection levels (higher number = more protection)
			const getLevelValue = (level: string): number => {
				const levelMap: Record<string, number> = {
					Watched: 1,
					Warning: 2,
					Protected: 3,
				};
				return levelMap[level] || 0;
			};

			// Check each protection rule to see if matching files are properly protected
			const criticalPatterns = policy.rules.filter(
				(r) => r.level === "Protected" || r.level === "Warning",
			);

			for (const rule of criticalPatterns) {
				try {
					// Find files matching this pattern
					const files = await vscode.workspace.findFiles(
						new vscode.RelativePattern(workspaceRoot, rule.pattern),
						"**/node_modules/**", // Exclude node_modules
					);

					for (const file of files) {
						const filePath = file.fsPath;
						const currentLevel = protectedMap.get(filePath);

						if (!currentLevel) {
							// File matches critical pattern but is NOT protected
							items.push({
								type: "unprotected_critical",
								filePath,
								message: `${rule.category || "Critical file"}: not protected (should be ${rule.level === "Protected" ? "Block" : "Warn"})`,
								severity: rule.level === "Protected" ? "error" : "warning",
								action: "snapback.protectFile",
							});
						} else if (
							getLevelValue(currentLevel) < getLevelValue(rule.level)
						) {
							// File is protected but at INSUFFICIENT level
							const currentLabel =
								currentLevel === "Watched"
									? "Watch"
									: currentLevel === "Warning"
										? "Warn"
										: "Block";
							const requiredLabel =
								rule.level === "Protected" ? "Block" : "Warn";

							items.push({
								type: "unprotected_critical", // Reuse this type for now
								filePath,
								message: `${rule.category || "Critical file"}: protected at ${currentLabel}, should be ${requiredLabel}`,
								severity: "warning", // Insufficient protection is a warning, not error
								action: "snapback.setProtectionLevel",
							});
						}
					}
				} catch (error) {
					logger.debug(
						`Failed to check pattern: ${rule.pattern}`,
						error as Error,
					);
				}
			}

			// Sort items: errors first, then warnings
			items.sort((a, b) => {
				if (a.severity === b.severity) return 0;
				return a.severity === "error" ? -1 : 1;
			});

			// Limit attention items to prevent overwhelming the user
			const MAX_ATTENTION_ITEMS = 20;
			if (items.length > MAX_ATTENTION_ITEMS) {
				logger.info(
					`Limiting attention items from ${items.length} to ${MAX_ATTENTION_ITEMS}`,
				);
				return items.slice(0, MAX_ATTENTION_ITEMS).concat([
					{
						type: "unprotected_critical",
						filePath: "",
						message: `...and ${items.length - MAX_ATTENTION_ITEMS} more files`,
						severity: "info",
					},
				]);
			}

			return items;
		} catch (error) {
			logger.error("Failed to compute attention items", error as Error);
			return [];
		}
	}

	/**
	 * Create an error audit result
	 */
	private createErrorAudit(): RepoProtectionAudit {
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
