/**
 * @fileoverview Tests for UserBehaviorTracker
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	USER_BEHAVIOR_KEYS,
	UserBehaviorTracker,
} from "../../../src/utils/UserBehaviorTracker.js";

describe("UserBehaviorTracker", () => {
	let userBehaviorTracker: UserBehaviorTracker;
	let mockContext: any;

	beforeEach(() => {
		// Create a mock context
		mockContext = {
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		};

		userBehaviorTracker = new UserBehaviorTracker(mockContext);
	});

	describe("constructor", () => {
		it("should initialize first use timestamp if not already set", () => {
			// Mock get to return undefined for first use timestamp
			vi.mocked(mockContext.globalState.get).mockImplementation(
				(key: string) => {
					if (key === USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP) {
						return undefined;
					}
					return 0;
				},
			);

			// Reset the mock to clear previous calls
			vi.mocked(mockContext.globalState.update).mockClear();

			new UserBehaviorTracker(mockContext);

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP,
				expect.any(Number),
			);
		});

		it("should not initialize first use timestamp if already set", () => {
			// Mock get to return a timestamp for first use timestamp
			vi.mocked(mockContext.globalState.get).mockImplementation(
				(key: string) => {
					if (key === USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP) {
						return Date.now() - 1000;
					}
					return 0;
				},
			);

			// Reset the mock to clear previous calls
			vi.mocked(mockContext.globalState.update).mockClear();

			new UserBehaviorTracker(mockContext);

			expect(mockContext.globalState.update).not.toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP,
				expect.any(Number),
			);
		});
	});

	describe("incrementCounter", () => {
		it("should increment counter correctly", () => {
			mockContext.globalState.get.mockReturnValue(5);

			userBehaviorTracker.incrementCounter("SNAPSHOTS_CREATED", 3);

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.SNAPSHOTS_CREATED,
				8,
			);
		});

		it("should increment counter by 1 when no amount specified", () => {
			mockContext.globalState.get.mockReturnValue(5);

			userBehaviorTracker.incrementCounter("SNAPSHOTS_CREATED");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.SNAPSHOTS_CREATED,
				6,
			);
		});
	});

	describe("recordCommandUsage", () => {
		it("should record command usage correctly", () => {
			mockContext.globalState.get.mockReturnValue({
				"snapback.createSnapshot": 5,
			});

			userBehaviorTracker.recordCommandUsage("snapback.createSnapshot", 2);

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.COMMANDS_USED,
				{
					"snapback.createSnapshot": 7,
				},
			);
		});

		it("should initialize command usage count for new commands", () => {
			mockContext.globalState.get.mockReturnValue({});

			userBehaviorTracker.recordCommandUsage("snapback.snapBack");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.COMMANDS_USED,
				{
					"snapback.snapBack": 1,
				},
			);
		});
	});

	describe("getCounter", () => {
		it("should get counter value correctly", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.SNAPSHOTS_CREATED) {
					return 10;
				}
				return 0;
			});

			const value = userBehaviorTracker.getCounter("SNAPSHOTS_CREATED");

			expect(value).toBe(10);
		});

		it("should return 0 for unset counters", () => {
			mockContext.globalState.get.mockImplementation((_key: string) => {
				return 0; // Return default value
			});

			const value = userBehaviorTracker.getCounter("SNAPSHOTS_CREATED");

			expect(value).toBe(0);
		});
	});

	describe("getCommandUsage", () => {
		it("should get command usage correctly", () => {
			const commandUsage = {
				"snapback.createSnapshot": 5,
				"snapback.snapBack": 3,
			};
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.COMMANDS_USED) {
					return commandUsage;
				}
				return {};
			});

			const result = userBehaviorTracker.getCommandUsage();

			expect(result).toEqual(commandUsage);
		});

		it("should return empty object for unset command usage", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.COMMANDS_USED) {
					return undefined;
				}
				return {};
			});

			const result = userBehaviorTracker.getCommandUsage();

			expect(result).toEqual({});
		});
	});

	describe("getFirstUseTimestamp", () => {
		it("should get first use timestamp correctly", () => {
			const timestamp = Date.now() - 1000;
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP) {
					return timestamp;
				}
				return Date.now();
			});

			const result = userBehaviorTracker.getFirstUseTimestamp();

			expect(result).toBe(timestamp);
		});

		it("should return current time for unset first use timestamp", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP) {
					return undefined;
				}
				return Date.now();
			});

			const result = userBehaviorTracker.getFirstUseTimestamp();

			expect(typeof result).toBe("number");
		});
	});

	describe("resetAllData", () => {
		it("should reset all behavior tracking data", () => {
			userBehaviorTracker.resetAllData();

			// Should reset all keys except FIRST_USE_TIMESTAMP
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.SNAPSHOTS_CREATED,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.SESSIONS_RECORDED,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.PROTECTED_FILES,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.MANUAL_RESTORES,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.AI_ASSISTED_SESSIONS,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.COMMANDS_USED,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.TIPS_SHOWN,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.HINTS_SHOWN,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.WARNINGS_SHOWN,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.BLOCKS_PREVENTED,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.FILES_RESTORED,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.CONFIG_CHANGES,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.POLICY_OVERRIDES,
				undefined,
			);
			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.EXPERIENCE_TIER,
				undefined,
			);

			// Should NOT reset first use timestamp
			expect(mockContext.globalState.update).not.toHaveBeenCalledWith(
				USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP,
				undefined,
			);
		});
	});

	describe("getBehaviorSummary", () => {
		it("should get behavior summary correctly", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				switch (key) {
					case USER_BEHAVIOR_KEYS.SNAPSHOTS_CREATED:
						return 10;
					case USER_BEHAVIOR_KEYS.SESSIONS_RECORDED:
						return 5;
					case USER_BEHAVIOR_KEYS.PROTECTED_FILES:
						return 3;
					case USER_BEHAVIOR_KEYS.MANUAL_RESTORES:
						return 2;
					case USER_BEHAVIOR_KEYS.AI_ASSISTED_SESSIONS:
						return 1;
					case USER_BEHAVIOR_KEYS.TIPS_SHOWN:
						return 4;
					case USER_BEHAVIOR_KEYS.HINTS_SHOWN:
						return 8;
					case USER_BEHAVIOR_KEYS.WARNINGS_SHOWN:
						return 1;
					case USER_BEHAVIOR_KEYS.BLOCKS_PREVENTED:
						return 0;
					case USER_BEHAVIOR_KEYS.FILES_RESTORED:
						return 3;
					case USER_BEHAVIOR_KEYS.CONFIG_CHANGES:
						return 2;
					case USER_BEHAVIOR_KEYS.POLICY_OVERRIDES:
						return 1;
					default:
						return 0;
				}
			});

			const summary = userBehaviorTracker.getBehaviorSummary();

			expect(summary).toEqual({
				SNAPSHOTS_CREATED: 10,
				SESSIONS_RECORDED: 5,
				PROTECTED_FILES: 3,
				MANUAL_RESTORES: 2,
				AI_ASSISTED_SESSIONS: 1,
				TIPS_SHOWN: 4,
				HINTS_SHOWN: 8,
				WARNINGS_SHOWN: 1,
				BLOCKS_PREVENTED: 0,
				FILES_RESTORED: 3,
				CONFIG_CHANGES: 2,
				POLICY_OVERRIDES: 1,
			});
		});
	});

	describe("getDaysSinceFirstUse", () => {
		it("should calculate days since first use correctly", () => {
			const pastDate = Date.now() - 5 * 24 * 60 * 60 * 1000; // 5 days ago
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.FIRST_USE_TIMESTAMP) {
					return pastDate;
				}
				return Date.now();
			});

			const days = userBehaviorTracker.getDaysSinceFirstUse();

			expect(days).toBe(5);
		});
	});

	describe("getCommandDiversity", () => {
		it("should calculate command diversity correctly", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.COMMANDS_USED) {
					return {
						"snapback.createSnapshot": 2,
						"snapback.snapBack": 2,
						"snapback.protectFile": 2,
					}; // 3 unique commands, 6 total uses = 3/6 = 0.5
				}
				return {};
			});

			const diversity = userBehaviorTracker.getCommandDiversity();

			expect(diversity).toBe(0.5);
		});

		it("should return 0 when no commands used", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.COMMANDS_USED) {
					return {};
				}
				return {};
			});

			const diversity = userBehaviorTracker.getCommandDiversity();

			expect(diversity).toBe(0);
		});

		it("should cap total commands at 20 for diversity calculation", () => {
			// Create a record with many commands but total uses > 20
			const commands: Record<string, number> = {};
			for (let i = 0; i < 15; i++) {
				commands[`command${i}`] = 2; // 15 unique commands, 30 total uses
			}

			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === USER_BEHAVIOR_KEYS.COMMANDS_USED) {
					return commands;
				}
				return {};
			});

			const diversity = userBehaviorTracker.getCommandDiversity();

			// 15 unique commands / min(30, 20) = 15/20 = 0.75
			expect(diversity).toBe(0.75);
		});
	});
});
