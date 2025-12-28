/**
 * IntelligenceBridge Tests - TDD Green Phase
 *
 * These tests define the expected behavior of IntelligenceBridge.
 * Following TDD Red-Green-Refactor cycle:
 * 1. RED: Write tests that fail (file doesn't exist yet) ✅
 * 2. GREEN: Write minimal code to make tests pass ← Current
 * 3. REFACTOR: Clean up while keeping tests green
 *
 * @see https://www.codecademy.com/article/tdd-red-green-refactor
 * @see apps/vscode/src/integration/INTELLIGENCE_INTEGRATION_PLAN.md
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Mock vscode before importing the module under test
vi.mock("vscode", () => ({
	workspace: {
		workspaceFolders: [{ uri: { fsPath: "/test/workspace", toString: () => "file:///test/workspace" } }],
	},
	Disposable: {
		from: vi.fn(),
	},
}));

// Create mock factories that return fresh instances
const createMockIntelligence = () => ({
	reportViolation: vi.fn(),
	recordLearning: vi.fn(),
	startSession: vi.fn(),
	endSession: vi.fn(),
	recordFileModification: vi.fn(),
});

const createMockVitals = () => ({
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
});

const createMockEventBus = () => ({
	on: vi.fn(),
	off: vi.fn(),
	emit: vi.fn(),
});

// Store shared mock instances for test assertions
let mockIntelligence: ReturnType<typeof createMockIntelligence>;
let mockVitals: ReturnType<typeof createMockVitals>;
let mockEventBus: ReturnType<typeof createMockEventBus>;

// Mock IntelligenceService with factory functions
vi.mock("../../../src/services/IntelligenceService", () => ({
	getIntelligence: vi.fn().mockImplementation(async () => mockIntelligence),
	getWorkspaceVitals: vi.fn().mockImplementation(async () => mockVitals),
}));

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
		vi.clearAllMocks();
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
		it("should subscribe to EventBus events on initialize", async () => {
			bridge = new IntelligenceBridge();
			await bridge.initialize();

			// Should subscribe to relevant events
			expect(mockEventBus.on).toHaveBeenCalled();
		});

		it("should unsubscribe from EventBus on dispose", async () => {
			bridge = new IntelligenceBridge();
			await bridge.initialize();
			bridge.dispose();

			expect(mockEventBus.off).toHaveBeenCalled();
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
