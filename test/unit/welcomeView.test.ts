import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { WelcomeView } from "../../src/welcomeView.js";

describe("WelcomeView", () => {
	let welcomeView: WelcomeView;
	let mockExtensionUri: vscode.Uri;

	beforeEach(() => {
		mockExtensionUri = vscode.Uri.parse("file:///test/extension");
		welcomeView = new WelcomeView(mockExtensionUri);
		vi.clearAllMocks();
		vi.mocked(vscode.Uri.joinPath).mockImplementation(
			(_base, ...paths: string[]) =>
				vscode.Uri.parse(`file:///${paths.join("/")}`),
		);
		vi.mocked(vscode.Uri.parse).mockImplementation((str: string) =>
			vscode.Uri.parse(str),
		);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should create welcome view provider with extension URI", () => {
			expect(welcomeView).toBeDefined();
			// @ts-expect-error - accessing private property for testing
			expect(welcomeView._extensionUri).toBe(mockExtensionUri);
		});
	});

	describe("resolveWebviewView", () => {
		it("should set up webview view with correct options", () => {
			const mockWebviewView = {
				webview: {
					options: {},
					html: "",
					onDidReceiveMessage: vi.fn(),
					asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				},
			};

			welcomeView.resolveWebviewView(
				mockWebviewView as vscode.WebviewView,
				{} as vscode.WebviewViewResolveContext,
				{} as vscode.CancellationToken,
			);

			// Check that webview options are set correctly
			expect(mockWebviewView.webview.options).toEqual({
				enableScripts: true,
				localResourceRoots: [mockExtensionUri],
			});

			// Check that HTML is set
			expect(mockWebviewView.webview.html).toContain("<!DOCTYPE html>");
			expect(mockWebviewView.webview.html).toContain("SnapBack");

			// Check that message handler is registered
			expect(mockWebviewView.webview.onDidReceiveMessage).toHaveBeenCalled();
		});

		it("should store reference to webview view", () => {
			const mockWebviewView = {
				webview: {
					options: {},
					html: "",
					onDidReceiveMessage: vi.fn(),
					asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				},
			};

			welcomeView.resolveWebviewView(
				mockWebviewView as vscode.WebviewView,
				{} as vscode.WebviewViewResolveContext,
				{} as vscode.CancellationToken,
			);

			// @ts-expect-error - accessing private property for testing
			expect(welcomeView._view).toBe(mockWebviewView);
		});
	});

	describe("message handling", () => {
		it("should handle initialize message", () => {
			const mockWebviewView = {
				webview: {
					options: {},
					html: "",
					onDidReceiveMessage: vi.fn(),
					asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				},
			};

			welcomeView.resolveWebviewView(
				mockWebviewView as vscode.WebviewView,
				{} as vscode.WebviewViewResolveContext,
				{} as vscode.CancellationToken,
			);

			// Get the message handler callback
			const messageHandler =
				mockWebviewView.webview.onDidReceiveMessage.mock.calls[0][0];

			// Call the handler with initialize message
			messageHandler({ type: "initialize" });

			expect(vscode.commands.executeCommand).toHaveBeenCalledWith(
				"snapback.initialize",
			);
		});

		it("should handle learnMore message", () => {
			const mockWebviewView = {
				webview: {
					options: {},
					html: "",
					onDidReceiveMessage: vi.fn(),
					asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				},
			};

			welcomeView.resolveWebviewView(
				mockWebviewView as vscode.WebviewView,
				{} as vscode.WebviewViewResolveContext,
				{} as vscode.CancellationToken,
			);

			// Get the message handler callback
			const messageHandler =
				mockWebviewView.webview.onDidReceiveMessage.mock.calls[0][0];

			// Call the handler with learnMore message
			messageHandler({ type: "learnMore" });

			expect(vscode.env.openExternal).toHaveBeenCalledWith(
				expect.objectContaining({ toString: expect.any(Function) }),
			);
		});

		it("should ignore unknown message types", () => {
			const mockWebviewView = {
				webview: {
					options: {},
					html: "",
					onDidReceiveMessage: vi.fn(),
					asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				},
			};

			welcomeView.resolveWebviewView(
				mockWebviewView as vscode.WebviewView,
				{} as vscode.WebviewViewResolveContext,
				{} as vscode.CancellationToken,
			);

			// Get the message handler callback
			const messageHandler =
				mockWebviewView.webview.onDidReceiveMessage.mock.calls[0][0];

			// Call the handler with unknown message
			messageHandler({ type: "unknown" });

			// Should not call any commands or external links
			expect(vscode.commands.executeCommand).not.toHaveBeenCalled();
			expect(vscode.env.openExternal).not.toHaveBeenCalled();
		});
	});

	describe("_getHtmlForWebview", () => {
		it("should generate HTML with correct structure", () => {
			const mockWebview = {
				asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				cspSource: "vscode-webview:",
			};

			// @ts-expect-error - accessing private method for testing
			const html = welcomeView._getHtmlForWebview(mockWebview);

			// Check for essential elements
			expect(html).toContain("<!DOCTYPE html>");
			expect(html).toContain('<html lang="en">');
			expect(html).toContain("<head>");
			expect(html).toContain("<body>");
			expect(html).toContain("SnapBack");
			expect(html).toContain("AI-Powered Code Guardian");
			expect(html).toContain("Initialize Protection");
			expect(html).toContain("Documentation");

			// Check for security nonce
			expect(html).toMatch(/nonce-([A-Za-z0-9]{32})/);

			// Check for script with nonce
			expect(html).toMatch(/<script nonce="([A-Za-z0-9]{32})">/);
		});

		it("should include correct CSS and JS resources", () => {
			const asWebviewUri = vi.fn().mockImplementation((uri) => uri);
			const mockWebview = {
				asWebviewUri,
				cspSource: "vscode-webview:",
			};

			// @ts-expect-error - accessing private method for testing
			welcomeView._getHtmlForWebview(mockWebview);

			expect(asWebviewUri).toHaveBeenCalled();
			const joinedPaths = vi
				.mocked(vscode.Uri.joinPath)
				.mock.calls.map((args) => args.slice(1).join("/"));
			expect(joinedPaths).toEqual(
				expect.arrayContaining([
					"media/reset.css",
					"media/vscode.css",
					"media/welcome.css",
					"out/welcome.js",
				]),
			);
		});

		it("should include correct Content Security Policy", () => {
			const mockWebview = {
				asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				cspSource: "vscode-webview:",
			};

			// @ts-expect-error - accessing private method for testing
			const html = welcomeView._getHtmlForWebview(mockWebview);

			expect(html).toContain("Content-Security-Policy");
			expect(html).toContain("default-src 'none'");
			expect(html).toContain("style-src vscode-webview:");
			expect(html).toMatch(/script-src 'nonce-([A-Za-z0-9]{32})'/);
		});

		it("should include initialize and learn more buttons", () => {
			const mockWebview = {
				asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				cspSource: "vscode-webview:",
			};

			// @ts-expect-error - accessing private method for testing
			const html = welcomeView._getHtmlForWebview(mockWebview);

			expect(html).toContain('id="initialize-btn"');
			expect(html).toContain('id="learn-more-btn"');
		});
	});

	describe("viewType", () => {
		it("should have correct view type", () => {
			expect(WelcomeView.viewType).toBe("snapback.welcome");
		});
	});

	describe("edge cases", () => {
		it("should handle special characters in extension URI", () => {
			const specialUri = {
				scheme: "file",
				authority: "",
				path: "/test/extension with spaces",
				query: "",
				fragment: "",
				toString: () => "file:///test/extension with spaces",
				with: vi.fn().mockReturnThis(),
			};
			const view = new WelcomeView(specialUri as unknown as vscode.Uri);

			const mockWebview = {
				asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				cspSource: "vscode-webview:",
			};

			// @ts-expect-error - accessing private method for testing
			const html = view._getHtmlForWebview(mockWebview);
			expect(html).toContain("<!DOCTYPE html>");
		});

		it("should handle unicode characters in extension URI", () => {
			const unicodeUri = {
				scheme: "file",
				authority: "",
				path: "/test/файл",
				query: "",
				fragment: "",
				toString: () => "file:///test/файл",
				with: vi.fn().mockReturnThis(),
			};
			const view = new WelcomeView(unicodeUri as unknown as vscode.Uri);

			const mockWebview = {
				asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				cspSource: "vscode-webview:",
			};

			// @ts-expect-error - accessing private method for testing
			const html = view._getHtmlForWebview(mockWebview);
			expect(html).toContain("<!DOCTYPE html>");
		});

		it("should handle very long extension URI", () => {
			const longPath = `/${"a".repeat(1000)}/extension`;
			const longUri = {
				scheme: "file",
				authority: "",
				path: longPath,
				query: "",
				fragment: "",
				toString: () => `file://${longPath}`,
				with: vi.fn().mockReturnThis(),
			};
			const view = new WelcomeView(longUri as unknown as vscode.Uri);

			const mockWebview = {
				asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				cspSource: "vscode-webview:",
			};

			// @ts-expect-error - accessing private method for testing
			const html = view._getHtmlForWebview(mockWebview);
			expect(html).toContain("<!DOCTYPE html>");
		});

		it("should handle multiple resolveWebviewView calls", () => {
			const mockWebviewView1 = {
				webview: {
					options: {},
					html: "",
					onDidReceiveMessage: vi.fn(),
					asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				},
			};

			const mockWebviewView2 = {
				webview: {
					options: {},
					html: "",
					onDidReceiveMessage: vi.fn(),
					asWebviewUri: vi.fn().mockImplementation((uri) => uri),
				},
			};

			// Call resolveWebviewView multiple times
			welcomeView.resolveWebviewView(
				mockWebviewView1 as vscode.WebviewView,
				{} as vscode.WebviewViewResolveContext,
				{} as vscode.CancellationToken,
			);

			welcomeView.resolveWebviewView(
				mockWebviewView2 as vscode.WebviewView,
				{} as vscode.WebviewViewResolveContext,
				{} as vscode.CancellationToken,
			);

			// Both should succeed without errors
			expect(mockWebviewView1.webview.html).toContain("<!DOCTYPE html>");
			expect(mockWebviewView2.webview.html).toContain("<!DOCTYPE html>");
		});
	});
});
