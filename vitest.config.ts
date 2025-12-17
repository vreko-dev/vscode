import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfigs, vscodeConfig } from "@snapback/vitest-config";
import { defineProject } from "vitest/config";

const __dirname = resolve(fileURLToPath(import.meta.url), "..");

/**
 * Vitest configuration for apps/vscode
 *
 * Uses the vscodeConfig preset from @snapback/vitest-config which:
 * - Sets environment to 'node'
 * - Externalizes 'vscode' module (mocked in setup)
 * - Inlines @sentry/* modules for ESM compatibility
 * - Includes standard test patterns and mock handling
 *
 * Test files live in test/ but import from src/
 */
export default defineProject(
	mergeConfigs(vscodeConfig, {
		resolve: {
			alias: {
				// Map @vscode/ to src/ for cleaner test imports
				"@vscode": resolve(__dirname, "./src"),
				// Common submodule aliases
				"@vscode/config": resolve(__dirname, "./src/config"),
				"@vscode/services": resolve(__dirname, "./src/services"),
				"@vscode/storage": resolve(__dirname, "./src/storage"),
				"@vscode/types": resolve(__dirname, "./src/types"),
				"@vscode/utils": resolve(__dirname, "./src/utils"),
				"@vscode/handlers": resolve(__dirname, "./src/handlers"),
				"@vscode/ui": resolve(__dirname, "./src/ui"),
				"@vscode/snapshot": resolve(__dirname, "./src/snapshot"),
				"@vscode/views": resolve(__dirname, "./src/views"),
				"@vscode/providers": resolve(__dirname, "./src/providers"),
				"@vscode/domain": resolve(__dirname, "./src/domain"),
				"@vscode/commands": resolve(__dirname, "./src/commands"),
				"@vscode/decorations": resolve(__dirname, "./src/decorations"),
				"@vscode/network": resolve(__dirname, "./src/network"),
				"@vscode/security": resolve(__dirname, "./src/security"),
				"@vscode/performance": resolve(__dirname, "./src/performance"),
				"@vscode/checkpoint": resolve(__dirname, "./src/checkpoint"),
				"@vscode/rules": resolve(__dirname, "./src/rules"),
				"@vscode/policy": resolve(__dirname, "./src/policy"),
				"@vscode/integration": resolve(__dirname, "./src/integration"),
				"@vscode/notifications": resolve(__dirname, "./src/notifications"),
				"@vscode/signage": resolve(__dirname, "./src/signage"),
				"@vscode/suppressions": resolve(__dirname, "./src/suppressions"),
				"@vscode/auth": resolve(__dirname, "./src/auth"),
				"@vscode/protection": resolve(__dirname, "./src/protection"),
				"@vscode/telemetry": resolve(__dirname, "./src/telemetry"),
				"@vscode/pioneer": resolve(__dirname, "./src/pioneer"),
			},
		},
		test: {
			name: "@snapback/vscode",
			include: ["test/**/*.test.ts"],
			// Global setup file for all tests
			setupFiles: ["./test/unit/setup.ts"],
		},
	}),
);
