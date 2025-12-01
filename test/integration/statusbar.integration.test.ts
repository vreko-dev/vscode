import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import { dispose, setRisk, show } from "../../src/ui/status";

// Mock vscode module
const mockStatusBarItem = {
	text: "",
	tooltip: "",
	command: "",
	show: vi.fn(),
	hide: vi.fn(),
	dispose: vi.fn(),
};

vi.mock("vscode", () => ({
	window: {
		createStatusBarItem: vi.fn(() => ({ ...mockStatusBarItem })),
	},
	StatusBarAlignment: {
		Left: 1,
		Right: 2,
	},
	ThemeColor: vi.fn().mockImplementation((id) => ({ id })),
	MarkdownString: vi.fn().mockImplementation((value) => {
		return {
			value,
			appendMarkdown: vi.fn(),
			supportHtml: false,
			isTrusted: false,
		};
	}),
}));

describe("Status updates + click-through", () => {
	let createdStatusBarItem: any;

	beforeEach(() => {
		// Clear any existing state
		vi.clearAllMocks();

		// Reset mock status bar item
		mockStatusBarItem.text = "";
		mockStatusBarItem.tooltip = "";
		mockStatusBarItem.command = "";
		mockStatusBarItem.show.mockClear();
		mockStatusBarItem.hide.mockClear();
		mockStatusBarItem.dispose.mockClear();

		// Mock the createStatusBarItem to return our mock
		(vscode.window.createStatusBarItem as any).mockImplementation(() => {
			createdStatusBarItem = { ...mockStatusBarItem };
			return createdStatusBarItem;
		});
	});

	afterEach(() => {
		// Clean up after each test
		dispose();
	});

	it("should create and show status bar item with risk information", () => {
		const mockUri = { fsPath: "/test/file.js" } as vscode.Uri;
		const score = 7.5;
		const label = "Potential security issue";

		setRisk(mockUri, score, label);

		// Verify status bar item was created
		expect(vscode.window.createStatusBarItem).toHaveBeenCalledWith(
			vscode.StatusBarAlignment.Right,
			100,
		);

		// Verify the status bar item properties
		expect(createdStatusBarItem.command).toBe("snapback.openReport");
		expect(createdStatusBarItem.text).toBe("⛑️ Risk: HIGH (7.5/10)");
		expect(createdStatusBarItem.tooltip).toBe(
			"SnapBack Risk Score for /test/file.js\nClick to open detailed report",
		);
		expect(createdStatusBarItem.show).toHaveBeenCalled();
	});

	it("should correctly categorize risk levels", () => {
		const mockUri = { fsPath: "/test/file.js" } as vscode.Uri;

		// Test CRITICAL level (8.0+)
		setRisk(mockUri, 8.5, "Critical issue");
		expect(createdStatusBarItem.text).toBe("⛑️ Risk: CRITICAL (8.5/10)");

		// Clean up
		dispose();

		// Test HIGH level (6.0-7.9)
		setRisk(mockUri, 7.2, "High issue");
		expect(createdStatusBarItem.text).toBe("⛑️ Risk: HIGH (7.2/10)");

		// Clean up
		dispose();

		// Test MEDIUM level (4.0-5.9)
		setRisk(mockUri, 5.1, "Medium issue");
		expect(createdStatusBarItem.text).toBe("⛑️ Risk: MEDIUM (5.1/10)");

		// Clean up
		dispose();

		// Test LOW level (2.0-3.9)
		setRisk(mockUri, 3.3, "Low issue");
		expect(createdStatusBarItem.text).toBe("⛑️ Risk: LOW (3.3/10)");

		// Clean up
		dispose();

		// Test MINIMAL level (0.0-1.9)
		setRisk(mockUri, 1.5, "Minimal issue");
		expect(createdStatusBarItem.text).toBe("⛑️ Risk: MINIMAL (1.5/10)");
	});

	it("should show status bar item when show is called", () => {
		const mockUri = { fsPath: "/test/file.js" } as vscode.Uri;
		setRisk(mockUri, 5.0, "Test issue");

		// Clear the call from setRisk
		createdStatusBarItem.show.mockClear();

		show();

		expect(createdStatusBarItem.show).toHaveBeenCalled();
	});

	it("should dispose status bar item and clear risk map", () => {
		const mockUri = { fsPath: "/test/file.js" } as vscode.Uri;
		setRisk(mockUri, 5.0, "Test issue");

		dispose();

		expect(createdStatusBarItem.dispose).toHaveBeenCalled();
		// Note: We can't directly test the riskMap clearing without exposing it,
		// but we can verify that subsequent calls work correctly
		setRisk(mockUri, 6.0, "New issue");
		expect(createdStatusBarItem.text).toBe("⛑️ Risk: HIGH (6.0/10)");
	});
});
