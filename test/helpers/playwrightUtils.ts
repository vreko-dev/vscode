/**
 * @fileoverview Playwright Utilities for Webview Testing
 *
 * Helper functions for testing VS Code webviews with Playwright.
 * These utilities handle common webview testing tasks like:
 * - Launching VS Code with webview panels
 * - Accessing webview iframes
 * - Waiting for webview content to load
 * - Taking screenshots and golden snapshots
 *
 * @see test/e2e/webview/README.md for usage examples
 */

import type { Frame, Locator, Page } from "@playwright/test";

/**
 * Webview panel configuration
 */
export interface WebviewConfig {
	/** Command to open the webview (e.g., "snapback.welcome") */
	command: string;
	/** Timeout for webview to appear (ms) */
	timeout?: number;
	/** Workspace folder to use */
	workspace?: string;
}

/**
 * Launch VS Code and open a webview panel
 *
 * NOTE: This is a placeholder implementation. Actual implementation requires:
 * - VS Code automation driver (e.g., @vscode/test-electron)
 * - Webview panel to be implemented in the extension
 *
 * @param page - Playwright page instance
 * @param commandOrConfig - Command ID or configuration object
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * await launchVSCodeWithWebview(page, 'snapback.welcome');
 * ```
 *
 * @example
 * ```typescript
 * await launchVSCodeWithWebview(page, {
 *   command: 'snapback.settings',
 *   timeout: 10000,
 *   workspace: '/path/to/test-workspace'
 * });
 * ```
 */
export async function launchVSCodeWithWebview(
	_page: Page,
	commandOrConfig: string | WebviewConfig,
): Promise<void> {
	const _config: WebviewConfig =
		typeof commandOrConfig === "string"
			? { command: commandOrConfig, timeout: 5000 }
			: { timeout: 5000, ...commandOrConfig };

	// TODO: Implement VS Code launch and webview opening
	// This requires integration with VS Code's automation driver
	//
	// Steps:
	// 1. Launch VS Code in automation mode
	// 2. Open workspace
	// 3. Execute command to open webview
	// 4. Wait for webview panel to appear
	//
	// Example implementation:
	// const vscode = await launchVSCode({ workspace: config.workspace });
	// await vscode.executeCommand(config.command);
	// await page.waitForSelector('iframe.webview', { timeout: config.timeout });

	throw new Error(
		"launchVSCodeWithWebview not implemented - no webviews exist yet",
	);
}

/**
 * Get the webview frame from a VS Code webview panel
 *
 * Webviews in VS Code are rendered in iframes. This function finds and returns
 * the iframe so you can interact with the webview content.
 *
 * @param page - Playwright page instance
 * @param selector - Optional CSS selector for the webview iframe
 * @returns Promise<Frame> - The webview frame
 *
 * @example
 * ```typescript
 * const webview = await getWebviewFrame(page);
 * const heading = await webview.locator('h1').textContent();
 * ```
 */
export async function getWebviewFrame(
	page: Page,
	selector = "iframe.webview",
): Promise<Frame> {
	// Wait for webview iframe to load
	await page.waitForSelector(selector, { timeout: 5000 });

	// Get the frame
	const frameHandle = await page.$(selector);
	if (!frameHandle) {
		throw new Error(`Webview frame not found: ${selector}`);
	}

	const frame = await frameHandle.contentFrame();
	if (!frame) {
		throw new Error("Could not access webview frame content");
	}

	return frame;
}

/**
 * Wait for webview content to load
 *
 * Webviews may take time to load their HTML/CSS/JS. This function waits
 * for a specific element to appear, indicating the webview is ready.
 *
 * @param frame - Webview frame
 * @param selector - CSS selector to wait for
 * @param timeout - Timeout in milliseconds
 * @returns Promise<Locator>
 *
 * @example
 * ```typescript
 * const webview = await getWebviewFrame(page);
 * await waitForWebviewContent(webview, '.loaded-indicator');
 * ```
 */
export async function waitForWebviewContent(
	frame: Frame,
	selector: string,
	timeout = 5000,
): Promise<Locator> {
	const locator = frame.locator(selector);
	await locator.waitFor({ state: "visible", timeout });
	return locator;
}

/**
 * Take a screenshot of the webview for visual regression testing
 *
 * @param frame - Webview frame
 * @param name - Screenshot name
 * @returns Promise<Buffer>
 *
 * @example
 * ```typescript
 * const webview = await getWebviewFrame(page);
 * const screenshot = await takeWebviewScreenshot(webview, 'welcome-screen');
 * ```
 */
export async function takeWebviewScreenshot(
	frame: Frame,
	name: string,
): Promise<Buffer> {
	// Get the webview body element
	const body = frame.locator("body");

	// Take screenshot
	const screenshot = await body.screenshot({
		path: `test-results/screenshots/${name}.png`,
	});

	return screenshot;
}

/**
 * Execute JavaScript in the webview context
 *
 * Useful for testing webview functionality that requires script execution.
 *
 * @param frame - Webview frame
 * @param script - JavaScript code to execute
 * @returns Promise<unknown>
 *
 * @example
 * ```typescript
 * const webview = await getWebviewFrame(page);
 * const result = await executeInWebview(webview, 'return document.title');
 * console.log('Webview title:', result);
 * ```
 */
export async function executeInWebview<T = unknown>(
	frame: Frame,
	script: string,
): Promise<T> {
	return frame.evaluate(script) as Promise<T>;
}

/**
 * Get webview console messages
 *
 * Captures console.log, console.error, etc. from the webview for debugging.
 *
 * @param page - Playwright page instance
 * @returns Promise<string[]>
 *
 * @example
 * ```typescript
 * const logs = await getWebviewConsoleLogs(page);
 * console.log('Webview logs:', logs);
 * ```
 */
export async function getWebviewConsoleLogs(page: Page): Promise<string[]> {
	const logs: string[] = [];

	page.on("console", (msg) => {
		logs.push(`[${msg.type()}] ${msg.text()}`);
	});

	return logs;
}

/**
 * Verify webview security (CSP, sandboxing)
 *
 * Validates that the webview has proper security configurations.
 *
 * @param frame - Webview frame
 * @returns Promise<{ csp: string | null; sandbox: boolean }>
 *
 * @example
 * ```typescript
 * const webview = await getWebviewFrame(page);
 * const security = await verifyWebviewSecurity(webview);
 * expect(security.csp).toContain("default-src 'self'");
 * ```
 */
export async function verifyWebviewSecurity(frame: Frame): Promise<{
	csp: string | null;
	sandbox: boolean;
}> {
	// Get CSP meta tag
	const csp = await executeInWebview<string | null>(
		frame,
		`(() => {
      const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
      return meta ? meta.getAttribute('content') : null;
    })()`,
	);

	// Check if iframe has sandbox attribute
	const sandbox = await executeInWebview<boolean>(
		frame,
		'window.frameElement?.hasAttribute("sandbox") || false',
	);

	return { csp, sandbox };
}

/**
 * Mock VS Code API in webview context
 *
 * Useful for testing webview logic that communicates with the extension.
 *
 * @param frame - Webview frame
 * @param apiMock - Mock VS Code API implementation
 * @returns Promise<void>
 *
 * @example
 * ```typescript
 * const webview = await getWebviewFrame(page);
 * await mockVSCodeAPI(webview, {
 *   postMessage: (msg) => console.log('Message from webview:', msg)
 * });
 * ```
 */
export async function mockVSCodeAPI(
	frame: Frame,
	apiMock: Record<string, unknown>,
): Promise<void> {
	await frame.evaluate((mock) => {
		// @ts-expect-error - Injecting mock API
		window.acquireVsCodeApi = () => mock;
	}, apiMock);
}

/**
 * Compare webview snapshot with golden image
 *
 * For visual regression testing, compare current screenshot with baseline.
 *
 * @param frame - Webview frame
 * @param goldenPath - Path to golden image
 * @param threshold - Pixel difference threshold (0-1)
 * @returns Promise<boolean>
 *
 * @example
 * ```typescript
 * const webview = await getWebviewFrame(page);
 * const matches = await compareWithGolden(webview, 'golden/welcome.png', 0.01);
 * expect(matches).toBe(true);
 * ```
 */
export async function compareWithGolden(
	frame: Frame,
	_goldenPath: string,
	_threshold = 0.01,
): Promise<boolean> {
	// Take current screenshot
	const _current = await frame.locator("body").screenshot();

	// TODO: Implement pixel-by-pixel comparison with golden image
	// This requires an image comparison library (e.g., pixelmatch)
	//
	// Example implementation:
	// const golden = await fs.readFile(goldenPath);
	// const diff = pixelmatch(golden, current, null, width, height, { threshold });
	// return diff === 0;

	console.warn("compareWithGolden not fully implemented - placeholder");
	return true;
}
