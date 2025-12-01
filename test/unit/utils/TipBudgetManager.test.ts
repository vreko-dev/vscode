/**
 * @fileoverview Tests for TipBudgetManager
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { TipBudgetManager } from "../../../src/utils/TipBudgetManager.js";

// Mock VS Code API
vi.mock("vscode", () => ({
	ExtensionContext: vi.fn(),
}));

describe("TipBudgetManager", () => {
	let tipBudgetManager: TipBudgetManager;
	let mockContext: any;

	beforeEach(() => {
		// Create a mock context
		mockContext = {
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		};

		tipBudgetManager = new TipBudgetManager(mockContext);
	});

	describe("constructor", () => {
		it("should initialize with a session ID", () => {
			expect(tipBudgetManager.getCurrentSessionId()).toContain("session-");
		});
	});

	describe("canShowTip", () => {
		it("should allow showing tip when within budget", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "tipBudget.tipsShownCurrentSession":
							return 0;
						case "tipBudget.tipsShownTimestamps":
							return [];
						default:
							return defaultValue;
					}
				},
			);

			const canShow = tipBudgetManager.canShowTip();

			expect(canShow).toBe(true);
		});

		it("should not allow showing tip when session budget exceeded", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "tipBudget.tipsShownCurrentSession":
							return 5; // Exceeds max of 1
						case "tipBudget.tipsShownTimestamps":
							return [];
						default:
							return defaultValue;
					}
				},
			);

			const canShow = tipBudgetManager.canShowTip();

			expect(canShow).toBe(false);
		});

		it("should not allow showing tip when 48-hour budget exceeded", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "tipBudget.tipsShownCurrentSession":
							return 0;
						case "tipBudget.tipsShownTimestamps":
							return [Date.now() - 1000]; // One recent tip
						default:
							return defaultValue;
					}
				},
			);

			const canShow = tipBudgetManager.canShowTip();

			expect(canShow).toBe(false);
		});
	});

	describe("recordTipShown", () => {
		it("should record tip shown correctly", () => {
			const now = Date.now();
			vi.useFakeTimers();
			vi.setSystemTime(now);

			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "tipBudget.tipsShownCurrentSession":
							return 0;
						case "tipBudget.tipsShownTimestamps":
							return [];
						default:
							return defaultValue;
					}
				},
			);

			tipBudgetManager.recordTipShown();

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.tipsShownCurrentSession",
				1,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.tipsShownTimestamps",
				[now],
			);

			vi.useRealTimers();
		});

		it("should update existing timestamps when recording tip shown", () => {
			const now = Date.now();
			const oldTimestamp = now - 24 * 60 * 60 * 1000; // 24 hours ago
			vi.useFakeTimers();
			vi.setSystemTime(now);

			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "tipBudget.tipsShownCurrentSession":
							return 0;
						case "tipBudget.tipsShownTimestamps":
							return [oldTimestamp];
						default:
							return defaultValue;
					}
				},
			);

			tipBudgetManager.recordTipShown();

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.tipsShownCurrentSession",
				1,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.tipsShownTimestamps",
				[oldTimestamp, now],
			);

			vi.useRealTimers();
		});
	});

	describe("startNewSession", () => {
		it("should start a new session", () => {
			const oldSessionId = tipBudgetManager.getCurrentSessionId();

			tipBudgetManager.startNewSession();

			const newSessionId = tipBudgetManager.getCurrentSessionId();

			expect(newSessionId).toContain("session-");
			expect(newSessionId).not.toBe(oldSessionId);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.currentSessionId",
				newSessionId,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.tipsShownCurrentSession",
				0,
			);
		});
	});

	describe("getBudgetStatus", () => {
		it("should return correct budget status when within budget", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "tipBudget.tipsShownCurrentSession":
							return 0;
						case "tipBudget.tipsShownTimestamps":
							return [];
						default:
							return defaultValue;
					}
				},
			);

			const status = tipBudgetManager.getBudgetStatus();

			expect(status).toEqual({
				canShowTip: true,
				tipsShownCurrentSession: 0,
				tipsShownLast48h: 0,
				maxTipsPerSession: 1,
				maxTipsPer48h: 1,
			});
		});

		it("should return correct budget status when budgets exceeded", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "tipBudget.tipsShownCurrentSession":
							return 5; // Exceeds max of 1
						case "tipBudget.tipsShownTimestamps":
							return [Date.now() - 1000]; // One recent tip
						default:
							return defaultValue;
					}
				},
			);

			const status = tipBudgetManager.getBudgetStatus();

			expect(status).toEqual({
				canShowTip: false,
				tipsShownCurrentSession: 5,
				tipsShownLast48h: 1,
				maxTipsPerSession: 1,
				maxTipsPer48h: 1,
			});
		});
	});

	describe("resetBudgetData", () => {
		it("should reset all budget data", () => {
			tipBudgetManager.resetBudgetData();

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.tipsShownTimestamps",
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.tipsShownCurrentSession",
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"tipBudget.currentSessionId",
				undefined,
			);
		});
	});

	describe("getRemainingSessionBudget", () => {
		it("should return correct remaining session budget", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					if (key === "tipBudget.tipsShownCurrentSession") {
						return 0;
					}
					return defaultValue;
				},
			);

			const remaining = tipBudgetManager.getRemainingSessionBudget();

			expect(remaining).toBe(1);
		});

		it("should return zero when session budget exceeded", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					if (key === "tipBudget.tipsShownCurrentSession") {
						return 5; // Exceeds max of 1
					}
					return defaultValue;
				},
			);

			const remaining = tipBudgetManager.getRemainingSessionBudget();

			expect(remaining).toBe(0);
		});
	});

	describe("getRemaining48hBudget", () => {
		it("should return correct remaining 48-hour budget", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					if (key === "tipBudget.tipsShownTimestamps") {
						return [];
					}
					return defaultValue;
				},
			);

			const remaining = tipBudgetManager.getRemaining48hBudget();

			expect(remaining).toBe(1);
		});

		it("should return zero when 48-hour budget exceeded", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					if (key === "tipBudget.tipsShownTimestamps") {
						return [Date.now() - 1000]; // One recent tip
					}
					return defaultValue;
				},
			);

			const remaining = tipBudgetManager.getRemaining48hBudget();

			expect(remaining).toBe(0);
		});

		it("should filter out old timestamps when calculating 48-hour budget", () => {
			const now = Date.now();
			const oldTimestamp = now - 72 * 60 * 60 * 1000; // 72 hours ago (outside 48h window)
			const recentTimestamp = now - 24 * 60 * 60 * 1000; // 24 hours ago (within 48h window)

			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					if (key === "tipBudget.tipsShownTimestamps") {
						return [oldTimestamp, recentTimestamp];
					}
					return defaultValue;
				},
			);

			const remaining = tipBudgetManager.getRemaining48hBudget();

			// Should only count the recent timestamp, so remaining should be 0 (1 max - 1 recent = 0)
			expect(remaining).toBe(0);
		});
	});
});
