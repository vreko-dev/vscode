import base64url from "base64url";
import semver from "semver";
import nacl from "tweetnacl";
import type * as vscode from "vscode";
import { validate as validateSchema } from "../schema/rulesBundle.schema";
import type { VSCodeTelemetry } from "../telemetry";
import { logger } from "../utils/logger";
import { SnapbackAPI } from "./SnapbackAPI";

interface PolicyRule {
	pattern: string;
	level: "watch" | "warn" | "block";
	reason?: string;
	autoSnapshot?: boolean;
	debounce?: number;
	precedence?: number;
}

interface PolicyBundle {
	version: string;
	minClientVersion: string;
	rules: PolicyRule[];
	metadata: {
		timestamp: number;
		schemaVersion: string;
	};
}

/**
 * RulesManager handles HTTP polling for rules with ETag caching
 * Implements daily pulls with conditional requests to minimize bandwidth
 */
export class RulesManager {
	private static instance: RulesManager;
	private etag: string | null = null;
	private currentRules: PolicyBundle | null = null;
	private pollingInterval: NodeJS.Timeout | null = null;
	private readonly POLLING_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours (daily)
	private context: vscode.ExtensionContext;
	private telemetry: VSCodeTelemetry | null = null;
	private offlineMode: boolean = false;

	// Ed25519 public key (32 bytes)
	// In production: Load from secure environment variable
	private readonly PUBLIC_KEY: Uint8Array;

	private constructor(context: vscode.ExtensionContext) {
		this.context = context;

		// Load public key from environment variable or use test key as fallback
		const publicKeyEnv = process.env.SNAPBACK_RULES_PUBLIC_KEY;
		if (publicKeyEnv) {
			// Decode base64-encoded public key from environment variable
			const publicKeyBytes = this.base64UrlDecode(publicKeyEnv);
			if (publicKeyBytes.length === 32) {
				this.PUBLIC_KEY = publicKeyBytes;
			} else {
				// Fallback to test key if environment variable is invalid
				this.PUBLIC_KEY = new Uint8Array([
					215, 90, 152, 1, 130, 177, 10, 183, 213, 75, 254, 211, 201, 100, 7,
					58, 14, 225, 114, 243, 218, 166, 35, 37, 175, 2, 26, 104, 247, 7, 81,
					26,
				]);
			}
		} else {
			// Fallback to test key if environment variable is not set
			this.PUBLIC_KEY = new Uint8Array([
				215, 90, 152, 1, 130, 177, 10, 183, 213, 75, 254, 211, 201, 100, 7, 58,
				14, 225, 114, 243, 218, 166, 35, 37, 175, 2, 26, 104, 247, 7, 81, 26,
			]);
		}
	}

	public static getInstance(context?: vscode.ExtensionContext): RulesManager {
		if (!RulesManager.instance) {
			if (!context) {
				throw new Error("Context is required to create RulesManager instance");
			}
			RulesManager.instance = new RulesManager(context);
		}
		return RulesManager.instance;
	}

	public setTelemetry(telemetry: VSCodeTelemetry) {
		this.telemetry = telemetry;
	}

	/**
	 * Set offline mode
	 * @param enabled Whether offline mode is enabled
	 */
	public setOfflineMode(enabled: boolean): void {
		this.offlineMode = enabled;
		logger.info(`Offline mode ${enabled ? "enabled" : "disabled"}`);
	}

	/**
	 * Check if offline mode is enabled
	 * @returns Whether offline mode is enabled
	 */
	public isOfflineMode(): boolean {
		return this.offlineMode;
	}

	/**
	 * Decode base64url to Uint8Array
	 */
	private base64UrlDecode(input: string): Uint8Array {
		return base64url.toBuffer(input);
	}

	/**
	 * Get current extension version from package.json
	 */
	private getExtensionVersion(): string {
		return this.context.extension.packageJSON.version;
	}

	/**
	 * Start polling for rules updates
	 */
	public startPolling(): void {
		// Initial fetch
		this.fetchRules().catch((error) => {
			logger.error("Failed to fetch initial rules", error);
		});

		// Set up periodic polling
		this.pollingInterval = setInterval(() => {
			this.fetchRules().catch((error) => {
				logger.error("Failed to fetch rules during polling", error);
			});
		}, this.POLLING_INTERVAL_MS);

		logger.info("RulesManager polling started");
	}

	/**
	 * Stop polling for rules updates
	 */
	public stopPolling(): void {
		if (this.pollingInterval) {
			clearInterval(this.pollingInterval);
			this.pollingInterval = null;
			logger.info("RulesManager polling stopped");
		}
	}

	/**
	 * Fetch rules from the API with ETag caching
	 */
	private async fetchRules(): Promise<void> {
		// If offline mode is enabled, skip network requests
		if (this.offlineMode) {
			logger.info("Offline mode enabled, skipping network request for rules");
			return;
		}

		try {
			const api = SnapbackAPI.getInstance();

			// Fetch rules bundle with ETag if available
			const response = await api.getRulesBundle(this.etag || undefined);

			// Check if content was modified
			if (response.notModified) {
				logger.info("Rules not modified, using cached version");
				return;
			}

			// Update ETag and rules
			if (response.etag) {
				this.etag = response.etag;
			}

			if (response.bundle) {
				try {
					// Validate the rules bundle with signature verification
					const validatedRules = await this.validateRulesBundle(
						response.bundle,
					);
					this.currentRules = validatedRules;
					logger.info("Rules updated successfully");

					// Notify listeners of rules update
					this.notifyRulesUpdated();
				} catch (error) {
					logger.error("Failed to validate rules bundle", error as Error);

					// Fallback to cached rules if available
					if (this.currentRules) {
						logger.info("Using cached rules due to validation failure");
						// Track cached rules usage
						this.telemetry?.trackFeatureUsed("rules.cached.fallback");
						// Notify listeners that we're using cached rules
						this.notifyRulesUpdated();
					} else {
						// No cached rules available, re-throw the error
						throw error;
					}
				}
			}
		} catch (error) {
			logger.error("Failed to fetch rules", error as Error);
			throw error;
		}
	}

	/**
	 * Get current rules
	 */
	public getCurrentRules(): PolicyBundle | null {
		return this.currentRules;
	}

	/**
	 * Notify listeners when rules are updated
	 */
	private notifyRulesUpdated(): void {
		// In a real implementation, this would emit events or update configuration
		logger.info("Rules updated, notifying listeners");
	}

	/**
	 * Validate JWS-signed rules bundle with Ed25519 signature verification
	 * @param bundle JWS format: header.payload.signature (all base64url)
	 * @returns Validated and parsed policy bundle
	 * @throws Error if signature invalid, version incompatible, or schema invalid
	 */
	public async validateRulesBundle(bundle: string): Promise<PolicyBundle> {
		try {
			// 1. Parse JWS structure
			const parts = bundle.split(".");
			if (parts.length !== 3) {
				throw new Error(
					"Invalid JWS format: expected 3 parts (header.payload.signature)",
				);
			}

			const [headerB64, payloadB64, signatureB64] = parts;

			// 2. Verify Ed25519 signature
			const message = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
			const signature = this.base64UrlDecode(signatureB64);

			try {
				const isValid = nacl.sign.detached.verify(
					message,
					signature,
					this.PUBLIC_KEY,
				);

				if (!isValid) {
					logger.error("Rule bundle signature verification failed");
					// Track signature verification failure
					this.telemetry?.trackError(
						"signature.verification.failed",
						"Invalid signature: bundle may be tampered",
					);
					throw new Error("Invalid signature: bundle may be tampered");
				}
			} catch (verifyError: unknown) {
				// Handle specific tweetnacl errors
				if (
					verifyError instanceof Error &&
					verifyError.message?.includes("bad signature size")
				) {
					logger.error(
						"Rule bundle signature verification failed due to bad signature size",
					);
					// Track signature verification failure
					this.telemetry?.trackError(
						"signature.verification.failed",
						"Invalid signature: bad signature size",
					);
					throw new Error("Invalid signature: bundle may be tampered");
				}
				// Re-throw other errors
				throw verifyError;
			}

			logger.info("Rule bundle signature verified successfully");
			// Track successful signature verification
			this.telemetry?.trackFeatureUsed("signature.verification.success");

			// 3. Parse and validate payload
			const payloadJson = new TextDecoder().decode(
				this.base64UrlDecode(payloadB64),
			);
			const payload = JSON.parse(payloadJson) as PolicyBundle;

			// 4. Validate schema structure
			const schemaValid = validateSchema(payload);
			if (!schemaValid) {
				logger.error("Rule bundle schema validation failed");
				throw new Error("Invalid bundle schema");
			}

			// 5. Verify minClientVersion compatibility
			const currentVersion = this.getExtensionVersion();
			if (semver.lt(currentVersion, payload.minClientVersion)) {
				logger.warn("Client version too old for bundle", {
					current: currentVersion,
					required: payload.minClientVersion,
				});
				throw new Error(
					`Extension update required: min version ${payload.minClientVersion}`,
				);
			}

			// 6. Verify bundle freshness (not older than 7 days)
			const bundleAge = Date.now() - payload.metadata.timestamp;
			const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

			if (bundleAge > MAX_AGE_MS) {
				logger.warn("Rule bundle is stale", {
					age: bundleAge / 1000 / 60 / 60 / 24,
				});
				// Don't reject, but log for monitoring
			}

			return payload;
		} catch (error) {
			logger.error("Failed to validate rules bundle", error as Error);
			throw error;
		}
	}
}
