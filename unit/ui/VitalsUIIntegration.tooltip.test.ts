/**
 * VSUI-05: VitalsUIIntegration pulse status-bar tooltip tests (RED gate)
 *
 * Verifies that handleSessionHealthUpdate populates a MarkdownString tooltip
 * on StatusFlagManager from VitalsSnapshot data (pulse, temp, detectedTool).
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ──────────────────────────────────────────────────────────────────────────────
// VS Code mock (must be before any import that re-exports vscode)
// ──────────────────────────────────────────────────────────────────────────────

vi.mock("vscode", () => {
	class MarkdownString {
		value: string;
		isTrusted: boolean;
		constructor(value = "", _isTrusted = false) {
			this.value = value;
			this.isTrusted = false;
		}
		appendMarkdown(text: string) {
			this.value += text;
			return this;
		}
	}

	return {
		MarkdownString,
		workspace: {
			getConfiguration: vi.fn(() => ({
				get: vi.fn((key: string, def: unknown) => def),
				update: vi.fn(),
			})),
			isTrusted: true,
		},
		window: {
			createOutputChannel: vi.fn(() => ({ appendLine: vi.fn(), dispose: vi.fn() })),
			createStatusBarItem: vi.fn(() => ({
				text: "",
				tooltip: undefined,
				backgroundColor: undefined,
				command: undefined,
				show: vi.fn(),
				dispose: vi.fn(),
			})),
		},
		commands: {
			executeCommand: vi.fn().mockResolvedValue(undefined),
			registerCommand: vi.fn(),
		},
		ConfigurationTarget: { Workspace: 2 },
		StatusBarAlignment: { Left: 1, Right: 2 },
		EventEmitter: vi.fn(() => ({
			event: vi.fn(),
			fire: vi.fn(),
			dispose: vi.fn(),
		})),
		Disposable: { from: vi.fn() },
		Uri: { parse: vi.fn((s: string) => ({ toString: () => s })) },
	};
});

// ──────────────────────────────────────────────────────────────────────────────
// UnifiedDataService mock
// ──────────────────────────────────────────────────────────────────────────────

const mockVitals = {
	timestamp: Date.now(),
	pulse: { level: "elevated" as const, changesPerMinute: 8 },
	temperature: { level: "warm" as const, aiPercentage: 0.75, detectedTool: "Claude" },
	pressure: {
		value: 50,
		unsnapshotedChanges: 5,
		timeSinceLastSnapshot: 120,
		criticalFilesTouched: [],
	},
	oxygen: { value: 80, coveragePercentage: 80, staleSnapshots: 0 },
	trajectory: "stable" as const,
};

const mockHealth = {
	healthScore: 72,
	trajectory: "stable" as const,
	activeWarnings: [],
	lastSnapshotMinutesAgo: undefined,
};

const mockDataService = {
	getSessionHealth: vi.fn(() => mockHealth),
	getVitals: vi.fn(() => mockVitals),
	getThresholdMultiplier: vi.fn(() => 1.0),
	getSnapshotRecommendation: vi.fn(() => null),
	onDataChange: vi.fn(() => ({ dispose: vi.fn() })),
};

vi.mock(
	"../../../src/services/UnifiedDataService",
	() => ({
		UnifiedDataService: {
			for: vi.fn(() => mockDataService),
		},
	}),
);

// ──────────────────────────────────────────────────────────────────────────────
// SnapshotRecommendationUI mock
// ──────────────────────────────────────────────────────────────────────────────

vi.mock(
	"../../../src/ui/SnapshotRecommendationUI",
	() => ({
		SnapshotRecommendationUI: vi.fn(() => ({
			updateRecommendation: vi.fn(),
			clearRecommendation: vi.fn(),
			dispose: vi.fn(),
		})),
	}),
);

vi.mock("../../../src/services/workspace-data/types.js", () => ({
	PRESSURE_THRESHOLDS: { high: 70 },
}));

// ──────────────────────────────────────────────────────────────────────────────
// StatusFlagManager mock  -  captures setTooltipOverride calls
// ──────────────────────────────────────────────────────────────────────────────

let capturedTooltip: unknown = undefined;

const mockStatusFlagManager = {
	setTooltipOverride: vi.fn((tooltip: unknown) => {
		capturedTooltip = tooltip;
	}),
	updateSessionHealth: vi.fn(),
	showVitals: vi.fn(),
	setVitalsEnabled: vi.fn(),
	showActivitySequenceByType: vi.fn().mockResolvedValue(undefined),
	dispose: vi.fn(),
};

// ──────────────────────────────────────────────────────────────────────────────
// Tests
// ──────────────────────────────────────────────────────────────────────────────

import { VitalsUIIntegration } from "../../../src/ui/VitalsUIIntegration";
import * as vscode from "vscode";

function buildIntegration(overrides: Partial<typeof mockVitals> = {}) {
	capturedTooltip = undefined;
	mockDataService.getVitals.mockReturnValue({ ...mockVitals, ...overrides });

	return new VitalsUIIntegration(
		"test-workspace",
		"/tmp/test",
		vscode.Uri.parse("file:///extension"),
		mockStatusFlagManager as never,
		null,
		{ showVitalsInStatusBar: true, enableRecommendations: false, recommendationThreshold: 70 },
	);
}

function triggerHealthUpdate(integration: VitalsUIIntegration) {
	// Fire the onDataChange callback registered during construction
	const dataChangeCb = mockDataService.onDataChange.mock.calls.at(-1)?.[0];
	if (dataChangeCb) {
		dataChangeCb({ type: "health-changed" });
	}
}

describe("VSUI-05: VitalsUIIntegration pulse tooltip", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		capturedTooltip = undefined;
	});

	it("sets a tooltip on StatusFlagManager after health update", () => {
		const integration = buildIntegration();
		triggerHealthUpdate(integration);
		expect(mockStatusFlagManager.setTooltipOverride).toHaveBeenCalledOnce();
	});

	it("tooltip contains 'Pulse' when pulse is elevated", () => {
		const integration = buildIntegration({ pulse: { level: "elevated", changesPerMinute: 8 } });
		triggerHealthUpdate(integration);
		const tooltip = capturedTooltip as { value: string } | undefined;
		expect(tooltip?.value).toContain("Pulse");
	});

	it("tooltip contains aiPercentage as percentage string when aiPercentage=0.75", () => {
		const integration = buildIntegration({
			temperature: { level: "warm", aiPercentage: 0.75, detectedTool: undefined },
		});
		triggerHealthUpdate(integration);
		const tooltip = capturedTooltip as { value: string } | undefined;
		// Should contain "75%" (0.75 * 100 = 75)
		expect(tooltip?.value).toMatch(/75%/);
	});

	it("tooltip contains detectedTool name when tool is present", () => {
		const integration = buildIntegration({
			temperature: { level: "warm", aiPercentage: 0.5, detectedTool: "Claude" },
		});
		triggerHealthUpdate(integration);
		const tooltip = capturedTooltip as { value: string } | undefined;
		expect(tooltip?.value).toContain("Claude");
	});

	it("tooltip does NOT contain 'Tool' line when detectedTool is absent", () => {
		const integration = buildIntegration({
			temperature: { level: "warm", aiPercentage: 0.3, detectedTool: undefined },
		});
		triggerHealthUpdate(integration);
		const tooltip = capturedTooltip as { value: string } | undefined;
		expect(tooltip?.value).not.toMatch(/Tool\s/);
	});
});
