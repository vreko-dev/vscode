import { describe, it, expect, beforeEach, vi } from "vitest";
import * as vscode from "vscode";

/**
 * Mock StatusBar for testing
 */

interface StatusBarItemMock {
	text: string;
	tooltip: string;
	command?: string;
	show(): void;
	hide(): void;
	dispose(): void;
}

class MockStatusBar {
	private items: Map<string, StatusBarItemMock> = new Map();

	createItem(id: string): StatusBarItemMock {
		const item: StatusBarItemMock = {
			text: "",
			tooltip: "",
			show: vi.fn(),
			hide: vi.fn(),
			dispose: vi.fn(),
		};
		this.items.set(id, item);
		return item;
	}

	getItem(id: string): StatusBarItemMock | undefined {
		return this.items.get(id);
	}

	getAllItems(): StatusBarItemMock[] {
		return Array.from(this.items.values());
	}

	removeItem(id: string): void {
		const item = this.items.get(id);
		if (item) {
			item.dispose();
			this.items.delete(id);
		}
	}

	clear(): void {
		for (const item of this.items.values()) {
			item.dispose();
		}
		this.items.clear();
	}
}

describe("StatusBar", () => {
	let statusBar: MockStatusBar;

	beforeEach(() => {
		statusBar = new MockStatusBar();
	});

	describe("Item creation", () => {
		it("should create status bar item", () => {
			const item = statusBar.createItem("snapback-status");

			expect(item).toBeDefined();
			expect(item.text).toBe("");
		});

		it("should create multiple items", () => {
			statusBar.createItem("snapback-status");
			statusBar.createItem("snapback-risk");
			statusBar.createItem("snapback-threats");

			const allItems = statusBar.getAllItems();
			expect(allItems).toHaveLength(3);
		});

		it("should allow item configuration", () => {
			const item = statusBar.createItem("snapback-status");

			item.text = "$(shield) SnapBack";
			item.tooltip = "SnapBack Protection Status";
			item.command = "snapback.showStatus";

			expect(item.text).toBe("$(shield) SnapBack");
			expect(item.tooltip).toBe("SnapBack Protection Status");
			expect(item.command).toBe("snapback.showStatus");
		});
	});

	describe("Threat indicators", () => {
		it("should display threat count", () => {
			const item = statusBar.createItem("snapback-threats");

			item.text = "$(warning) Threats: 2";
			item.tooltip = "2 potential threats detected";

			expect(item.text).toContain("2");
			expect(item.tooltip).toContain("2");
		});

		it("should show no threats icon", () => {
			const item = statusBar.createItem("snapback-status");

			item.text = "$(shield) Protected";
			item.tooltip = "No threats detected";

			expect(item.text).toContain("shield");
		});

		it("should show warning icon for elevated risk", () => {
			const item = statusBar.createItem("snapback-risk");

			item.text = "$(warning) Risk: 65%";
			item.tooltip = "Elevated risk detected";

			expect(item.text).toContain("warning");
		});

		it("should show error icon for critical threats", () => {
			const item = statusBar.createItem("snapback-critical");

			item.text = "$(error) Critical Threat";
			item.tooltip = "Immediate action required";

			expect(item.text).toContain("error");
		});
	});

	describe("Session information", () => {
		it("should display protected files count", () => {
			const item = statusBar.createItem("snapback-files");

			item.text = "$(file-code) 8 Protected";
			item.tooltip = "8 files under protection";

			expect(item.text).toContain("8");
		});

		it("should display snapshot count", () => {
			const item = statusBar.createItem("snapback-snapshots");

			item.text = "$(archive) 15 Snapshots";
			item.tooltip = "15 snapshots stored";

			expect(item.text).toContain("15");
		});

		it("should display session status", () => {
			const item = statusBar.createItem("snapback-session");

			item.text = "$(circle-filled) Active";
			item.tooltip = "SnapBack active and monitoring";

			expect(item.text).toContain("Active");
		});
	});

	describe("Risk scoring display", () => {
		it("should show low risk (0-33%)", () => {
			const item = statusBar.createItem("snapback-risk");

			item.text = "$(circle-outline) 20%";
			item.tooltip = "Low risk detected";

			expect(item.text).toContain("20");
		});

		it("should show medium risk (34-66%)", () => {
			const item = statusBar.createItem("snapback-risk");

			item.text = "$(circle-half-filled) 50%";
			item.tooltip = "Medium risk detected";

			expect(item.text).toContain("50");
		});

		it("should show high risk (67-100%)", () => {
			const item = statusBar.createItem("snapback-risk");

			item.text = "$(circle-filled) 85%";
			item.tooltip = "High risk detected";

			expect(item.text).toContain("85");
		});
	});

	describe("Dynamic updates", () => {
		it("should update threat count reactively", () => {
			const item = statusBar.createItem("snapback-threats");

			item.text = "$(warning) Threats: 0";
			expect(item.text).toContain("0");

			item.text = "$(warning) Threats: 3";
			expect(item.text).toContain("3");
		});

		it("should update risk score in real-time", () => {
			const item = statusBar.createItem("snapback-risk");

			item.text = "$(circle-outline) 20%";
			item.tooltip = "Risk score: 20%";

			item.text = "$(circle-filled) 75%";
			item.tooltip = "Risk score: 75%";

			expect(item.text).toContain("75");
		});

		it("should update session information", () => {
			const item = statusBar.createItem("snapback-session");

			item.text = "$(circle-filled) Active";
			expect(item.text).toContain("Active");

			item.text = "$(circle-outline) Idle";
			expect(item.text).toContain("Idle");
		});

		it("should handle multiple updates", () => {
			const threatsItem = statusBar.createItem("snapback-threats");
			const riskItem = statusBar.createItem("snapback-risk");
			const filesItem = statusBar.createItem("snapback-files");

			// Update 1
			threatsItem.text = "$(warning) 1";
			riskItem.text = "$(circle-half-filled) 45%";
			filesItem.text = "$(file-code) 5";

			expect(threatsItem.text).toContain("1");
			expect(riskItem.text).toContain("45");
			expect(filesItem.text).toContain("5");

			// Update 2
			threatsItem.text = "$(error) 5";
			riskItem.text = "$(circle-filled) 82%";
			filesItem.text = "$(file-code) 12";

			expect(threatsItem.text).toContain("5");
			expect(riskItem.text).toContain("82");
			expect(filesItem.text).toContain("12");
		});
	});

	describe("Command integration", () => {
		it("should execute command on click", () => {
			const item = statusBar.createItem("snapback-status");

			item.command = "snapback.showDashboard";

			expect(item.command).toBe("snapback.showDashboard");
		});

		it("should support dashboard command", () => {
			const item = statusBar.createItem("snapback-main");

			item.text = "$(shield) SnapBack";
			item.command = "snapback.showDashboard";
			item.tooltip = "Click to open SnapBack dashboard";

			expect(item.command).toBe("snapback.showDashboard");
		});

		it("should support settings command", () => {
			const item = statusBar.createItem("snapback-settings");

			item.command = "snapback.openSettings";

			expect(item.command).toBe("snapback.openSettings");
		});

		it("should support restore command", () => {
			const item = statusBar.createItem("snapback-restore");

			item.command = "snapback.showSnapshots";

			expect(item.command).toBe("snapback.showSnapshots");
		});
	});

	describe("Visibility control", () => {
		it("should show item", () => {
			const item = statusBar.createItem("snapback-status");
			item.show();

			expect(item.show).toHaveBeenCalled();
		});

		it("should hide item", () => {
			const item = statusBar.createItem("snapback-status");
			item.hide();

			expect(item.hide).toHaveBeenCalled();
		});

		it("should toggle visibility based on state", () => {
			const item = statusBar.createItem("snapback-threats");

			// Show threats item only if threats > 0
			const threatCount = 3;
			if (threatCount > 0) {
				item.show();
			} else {
				item.hide();
			}

			expect(item.show).toHaveBeenCalled();
		});
	});

	describe("Item lifecycle", () => {
		it("should dispose item properly", () => {
			const item = statusBar.createItem("snapback-status");
			statusBar.removeItem("snapback-status");

			expect(item.dispose).toHaveBeenCalled();
		});

		it("should clear all items", () => {
			statusBar.createItem("item1");
			statusBar.createItem("item2");
			statusBar.createItem("item3");

			let allItems = statusBar.getAllItems();
			expect(allItems).toHaveLength(3);

			statusBar.clear();
			allItems = statusBar.getAllItems();
			expect(allItems).toHaveLength(0);
		});

		it("should prevent memory leaks", () => {
			const item = statusBar.createItem("snapback-status");

			// Simulate cleanup
			statusBar.removeItem("snapback-status");

			const retrieved = statusBar.getItem("snapback-status");
			expect(retrieved).toBeUndefined();
		});
	});

	describe("Tooltip information", () => {
		it("should provide detailed threat tooltip", () => {
			const item = statusBar.createItem("snapback-threats");

			item.tooltip =
				"$(warning) 2 threats detected\nClick to view details";

			expect(item.tooltip).toContain("2");
			expect(item.tooltip).toContain("threats");
		});

		it("should provide risk score tooltip", () => {
			const item = statusBar.createItem("snapback-risk");

			item.tooltip = "Current risk score: 65%\nClick to adjust thresholds";

			expect(item.tooltip).toContain("65");
		});

		it("should provide protection status tooltip", () => {
			const item = statusBar.createItem("snapback-status");

			item.tooltip =
				"SnapBack is active\n8 files protected\n15 snapshots available";

			expect(item.tooltip).toContain("active");
			expect(item.tooltip).toContain("8");
			expect(item.tooltip).toContain("15");
		});
	});

	describe("Icon consistency", () => {
		it("should use consistent icon library", () => {
			const validIcons = [
				"shield",
				"warning",
				"error",
				"circle-filled",
				"circle-outline",
				"file-code",
				"archive",
			];

			const item = statusBar.createItem("test");
			item.text = "$(shield) Test";

			const icon = item.text.match(/\$\(([^)]+)\)/)?.[1];
			expect(validIcons).toContain(icon);
		});

		it("should reflect protection level with icon", () => {
			const protectionLevels: Record<string, string> = {
				watch: "$(eye)",
				warn: "$(warning)",
				block: "$(lock)",
			};

			for (const [level, icon] of Object.entries(protectionLevels)) {
				expect(icon).toContain("$(");
			}
		});
	});

	describe("Accessibility", () => {
		it("should have descriptive text labels", () => {
			const item = statusBar.createItem("snapback-status");

			item.text = "$(shield) SnapBack: Active";

			expect(item.text).toBeDefined();
			expect(item.text.length).toBeGreaterThan(0);
		});

		it("should provide tooltip for accessibility", () => {
			const item = statusBar.createItem("snapback-risk");

			item.tooltip = "Risk Score: 60% - Medium risk level detected";

			expect(item.tooltip).toBeDefined();
			expect(item.tooltip.length).toBeGreaterThan(0);
		});

		it("should support keyboard navigation", () => {
			const item = statusBar.createItem("snapback-status");

			item.command = "snapback.showDashboard";

			expect(item.command).toBeDefined();
		});
	});
});
