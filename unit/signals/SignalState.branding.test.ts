/**
 * SignalState Branding Tests
 *
 * Tests for Pioneer tier display methods and branding-related functionality.
 *
 * @see docs/brand/extension-branding-playbook.md
 * @module test/unit/signals
 */

import { describe, expect, it, beforeEach } from "vitest";
import { SignalState } from "../../../src/signals/SignalState";
import type { UserInfo, PioneerTier } from "../../../src/signals/types";

describe("SignalState Branding", () => {
	let signalState: SignalState;

	beforeEach(() => {
		signalState = new SignalState();
	});

	describe("getPioneerEmoji", () => {
		it("should return seedling emoji for pioneer tier", () => {
			expect(signalState.getPioneerEmoji("pioneer")).toBe("🌱");
		});

		it("should return herb emoji for active_pioneer tier", () => {
			expect(signalState.getPioneerEmoji("active_pioneer")).toBe("🌿");
		});

		it("should return tree emoji for contributing_pioneer tier", () => {
			expect(signalState.getPioneerEmoji("contributing_pioneer")).toBe("🌳");
		});

		it("should return star emoji for founding_pioneer tier", () => {
			expect(signalState.getPioneerEmoji("founding_pioneer")).toBe("⭐");
		});

		it("should return empty string for undefined tier", () => {
			expect(signalState.getPioneerEmoji(undefined)).toBe("");
		});

		it("should return empty string for null-like values", () => {
			expect(signalState.getPioneerEmoji(null as unknown as PioneerTier)).toBe("");
			expect(signalState.getPioneerEmoji("" as PioneerTier)).toBe("");
		});

		it("should handle all Pioneer tiers", () => {
			const tiers: PioneerTier[] = ["pioneer", "active_pioneer", "contributing_pioneer", "founding_pioneer"];
			const emojis = tiers.map((tier) => signalState.getPioneerEmoji(tier));

			// All emojis should be unique
			expect(new Set(emojis).size).toBe(tiers.length);

			// All emojis should be non-empty
			expect(emojis.every((e) => e.length > 0)).toBe(true);
		});
	});

	describe("formatPioneerTier", () => {
		it("should format pioneer tier correctly", () => {
			expect(signalState.formatPioneerTier("pioneer")).toBe("Pioneer");
		});

		it("should format active_pioneer tier correctly", () => {
			expect(signalState.formatPioneerTier("active_pioneer")).toBe("Active Pioneer");
		});

		it("should format contributing_pioneer tier correctly", () => {
			expect(signalState.formatPioneerTier("contributing_pioneer")).toBe("Contributing Pioneer");
		});

		it("should format founding_pioneer tier correctly", () => {
			expect(signalState.formatPioneerTier("founding_pioneer")).toBe("Founding Pioneer");
		});

		it("should return empty string for undefined tier", () => {
			expect(signalState.formatPioneerTier(undefined)).toBe("");
		});

		it("should capitalize all words in tier name", () => {
			const tiers: PioneerTier[] = ["active_pioneer", "contributing_pioneer", "founding_pioneer"];

			for (const tier of tiers) {
				const formatted = signalState.formatPioneerTier(tier);
				// Each word should start with uppercase
				const words = formatted.split(" ");
				expect(words.every((w) => w[0] === w[0].toUpperCase())).toBe(true);
			}
		});
	});

	describe("getTierDisplayText", () => {
		it("should return empty string when no user info", () => {
			expect(signalState.getTierDisplayText()).toBe("");
		});

		it("should return Pioneer tier with emoji when user has pioneerTier", () => {
			signalState.userInfo = {
				id: "user-123",
				email: "test@example.com",
				subscriptionTier: "free",
				pioneerTier: "active_pioneer",
			} as UserInfo;

			const display = signalState.getTierDisplayText();
			expect(display).toBe("Active Pioneer 🌿");
		});

		it("should return founding_pioneer with star emoji", () => {
			signalState.userInfo = {
				id: "user-123",
				email: "test@example.com",
				subscriptionTier: "pro",
				pioneerTier: "founding_pioneer",
			} as UserInfo;

			const display = signalState.getTierDisplayText();
			expect(display).toBe("Founding Pioneer ⭐");
		});

		it("should return capitalized subscription tier when no pioneerTier", () => {
			signalState.userInfo = {
				id: "user-123",
				email: "test@example.com",
				subscriptionTier: "pro",
			} as UserInfo;

			const display = signalState.getTierDisplayText();
			expect(display).toBe("Pro");
		});

		it("should capitalize free tier correctly", () => {
			signalState.userInfo = {
				id: "user-123",
				email: "test@example.com",
				subscriptionTier: "free",
			} as UserInfo;

			const display = signalState.getTierDisplayText();
			expect(display).toBe("Free");
		});

		it("should prioritize pioneerTier over subscriptionTier", () => {
			signalState.userInfo = {
				id: "user-123",
				email: "test@example.com",
				subscriptionTier: "pro",
				pioneerTier: "pioneer",
			} as UserInfo;

			const display = signalState.getTierDisplayText();
			// Should show Pioneer tier, not subscription
			expect(display).toBe("Pioneer 🌱");
			expect(display).not.toContain("Pro");
		});

		it("should handle all pioneer tiers in display text", () => {
			const testCases: { tier: PioneerTier; expected: string }[] = [
				{ tier: "pioneer", expected: "Pioneer 🌱" },
				{ tier: "active_pioneer", expected: "Active Pioneer 🌿" },
				{ tier: "contributing_pioneer", expected: "Contributing Pioneer 🌳" },
				{ tier: "founding_pioneer", expected: "Founding Pioneer ⭐" },
			];

			for (const { tier, expected } of testCases) {
				signalState.userInfo = {
					id: "user-123",
					email: "test@example.com",
					subscriptionTier: "free",
					pioneerTier: tier,
				} as UserInfo;

				expect(signalState.getTierDisplayText()).toBe(expected);
			}
		});
	});

	describe("tier property (disclosure tier)", () => {
		it("should return 'new' for less than 5 snapshots", () => {
			signalState.snapshotCountLifetime = 0;
			expect(signalState.tier).toBe("new");

			signalState.snapshotCountLifetime = 4;
			expect(signalState.tier).toBe("new");
		});

		it("should return 'active' for 5-49 snapshots", () => {
			signalState.snapshotCountLifetime = 5;
			expect(signalState.tier).toBe("active");

			signalState.snapshotCountLifetime = 25;
			expect(signalState.tier).toBe("active");

			signalState.snapshotCountLifetime = 49;
			expect(signalState.tier).toBe("active");
		});

		it("should return 'power' for 50+ snapshots", () => {
			signalState.snapshotCountLifetime = 50;
			expect(signalState.tier).toBe("power");

			signalState.snapshotCountLifetime = 100;
			expect(signalState.tier).toBe("power");

			signalState.snapshotCountLifetime = 1000;
			expect(signalState.tier).toBe("power");
		});
	});

	describe("integration with onSnapshotCreated", () => {
		it("should increment lifetime snapshot count and affect tier", () => {
			expect(signalState.snapshotCountLifetime).toBe(0);
			expect(signalState.tier).toBe("new");

			// Create 5 snapshots to reach 'active' tier
			for (let i = 0; i < 5; i++) {
				signalState.onSnapshotCreated({
					name: `snapshot-${i}`,
					id: `id-${i}`,
					timestamp: Date.now(),
				});
			}

			expect(signalState.snapshotCountLifetime).toBe(5);
			expect(signalState.tier).toBe("active");
		});

		it("should progress through tiers correctly", () => {
			// Start as 'new'
			expect(signalState.tier).toBe("new");

			// After 5 snapshots, become 'active'
			for (let i = 0; i < 5; i++) {
				signalState.onSnapshotCreated({
					name: `snapshot-${i}`,
					id: `id-${i}`,
					timestamp: Date.now(),
				});
			}
			expect(signalState.tier).toBe("active");

			// After 50 total snapshots, become 'power'
			for (let i = 5; i < 50; i++) {
				signalState.onSnapshotCreated({
					name: `snapshot-${i}`,
					id: `id-${i}`,
					timestamp: Date.now(),
				});
			}
			expect(signalState.tier).toBe("power");
		});
	});

	describe("branding consistency", () => {
		it("should use consistent emoji mapping across methods", () => {
			const tiers: PioneerTier[] = ["pioneer", "active_pioneer", "contributing_pioneer", "founding_pioneer"];

			for (const tier of tiers) {
				const emoji = signalState.getPioneerEmoji(tier);
				const formatted = signalState.formatPioneerTier(tier);

				// getTierDisplayText should combine both
				signalState.userInfo = {
					id: "user-123",
					email: "test@example.com",
					subscriptionTier: "free",
					pioneerTier: tier,
				} as UserInfo;

				const displayText = signalState.getTierDisplayText();
				expect(displayText).toBe(`${formatted} ${emoji}`);
			}
		});

		it("should have unique emojis for each tier level", () => {
			const tiers: PioneerTier[] = ["pioneer", "active_pioneer", "contributing_pioneer", "founding_pioneer"];
			const emojis = tiers.map((t) => signalState.getPioneerEmoji(t));

			// No duplicates
			expect(new Set(emojis).size).toBe(tiers.length);
		});

		it("should have progressive emoji evolution (seed → herb → tree → star)", () => {
			// This tests the visual progression metaphor
			const progression: PioneerTier[] = ["pioneer", "active_pioneer", "contributing_pioneer", "founding_pioneer"];
			const emojis = progression.map((t) => signalState.getPioneerEmoji(t));

			// Expected progression: 🌱 → 🌿 → 🌳 → ⭐
			expect(emojis).toEqual(["🌱", "🌿", "🌳", "⭐"]);
		});
	});
});
