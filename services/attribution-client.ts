/**
 * Attribution Client Service (Gap 4 - Attribution Integration)
 *
 * Handles marketing attribution transfer from web to extension.
 * Called after successful device authentication to link web attribution.
 *
 * Flow:
 * 1. User visits website → fingerprint captured
 * 2. User installs extension → fingerprint stored locally
 * 3. User authenticates → attribution transferred to account
 *
 * @module services/attribution-client
 */

import type { ExtensionContext } from "vscode";
import { logger } from "../utils/logger";
import { ApiClient } from "./api-client";

// Storage keys for attribution data
const STORAGE_KEYS = {
	FINGERPRINT: "vreko.attribution.fingerprint",
	SOURCE: "vreko.attribution.source",
	UTM_PARAMS: "vreko.attribution.utmParams",
	REFERRAL_CODE: "vreko.attribution.referralCode",
	TRANSFERRED: "vreko.attribution.transferred",
};

/**
 * Attribution source types
 */
export type AttributionSource =
	| "facebook"
	| "google"
	| "twitter"
	| "linkedin"
	| "reddit"
	| "direct"
	| "referral"
	| "organic";

/**
 * Attribution Client for VSCode Extension
 *
 * Manages attribution data capture and transfer to the platform.
 */
export class AttributionClient {
	private context: ExtensionContext;
	private apiClient: ApiClient;

	constructor(context: ExtensionContext) {
		this.context = context;
		this.apiClient = new ApiClient();
	}

	/**
	 * Store attribution data received from web (via deeplink or URI handler)
	 *
	 * Called when extension receives attribution data from the web app,
	 * typically via a deeplink like: vscode://vreko.vreko/attribution?...
	 *
	 * @param data Attribution data from web
	 */
	async storeWebAttribution(data: {
		fingerprint: string;
		source?: AttributionSource;
		utmSource?: string;
		utmMedium?: string;
		utmCampaign?: string;
		utmContent?: string;
		utmTerm?: string;
		referralCode?: string;
	}): Promise<void> {
		const { fingerprint, source, referralCode, ...utmParams } = data;

		await this.context.globalState.update(STORAGE_KEYS.FINGERPRINT, fingerprint);
		await this.context.globalState.update(STORAGE_KEYS.SOURCE, source || "direct");
		await this.context.globalState.update(STORAGE_KEYS.UTM_PARAMS, {
			utm_source: utmParams.utmSource,
			utm_medium: utmParams.utmMedium,
			utm_campaign: utmParams.utmCampaign,
			utm_content: utmParams.utmContent,
			utm_term: utmParams.utmTerm,
		});

		if (referralCode) {
			await this.context.globalState.update(STORAGE_KEYS.REFERRAL_CODE, referralCode);
		}

		logger.info("Attribution data stored", { source, hasFingerprint: !!fingerprint });
	}

	/**
	 * Transfer stored attribution to the platform after authentication
	 *
	 * Should be called after successful device auth or login.
	 * This links the web attribution to the authenticated user.
	 *
	 * @returns Transfer result or null if no attribution/already transferred
	 */
	async transferAttributionAfterAuth(): Promise<{
		success: boolean;
		attributionId: string;
		action: "created" | "merged" | "ignored";
	} | null> {
		// Check if already transferred
		const alreadyTransferred = this.context.globalState.get<boolean>(STORAGE_KEYS.TRANSFERRED);
		if (alreadyTransferred) {
			logger.debug("Attribution already transferred, skipping");
			return null;
		}

		// Get stored attribution data
		const fingerprint = this.context.globalState.get<string>(STORAGE_KEYS.FINGERPRINT);
		if (!fingerprint) {
			logger.debug("No fingerprint stored, skipping attribution transfer");
			return null;
		}

		const source = this.context.globalState.get<AttributionSource>(STORAGE_KEYS.SOURCE) || "direct";
		const utmParams = this.context.globalState.get<{
			utm_source?: string;
			utm_medium?: string;
			utm_campaign?: string;
			utm_content?: string;
			utm_term?: string;
		}>(STORAGE_KEYS.UTM_PARAMS);
		const referralCode = this.context.globalState.get<string>(STORAGE_KEYS.REFERRAL_CODE);

		try {
			const result = await this.apiClient.transferAttribution(fingerprint, {
				source,
				utmParams,
				referralCode,
			});

			if (result?.success) {
				// Mark as transferred to prevent duplicate transfers
				await this.context.globalState.update(STORAGE_KEYS.TRANSFERRED, true);
				logger.info("Attribution transferred successfully", { action: result.action });
			}

			return result;
		} catch (error) {
			logger.error("Failed to transfer attribution", error as Error);
			return null;
		}
	}

	/**
	 * Get current user's attribution from the platform
	 *
	 * @returns Attribution record or null
	 */
	async getAttribution() {
		return this.apiClient.getAttribution();
	}

	/**
	 * Check if attribution has been transferred
	 */
	isAttributionTransferred(): boolean {
		return this.context.globalState.get<boolean>(STORAGE_KEYS.TRANSFERRED) || false;
	}

	/**
	 * Clear stored attribution data
	 * (for testing or user-initiated reset)
	 */
	async clearAttributionData(): Promise<void> {
		await this.context.globalState.update(STORAGE_KEYS.FINGERPRINT, undefined);
		await this.context.globalState.update(STORAGE_KEYS.SOURCE, undefined);
		await this.context.globalState.update(STORAGE_KEYS.UTM_PARAMS, undefined);
		await this.context.globalState.update(STORAGE_KEYS.REFERRAL_CODE, undefined);
		await this.context.globalState.update(STORAGE_KEYS.TRANSFERRED, undefined);
		logger.info("Attribution data cleared");
	}
}

/**
 * Singleton instance getter
 */
let attributionClientInstance: AttributionClient | null = null;

export function getAttributionClient(context: ExtensionContext): AttributionClient {
	if (!attributionClientInstance) {
		attributionClientInstance = new AttributionClient(context);
	}
	return attributionClientInstance;
}
