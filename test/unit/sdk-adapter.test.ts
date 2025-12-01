import { beforeEach, describe, expect, it, vi } from "vitest";
import { VSCodeSDKAdapter } from "../../src/sdk-adapter";

// Mock the SDK helpers
vi.mock("@snapback/sdk/helpers", () => ({
	analyze: vi.fn().mockResolvedValue({
		riskLevel: "low",
		issues: [],
	}),
	evaluatePolicy: vi.fn().mockResolvedValue({
		allowed: true,
		violations: [],
	}),
	ingestTelemetry: vi.fn().mockResolvedValue({
		success: true,
	}),
}));

describe("VSCodeSDKAdapter", () => {
	let adapter: VSCodeSDKAdapter;

	beforeEach(() => {
		adapter = new VSCodeSDKAdapter();
	});

	describe("analyzeContent", () => {
		it("should call analyze with correct parameters", async () => {
			const { analyze } = await import("@snapback/sdk/helpers");

			const result = await adapter.analyzeContent(
				"const x = 1;",
				"/test/file.ts",
				"typescript",
			);

			expect(analyze).toHaveBeenCalledWith(
				expect.anything(), // client
				expect.objectContaining({
					client: "vscode",
					workspace_id: expect.any(String),
					session_id: expect.any(String),
					request_id: expect.any(String),
				}),
				expect.objectContaining({
					content: "const x = 1;",
					filePath: "/test/file.ts",
					language: "typescript",
				}),
			);

			expect(result).toEqual({
				riskLevel: "low",
				issues: [],
			});
		});

		it("should work without language parameter", async () => {
			const { analyze } = await import("@snapback/sdk/helpers");

			await adapter.analyzeContent("const x = 1;", "/test/file.ts");

			expect(analyze).toHaveBeenCalledWith(
				expect.anything(),
				expect.anything(),
				expect.objectContaining({
					content: "const x = 1;",
					filePath: "/test/file.ts",
				}),
			);
		});
	});

	describe("evaluatePolicy", () => {
		it("should call evaluatePolicy with correct parameters", async () => {
			const { evaluatePolicy } = await import("@snapback/sdk/helpers");

			const context = {
				filePath: "/test/file.ts",
				action: "save",
			};

			const result = await adapter.evaluatePolicy(context);

			expect(evaluatePolicy).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					client: "vscode",
				}),
				expect.objectContaining({
					context,
				}),
			);

			expect(result).toEqual({
				allowed: true,
				violations: [],
			});
		});
	});

	describe("ingestTelemetry", () => {
		it("should call ingestTelemetry with correct parameters", async () => {
			const { ingestTelemetry } = await import("@snapback/sdk/helpers");

			const payload = {
				action: "snapshot_created",
				fileCount: 5,
			};

			const result = await adapter.ingestTelemetry("user_action", payload);

			expect(ingestTelemetry).toHaveBeenCalledWith(
				expect.anything(),
				expect.objectContaining({
					client: "vscode",
				}),
				expect.objectContaining({
					eventType: "user_action",
					payload,
					timestamp: expect.any(Number),
				}),
			);

			expect(result).toEqual({
				success: true,
			});
		});
	});

	describe("envelope creation", () => {
		it("should generate unique request IDs for each call", async () => {
			const { analyze } = await import("@snapback/sdk/helpers");

			await adapter.analyzeContent("test1", "/file1.ts");
			await adapter.analyzeContent("test2", "/file2.ts");

			const calls = vi.mocked(analyze).mock.calls;
			const requestId1 = calls[0][1].request_id;
			const requestId2 = calls[1][1].request_id;

			expect(requestId1).not.toBe(requestId2);
		});

		it("should use the same session ID across calls", async () => {
			const { analyze } = await import("@snapback/sdk/helpers");

			await adapter.analyzeContent("test1", "/file1.ts");
			await adapter.analyzeContent("test2", "/file2.ts");

			const calls = vi.mocked(analyze).mock.calls;
			const sessionId1 = calls[0][1].session_id;
			const sessionId2 = calls[1][1].session_id;

			expect(sessionId1).toBe(sessionId2);
		});

		it("should include workspace ID from VSCode", async () => {
			const { analyze } = await import("@snapback/sdk/helpers");

			await adapter.analyzeContent("test", "/file.ts");

			const envelope = vi.mocked(analyze).mock.calls[0][1];
			expect(envelope.workspace_id).toBeDefined();
		});
	});
});
