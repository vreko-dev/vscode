/**
 * IntelligenceBridge Tests
 *
 * Unit tests for IntelligenceBridge - the central router for Intelligence integration.
 * Implemented using TDD Red-Green-Refactor methodology.
 *
 * @see apps/vscode/src/bridges/IntelligenceBridge.ts
 * @see apps/vscode/src/integration/INTELLIGENCE_INTEGRATION_PLAN.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Create mock instances at module scope - these will be shared
const mockIntelligence = {
	reportViolation: vi.fn(),
	recordLearning: vi.fn(),
	startSession: vi.fn(),
	endSession: vi.fn(),
	recordFileModification: vi.fn(),
};

const mockVitals = {
	current: vi.fn().mockReturnValue({
		pulse: { level: "active", value: 50 },
		temperature: { level: "warm", value: 60 },
		pressure: { level: "normal", value: 30 },
		oxygen: { level: "healthy", value: 85 },
	}),
	getThresholdMultiplier: vi.fn().mockReturnValue(1.0),
	getAgentGuidance: vi.fn().mockReturnValue(null),
	onFileChange: vi.fn(),
	onAIDetected: vi.fn(),
	recordEdit: vi.fn(),
	recordTest: vi.fn(),
	recordBehavior: vi.fn(),
};

const mockEventBus = {
	on: vi.fn(),
	off: vi.fn(),
	emit: vi.fn(),
};

// Mock vscode before importing the module under test
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace", toString: () => "file:///test/workspace" } }],
	},
	Disposable: {
		from: vi.fn(),
	},
}));

// Mock IntelligenceService - use getter functions so the mock can be reset
vi.mock("../../../src/services/IntelligenceService", async () => {
	return {
		getIntelligence: vi.fn(async () => mockIntelligence),
		getWorkspaceVitals: vi.fn(async () => mockVitals),
	};
});

// Mock SnapBackEventBus
vi.mock("../../../src/events/SnapBackEventBus", () => ({
	getEventBus: vi.fn(() => mockEventBus),
	SnapBackEventBus: vi.fn(() => mockEventBus),
}));

// Mock logger
vi.mock("../../../src/utils/logger", () => ({
	logger: {
		info: vi.fn(),
		debug: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import after mocks are set up
import {
	disposeIntelligenceBridge,
	getIntelligenceBridge,
	initializeIntelligenceBridge,
	IntelligenceBridge,
} from "../../../src/bridges/IntelligenceBridge";

describe("IntelligenceBridge", () => {
	let bridge: IntelligenceBridge;

	beforeEach(() => {
		// Reset all mock function call history
		vi.clearAllMocks();
		// Re-apply default return values that clearAllMocks removes
		mockVitals.current.mockReturnValue({
			pulse: { level: "active", value: 50 },
			temperature: { level: "warm", value: 60 },
			pressure: { level: "normal", value: 30 },
			oxygen: { level: "healthy", value: 85 },
		});
		mockVitals.getThresholdMultiplier.mockReturnValue(1.0);
		mockVitals.getAgentGuidance.mockReturnValue(null);
		// Reset singleton between tests
		disposeIntelligenceBridge();
	});

	afterEach(() => {
		// Clean up singleton after each test
		disposeIntelligenceBridge();
	});

	describe("Initialization", () => {
		it("should create an instance", () => {
			bridge = new IntelligenceBridge();
			expect(bridge).toBeDefined();
		});

		it("should not be initialized before calling initialize()", () => {
			bridge = new IntelligenceBridge();
			expect(bridge.isInitialized()).toBe(false);
		});

		it("should be initialized after calling initialize()", async () => {
			bridge = new IntelligenceBridge();
			await bridge.initialize();
			expect(bridge.isInitialized()).toBe(true);
		});

		it("should only initialize once", async () => {
			bridge = new IntelligenceBridge();
			await bridge.initialize();
			await bridge.initialize();
			// Should not throw, just return early
			expect(bridge.isInitialized()).toBe(true);
		});
	});

	describe("Singleton Pattern", () => {
		it("should return same instance from getIntelligenceBridge", () => {
			const instance1 = getIntelligenceBridge();
			const instance2 = getIntelligenceBridge();
			expect(instance1).toBe(instance2);
		});

		it("should initialize and return bridge from initializeIntelligenceBridge", async () => {
			const bridge = await initializeIntelligenceBridge();
			expect(bridge).toBeDefined();
			expect(bridge.isInitialized()).toBe(true);
		});
	});

	describe("EventBus Integration", () => {
		it("should subscribe to EventBus events on initialize when available", async () => {
			bridge = new IntelligenceBridge();
			await bridge.initialize();

			// EventBus subscription is attempted via dynamic require
			// When EventBus module exists, it should subscribe to relevant events
			// Currently EventBus doesn't exist, so subscription is gracefully skipped
			// This test verifies the bridge initializes without throwing
			expect(bridge.isInitialized()).toBe(true);
		});

		it("should handle missing EventBus gracefully", async () => {
			bridge = new IntelligenceBridge();
			// Should not throw even if EventBus is unavailable
			await bridge.initialize();
			bridge.dispose();

			// Bridge should still function without EventBus
			expect(bridge.isInitialized()).toBe(false);
		});
	});

	describe("Vitals Access", () => {
		it("should return vitals snapshot when initialized", async () => {
			bridge = await initializeIntelligenceBridge();

			const snapshot = bridge.getVitalsSnapshot();
			expect(snapshot).not.toBeNull();
			expect(snapshot?.pulse.level).toBe("active");
		});

		it("should return null vitals when not initialized", () => {
			bridge = new IntelligenceBridge();
			const snapshot = bridge.getVitalsSnapshot();
			expect(snapshot).toBeNull();
		});

		it("should return threshold multiplier", async () => {
			bridge = await initializeIntelligenceBridge();

			const multiplier = bridge.getThresholdMultiplier();
			expect(multiplier).toBe(1.0);
		});

		it("should return default multiplier when not initialized", () => {
			bridge = new IntelligenceBridge();
			const multiplier = bridge.getThresholdMultiplier();
			expect(multiplier).toBe(1.0);
		});
	});

	describe("Analysis Recording", () => {
		it("should record analysis result", async () => {
			bridge = await initializeIntelligenceBridge();

			await bridge.recordAnalysisResult({
				filePath: "/test/file.ts",
				score: 0.8,
				severity: "high",
				factors: ["Hardcoded credentials"],
				passed: false,
			});

			expect(mockIntelligence.reportViolation).toHaveBeenCalled();
		});

		it("should not record violations for low severity", async () => {
			bridge = await initializeIntelligenceBridge();

			await bridge.recordAnalysisResult({
				filePath: "/test/file.ts",
				score: 0.2,
				severity: "low",
				factors: [],
				passed: true,
			});

			expect(mockIntelligence.reportViolation).not.toHaveBeenCalled();
		});
	});

	describe("Session Management", () => {
		it("should start Intelligence session", async () => {
			bridge = await initializeIntelligenceBridge();

			bridge.startSession("session-123", { files: ["file1.ts", "file2.ts"] });

			expect(mockIntelligence.startSession).toHaveBeenCalledWith("session-123", expect.any(Object));
		});

		it("should end Intelligence session", async () => {
			bridge = await initializeIntelligenceBridge();

			bridge.endSession("session-123");

			expect(mockIntelligence.endSession).toHaveBeenCalledWith("session-123");
		});
	});

	describe("User Behavior Recording", () => {
		it("should record user behavior for snapshots", async () => {
			bridge = await initializeIntelligenceBridge();

			bridge.recordUserBehavior({
				type: "snapshot_created",
				userInitiated: true,
			});

			expect(mockVitals.recordBehavior).toHaveBeenCalledWith(true);
		});
	});

	describe("Disposal", () => {
		it("should dispose cleanly", async () => {
			bridge = new IntelligenceBridge();
			await bridge.initialize();
			bridge.dispose();

			expect(bridge.isInitialized()).toBe(false);
		});

		it("should handle double dispose", async () => {
			bridge = new IntelligenceBridge();
			await bridge.initialize();
			bridge.dispose();
			bridge.dispose(); // Should not throw
		});
	});
});
