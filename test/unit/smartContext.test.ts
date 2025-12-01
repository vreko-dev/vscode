import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	type SmartContext,
	SmartContextDetector,
} from "../../src/smartContext";

describe("SmartContextDetector", () => {
	let smartContextDetector: SmartContextDetector;
	let mockWorkspaceMemory: any;

	beforeEach(() => {
		// Create mock workspace memory with default context
		mockWorkspaceMemory = {
			getContext: vi.fn().mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			}),
		};

		smartContextDetector = new SmartContextDetector(mockWorkspaceMemory);
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("constructor", () => {
		it("should create smart context detector with workspace memory", () => {
			expect(smartContextDetector).toBeDefined();
		});
	});

	describe("detectContext", () => {
		it("should detect basic context with default values", async () => {
			const context = await smartContextDetector.detectContext();

			expect(context).toEqual({
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [".env", "config.json", "secrets.json"],
				activeDevelopmentAreas: [],
				predictedNextAction: null,
			});
		});

		it("should detect rapid file changes risk pattern", async () => {
			// Mock workspace memory with rapid file changes
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "/test/file3.ts",
				recentFiles: ["/test/file1.ts", "/test/file2.ts", "/test/file3.ts"],
				activeBranch: "main",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [
					{ action: "file_opened", timestamp: Date.now() - 1000 },
					{ action: "file_opened", timestamp: Date.now() - 2000 },
					{ action: "file_opened", timestamp: Date.now() - 3000 },
					{ action: "file_opened", timestamp: Date.now() - 4000 },
					{ action: "file_opened", timestamp: Date.now() - 5000 },
					{ action: "file_opened", timestamp: Date.now() - 6000 },
				],
			});

			const context = await smartContextDetector.detectContext();

			expect(context.riskPatterns).toContain("rapid_file_changes");
			expect(context.predictedNextAction).toBe("create_checkpoint");
		});

		it("should detect frequent branch switching risk pattern", async () => {
			// Mock workspace memory with frequent branch changes
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "/test/file.ts",
				recentFiles: ["/test/file.ts"],
				activeBranch: "feature-branch",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [
					{ action: "branch_changed", timestamp: Date.now() - 1000 },
					{ action: "branch_changed", timestamp: Date.now() - 2000 },
					{ action: "branch_changed", timestamp: Date.now() - 3000 },
				],
			});

			const context = await smartContextDetector.detectContext();

			expect(context.riskPatterns).toContain("frequent_branch_switching");
		});

		it("should determine active development areas from recent files", async () => {
			// Mock workspace memory with recent files in different directories
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "/src/components/Button.tsx",
				recentFiles: [
					"/src/components/Button.tsx",
					"/src/components/Input.tsx",
					"/src/utils/helper.ts",
					"/src/services/api.ts",
				],
				activeBranch: "main",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});

			const context = await smartContextDetector.detectContext();

			// Should identify parent directories as active areas
			expect(context.activeDevelopmentAreas).toContain("components");
			expect(context.activeDevelopmentAreas).toContain("utils");
			expect(context.activeDevelopmentAreas).toContain("services");
		});

		it("should predict next action based on active areas", async () => {
			// Mock workspace memory with active development area
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "/src/auth/service.ts",
				recentFiles: ["/src/auth/service.ts"],
				activeBranch: "main",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});

			const context = await smartContextDetector.detectContext();

			expect(context.predictedNextAction).toBe("focus_on_auth");
		});

		it("should handle empty recent files", async () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: null,
				recentFiles: [],
				activeBranch: null,
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});

			const context = await smartContextDetector.detectContext();

			expect(context.activeDevelopmentAreas).toEqual([]);
			expect(context.predictedNextAction).toBeNull();
		});

		it("should handle files with complex paths", async () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "/very/deep/nested/directory/structure/file.ts",
				recentFiles: ["/very/deep/nested/directory/structure/file.ts"],
				activeBranch: "main",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});

			const context = await smartContextDetector.detectContext();

			expect(context.activeDevelopmentAreas).toContain("structure");
		});

		it("should handle files with no parent directory", async () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "rootfile.ts",
				recentFiles: ["rootfile.ts"],
				activeBranch: "main",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});

			const context = await smartContextDetector.detectContext();

			expect(context.activeDevelopmentAreas).toEqual([]);
		});

		it("should combine multiple risk patterns", async () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "/test/file.ts",
				recentFiles: [
					"/test/file1.ts",
					"/test/file2.ts",
					"/test/file3.ts",
					"/test/file4.ts",
					"/test/file5.ts",
					"/test/file6.ts",
				],
				activeBranch: "feature-branch",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [
					{ action: "file_opened", timestamp: Date.now() - 1000 },
					{ action: "file_opened", timestamp: Date.now() - 2000 },
					{ action: "file_opened", timestamp: Date.now() - 3000 },
					{ action: "file_opened", timestamp: Date.now() - 4000 },
					{ action: "file_opened", timestamp: Date.now() - 5000 },
					{ action: "file_opened", timestamp: Date.now() - 6000 },
					{ action: "branch_changed", timestamp: Date.now() - 10000 },
					{ action: "branch_changed", timestamp: Date.now() - 20000 },
					{ action: "branch_changed", timestamp: Date.now() - 30000 },
				],
			});

			const context = await smartContextDetector.detectContext();

			expect(context.riskPatterns).toContain("rapid_file_changes");
			expect(context.riskPatterns).toContain("frequent_branch_switching");
			expect(context.predictedNextAction).toBe("create_checkpoint");
		});
	});

	describe("detectProjectType", () => {
		it("should detect project type", () => {
			// @ts-expect-error - accessing private method for testing
			const projectType = smartContextDetector.detectProjectType();
			expect(projectType).toBe("typescript");
		});
	});

	describe("detectFramework", () => {
		it("should detect framework", () => {
			// @ts-expect-error - accessing private method for testing
			const framework = smartContextDetector.detectFramework();
			expect(framework).toBe("vscode-extension");
		});
	});

	describe("identifyRiskPatterns", () => {
		it("should identify rapid file changes pattern", () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				recentActions: [
					{ action: "file_opened", timestamp: Date.now() - 1000 },
					{ action: "file_opened", timestamp: Date.now() - 2000 },
					{ action: "file_opened", timestamp: Date.now() - 3000 },
					{ action: "file_opened", timestamp: Date.now() - 4000 },
					{ action: "file_opened", timestamp: Date.now() - 5000 },
					{ action: "file_opened", timestamp: Date.now() - 6000 },
				],
			});

			// @ts-expect-error - accessing private method for testing
			const patterns = smartContextDetector.identifyRiskPatterns();
			expect(patterns).toContain("rapid_file_changes");
		});

		it("should identify frequent branch switching pattern", () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				recentActions: [
					{ action: "branch_changed", timestamp: Date.now() - 1000 },
					{ action: "branch_changed", timestamp: Date.now() - 2000 },
					{ action: "branch_changed", timestamp: Date.now() - 3000 },
				],
			});

			// @ts-expect-error - accessing private method for testing
			const patterns = smartContextDetector.identifyRiskPatterns();
			expect(patterns).toContain("frequent_branch_switching");
		});

		it("should handle no risk patterns", () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				recentActions: [
					{ action: "file_opened", timestamp: Date.now() - 1000 },
					{ action: "branch_changed", timestamp: Date.now() - 2000 },
				],
			});

			// @ts-expect-error - accessing private method for testing
			const patterns = smartContextDetector.identifyRiskPatterns();
			expect(patterns).toEqual([]);
		});
	});

	describe("identifySensitiveFiles", () => {
		it("should identify sensitive files", () => {
			// @ts-expect-error - accessing private method for testing
			const sensitiveFiles = smartContextDetector.identifySensitiveFiles();
			expect(sensitiveFiles).toEqual([".env", "config.json", "secrets.json"]);
		});
	});

	describe("determineActiveAreas", () => {
		it("should determine active development areas", () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				recentFiles: [
					"/src/components/Button.tsx",
					"/src/components/Input.tsx",
					"/src/utils/helper.ts",
				],
			});

			// @ts-expect-error - accessing private method for testing
			const areas = smartContextDetector.determineActiveAreas();
			expect(areas).toContain("components");
			expect(areas).toContain("utils");
		});

		it("should handle empty recent files", () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				recentFiles: [],
			});

			// @ts-expect-error - accessing private method for testing
			const areas = smartContextDetector.determineActiveAreas();
			expect(areas).toEqual([]);
		});
	});

	describe("predictNextAction", () => {
		it("should predict checkpoint creation for rapid file changes", () => {
			const context: SmartContext = {
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: ["rapid_file_changes"],
				sensitiveFiles: [".env", "config.json", "secrets.json"],
				activeDevelopmentAreas: ["components"],
				predictedNextAction: null,
			};

			// @ts-expect-error - accessing private method for testing
			const action = smartContextDetector.predictNextAction(context);
			expect(action).toBe("create_checkpoint");
		});

		it("should predict focus on active area", () => {
			const context: SmartContext = {
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [".env", "config.json", "secrets.json"],
				activeDevelopmentAreas: ["auth"],
				predictedNextAction: null,
			};

			// @ts-expect-error - accessing private method for testing
			const action = smartContextDetector.predictNextAction(context);
			expect(action).toBe("focus_on_auth");
		});

		it("should return null when no prediction can be made", () => {
			const context: SmartContext = {
				projectType: "typescript",
				framework: "vscode-extension",
				riskPatterns: [],
				sensitiveFiles: [".env", "config.json", "secrets.json"],
				activeDevelopmentAreas: [],
				predictedNextAction: null,
			};

			// @ts-expect-error - accessing private method for testing
			const action = smartContextDetector.predictNextAction(context);
			expect(action).toBeNull();
		});
	});

	describe("edge cases", () => {
		it("should handle files with special characters", async () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "/test/file with spaces.ts",
				recentFiles: ["/test/file with spaces.ts"],
				activeBranch: "main",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});

			const context = await smartContextDetector.detectContext();
			expect(context.activeDevelopmentAreas).toContain("test");
		});

		it("should handle unicode file paths", async () => {
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: "/test/файл.ts",
				recentFiles: ["/test/файл.ts"],
				activeBranch: "main",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});

			const context = await smartContextDetector.detectContext();
			expect(context.activeDevelopmentAreas).toContain("test");
		});

		it("should handle very long file paths", async () => {
			const longPath = `/test/${"a".repeat(100)}/file.ts`;
			mockWorkspaceMemory.getContext.mockReturnValue({
				lastActiveFile: longPath,
				recentFiles: [longPath],
				activeBranch: "main",
				lastCheckpoint: null,
				protectionStatus: "protected",
				recentActions: [],
			});

			const context = await smartContextDetector.detectContext();
			expect(context.activeDevelopmentAreas).toContain("a".repeat(100));
		});

		it("should handle concurrent context detection", async () => {
			// Run multiple detections concurrently
			const promises = Array.from({ length: 5 }, () =>
				smartContextDetector.detectContext(),
			);

			const results = await Promise.all(promises);
			expect(results).toHaveLength(5);
			results.forEach((result) => {
				expect(result.projectType).toBe("typescript");
				expect(result.framework).toBe("vscode-extension");
			});
		});

		it("should handle workspace memory errors gracefully", async () => {
			mockWorkspaceMemory.getContext.mockImplementation(() => {
				throw new Error("Workspace memory error");
			});

			await expect(smartContextDetector.detectContext()).rejects.toThrow(
				"Workspace memory error",
			);
		});
	});
});
