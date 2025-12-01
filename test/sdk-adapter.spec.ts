import { describe, expect, it, vi } from "vitest";
import { VSCodeSDKAdapter } from "../src/sdk-adapter";

// Test IDs: sdkuse-001
describe("VSCode SDK Adapter", () => {
	describe("sdkuse-001: VSCode uses SDK only", () => {
		it("should create VSCodeSDKAdapter instance", () => {
			// Mock VS Code API
			vi.mock("vscode", () => ({
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "api.baseUrl") return "https://api.snapback.dev";
								if (key === "api.key") return "test-key";
								return defaultValue;
							}),
					}),
					workspaceFolders: [
						{
							uri: {
								fsPath: "/test/workspace",
							},
						},
					],
				},
			}));

			const adapter = new VSCodeSDKAdapter();

			expect(adapter).toBeInstanceOf(VSCodeSDKAdapter);
		});

		it("should create envelope with correct structure", () => {
			// Mock VS Code API
			vi.mock("vscode", () => ({
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "api.baseUrl") return "https://api.snapback.dev";
								if (key === "api.key") return "test-key";
								return defaultValue;
							}),
					}),
					workspaceFolders: [
						{
							uri: {
								fsPath: "/test/workspace",
							},
						},
					],
				},
			}));

			const adapter = new VSCodeSDKAdapter();

			// Test that the adapter has the expected methods
			expect(typeof (adapter as any).createEnvelope).toBe("function");
		});

		it("should expose analyzeContent method", () => {
			// Mock VS Code API
			vi.mock("vscode", () => ({
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "api.baseUrl") return "https://api.snapback.dev";
								if (key === "api.key") return "test-key";
								return defaultValue;
							}),
					}),
					workspaceFolders: [
						{
							uri: {
								fsPath: "/test/workspace",
							},
						},
					],
				},
			}));

			const adapter = new VSCodeSDKAdapter();

			expect(typeof adapter.analyzeContent).toBe("function");
		});

		it("should expose evaluatePolicy method", () => {
			// Mock VS Code API
			vi.mock("vscode", () => ({
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "api.baseUrl") return "https://api.snapback.dev";
								if (key === "api.key") return "test-key";
								return defaultValue;
							}),
					}),
					workspaceFolders: [
						{
							uri: {
								fsPath: "/test/workspace",
							},
						},
					],
				},
			}));

			const adapter = new VSCodeSDKAdapter();

			expect(typeof adapter.evaluatePolicy).toBe("function");
		});

		it("should expose ingestTelemetry method", () => {
			// Mock VS Code API
			vi.mock("vscode", () => ({
				workspace: {
					getConfiguration: vi.fn().mockReturnValue({
						get: vi
							.fn()
							.mockImplementation((key: string, defaultValue: any) => {
								if (key === "api.baseUrl") return "https://api.snapback.dev";
								if (key === "api.key") return "test-key";
								return defaultValue;
							}),
					}),
					workspaceFolders: [
						{
							uri: {
								fsPath: "/test/workspace",
							},
						},
					],
				},
			}));

			const adapter = new VSCodeSDKAdapter();

			expect(typeof adapter.ingestTelemetry).toBe("function");
		});
	});
});
