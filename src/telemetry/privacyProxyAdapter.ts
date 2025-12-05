import { logger } from "../utils/logger";

/**
 * Privacy Proxy Configuration
 */
export interface PrivacyProxyConfig {
	/**
	 * Custom domain for analytics (e.g., posthog.yourdomain.com)
	 */
	customDomain?: string;

	/**
	 * Separate domain for feature flags (optional)
	 */
	flagsDomain?: string;

	/**
	 * PostHog Cloud domain (app.posthog.com or eu.posthog.com)
	 */
	cloudDomain: string;

	/**
	 * Enable privacy proxy routing
	 */
	enabled: boolean;

	/**
	 * Proxy path for events (default: /api/posthog)
	 */
	proxyPath?: string;

	/**
	 * Proxy path for flags (default: /api/flags)
	 */
	flagsProxyPath?: string;
}

/**
 * Privacy Proxy Request Handler
 */
export interface PrivacyProxyRequest {
	/**
	 * Target domain (PostHog Cloud)
	 */
	targetDomain: string;

	/**
	 * Request path
	 */
	path: string;

	/**
	 * Request headers
	 */
	headers: Record<string, string>;

	/**
	 * Request body
	 */
	body?: Record<string, any>;
}

/**
 * PrivacyProxyAdapter
 * Configures PostHog SDK to route through custom domain (privacy proxy)
 * Addresses ad-blocker and privacy blocker circumvention
 */
export class PrivacyProxyAdapter {
	private config: PrivacyProxyConfig;

	constructor(config: PrivacyProxyConfig) {
		this.config = {
			proxyPath: "/api/posthog",
			flagsProxyPath: "/api/flags",
			...config,
		};

		logger.debug("PrivacyProxyAdapter initialized", {
			enabled: this.config.enabled,
			customDomain: this.config.customDomain,
			flagsDomain: this.config.flagsDomain,
		});
	}

	/**
	 * Get PostHog initialization config
	 */
	getPostHogConfig(): Record<string, any> {
		if (!this.config.enabled || !this.config.customDomain) {
			// No privacy proxy, use direct cloud domain
			return {
				api_host: `https://${this.config.cloudDomain}`,
				ui_host: `https://${this.getUiHost()}`,
			};
		}

		// Privacy proxy enabled, route through custom domain
		const config: Record<string, any> = {
			api_host: this.getApiHost(),
			ui_host: `https://${this.getUiHost()}`,
		};

		// If separate flags domain, configure it
		if (this.config.flagsDomain) {
			config.flags_api_host = this.getFlagsHost();
		}

		return config;
	}

	/**
	 * Get API host URL
	 */
	private getApiHost(): string {
		if (!this.config.customDomain) {
			return `https://${this.config.cloudDomain}`;
		}

		return `https://${this.config.customDomain}${this.config.proxyPath || ""}`;
	}

	/**
	 * Get flags API host URL
	 */
	private getFlagsHost(): string {
		if (!this.config.flagsDomain) {
			return this.getApiHost();
		}

		return `https://${this.config.flagsDomain}${this.config.flagsProxyPath || ""}`;
	}

	/**
	 * Get UI host (dashboard)
	 */
	private getUiHost(): string {
		// UI always stays at PostHog Cloud (not proxied)
		if (this.config.cloudDomain.includes("eu.")) {
			return "eu.posthog.com";
		}
		return "us.posthog.com";
	}

	/**
	 * Transform outgoing request for proxy routing
	 */
	transformRequest(request: PrivacyProxyRequest): PrivacyProxyRequest {
		if (!this.config.enabled || !this.config.customDomain) {
			// No transformation needed
			return request;
		}

		// Transform for privacy proxy routing
		return {
			...request,
			// Add routing headers for reverse proxy
			headers: {
				...request.headers,
				"X-Forwarded-For": request.headers["X-Forwarded-For"] || "0.0.0.0",
				"X-Forwarded-Proto": "https",
				"X-Forwarded-Host": this.config.customDomain,
			},
		};
	}

	/**
	 * Get proxy configuration for reverse proxy setup
	 */
	getProxyConfig(): Record<string, any> {
		if (!this.config.enabled || !this.config.customDomain) {
			return {};
		}

		return {
			customDomain: this.config.customDomain,
			cloudDomain: this.config.cloudDomain,
			endpoints: {
				events: `${this.config.proxyPath || "/api/posthog"}/v0/e`,
				batch: `${this.config.proxyPath || "/api/posthog"}/batch`,
				flags: `${this.config.flagsProxyPath || "/api/flags"}/evaluate`,
				decide: `${this.config.proxyPath || "/api/posthog"}/decide`,
			},
		};
	}

	/**
	 * Validate configuration
	 */
	validate(): { valid: boolean; errors: string[] } {
		const errors: string[] = [];

		// If enabled, custom domain is required
		if (this.config.enabled && !this.config.customDomain) {
			errors.push("Privacy proxy enabled but customDomain not provided");
		}

		// Custom domain must be valid format (only if provided)
		if (this.config.customDomain && !this.isValidDomain(this.config.customDomain)) {
			errors.push(`Invalid custom domain format: ${this.config.customDomain}`);
		}

		// Flags domain must be valid if provided
		if (this.config.flagsDomain && !this.isValidDomain(this.config.flagsDomain)) {
			errors.push(`Invalid flags domain format: ${this.config.flagsDomain}`);
		}

		// Cloud domain must be valid
		if (!this.isValidDomain(this.config.cloudDomain)) {
			errors.push(`Invalid cloud domain format: ${this.config.cloudDomain}`);
		}

		if (errors.length > 0) {
			logger.warn("PrivacyProxyAdapter validation failed", { errors });
		}

		return {
			valid: errors.length === 0,
			errors,
		};
	}

	/**
	 * Basic domain validation
	 */
	private isValidDomain(domain: string): boolean {
		const domainRegex = /^([a-z0-9](-*[a-z0-9])*\.)+[a-z]{2,}$/i;
		return domainRegex.test(domain);
	}

	/**
	 * Check if privacy proxy is enabled
	 */
	isEnabled(): boolean {
		return this.config.enabled && !!this.config.customDomain;
	}

	/**
	 * Get configuration
	 */
	getConfig(): PrivacyProxyConfig {
		return { ...this.config };
	}
}

/**
 * Factory function for creating PrivacyProxyAdapter
 * Usage:
 * ```typescript
 * const adapter = createPrivacyProxyAdapter({
 *   enabled: true,
 *   customDomain: 'analytics.example.com',
 *   cloudDomain: 'app.posthog.com',
 *   flagsDomain: 'flags.example.com'
 * });
 * const posthogConfig = adapter.getPostHogConfig();
 * posthog.init(apiKey, posthogConfig);
 * ```
 */
export function createPrivacyProxyAdapter(config: PrivacyProxyConfig): PrivacyProxyAdapter {
	const adapter = new PrivacyProxyAdapter(config);

	// Validate on creation
	const validation = adapter.validate();
	if (!validation.valid) {
		logger.warn("PrivacyProxyAdapter created with validation errors", {
			errors: validation.errors,
		});
	}

	return adapter;
}
