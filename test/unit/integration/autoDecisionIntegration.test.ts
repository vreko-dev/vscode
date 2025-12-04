/**
 * AutoDecisionIntegration Tests
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import { AutoDecisionIntegration } from "../../../src/integration/AutoDecisionIntegration";

describe("AutoDecisionIntegration", () => {
	let integration: AutoDecisionIntegration;

	beforeEach(() => {
		vi.clearAllMocks();
		integration = new AutoDecisionIntegration(
			{ createSnapshot: vi.fn() } as any,
			{} as any,
		);
	});

	describe("Lifecycle", () => {
		it("should initialize in inactive state", () => {
			const stats = integration.getStats();
			expect(stats.isActive).toBe(false);
		});

		it("should activate", () => {
			integration.activate();
			expect(integration.getStats().isActive).toBe(true);
			integration.deactivate();
		});

		it("should deactivate", () => {
			integration.activate();
			integration.deactivate();
			expect(integration.getStats().isActive).toBe(false);
		});

		it("should handle multiple activates", () => {
			integration.activate();
			integration.activate();
			expect(integration.getStats().isActive).toBe(true);
			integration.deactivate();
		});
	});

	describe("Statistics", () => {
		it("should provide stats", () => {
			const stats = integration.getStats();
			expect(stats.isActive).toBe(false);
			expect(stats.bufferedEvents).toBe(0);
			expect(stats.isProcessing).toBe(false);
		});
	});

	describe("Configuration", () => {
		it("should accept custom config", () => {
			const custom = new AutoDecisionIntegration(
				{ createSnapshot: vi.fn() } as any,
				{} as any,
				{ riskThreshold: 75 },
			);
			expect(custom).toBeDefined();
			custom.deactivate();
		});
	});
});
