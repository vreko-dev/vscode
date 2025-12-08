import { resolve } from "node:path";
import { defineConfig } from "vitest/config";

/**
 * Vitest configuration for apps/vscode
 *
 * Configures TypeScript alias support for testing
 * Test files live in test/ but import from src/
 */
export default defineConfig({
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
		},
	},
	test: {
		globals: true,
		environment: "node",
		passWithNoTests: true,
		include: ["test/**/*.test.ts", "test/**/*.spec.ts"],
		exclude: ["node_modules", "dist", "out"],
		// Global setup file for all tests
		setupFiles: ["./test/unit/setup.ts"],
		// Module directories for monorepo dependency resolution
		deps: {
			moduleDirectories: ["node_modules", resolve(__dirname, "../../node_modules")],
		},
	},
});
