import { defineConfig } from "@playwright/test";

/**
 * Playwright Configuration for Webview DOM Validation
 *
 * IMPORTANT: This config is for testing VS Code webviews, not web apps.
 * - No retries (flakiness must be fixed, not masked)
 * - Sequential execution (workers: 1)
 * - Screenshots/videos on failure for debugging
 */
export default defineConfig({
	testDir: "./test/e2e/webview",
	timeout: 30000,
	expect: {
		timeout: 5000,
	},
	fullyParallel: false, // Sequential execution for stability
	forbidOnly: !!process.env.CI,
	retries: 0, // NEVER retry - fix flaky tests instead
	workers: 1, // Sequential execution
	reporter: [
		["html"],
		["list"], // Console output for CI
	],
	use: {
		actionTimeout: 0,
		baseURL: "http://localhost:3000",
		trace: "retain-on-failure", // Capture trace on failure
		screenshot: "only-on-failure", // Capture screenshot on failure
		video: "retain-on-failure", // Capture video on failure
	},
	projects: [
		{
			name: "chromium",
			use: { browserName: "chromium" },
		},
	],
});
