/**
 * @fileoverview Tests for AIOptInManager
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AIOptInManager } from "../../../src/utils/AIOptInManager.js";

// Mock VS Code API
vi.mock("vscode", () => ({
	window: {
		createQuickPick: vi.fn(),
		showQuickPick: vi.fn(),
	},
	ExtensionContext: vi.fn(),
}));

describe("AIOptInManager", () => {
	let aiOptInManager: AIOptInManager;
	let mockContext: any;

	beforeEach(() => {
		// Create a mock context
		mockContext = {
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		};

		aiOptInManager = new AIOptInManager(mockContext);
	});

	describe("hasUserMadeChoice", () => {
		it("should return false when user has not made a choice", () => {
			mockContext.globalState.get.mockReturnValue(undefined);

			expect(aiOptInManager.hasUserMadeChoice()).toBe(false);
		});

		it("should return true when user has made a choice", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === "aiCheckpointingChoiceMade") {
					return true;
				}
				return undefined;
			});

			expect(aiOptInManager.hasUserMadeChoice()).toBe(true);
		});
	});

	describe("isAIcheckpointingEnabled", () => {
		it("should return false when user has not made a choice", () => {
			mockContext.globalState.get.mockReturnValue(undefined);

			expect(aiOptInManager.isAIcheckpointingEnabled()).toBe(false);
		});

		it("should return false when user has made choice but disabled AI checkpointing", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				switch (key) {
					case "aiCheckpointingChoiceMade":
						return true;
					case "aiCheckpointingEnabled":
						return false;
					default:
						return undefined;
				}
			});

			expect(aiOptInManager.isAIcheckpointingEnabled()).toBe(false);
		});

		it("should return true when user has made choice and enabled AI checkpointing", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				switch (key) {
					case "aiCheckpointingChoiceMade":
						return true;
					case "aiCheckpointingEnabled":
						return true;
					default:
						return undefined;
				}
			});

			expect(aiOptInManager.isAIcheckpointingEnabled()).toBe(true);
		});
	});

	describe("getUserChoiceInfo", () => {
		it("should return correct info when user has not made a choice", () => {
			mockContext.globalState.get.mockReturnValue(undefined);

			const info = aiOptInManager.getUserChoiceInfo();

			expect(info.choiceMade).toBe(false);
			expect(info.enabled).toBe(false);
			expect(info.timestamp).toBeUndefined();
		});

		it("should return correct info when user has made choice", () => {
			const timestamp = Date.now();
			mockContext.globalState.get.mockImplementation((key: string) => {
				switch (key) {
					case "aiCheckpointingChoiceMade":
						return true;
					case "aiCheckpointingEnabled":
						return true;
					case "aiCheckpointingChoiceTimestamp":
						return timestamp;
					default:
						return undefined;
				}
			});

			const info = aiOptInManager.getUserChoiceInfo();

			expect(info.choiceMade).toBe(true);
			expect(info.enabled).toBe(true);
			expect(info.timestamp).toBe(timestamp);
		});
	});

	describe("resetUserChoice", () => {
		it("should reset all user choice data", () => {
			aiOptInManager.resetUserChoice();

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"aiCheckpointingChoiceMade",
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"aiCheckpointingEnabled",
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"aiCheckpointingChoiceTimestamp",
				undefined,
			);
		});
	});

	describe("saveUserChoice", () => {
		it("should save user choice data correctly", () => {
			const dateNow = Date.now();
			vi.useFakeTimers();
			vi.setSystemTime(dateNow);

			(aiOptInManager as any).saveUserChoice(true);

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"aiCheckpointingChoiceMade",
				true,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"aiCheckpointingEnabled",
				true,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"aiCheckpointingChoiceTimestamp",
				dateNow,
			);

			vi.useRealTimers();
		});
	});
});
