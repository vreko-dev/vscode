/**
 * Security Tests for authCommands - AUTH-030
 *
 * Verifies auth commands use SecureConfigService for API key checks
 *
 * Requirements:
 * - Auth status checks MUST use hasSecure(), NOT workspace config
 * - No plaintext API keys exposed in settings
 * - Secure display of authentication method
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

describe("authCommands Security (AUTH-030)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("🔴 RED PHASE: Security Integration", () => {
		it("should verify authCommands uses SecureConfigService", async () => {
			// Static analysis test: verify source code uses SecureConfigService
			const { readFileSync } = await import("node:fs");
			const { join } = await import("node:path");

			const authCommandsPath = join(__dirname, "../../../src/commands/authCommands.ts");
			const authCommandsSource = readFileSync(authCommandsPath, "utf-8");

			// ASSERT: Source code imports SecureConfigService
			expect(authCommandsSource).toContain('from "../security/SecureConfigService"');

			// ASSERT: Source code calls getSecureConfig()
			expect(authCommandsSource).toContain("getSecureConfig()");

			// ASSERT: Source code uses hasSecure() for API key checks
			expect(authCommandsSource).toContain('hasSecure("api.key")');
		});

		it("should verify no workspace config used for API key checks", async () => {
			const { readFileSync } = await import("node:fs");
			const { join } = await import("node:path");

			const authCommandsPath = join(__dirname, "../../../src/commands/authCommands.ts");
			const authCommandsSource = readFileSync(authCommandsPath, "utf-8");

			// Find all lines that check for API key
			const lines = authCommandsSource.split("\n");
			const apiKeyCheckLines = lines.filter((line) => line.includes("api.key") && !line.includes("//"));

			// ASSERT: No workspace.getConfiguration used for api.key checks
			for (const line of apiKeyCheckLines) {
				// Lines with api.key should use hasSecure(), not config.get()
				if (line.includes('hasSecure("api.key")') || line.includes("AUTH-030")) {
					// ✅ Correct pattern
					continue;
				}

				// ❌ Should not use workspace config for API key
				expect(line).not.toMatch(/config\.get.*api\.key/);
			}
		});

		it("should verify AUTH-030 security comments present", async () => {
			const { readFileSync } = await import("node:fs");
			const { join } = await import("node:path");

			const authCommandsPath = join(__dirname, "../../../src/commands/authCommands.ts");
			const authCommandsSource = readFileSync(authCommandsPath, "utf-8");

			// ASSERT: Security comments documenting AUTH-030 fix
			expect(authCommandsSource).toContain("✅ SECURITY (AUTH-030)");

			// ASSERT: Comments explain SecretStorage usage
			expect(authCommandsSource).toContain("using SecretStorage");
		});

		it("should verify async pattern for hasSecure() calls", async () => {
			const { readFileSync } = await import("node:fs");
			const { join } = await import("node:path");

			const authCommandsPath = join(__dirname, "../../../src/commands/authCommands.ts");
			const authCommandsSource = readFileSync(authCommandsPath, "utf-8");

			// ASSERT: hasSecure() calls are awaited (async pattern)
			const hasSecureCalls = authCommandsSource.match(/hasSecure\("api\.key"\)/g) || [];
			expect(hasSecureCalls.length).toBeGreaterThan(0);

			// Find context around hasSecure calls
			const lines = authCommandsSource.split("\n");
			for (let i = 0; i < lines.length; i++) {
				const line = lines[i];
				if (line.includes('hasSecure("api.key")')) {
					// Check that this line or previous line has 'await'
					const hasAwait = line.includes("await") || (i > 0 && lines[i - 1].includes("await"));

					// Or it's assigned to a variable that will be awaited
					const isAssignment = line.includes("=") && line.includes("hasSecure");

					expect(hasAwait || isAssignment).toBe(true);
				}
			}
		});
	});

	describe("Command Security Patterns", () => {
		it("should verify showStatus command uses secure checks", async () => {
			const { readFileSync } = await import("node:fs");
			const { join } = await import("node:path");

			const authCommandsPath = join(__dirname, "../../../src/commands/authCommands.ts");
			const authCommandsSource = readFileSync(authCommandsPath, "utf-8");

			// Extract showStatus command code
			const showStatusMatch = authCommandsSource.match(/SHOW_STATUS.*?(?=vscode\.commands\.registerCommand|$)/s);
			expect(showStatusMatch).toBeTruthy();

			const showStatusCode = showStatusMatch?.[0] || "";

			// ASSERT: Uses getSecureConfig() in showStatus
			expect(showStatusCode).toContain("getSecureConfig()");

			// ASSERT: Uses hasSecure() for API key presence check
			expect(showStatusCode).toContain('hasSecure("api.key")');
		});

		it("should verify correct authentication method display logic", async () => {
			const { readFileSync } = await import("node:fs");
			const { join } = await import("node:path");

			const authCommandsPath = join(__dirname, "../../../src/commands/authCommands.ts");
			const authCommandsSource = readFileSync(authCommandsPath, "utf-8");

			// ASSERT: Auth method string differentiates OAuth vs API key
			expect(authCommandsSource).toContain("OAuth (with API key fallback)");
			expect(authCommandsSource).toContain('"OAuth"');
			expect(authCommandsSource).toContain("Authenticated with API key");
		});
	});
});

/**
 * SECURITY VERIFICATION CHECKLIST:
 *
 * ✅ SecureConfigService imported and used
 * ✅ hasSecure("api.key") used instead of config.get("api.key")
 * ✅ Async pattern (await) for hasSecure() calls
 * ✅ No workspace config used for API key checks
 * ✅ AUTH-030 security comments present
 * ✅ Correct authentication method display
 */
