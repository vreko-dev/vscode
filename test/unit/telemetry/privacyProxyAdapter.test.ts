import { describe, it, expect, beforeEach } from "vitest";

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
 */
export class PrivacyProxyAdapter {
	private config: PrivacyProxyConfig;

	constructor(config: PrivacyProxyConfig) {
		this.config = {
			proxyPath: "/api/posthog",
			flagsProxyPath: "/api/flags",
			...config,
		};
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
 * Tests
 */
describe("PrivacyProxyAdapter", () => {
	describe("Initialization", () => {
		it("should initialize with default config", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: false,
			});

			const config = adapter.getConfig();
			expect(config.cloudDomain).toBe("app.posthog.com");
			expect(config.proxyPath).toBe("/api/posthog");
			expect(config.flagsProxyPath).toBe("/api/flags");
		});

		it("should allow custom proxy paths", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
				proxyPath: "/telemetry",
				flagsProxyPath: "/flags",
			});

			const config = adapter.getConfig();
			expect(config.proxyPath).toBe("/telemetry");
			expect(config.flagsProxyPath).toBe("/flags");
		});
	});

	describe("PostHog Configuration", () => {
		it("should return cloud domain when proxy disabled", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: false,
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.api_host).toBe("https://app.posthog.com");
			expect(posthogConfig.ui_host).toBe("https://us.posthog.com");
		});

		it("should return custom domain when proxy enabled", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "posthog.example.com",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.api_host).toBe("https://posthog.example.com/api/posthog");
			expect(posthogConfig.ui_host).toBe("https://us.posthog.com");
		});

		it("should use EU dashboard for EU cloud domain", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "eu.posthog.com",
				enabled: true,
				customDomain: "analytics.example.de",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.ui_host).toBe("https://eu.posthog.com");
		});

		it("should configure separate flags domain if provided", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "posthog.example.com",
				flagsDomain: "flags.example.com",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.api_host).toBe("https://posthog.example.com/api/posthog");
			expect(posthogConfig.flags_api_host).toBe(
				"https://flags.example.com/api/flags",
			);
		});

		it("should not include flags_api_host when no separate flags domain", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "posthog.example.com",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.flags_api_host).toBeUndefined();
		});
	});

	describe("Domain Routing", () => {
		it("should route to custom domain with proxy path", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
				proxyPath: "/api/telemetry",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.api_host).toContain("analytics.example.com");
			expect(posthogConfig.api_host).toContain("/api/telemetry");
		});

		it("should handle domains without proxy path", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "posthog.example.com",
				proxyPath: "",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.api_host).toBe("https://posthog.example.com");
		});

		it("should support separate flags subdomain", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
				flagsDomain: "flags.example.com",
				proxyPath: "/api/posthog",
				flagsProxyPath: "/api/flags",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.api_host).toBe(
				"https://analytics.example.com/api/posthog",
			);
			expect(posthogConfig.flags_api_host).toBe(
				"https://flags.example.com/api/flags",
			);
		});
	});

	describe("Request Transformation", () => {
		it("should not transform when proxy disabled", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: false,
			});

			const request = {
				targetDomain: "app.posthog.com",
				path: "/batch",
				headers: { "Content-Type": "application/json" },
			};

			const transformed = adapter.transformRequest(request);
			expect(transformed).toEqual(request);
		});

		it("should add forwarding headers when proxy enabled", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const request = {
				targetDomain: "app.posthog.com",
				path: "/batch",
				headers: { "Content-Type": "application/json" },
			};

			const transformed = adapter.transformRequest(request);
			expect(transformed.headers["X-Forwarded-Proto"]).toBe("https");
			expect(transformed.headers["X-Forwarded-Host"]).toBe("analytics.example.com");
			expect(transformed.headers["X-Forwarded-For"]).toBeDefined();
		});

		it("should preserve existing X-Forwarded-For header", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const request = {
				targetDomain: "app.posthog.com",
				path: "/batch",
				headers: { "X-Forwarded-For": "192.168.1.1" },
			};

			const transformed = adapter.transformRequest(request);
			expect(transformed.headers["X-Forwarded-For"]).toBe("192.168.1.1");
		});

		it("should preserve other headers", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const request = {
				targetDomain: "app.posthog.com",
				path: "/batch",
				headers: {
					"Content-Type": "application/json",
					Authorization: "Bearer token123",
				},
			};

			const transformed = adapter.transformRequest(request);
			expect(transformed.headers["Content-Type"]).toBe("application/json");
			expect(transformed.headers.Authorization).toBe("Bearer token123");
		});

		it("should preserve request body", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const body = { event: "test", properties: { value: 123 } };
			const request = {
				targetDomain: "app.posthog.com",
				path: "/batch",
				headers: {},
				body,
			};

			const transformed = adapter.transformRequest(request);
			expect(transformed.body).toEqual(body);
		});
	});

	describe("Proxy Configuration", () => {
		it("should return empty config when proxy disabled", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: false,
			});

			const proxyConfig = adapter.getProxyConfig();
			expect(Object.keys(proxyConfig)).toHaveLength(0);
		});

		it("should return proxy endpoints when enabled", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const proxyConfig = adapter.getProxyConfig();
			expect(proxyConfig.customDomain).toBe("analytics.example.com");
			expect(proxyConfig.cloudDomain).toBe("app.posthog.com");
			expect(proxyConfig.endpoints).toBeDefined();
		});

		it("should include all required endpoints", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const proxyConfig = adapter.getProxyConfig();
			expect(proxyConfig.endpoints.events).toBeDefined();
			expect(proxyConfig.endpoints.batch).toBeDefined();
			expect(proxyConfig.endpoints.flags).toBeDefined();
			expect(proxyConfig.endpoints.decide).toBeDefined();
		});

		it("should use custom proxy paths in endpoints", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
				proxyPath: "/telemetry",
				flagsProxyPath: "/features",
			});

			const proxyConfig = adapter.getProxyConfig();
			expect(proxyConfig.endpoints.batch).toContain("/telemetry");
			expect(proxyConfig.endpoints.flags).toContain("/features");
		});
	});

	describe("Validation", () => {
		it("should validate valid config", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const result = adapter.validate();
			expect(result.valid).toBe(true);
			expect(result.errors).toHaveLength(0);
		});

		it("should reject enabled proxy without custom domain", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
			});

			const result = adapter.validate();
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("customDomain"))).toBe(true);
		});

		it("should reject invalid custom domain format", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "invalid domain!",
			});

			const result = adapter.validate();
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("custom domain"))).toBe(true);
		});

		it("should reject invalid cloud domain", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "not a domain",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const result = adapter.validate();
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("cloud domain"))).toBe(true);
		});

		it("should reject invalid flags domain", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
				flagsDomain: "flags domain!",
			});

			const result = adapter.validate();
			expect(result.valid).toBe(false);
			expect(result.errors.some((e) => e.includes("flags domain"))).toBe(true);
		});
	});

	describe("Status Checks", () => {
		it("should report proxy enabled", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			expect(adapter.isEnabled()).toBe(true);
		});

		it("should report proxy disabled when not configured", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: false,
			});

			expect(adapter.isEnabled()).toBe(false);
		});

		it("should report proxy disabled when enabled but no custom domain", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
			});

			expect(adapter.isEnabled()).toBe(false);
		});
	});

	describe("EU vs US Configuration", () => {
		it("should use eu.posthog.com dashboard for EU cloud", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "eu.posthog.com",
				enabled: true,
				customDomain: "analytics.example.de",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.ui_host).toBe("https://eu.posthog.com");
		});

		it("should use us.posthog.com dashboard for US cloud", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "app.posthog.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.ui_host).toBe("https://us.posthog.com");
		});

		it("should default to US dashboard when cloud domain unclear", () => {
			const adapter = new PrivacyProxyAdapter({
				cloudDomain: "posthog.example.com",
				enabled: true,
				customDomain: "analytics.example.com",
			});

			const posthogConfig = adapter.getPostHogConfig();
			expect(posthogConfig.ui_host).toBe("https://us.posthog.com");
		});
	});
});
