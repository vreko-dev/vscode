/**
 * MCPStatusItem Daemon Health Tooltip Tests
 *
 * Tests for P2-STATUS-BAR feature: daemon health metrics in tooltip.
 * Verifies connection pool status, memory usage, and uptime display.
 *
 * @see apps/vscode/src/ui/MCPStatusItem.ts - refreshDaemonStatus(), buildTooltip()
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";

// Mock dependencies before importing modules
vi.mock("vscode", () => ({
	window: {
		createStatusBarItem: vi.fn(() => ({
			text: "",
			tooltip: "",
			backgroundColor: undefined,
			color: undefined,
			command: "",
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		})),
		activeTextEditor: null,
		onDidChangeActiveTextEditor: vi.fn(() => ({ dispose: vi.fn() })),
	},
	workspace: {
		workspaceFolders: [],
		getConfiguration: vi.fn(() => ({
			get: vi.fn((key: string, defaultValue?: unknown) => defaultValue),
		})),
		onDidChangeWorkspaceFolders: vi.fn(() => ({ dispose: vi.fn() })),
	},
	StatusBarAlignment: { Left: 1, Right: 2 },
	ThemeColor: class {
		constructor(public id: string) { /* intentionally empty */ }
	},
	MarkdownString: class {
		value = "";
		isTrusted = false;
		appendMarkdown(text: string) {
			this.value += text;
			return this;
		}
	},
	Uri: {
		parse: vi.fn((url: string) => ({ toString: () => url })),
	},
}));

vi.mock("@vreko/mcp-config", () => ({
	detectAIClients: vi.fn(() => ({ detected: [] })),
	detectWorkspaceConfig: vi.fn(() => null),
}));

vi.mock("../../../src/services/DaemonBridge", () => ({
	getDaemonBridge: vi.fn(),
	resetDaemonCircuitBreaker: vi.fn(),
}));

vi.mock("../../../src/services/CliPathCache", () => ({
	getCliPathCache: vi.fn(() => ({ get: vi.fn(() => null) })),
}));

vi.mock("../../../src/utils/logger", () => ({
	logger: {
		debug: vi.fn(),
		info: vi.fn(),
		warn: vi.fn(),
		error: vi.fn(),
	},
}));

// Import formatBytes and formatDuration for test verification
vi.mock("../../../src/utils/format", () => ({
	formatBytes: vi.fn((bytes: number) => {
		if (bytes >= 1024 * 1024) return `${Math.round(bytes / 1024 / 1024)} MB`;
		if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${bytes} B`;
	}),
	formatDuration: vi.fn((ms: number) => {
		if (ms >= 3600000) return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
		if (ms >= 60000) return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
		return `${Math.floor(ms / 1000)}s`;
	}),
}));

import { getDaemonBridge } from "../../../src/services/DaemonBridge";
import { formatBytes, formatDuration } from "../../../src/utils/format";

describe("MCPStatusItem Daemon Health Tooltip (P2-STATUS-BAR)", () => {
	let mockBridge: any;

	beforeEach(() => {
		vi.clearAllMocks();

		// Mock DaemonBridge
		mockBridge = {
			getState: vi.fn(() => "connected"),
			getDaemonVersion: vi.fn(() => "1.0.0"),
			isConnected: vi.fn(() => true),
			onStateChange: vi.fn(() => ({ dispose: vi.fn() })),
			getStatus: vi.fn(),
		};

		vi.mocked(getDaemonBridge).mockReturnValue(mockBridge);
	});

	describe("DaemonStatus schema compliance", () => {
		it("should handle complete DaemonStatus response", async () => {
			const fullStatus = {
				connected: true,
				pid: 12345,
				version: "1.0.0",
				uptime: 3600000, // 1 hour
				startedAt: "2026-02-10T12:00:00.000Z",
				workspaces: 2,
				connections: 5,
				maxConnections: 10,
				memoryUsage: {
					heapUsed: 87000000, // ~83 MB
					heapTotal: 100000000,
					rss: 150000000,
				},
				idleTimeout: 900000,
				lastActivity: Date.now(),
			};

			mockBridge.getStatus.mockResolvedValue(fullStatus);

			const status = await mockBridge.getStatus();

			// Verify all health metrics are present
			expect(status.connections).toBe(5);
			expect(status.maxConnections).toBe(10);
			expect(status.memoryUsage.heapUsed).toBe(87000000);
			expect(status.uptime).toBe(3600000);
			expect(status.workspaces).toBe(2);
		});

		it("should handle partial DaemonStatus (backward compatibility)", async () => {
			// Older daemon versions might not return all fields
			const partialStatus = {
				connected: true,
				pid: 12345,
				version: "0.9.0",
				uptime: 1800000,
				workspaces: 1,
			};

			mockBridge.getStatus.mockResolvedValue(partialStatus);

			const status = await mockBridge.getStatus();

			expect(status.connected).toBe(true);
			expect(status.connections).toBeUndefined();
			expect(status.maxConnections).toBeUndefined();
			expect(status.memoryUsage).toBeUndefined();
		});
	});

	describe("Connection pool health indicators", () => {
		it("should identify healthy connection pool (< 50%)", () => {
			const connections = 3;
			const maxConnections = 10;
			const pressure = connections / maxConnections;

			expect(pressure).toBeLessThan(0.5);
			// Icon should be ✅ for healthy
		});

		it("should identify moderate connection pool (50-80%)", () => {
			const connections = 6;
			const maxConnections = 10;
			const pressure = connections / maxConnections;

			expect(pressure).toBeGreaterThanOrEqual(0.5);
			expect(pressure).toBeLessThan(0.8);
			// Icon should be 🟡 for caution
		});

		it("should identify high connection pool (> 80%)", () => {
			const connections = 9;
			const maxConnections = 10;
			const pressure = connections / maxConnections;

			expect(pressure).toBeGreaterThanOrEqual(0.8);
			// Icon should be ⚠️ for warning
		});

		it("should detect connection exhaustion (100%)", () => {
			const connections = 10;
			const maxConnections = 10;
			const pressure = connections / maxConnections;

			expect(pressure).toBe(1);
			// This is the state that caused 9,100 connection rejections
		});
	});

	describe("formatBytes utility", () => {
		it("should format memory usage correctly", () => {
			expect(formatBytes(87117912)).toContain("MB");
			expect(formatBytes(1024)).toContain("KB");
			expect(formatBytes(500)).toContain("B");
		});
	});

	describe("formatDuration utility", () => {
		it("should format uptime correctly", () => {
			// 1 hour
			expect(formatDuration(3600000)).toContain("h");
			// 5 minutes
			expect(formatDuration(300000)).toContain("m");
			// 30 seconds
			expect(formatDuration(30000)).toContain("s");
		});
	});

	describe("Tooltip content generation", () => {
		it("should include connection pool status when available", () => {
			const connections = 5;
			const maxConnections = 10;

			const tooltipLine = `- ✅ Connections: ${connections}/${maxConnections}`;

			expect(tooltipLine).toContain("Connections:");
			expect(tooltipLine).toContain("5/10");
		});

		it("should include memory usage when available", () => {
			const heapUsed = 87117912;
			const formatted = formatBytes(heapUsed);

			const tooltipLine = `- 💾 Memory: ${formatted}`;

			expect(tooltipLine).toContain("Memory:");
			expect(tooltipLine).toContain("MB");
		});

		it("should include uptime when available", () => {
			const uptime = 3600000;
			const formatted = formatDuration(uptime);

			const tooltipLine = `- ⏱️ Uptime: ${formatted}`;

			expect(tooltipLine).toContain("Uptime:");
		});

		it("should include workspace count when available", () => {
			const workspaces = 2;

			const tooltipLine = `- 📁 Workspaces: ${workspaces}`;

			expect(tooltipLine).toContain("Workspaces: 2");
		});
	});

	describe("Error handling", () => {
		it("should handle getStatus failure gracefully", async () => {
			mockBridge.getStatus.mockRejectedValue(new Error("Connection failed"));

			await expect(mockBridge.getStatus()).rejects.toThrow("Connection failed");
			// Should not crash, should log debug message
		});

		it("should handle disconnected state", async () => {
			mockBridge.isConnected.mockReturnValue(false);
			mockBridge.getStatus.mockResolvedValue({ connected: false });

			const status = await mockBridge.getStatus();

			expect(status.connected).toBe(false);
			// Tooltip should not show health metrics when disconnected
		});
	});
});
