/**
 * AI Presence Detector Tests
 *
 * Tests for the AIPresenceDetector utility that detects AI coding assistants.
 */

import { describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
	detectAIPresence,
	getInstalledAIAssistants,
	isAIAssistantInstalled,
} from "@vscode/utils/AIPresenceDetector";

// Create a mock extension object
const createMockExtension = (id: string, name: string) => ({
	id,
	packageJSON: { name },
	extensionUri: {} as any,
	extensionPath: "",
	isActive: true,
	extensionKind: 1,
	exports: {},
	activate: vi.fn(),
});

// Mock VS Code extensions API
vi.mock("vscode", () => ({
	extensions: {
		all: [
			createMockExtension("github.copilot", "GitHub Copilot"),
			createMockExtension("claude.claude", "Claude"),
			createMockExtension("some.other.extension", "Other Extension"),
		],
	},
}));

describe("AIPresenceDetector", () => {
	describe("detectAIPresence", () => {
		it("should detect installed AI assistants", () => {
			const presence = detectAIPresence();

			expect(presence.hasAI).toBe(true);
			expect(presence.detectedAssistants).toContain("GITHUB_COPILOT");
			expect(presence.detectedAssistants).toContain("CLAUDE");
			expect(presence.detectedAssistants).not.toContain("TABNINE");
		});

		it("should return empty array when no AI assistants are installed", () => {
			// Mock no AI extensions
			vi.mocked(vscode.extensions).all = [
				createMockExtension("some.other.extension", "Other Extension"),
			];

			const presence = detectAIPresence();

			expect(presence.hasAI).toBe(false);
			expect(presence.detectedAssistants).toEqual([]);
		});
	});

	describe("isAIAssistantInstalled", () => {
		it("should return true for installed AI assistants", () => {
			expect(isAIAssistantInstalled("GITHUB_COPILOT")).toBe(true);
			expect(isAIAssistantInstalled("CLAUDE")).toBe(true);
		});

		it("should return false for non-installed AI assistants", () => {
			expect(isAIAssistantInstalled("TABNINE")).toBe(false);
			expect(isAIAssistantInstalled("CODEIUM")).toBe(false);
		});
	});

	describe("getInstalledAIAssistants", () => {
		it("should return list of installed AI assistants", () => {
			const installed = getInstalledAIAssistants();

			expect(installed).toContain("GITHUB_COPILOT");
			expect(installed).toContain("CLAUDE");
			expect(installed).not.toContain("TABNINE");
			expect(installed).not.toContain("CODEIUM");
		});
	});
});
