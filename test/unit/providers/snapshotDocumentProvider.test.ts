import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CheckpointDocumentProvider } from "../../../src/providers/CheckpointDocumentProvider";

describe("CheckpointDocumentProvider", () => {
	let provider: CheckpointDocumentProvider;

	beforeEach(() => {
		provider = new CheckpointDocumentProvider();
	});

	afterEach(() => {
		provider.dispose();
	});

	describe("setCheckpointContent", () => {
		it("should store content with simple key", () => {
			const filePath = "src/test.ts";
			const content = "test content";

			provider.setCheckpointContent(filePath, content);

			const uri = { path: filePath } as any;
			const result = provider.provideTextDocumentContent(uri);

			expect(result).toBe(content);
		});

		it("should store content with composite key", () => {
			const checkpointId = "cp-123";
			const filePath = "src/test.ts";
			const content = "test content";

			provider.setCheckpointContent(checkpointId, filePath, content);

			const uri = { path: `${checkpointId}/${filePath}` } as any;
			const result = provider.provideTextDocumentContent(uri);

			expect(result).toBe(content);
		});

		it("should fire onDidChange event when content is set", () => {
			const filePath = "src/test.ts";
			const content = "test content";
			let eventFired = false;

			provider.onDidChange(() => {
				eventFired = true;
			});

			provider.setCheckpointContent(filePath, content);

			expect(eventFired).toBe(true);
		});
	});

	describe("provideTextDocumentContent", () => {
		it("should return stored content", () => {
			const filePath = "src/test.ts";
			const content = "test content";

			provider.setCheckpointContent(filePath, content);

			const uri = { path: filePath } as any;
			const result = provider.provideTextDocumentContent(uri);

			expect(result).toBe(content);
		});

		it("should return empty string for missing content", () => {
			const uri = { path: "missing/file.ts" } as any;
			const result = provider.provideTextDocumentContent(uri);

			expect(result).toBe("");
		});

		it("should handle composite key format", () => {
			const checkpointId = "cp-123";
			const filePath = "src/test.ts";
			const content = "test content";

			provider.setCheckpointContent(checkpointId, filePath, content);

			const uri = { path: `${checkpointId}/${filePath}` } as any;
			const result = provider.provideTextDocumentContent(uri);

			expect(result).toBe(content);
		});
	});

	describe("clearContent", () => {
		it("should remove content by file path", () => {
			const filePath = "src/test.ts";
			const content = "test content";

			provider.setCheckpointContent(filePath, content);

			let result = provider.provideTextDocumentContent({
				path: filePath,
			} as any);
			expect(result).toBe(content);

			provider.clearContent(filePath);

			result = provider.provideTextDocumentContent({
				path: filePath,
			} as any);
			expect(result).toBe("");
		});

		it("should remove composite key content", () => {
			const checkpointId = "cp-123";
			const filePath = "src/test.ts";
			const content = "test content";

			provider.setCheckpointContent(checkpointId, filePath, content);

			let result = provider.provideTextDocumentContent({
				path: `${checkpointId}/${filePath}`,
			} as any);
			expect(result).toBe(content);

			provider.clearContent(filePath);

			result = provider.provideTextDocumentContent({
				path: `${checkpointId}/${filePath}`,
			} as any);
			expect(result).toBe("");
		});
	});

	describe("clearContentForCheckpoint", () => {
		it("should remove content for specific checkpoint and file", () => {
			const checkpointId = "cp-123";
			const filePath = "src/test.ts";
			const content = "test content";

			provider.setCheckpointContent(checkpointId, filePath, content);

			let result = provider.provideTextDocumentContent({
				path: `${checkpointId}/${filePath}`,
			} as any);
			expect(result).toBe(content);

			provider.clearContentForCheckpoint(checkpointId, filePath);

			result = provider.provideTextDocumentContent({
				path: `${checkpointId}/${filePath}`,
			} as any);
			expect(result).toBe("");
		});
	});

	describe("clearAllContent", () => {
		it("should remove all stored content", () => {
			provider.setCheckpointContent("file1.ts", "content1");
			provider.setCheckpointContent("cp-123", "file2.ts", "content2");

			provider.clearAllContent();

			const result1 = provider.provideTextDocumentContent({
				path: "file1.ts",
			} as any);
			const result2 = provider.provideTextDocumentContent({
				path: "cp-123/file2.ts",
			} as any);

			expect(result1).toBe("");
			expect(result2).toBe("");
		});
	});

	describe("dispose", () => {
		it("should clear all content and dispose event emitter", () => {
			const disposeSpy = vi.spyOn((provider as any)._onDidChange, "dispose");

			provider.setCheckpointContent("test.ts", "content");
			provider.dispose();

			expect(disposeSpy).toHaveBeenCalled();

			const result = provider.provideTextDocumentContent({
				path: "test.ts",
			} as any);
			expect(result).toBe("");
		});
	});
});
