import { beforeEach, describe, expect, it, vi } from "vitest";
import { SnapBackStatusBar } from "../../src/protectionStatusBar.js";
import { ProtectedFileRegistry } from "../../src/services/protectedFileRegistry.js";
import {
	BRAND_SIGNAGE,
	getProtectionLevelSignage,
} from "../../src/signage/index.js";
import type { ProtectionLevel } from "../../src/views/types.js";

describe("ProtectionStatusBar", () => {
	let statusBar: SnapBackStatusBar;
	let registry: ProtectedFileRegistry;
	let mockStorage: Map<string, any>;

	// Mock VS Code ThemeColor
	const mockThemeColor = vi.fn((colorId) => ({ id: colorId }));

	// Mock status bar item
	const mockStatusBarItem = {
		text: "",
		backgroundColor: undefined,
		command: "",
		tooltip: undefined,
		show: vi.fn(),
		hide: vi.fn(),
		dispose: vi.fn(),
	};

	// Mock window API
	const mockWindow = {
		createStatusBarItem: vi.fn().mockReturnValue(mockStatusBarItem),
	};

	beforeEach(() => {
		// Reset mocks
		vi.clearAllMocks();

		// Setup VS Code mocks
		vi.doMock("vscode", () => ({
			window: mockWindow,
			ThemeColor: mockThemeColor,
			StatusBarAlignment: { Left: 1 },
			MarkdownString: class {
				content = "";
				appendMarkdown = vi.fn((markdown) => {
					this.content += markdown;
				});
				supportHtml = false;
				isTrusted = true;
			},
		}));

		// Create new status bar instance
		statusBar = new SnapBackStatusBar();

		// Create registry for testing
		mockStorage = new Map();
		const mockState = {
			get: vi.fn().mockImplementation((key, defaultValue) => {
				return mockStorage.get(key) ?? defaultValue;
			}),
			update: vi.fn().mockImplementation((key, value) => {
				mockStorage.set(key, value);
				return Promise.resolve();
			}),
		};

		registry = new ProtectedFileRegistry(mockState as any);
	});

	describe("Initialization", () => {
		it("should create status bar item with correct properties", () => {
			expect(mockWindow.createStatusBarItem).toHaveBeenCalledWith(
				1, // StatusBarAlignment.Left
				100, // Priority
			);
			expect(mockStatusBarItem.command).toBe("snapback.showProtectionPanel");
		});
	});

	describe("Protection Statistics", () => {
		it("should calculate correct statistics for empty registry", async () => {
			vi.spyOn(registry, "list").mockResolvedValue([]);

			// Use reflection to access private method
			const stats = await (statusBar as any).calculateStats();

			expect(stats).toEqual({
				watched: 0,
				warning: 0,
				protected: 0,
				total: 0,
				highestLevel: null,
			});
		});

		it("should calculate correct statistics for mixed protection levels", async () => {
			const mockFiles = [
				{
					path: "/test/file1.ts",
					protectionLevel: "Watched" as ProtectionLevel,
					label: "file1.ts",
					lastProtectedAt: Date.now(),
				},
				{
					path: "/test/file2.ts",
					protectionLevel: "Warning" as ProtectionLevel,
					label: "file2.ts",
					lastProtectedAt: Date.now(),
				},
				{
					path: "/test/file3.ts",
					protectionLevel: "Protected" as ProtectionLevel,
					label: "file3.ts",
					lastProtectedAt: Date.now(),
				},
			];

			vi.spyOn(registry, "list").mockResolvedValue(mockFiles as any);

			// Use reflection to access private method
			const stats = await (statusBar as any).calculateStats();

			expect(stats).toEqual({
				watched: 1,
				warning: 1,
				protected: 1,
				total: 3,
				highestLevel: "Protected",
			});
		});

		it("should determine correct highest protection level", async () => {
			// Test Protected > Warning > Watched priority
			const testCases = [
				{
					files: [
						{ protectionLevel: "Watched" as ProtectionLevel },
						{ protectionLevel: "Warning" as ProtectionLevel },
						{ protectionLevel: "Protected" as ProtectionLevel },
					],
					expected: "Protected",
				},
				{
					files: [
						{ protectionLevel: "Watched" as ProtectionLevel },
						{ protectionLevel: "Warning" as ProtectionLevel },
					],
					expected: "Warning",
				},
				{
					files: [{ protectionLevel: "Watched" as ProtectionLevel }],
					expected: "Watched",
				},
				{
					files: [],
					expected: null,
				},
			];

			for (const testCase of testCases) {
				vi.spyOn(registry, "list").mockResolvedValue(
					testCase.files.map((f, i) => ({
						path: `/test/file${i}.ts`,
						protectionLevel: f.protectionLevel,
						label: `file${i}.ts`,
						lastProtectedAt: Date.now(),
					})) as any,
				);

				// Use reflection to access private method
				const stats = await (statusBar as any).calculateStats();
				expect(stats.highestLevel).toBe(testCase.expected);
			}
		});
	});

	describe("Text Formatting", () => {
		it("should format text for no protected files", () => {
			const stats = {
				watched: 0,
				warning: 0,
				protected: 0,
				total: 0,
				highestLevel: null,
			};

			// Use reflection to access private method
			const text = (statusBar as any).formatText(stats);
			expect(text).toBe(`${BRAND_SIGNAGE.logoEmoji} No files protected`);
		});

		it("should format text for single file", () => {
			const stats = {
				watched: 0,
				warning: 1,
				protected: 0,
				total: 1,
				highestLevel: "Warning" as ProtectionLevel,
			};

			// Use reflection to access private method
			const text = (statusBar as any).formatText(stats);
			const warnSignage = getProtectionLevelSignage("warn");
			expect(text).toBe(
				`${BRAND_SIGNAGE.logoEmoji} 1 file | ${warnSignage.emoji} Warning`,
			);
		});

		it("should format text for multiple files", () => {
			const stats = {
				watched: 2,
				warning: 1,
				protected: 0,
				total: 3,
				highestLevel: "Warning" as ProtectionLevel,
			};

			// Use reflection to access private method
			const text = (statusBar as any).formatText(stats);
			const warnSignage = getProtectionLevelSignage("warn");
			expect(text).toBe(
				`${BRAND_SIGNAGE.logoEmoji} 3 files | ${warnSignage.emoji} Warning`,
			);
		});
	});

	describe("Color Coding", () => {
		it("should return correct colors for different protection levels", () => {
			const testCases = [
				{ protected: 1, warning: 0, watched: 0, expected: "error" },
				{ protected: 0, warning: 1, watched: 0, expected: "warning" },
				{ protected: 0, warning: 0, watched: 1, expected: "default" },
				{ protected: 0, warning: 0, watched: 0, expected: "none" },
			];

			for (const testCase of testCases) {
				const stats = {
					watched: testCase.watched,
					warning: testCase.warning,
					protected: testCase.protected,
					total: testCase.watched + testCase.warning + testCase.protected,
					highestLevel: testCase.protected
						? "Protected"
						: testCase.warning
							? "Warning"
							: testCase.watched
								? "Watched"
								: null,
				};

				// Use reflection to access private method
				const color = (statusBar as any).getColor(stats);
				expect(color).toBe(testCase.expected);
			}
		});
	});

	describe("Status Bar Updates", () => {
		it("should update status bar appearance correctly", () => {
			// Use reflection to access private method
			(statusBar as any).updateStatusBar("Test text", "error");

			expect(mockStatusBarItem.text).toBe("Test text");
			expect(mockStatusBarItem.backgroundColor).toEqual({
				id: "statusBarItem.errorBackground",
			});
		});

		it("should show status bar item", () => {
			statusBar.show();
			expect(mockStatusBarItem.show).toHaveBeenCalled();
		});

		it("should hide status bar item", () => {
			statusBar.hide();
			expect(mockStatusBarItem.hide).toHaveBeenCalled();
		});

		it("should dispose status bar item", () => {
			statusBar.dispose();
			expect(mockStatusBarItem.dispose).toHaveBeenCalled();
		});
	});

	describe("Tooltip Generation", () => {
		it("should create tooltip with correct statistics", () => {
			const stats = {
				watched: 2,
				warning: 1,
				protected: 3,
				total: 6,
				highestLevel: "Protected" as ProtectionLevel,
			};

			// Use reflection to access private method
			const tooltip = (statusBar as any).createTooltip(stats);

			// Check that markdown was appended correctly
			expect(tooltip.appendMarkdown).toHaveBeenCalledWith(
				"**SnapBack Protection Status**\n\n",
			);
			const watchSignage = getProtectionLevelSignage("watch");
			const warnSignage = getProtectionLevelSignage("warn");
			const blockSignage = getProtectionLevelSignage("block");

			expect(tooltip.appendMarkdown).toHaveBeenCalledWith(
				`${watchSignage.emoji} ${watchSignage.label}: 2 file(s)\n`,
			);
			expect(tooltip.appendMarkdown).toHaveBeenCalledWith(
				`${warnSignage.emoji} ${warnSignage.label}: 1 file(s)\n`,
			);
			expect(tooltip.appendMarkdown).toHaveBeenCalledWith(
				`${blockSignage.emoji} ${blockSignage.label}: 3 file(s)\n\n`,
			);
			expect(tooltip.appendMarkdown).toHaveBeenCalledWith(
				"Highest level: **Protected**\n",
			);
			expect(tooltip.appendMarkdown).toHaveBeenCalledWith(
				"*Click to manage protection*",
			);
		});
	});
});
