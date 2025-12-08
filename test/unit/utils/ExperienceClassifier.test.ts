/**
 * @fileoverview Tests for ExperienceClassifier
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExperienceClassifier } from "@vscode/utils/ExperienceClassifier";

describe("ExperienceClassifier", () => {
	let experienceClassifier: ExperienceClassifier;
	let mockContext: any;

	beforeEach(() => {
		// Create a mock context
		mockContext = {
			globalState: {
				get: vi.fn(),
				update: vi.fn(),
			},
		};

		experienceClassifier = new ExperienceClassifier(mockContext);
	});

	describe("getExperienceTier", () => {
		it("should return manually set tier when available", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === "experienceTier") {
					return "power";
				}
				return undefined;
			});

			expect(experienceClassifier.getExperienceTier()).toBe("power");
		});

		it("should return unknown when no metrics are available", () => {
			mockContext.globalState.get.mockImplementation(
				(_key: string, defaultValue?: any) => {
					return defaultValue;
				},
			);

			expect(experienceClassifier.getExperienceTier()).toBe("unknown");
		});

		it("should classify as explorer when meeting explorer thresholds but not intermediate", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "snapshotsCreated":
							return 6; // Above explorer (5), below intermediate (20)
						case "sessionsRecorded":
							return 4; // Above explorer (3), below intermediate (10)
						case "protectedFiles":
							return 3; // Above explorer (2), below intermediate (5)
						case "manualRestores":
							return 2; // Above explorer (1), below intermediate (5)
						case "aiAssistedSessions":
							return 1; // Above explorer (0), below intermediate (2)
						case "daysSinceFirstUse":
							return 8; // Above explorer (7), below intermediate (30)
						case "commandsUsed":
							return { "snapback.createSnapshot": 2 }; // Low diversity, about 0.33
						case "firstUseTimestamp":
							return Date.now() - 8 * 24 * 60 * 60 * 1000;
						default:
							return defaultValue;
					}
				},
			);

			expect(experienceClassifier.getExperienceTier()).toBe("explorer");
		});

		it("should classify as intermediate when meeting intermediate thresholds but not power", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "snapshotsCreated":
							return 25; // Above intermediate (20), below power (100)
						case "sessionsRecorded":
							return 12; // Above intermediate (10), below power (50)
						case "protectedFiles":
							return 6; // Above intermediate (5), below power (20)
						case "manualRestores":
							return 6; // Above intermediate (5), below power (20)
						case "aiAssistedSessions":
							return 3; // Above intermediate (2), below power (10)
						case "daysSinceFirstUse":
							return 35; // Above intermediate (30), below power (90)
						case "commandsUsed":
							return {
								"snapback.createSnapshot": 4,
								"snapback.snapBack": 3,
								"snapback.protectFile": 2,
								"snapback.showAllSnapshots": 1,
							}; // Medium diversity: 4 commands, 10 total uses = 4/10 = 0.4, but we need 0.6
						// Let's adjust to: 6 commands, 10 total uses = 6/10 = 0.6
						case "firstUseTimestamp":
							return Date.now() - 35 * 24 * 60 * 60 * 1000;
						default:
							return defaultValue;
					}
				},
			);

			// Actually, let's make it simpler - 6 unique commands with 10 total uses
			// commandDiversity = 6 / min(10, 20) = 6 / 10 = 0.6
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "snapshotsCreated":
							return 25;
						case "sessionsRecorded":
							return 12;
						case "protectedFiles":
							return 6;
						case "manualRestores":
							return 6;
						case "aiAssistedSessions":
							return 3;
						case "daysSinceFirstUse":
							return 35;
						case "commandsUsed":
							return {
								"snapback.createSnapshot": 2,
								"snapback.snapBack": 2,
								"snapback.protectFile": 2,
								"snapback.showAllSnapshots": 1,
								"snapback.compareWithSnapshot": 1,
								"snapback.deleteSnapshot": 1,
								"snapback.renameSnapshot": 1,
							}; // 6 unique commands, 10 total uses = 6/10 = 0.6
						case "firstUseTimestamp":
							return Date.now() - 35 * 24 * 60 * 60 * 1000;
						default:
							return defaultValue;
					}
				},
			);

			expect(experienceClassifier.getExperienceTier()).toBe("intermediate");
		});

		it("should classify as power when meeting power thresholds", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "snapshotsCreated":
							return 150;
						case "sessionsRecorded":
							return 75;
						case "protectedFiles":
							return 30;
						case "manualRestores":
							return 30;
						case "aiAssistedSessions":
							return 20;
						case "daysSinceFirstUse":
							return 120;
						case "commandsUsed":
							return {
								"snapback.createSnapshot": 20,
								"snapback.snapBack": 15,
								"snapback.protectFile": 10,
								"snapback.showAllSnapshots": 8,
								"snapback.compareWithSnapshot": 5,
							}; // 5 unique commands, 58 total uses = 5/20 = 0.25, but we need 0.9
						// Let's adjust to have enough unique commands
						case "firstUseTimestamp":
							return Date.now() - 120 * 24 * 60 * 60 * 1000;
						default:
							return defaultValue;
					}
				},
			);

			// For power user: need commandDiversity >= 0.9
			// That means we need at least 18 unique commands with 20 total uses, or 9 unique with 10 total, etc.
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					switch (key) {
						case "snapshotsCreated":
							return 150;
						case "sessionsRecorded":
							return 75;
						case "protectedFiles":
							return 30;
						case "manualRestores":
							return 30;
						case "aiAssistedSessions":
							return 20;
						case "daysSinceFirstUse":
							return 120;
						case "commandsUsed":
							return {
								"snapback.createSnapshot": 2,
								"snapback.snapBack": 2,
								"snapback.protectFile": 2,
								"snapback.showAllSnapshots": 2,
								"snapback.compareWithSnapshot": 2,
								"snapback.deleteSnapshot": 2,
								"snapback.renameSnapshot": 2,
								"snapback.protectCurrentFile": 2,
								"snapback.unprotectFile": 2,
								"snapback.changeProtectionLevel": 2,
								"snapback.setWatchLevel": 2,
								"snapback.setWarnLevel": 2,
								"snapback.setBlockLevel": 2,
								"snapback.viewSnapshot": 2,
								"snapback.showAllProtectedFiles": 2,
								"snapback.openWalkthrough": 2,
								"snapback.refreshViews": 2,
								"snapback.updateConfiguration": 2,
							}; // 18 unique commands, 36 total uses = 18/20 = 0.9
						case "firstUseTimestamp":
							return Date.now() - 120 * 24 * 60 * 60 * 1000;
						default:
							return defaultValue;
					}
				},
			);

			expect(experienceClassifier.getExperienceTier()).toBe("power");
		});
	});

	describe("updateExperienceMetrics", () => {
		it("should update experience metrics correctly", () => {
			mockContext.globalState.get.mockReturnValue(5);

			experienceClassifier.updateExperienceMetrics("snapshotsCreated", 3);

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"snapshotsCreated",
				8,
			);
		});

		it("should set first use timestamp when not already set", () => {
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === "firstUseTimestamp") {
					return undefined;
				}
				return 0;
			});

			experienceClassifier.updateExperienceMetrics("snapshotsCreated");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"firstUseTimestamp",
				expect.any(Number),
			);
		});
	});

	describe("recordCommandUsage", () => {
		it("should record command usage correctly", () => {
			mockContext.globalState.get.mockReturnValue({
				"snapback.createSnapshot": 5,
			});

			experienceClassifier.recordCommandUsage("snapback.createSnapshot");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"commandsUsed",
				{
					"snapback.createSnapshot": 6,
				},
			);
		});

		it("should initialize command usage count for new commands", () => {
			mockContext.globalState.get.mockReturnValue({});

			experienceClassifier.recordCommandUsage("snapback.snapBack");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"commandsUsed",
				{
					"snapback.snapBack": 1,
				},
			);
		});
	});

	describe("setExperienceTier", () => {
		it("should set experience tier manually", () => {
			experienceClassifier.setExperienceTier("intermediate");

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"experienceTier",
				"intermediate",
			);
		});
	});

	describe("resetExperienceTier", () => {
		it("should reset experience tier", () => {
			experienceClassifier.resetExperienceTier();

			expect(mockContext.globalState.update).toHaveBeenCalledWith(
				"experienceTier",
				undefined,
			);
		});
	});

	describe("getExperienceTierDescription", () => {
		it("should return correct description for explorer tier", () => {
			// Mock the globalState.get to return the manually set tier
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === "experienceTier") {
					return "explorer";
				}
				return undefined;
			});

			expect(experienceClassifier.getExperienceTierDescription()).toBe(
				"Welcome to SnapBack! You're just getting started with file protection.",
			);
		});

		it("should return correct description for intermediate tier", () => {
			// Mock the globalState.get to return the manually set tier
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === "experienceTier") {
					return "intermediate";
				}
				return undefined;
			});

			expect(experienceClassifier.getExperienceTierDescription()).toBe(
				"You're becoming a SnapBack pro! You're using multiple protection levels effectively.",
			);
		});

		it("should return correct description for power tier", () => {
			// Mock the globalState.get to return the manually set tier
			mockContext.globalState.get.mockImplementation((key: string) => {
				if (key === "experienceTier") {
					return "power";
				}
				return undefined;
			});

			expect(experienceClassifier.getExperienceTierDescription()).toBe(
				"You're a SnapBack expert! You're using the full power of the extension.",
			);
		});

		it("should return correct description for unknown tier", () => {
			mockContext.globalState.get.mockImplementation(
				(key: string, defaultValue?: any) => {
					if (key === "experienceTier") {
						return undefined;
					}
					if (key === "commandsUsed") {
						return {};
					}
					return defaultValue;
				},
			);

			expect(experienceClassifier.getExperienceTierDescription()).toBe(
				"We're still learning about how you use SnapBack.",
			);
		});
	});
});
