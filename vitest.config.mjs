import path from "node:path";
import { defineConfig } from "vitest/config";
export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		include: [
			"test/unit/**/*.test.ts",
			"test/unit/**/*.unit.test.ts",
			"test/integration/**/*.integration.test.ts",
			"test/performance/**/*.test.ts",
			"test/regression/**/*.test.ts",
			"test/monitoring/**/*.test.ts",
			"test/e2e/**/*.e2e.test.ts", // Enable E2E tests
		],
		exclude: [
			"node_modules",
			"out",
			"dist",
			"test/integration/**/*", // Exclude Mocha integration tests (legacy)
		],
		setupFiles: ["./test/unit/setup.ts"],
		testTimeout: 30000, // 30s timeout for performance tests
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			reportsDirectory: "./coverage",
			exclude: [
				"**/*.test.ts",
				"**/*.spec.ts",
				"**/test/**",
				"**/__mocks__/**",
				"**/scripts/**",
				"**/dist/**",
				"**/out/**",
			],
			thresholds: {
				lines: 80,
				functions: 80,
				branches: 75,
				statements: 80,
			},
		},
		// Performance budgets enforced via tests
		includeSource: ["src/**/*.ts"],
	},
	resolve: {
		alias: {
			"@": path.resolve(__dirname, "./src"),
			"@test": path.resolve(__dirname, "./test"),
			"@snapback/core": path.resolve(__dirname, "../../packages/core/src"),
			"@snapback/contracts": path.resolve(
				__dirname,
				"../../packages/contracts/src",
			),
		},
	},
});
