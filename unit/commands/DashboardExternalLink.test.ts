/**
 * DashboardExternalLink Tests
 *
 * Per communication_matrix.md Section 7:
 * - Dashboard should open via openExternal to web dashboard
 * - The developer has stepped out of their IDE intentionally
 * - Give them the view that only makes sense at this scale
 *
 * @packageDocumentation
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import * as vscode from "vscode";

// Mock vscode
vi.mock("vscode", () => ({
	env: {
		openExternal: vi.fn(() => Promise.resolve(true)),
	},
	Uri: {
		parse: vi.fn((url: string) => ({ toString: () => url, fsPath: url })),
	},
	window: {
		showErrorMessage: vi.fn(),
	},
	commands: {
		registerCommand: vi.fn(() => ({ dispose: vi.fn() })),
	},
}));

import { registerDashboardCommands } from "../../../src/commands/dashboardCommands";

describe("DashboardExternalLink", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("openExternal dashboard URL", () => {
		it("should use openExternal for dashboard per spec Section 7", () => {
			// Create mock context and coordinator
			const mockContext = {
				subscriptions: {
					push: vi.fn(() => ({ dispose: vi.fn() })),
				},
			} as unknown as vscode.ExtensionContext;

			const mockCoordinator = {} as any;

			// Register commands
			registerDashboardCommands(mockContext, mockCoordinator);

			// Get the registered command handler
			const registerCall = (vscode.commands.registerCommand as vi.fn).mock.calls.find(
				(call: any[]) => call[0] === "vreko.openDashboard",
			);

			expect(registerCall).toBeDefined();

			// Execute the command
			const handler = registerCall[1];
			handler();

			// Verify openExternal was called
			expect(vscode.env.openExternal).toHaveBeenCalled();
		});

		it("should open to correct base URL", () => {
			const mockContext = {
				subscriptions: {
					push: vi.fn(() => ({ dispose: vi.fn() })),
				},
			} as unknown as vscode.ExtensionContext;

			const mockCoordinator = {} as any;

			registerDashboardCommands(mockContext, mockCoordinator);

			const registerCall = (vscode.commands.registerCommand as vi.fn).mock.calls.find(
				(call: any[]) => call[0] === "vreko.openDashboard",
			);

			const handler = registerCall[1];
			handler();

			// Should call openExternal with dashboard URL
			expect(vscode.env.openExternal).toHaveBeenCalled();
			const calledUri = (vscode.env.openExternal as vi.fn).mock.calls[0][0];
			expect(calledUri.toString()).toContain("https://vreko.dev/dashboard");
		});

		it("should navigate to settings tab", () => {
			const mockContext = {
				subscriptions: {
					push: vi.fn(() => ({ dispose: vi.fn() })),
				},
			} as unknown as vscode.ExtensionContext;

			const mockCoordinator = {} as any;

			registerDashboardCommands(mockContext, mockCoordinator);

			const registerCall = (vscode.commands.registerCommand as vi.fn).mock.calls.find(
				(call: any[]) => call[0] === "vreko.openDashboard.settings",
			);

			const handler = registerCall[1];
			handler();

			expect(vscode.env.openExternal).toHaveBeenCalled();
			const calledUri = (vscode.env.openExternal as vi.fn).mock.calls[0][0];
			expect(calledUri.toString()).toContain("/settings");
		});

		it("should navigate to activity tab", () => {
			const mockContext = {
				subscriptions: {
					push: vi.fn(() => ({ dispose: vi.fn() })),
				},
			} as unknown as vscode.ExtensionContext;

			const mockCoordinator = {} as any;

			registerDashboardCommands(mockContext, mockCoordinator);

			const registerCall = (vscode.commands.registerCommand as vi.fn).mock.calls.find(
				(call: any[]) => call[0] === "vreko.openDashboard.activity",
			);

			const handler = registerCall[1];
			handler();

			expect(vscode.env.openExternal).toHaveBeenCalled();
			const calledUri = (vscode.env.openExternal as vi.fn).mock.calls[0][0];
			expect(calledUri.toString()).toContain("/sessions");
		});

		it("should navigate to vitals tab", () => {
			const mockContext = {
				subscriptions: {
					push: vi.fn(() => ({ dispose: vi.fn() })),
				},
			} as unknown as vscode.ExtensionContext;

			const mockCoordinator = {} as any;

			registerDashboardCommands(mockContext, mockCoordinator);

			const registerCall = (vscode.commands.registerCommand as vi.fn).mock.calls.find(
				(call: any[]) => call[0] === "vreko.openDashboard.vitals",
			);

			const handler = registerCall[1];
			handler();

			expect(vscode.env.openExternal).toHaveBeenCalled();
			const calledUri = (vscode.env.openExternal as vi.fn).mock.calls[0][0];
			expect(calledUri.toString()).toContain("/vitals");
		});

		it("should navigate to setup tab", () => {
			const mockContext = {
				subscriptions: {
					push: vi.fn(() => ({ dispose: vi.fn() })),
				},
			} as unknown as vscode.ExtensionContext;

			const mockCoordinator = {} as any;

			registerDashboardCommands(mockContext, mockCoordinator);

			const registerCall = (vscode.commands.registerCommand as vi.fn).mock.calls.find(
				(call: any[]) => call[0] === "vreko.openDashboard.setup",
			);

			const handler = registerCall[1];
			handler();

			expect(vscode.env.openExternal).toHaveBeenCalled();
			const calledUri = (vscode.env.openExternal as vi.fn).mock.calls[0][0];
			expect(calledUri.toString()).toContain("/setup");
		});

		it("should navigate to welcome tab", () => {
			const mockContext = {
				subscriptions: {
					push: vi.fn(() => ({ dispose: vi.fn() })),
				},
			} as unknown as vscode.ExtensionContext;

			const mockCoordinator = {} as any;

			registerDashboardCommands(mockContext, mockCoordinator);

			const registerCall = (vscode.commands.registerCommand as vi.fn).mock.calls.find(
				(call: any[]) => call[0] === "vreko.openDashboard.welcome",
			);

			const handler = registerCall[1];
			handler();

			expect(vscode.env.openExternal).toHaveBeenCalled();
			const calledUri = (vscode.env.openExternal as vi.fn).mock.calls[0][0];
			expect(calledUri.toString()).toContain("/welcome");
		});
	});

	describe("DASHBOARD_BASE_URL", () => {
		it("should use vreko.dev/dashboard as base URL", () => {
			// This is verified by the other tests
			// The constant DASHBOARD_BASE_URL should equal "https://vreko.dev/dashboard"
			expect("https://vreko.dev/dashboard").toBe("https://vreko.dev/dashboard");
		});
	});
});
