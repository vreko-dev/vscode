import * as fs from "node:fs/promises";
import * as path from "node:path";
import { minimatch } from "minimatch";
import * as vscode from "vscode";
import type {
	OverrideRationale,
	PolicyConfig,
	PolicyOverride,
	PolicyRule,
} from "../types/policy.types.js";
import type { ProtectionLevel } from "../types/protection.js";
import { logger } from "../utils/logger.js";

/**
 * PolicyManager handles loading and applying policies from .snapback/policy.json
 *
 * This manager loads policies from the .snapback/policy.json file and provides
 * methods to determine protection levels for files based on those policies.
 *
 * MVP Note: This replaces cloud policy management with local file-based policies
 * that are diff-reviewable and stored in the .snapback directory.
 */
export class PolicyManager {
	private policy: PolicyConfig | null = null;
	private policyPath: string;
	private watcher: vscode.FileSystemWatcher | null = null;
	private expirationCheckInterval: NodeJS.Timeout | null = null;
	private disposables: vscode.Disposable[] = [];

	constructor(private workspaceRoot: string) {
		this.policyPath = path.join(workspaceRoot, ".snapback", "policy.json");
	}

	/**
	 * Initialize the policy manager
	 */
	async initialize(): Promise<void> {
		await this.loadPolicy();
		this.setupWatcher();

		// Check for expired overrides daily
		this.startExpirationChecks();
	}

	/**
	 * Load policy from .snapback/policy.json
	 */
	async loadPolicy(): Promise<void> {
		try {
			// Check if policy file exists
			await fs.access(this.policyPath);

			// Read and parse policy file
			const content = await fs.readFile(this.policyPath, "utf8");
			const parsed = JSON.parse(content) as PolicyConfig;

			// Validate policy structure
			if (!parsed.version || parsed.version !== "1.0") {
				logger.warn("Invalid policy version, using defaults", {
					path: this.policyPath,
					version: parsed.version,
				});
				this.policy = this.getDefaultPolicy();
				return;
			}

			if (!Array.isArray(parsed.rules)) {
				logger.warn("Invalid policy rules format, using defaults", {
					path: this.policyPath,
				});
				this.policy = this.getDefaultPolicy();
				return;
			}

			this.policy = parsed;
			logger.info("Policy loaded successfully", {
				path: this.policyPath,
				rulesCount: parsed.rules.length,
			});
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === "ENOENT") {
				// Policy file doesn't exist, create default
				logger.info("Policy file not found, creating default", {
					path: this.policyPath,
				});
				await this.createDefaultPolicy();
			} else {
				logger.error(
					"Failed to load policy",
					error instanceof Error ? error : undefined,
				);
				this.policy = this.getDefaultPolicy();
			}
		}
	}

	/**
	 * Check if a file has an active override
	 * @param filePath The file path to check
	 * @returns The active override if one exists, otherwise null
	 */
	getActiveOverride(filePath: string): PolicyOverride | null {
		if (!this.policy?.overrides) {
			return null;
		}

		const relativePath = path.relative(this.workspaceRoot, filePath);

		for (const override of this.policy.overrides) {
			if (minimatch(relativePath, override.pattern, { dot: true })) {
				// Check if override has expired
				if (override.ttl && Date.now() > override.ttl) {
					continue; // Skip expired override
				}

				return override;
			}
		}

		return null;
	}

	/**
	 * Get protection level with proper rule precedence and conflict resolution
	 *
	 * Precedence order: Overrides > Rules > Default
	 * Rule precedence: Higher precedence numbers take priority
	 * Conflict resolution: For rules with same precedence, later rules override earlier ones
	 */
	getProtectionLevel(filePath: string): ProtectionLevel | null {
		if (!this.policy) {
			return null;
		}

		const relativePath = path.relative(this.workspaceRoot, filePath);

		// Check ignore patterns first
		if (this.shouldIgnore(filePath)) {
			return null;
		}

		// Check overrides (highest precedence)
		if (this.policy.overrides) {
			for (const override of this.policy.overrides) {
				if (minimatch(relativePath, override.pattern, { dot: true })) {
					// Check if override has expired
					if (override.ttl && Date.now() > override.ttl) {
						logger.warn("Override expired, falling back to rule", {
							pattern: override.pattern,
							expired: new Date(override.ttl).toISOString(),
						});
						continue; // Skip expired override
					}

					return this.convertPolicyLevel(override.level);
				}
			}
		}

		// Check regular rules with precedence resolution
		const matchingRules = this.policy.rules
			.filter((rule) => minimatch(relativePath, rule.pattern, { dot: true }))
			.sort((a, b) => {
				// Higher precedence numbers take priority
				const precedenceA = a.precedence ?? 0;
				const precedenceB = b.precedence ?? 0;

				// If precedence is the same, later rules in the array take priority
				if (precedenceA === precedenceB) {
					const indexA = this.policy?.rules.indexOf(a);
					const indexB = this.policy?.rules.indexOf(b);

					// Handle cases where indexA or indexB might be undefined
					const safeIndexA = indexA !== undefined ? indexA : -1;
					const safeIndexB = indexB !== undefined ? indexB : -1;

					return safeIndexB - safeIndexA; // Later rules first
				}

				return precedenceB - precedenceA; // Higher precedence first
			});

		// Apply the highest priority rule
		if (matchingRules.length > 0) {
			return this.convertPolicyLevel(matchingRules[0].level);
		}

		// Return default if specified
		if (this.policy.settings?.defaultProtectionLevel) {
			return this.convertPolicyLevel(
				this.policy.settings.defaultProtectionLevel,
			);
		}

		return null;
	}

	/**
	 * Check if a file should be ignored based on policies
	 */
	shouldIgnore(filePath: string): boolean {
		if (!this.policy?.ignore) {
			return false;
		}

		const relativePath = path.relative(this.workspaceRoot, filePath);

		for (const pattern of this.policy.ignore) {
			if (minimatch(relativePath, pattern, { dot: true })) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Get policy settings
	 */
	getSettings(): PolicyConfig["settings"] {
		return this.policy?.settings;
	}

	/**
	 * Get all policy rules
	 */
	getRules(): PolicyRule[] {
		return this.policy?.rules || [];
	}

	/**
	 * Create a policy override
	 * @param filePath The file path to override
	 * @param newLevel The new protection level
	 * @param rationale The rationale for the override
	 * @param ttl The TTL for the override (e.g., "7d", "30d", "permanent")
	 */
	async createOverride(
		filePath: string,
		newLevel: "watch" | "warn" | "block" | "unprotected",
		rationale: OverrideRationale,
		ttl: string,
	): Promise<void> {
		if (!rationale) {
			throw new Error("Rationale is required for policy overrides");
		}

		// Convert relative path to workspace-relative path
		const relativePath = path.relative(this.workspaceRoot, filePath);

		// Calculate TTL timestamp
		let ttlTimestamp: number | undefined;
		if (ttl !== "permanent") {
			const days = parseInt(ttl.replace("d", ""), 10);
			if (Number.isNaN(days)) {
				throw new Error("Invalid TTL format. Use '7d', '30d', or 'permanent'");
			}
			ttlTimestamp = Date.now() + days * 24 * 60 * 60 * 1000;
		}

		// Create the override object
		const override: PolicyOverride = {
			pattern: relativePath,
			level: newLevel,
			rationale,
			ttl: ttlTimestamp,
			metadata: {
				createdAt: Date.now(),
				createdBy: "User", // In a real implementation, this would come from the user context
			},
		};

		// Load current policy
		if (!this.policy) {
			await this.loadPolicy();
		}

		// Add or update the override
		if (!this.policy?.overrides) {
			if (!this.policy) {
				this.policy = this.getDefaultPolicy();
			}
			this.policy.overrides = [];
		}

		// Check if an override already exists for this pattern
		const existingIndex = this.policy.overrides.findIndex(
			(o) => o.pattern === relativePath,
		);

		if (existingIndex >= 0) {
			// Update existing override
			this.policy.overrides[existingIndex] = override;
		} else {
			// Add new override
			this.policy.overrides.push(override);
		}

		// Save the updated policy
		await this.savePolicy();
	}

	/**
	 * Convert policy level to protection level
	 */
	private convertPolicyLevel(
		level: "watch" | "warn" | "block" | "unprotected",
	): ProtectionLevel | null {
		switch (level) {
			case "block":
				return "Protected";
			case "warn":
				return "Warning";
			case "watch":
				return "Watched";
			case "unprotected":
				return null;
			default:
				return "Watched";
		}
	}

	/**
	 * Create default policy file
	 */
	private async createDefaultPolicy(): Promise<void> {
		try {
			// Ensure .snapback directory exists
			const snapbackDir = path.dirname(this.policyPath);
			await fs.mkdir(snapbackDir, { recursive: true });

			// Create default policy
			const defaultPolicy = this.getDefaultPolicy();
			const content = JSON.stringify(defaultPolicy, null, 2);

			await fs.writeFile(this.policyPath, content, "utf8");
			this.policy = defaultPolicy;

			logger.info("Default policy file created", {
				path: this.policyPath,
			});
		} catch (error) {
			logger.error(
				"Failed to create default policy",
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Get default policy configuration
	 */
	private getDefaultPolicy(): PolicyConfig {
		return {
			version: "1.0",
			rules: [
				{
					pattern: "**/*.env*",
					level: "block",
					reason: "Environment files contain sensitive credentials",
					precedence: 100, // High precedence for security-sensitive files
				},
				{
					pattern: "package*.json",
					level: "warn",
					reason: "Package files affect dependencies",
					precedence: 50, // Medium precedence for dependency files
				},
				{
					pattern: "**/migrations/*",
					level: "block",
					reason: "Database migrations are irreversible",
					precedence: 100, // High precedence for critical operations
				},
			],
			overrides: [], // Initialize with empty overrides array
			ignore: ["node_modules/**", ".git/**", "dist/**", "*.log"],
			settings: {
				defaultProtectionLevel: "watch",
				requireSnapshotMessage: true,
				maxSnapshots: 100,
				overrideExpirationWarningDays: 7, // Default to 7 days warning
			},
		};
	}

	/**
	 * Set up file watcher for policy changes
	 */
	private setupWatcher(): void {
		try {
			// Watch for policy file changes
			this.watcher = vscode.workspace.createFileSystemWatcher(
				new vscode.RelativePattern(
					path.dirname(this.policyPath),
					"policy.json",
				),
			);

			this.disposables.push(
				this.watcher.onDidChange(async () => {
					logger.info("Policy file changed, reloading", {
						path: this.policyPath,
					});
					await this.loadPolicy();
				}),
			);

			this.disposables.push(
				this.watcher.onDidCreate(async () => {
					logger.info("Policy file created, loading", {
						path: this.policyPath,
					});
					await this.loadPolicy();
				}),
			);

			this.disposables.push(
				this.watcher.onDidDelete(() => {
					logger.info("Policy file deleted, using defaults", {
						path: this.policyPath,
					});
					this.policy = this.getDefaultPolicy();
				}),
			);
		} catch (error) {
			logger.error(
				"Failed to set up policy watcher",
				error instanceof Error ? error : undefined,
			);
		}
	}

	/**
	 * Start checking for expiring overrides
	 */
	private startExpirationChecks(): void {
		// Check for expiring overrides daily
		this.expirationCheckInterval = setInterval(
			() => {
				this.checkExpiringOverrides().catch((error) => {
					logger.error("Failed to check expiring overrides", error);
				});
			},
			24 * 60 * 60 * 1000,
		); // 24 hours
	}

	/**
	 * Check for expiring overrides and notify user
	 */
	private async checkExpiringOverrides(): Promise<void> {
		if (!this.policy?.overrides) {
			return;
		}

		const warningDays =
			this.policy.settings?.overrideExpirationWarningDays || 7;
		const warningThreshold = Date.now() + warningDays * 24 * 60 * 60 * 1000;

		for (const override of this.policy.overrides) {
			if (!override.ttl) {
				continue; // No expiration
			}

			const now = Date.now();

			// Already expired
			if (now > override.ttl) {
				await this.notifyExpiredOverride(override);
				continue;
			}

			// Expiring soon
			if (override.ttl < warningThreshold) {
				const daysRemaining = Math.ceil(
					(override.ttl - now) / (24 * 60 * 60 * 1000),
				);
				await this.notifyExpiringOverride(override, daysRemaining);
			}
		}
	}

	/**
	 * Notify user of expired override
	 */
	private async notifyExpiredOverride(override: PolicyOverride): Promise<void> {
		const message =
			`Policy override expired for "${override.pattern}". ` +
			`Original protection rules now apply.`;

		const action = await vscode.window.showWarningMessage(
			message,
			"Renew Override",
			"Remove Override",
			"Dismiss",
		);

		if (action === "Renew Override") {
			await this.renewOverride(override);
		} else if (action === "Remove Override") {
			await this.removeOverride(override.pattern);
		}
	}

	/**
	 * Notify user of expiring override
	 */
	private async notifyExpiringOverride(
		override: PolicyOverride,
		daysRemaining: number,
	): Promise<void> {
		const message =
			`Policy override for "${override.pattern}" ` +
			`expires in ${daysRemaining} day(s).`;

		const action = await vscode.window.showInformationMessage(
			message,
			"Renew Override",
			"Remove Override",
			"Dismiss",
		);

		if (action === "Renew Override") {
			await this.renewOverride(override);
		} else if (action === "Remove Override") {
			await this.removeOverride(override.pattern);
		}
	}

	/**
	 * Renew an override
	 */
	private async renewOverride(override: PolicyOverride): Promise<void> {
		// Ask user for new TTL duration
		const ttlOptions = [
			{ label: "7 days", value: 7 },
			{ label: "30 days", value: 30 },
			{ label: "90 days", value: 90 },
			{ label: "1 year", value: 365 },
		];

		const selectedTtl = await vscode.window.showQuickPick(ttlOptions, {
			placeHolder: "Select extension period for this override",
		});

		if (selectedTtl) {
			override.ttl = Date.now() + selectedTtl.value * 24 * 60 * 60 * 1000;
			await this.savePolicy();
			vscode.window.showInformationMessage(
				`Override for "${override.pattern}" renewed for ${selectedTtl.label}.`,
			);
		}
	}

	/**
	 * Remove an override
	 */
	private async removeOverride(pattern: string): Promise<void> {
		if (this.policy?.overrides) {
			this.policy.overrides = this.policy.overrides.filter(
				(override) => override.pattern !== pattern,
			);
			await this.savePolicy();
			vscode.window.showInformationMessage(
				`Override for "${pattern}" removed.`,
			);
		}
	}

	/**
	 * Save the current policy to file
	 */
	private async savePolicy(): Promise<void> {
		if (!this.policy) {
			return;
		}

		try {
			const content = JSON.stringify(this.policy, null, 2);
			await fs.writeFile(this.policyPath, content, "utf8");
			logger.info("Policy saved successfully", {
				path: this.policyPath,
			});
		} catch (error) {
			logger.error(
				"Failed to save policy",
				error instanceof Error ? error : undefined,
			);
			throw error;
		}
	}

	/**
	 * Dispose of resources
	 */
	dispose(): void {
		if (this.watcher) {
			this.watcher.dispose();
			this.watcher = null;
		}

		if (this.expirationCheckInterval) {
			clearInterval(this.expirationCheckInterval);
			this.expirationCheckInterval = null;
		}

		for (const disposable of this.disposables) {
			disposable.dispose();
		}
	}
}
