/**
 * Unit tests for AI Presence Detector
 *
 * Tests the rich, multi-assistant detection including:
 * - Known assistant detection via extension IDs
 * - Host app detection (VS Code, Cursor, Windsurf)
 * - Confidence levels (high, medium, low, none)
 * - Primary selection strategy (user pref → host match → priority)
 * - Cache + invalidation
 * - Backward-compat shape (hasAI, detected, tool, detectedAssistants)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as vscode from "vscode";
import {
	detectAIPresence,
	detectAIPresenceAsync,
	getAIPresenceDetector,
	getInstalledAIAssistants,
	invalidatePresenceCache,
	isAIAssistantInstalled,
} from "../../../src/utils/AIPresenceDetector";

// ── Helpers to control the vscode mock ──────────────────────────────────────

function mockExtension(
	id: string,
	opts: { version?: string; categories?: string[]; keywords?: string[]; displayName?: string } = {},
) {
	return {
		id,
		packageJSON: {
			version: opts.version ?? "1.0.0",
			categories: opts.categories ?? [],
			keywords: opts.keywords ?? [],
			displayName: opts.displayName ?? id,
		},
		extensionUri: vscode.Uri.file(`/ext/${id}`),
		extensionPath: `/ext/${id}`,
		isActive: true,
		exports: undefined,
		activate: vi.fn(),
		extensionKind: 1,
	};
}

function setInstalledExtensions(extensions: ReturnType<typeof mockExtension>[]) {
	Object.defineProperty(vscode.extensions, "all", {
		value: extensions,
		writable: true,
		configurable: true,
	});
}

function setAppName(name: string) {
	Object.defineProperty(vscode.env, "appName", {
		value: name,
		writable: true,
		configurable: true,
	});
}

function setAppHost(host: string) {
	Object.defineProperty(vscode.env, "appHost", {
		value: host,
		writable: true,
		configurable: true,
	});
}

describe("AIPresenceDetector", () => {
	beforeEach(() => {
		// Reset to defaults
		setAppName("Visual Studio Code");
		setAppHost("desktop");
		setInstalledExtensions([]);
		invalidatePresenceCache();
		// Mock workspace config to return undefined for primaryAssistant
		vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
			get: vi.fn().mockReturnValue(undefined),
			has: vi.fn().mockReturnValue(false),
			inspect: vi.fn().mockReturnValue(undefined),
			update: vi.fn().mockResolvedValue(undefined),
		} as unknown as vscode.WorkspaceConfiguration);
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	// ── No AI scenario ────────────────────────────────────────────────────

	describe("when no AI extensions are installed", () => {
		it("returns empty state with confidence 'none'", () => {
			const result = detectAIPresence();
			expect(result.installed).toEqual([]);
			expect(result.primary).toBeUndefined();
			expect(result.confidence).toBe("none");
			expect(result.host).toBe("vscode");
			expect(result.detected).toBe(false);
			expect(result.hasAI).toBe(false);
		});
	});

	// ── Known assistant detection ─────────────────────────────────────────

	describe("known assistant detection", () => {
		it("detects GitHub Copilot by extension ID", () => {
			setInstalledExtensions([mockExtension("github.copilot", { version: "1.200.0" })]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.installed).toContain("copilot");
			expect(result.confidence).toBe("high");
			expect(result.detected).toBe(true);
			expect(result.hasAI).toBe(true);
		});

		it("detects Cursor AI", () => {
			setInstalledExtensions([mockExtension("anysphere.cursor")]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.installed).toContain("cursor");
			expect(result.confidence).toBe("high");
		});

		it("detects Claude via anthropic extension", () => {
			setInstalledExtensions([mockExtension("anthropic.claude-vscode")]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.installed).toContain("claude");
			expect(result.confidence).toBe("high");
		});

		it("detects multiple assistants simultaneously", () => {
			setInstalledExtensions([
				mockExtension("github.copilot", { version: "1.200.0" }),
				mockExtension("anthropic.claude-vscode", { version: "0.5.0" }),
				mockExtension("tabnine.tabnine-vscode"),
			]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.installed).toContain("copilot");
			expect(result.installed).toContain("claude");
			expect(result.installed).toContain("tabnine");
			expect(result.installed).toHaveLength(3);
			expect(result.confidence).toBe("high");
		});

		it("deduplicates when multiple extension IDs match same assistant", () => {
			setInstalledExtensions([
				mockExtension("github.copilot"),
				mockExtension("github.copilot-chat"),
			]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			const copilotEntries = result.installed.filter((n) => n === "copilot");
			expect(copilotEntries).toHaveLength(1);
		});
	});

	// ── Host detection ────────────────────────────────────────────────────

	describe("host detection", () => {
		it("detects standard VS Code", () => {
			setAppName("Visual Studio Code");
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.host).toBe("vscode");
		});

		it("detects Cursor host from appName", () => {
			setAppName("Cursor");
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.host).toBe("cursor");
		});

		it("detects Windsurf host from appName", () => {
			setAppName("Windsurf");
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.host).toBe("windsurf");
		});

		it("detects Cursor from appHost fallback", () => {
			setAppName("Visual Studio Code");
			setAppHost("cursor");
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.host).toBe("cursor");
		});

		it("adds host-detected assistant when running in Cursor without extension", async () => {
			setAppName("Cursor");
			setInstalledExtensions([]);
			invalidatePresenceCache();
			const result = await detectAIPresenceAsync();
			expect(result.installed).toContain("cursor");
			expect(result.confidence).toBe("low");
			expect(result.indicators.some((i) => i.includes("host-detected"))).toBe(true);
		});

		it("adds host-detected assistant for Windsurf without extension", async () => {
			setAppName("Windsurf");
			setInstalledExtensions([]);
			invalidatePresenceCache();
			const result = await detectAIPresenceAsync();
			expect(result.installed).toContain("windsurf");
			expect(result.confidence).toBe("low");
		});
	});

	// ── Confidence levels ─────────────────────────────────────────────────

	describe("confidence levels", () => {
		it("returns 'high' when known assistants are found", () => {
			setInstalledExtensions([mockExtension("github.copilot")]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.confidence).toBe("high");
		});

		it("returns 'none' when no AI and standard VS Code host", () => {
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.confidence).toBe("none");
		});

		it("returns 'low' for Cursor host with no known extensions", () => {
			setAppName("Cursor");
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.confidence).toBe("low");
		});
	});

	// ── Primary selection ─────────────────────────────────────────────────

	describe("primary selection", () => {
		it("selects single installed assistant as primary", () => {
			setInstalledExtensions([mockExtension("github.copilot")]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.primary).toBe("copilot");
			expect(result.tool).toBe("copilot");
		});

		it("selects host-matching assistant as primary in Cursor", () => {
			setAppName("Cursor");
			setInstalledExtensions([
				mockExtension("github.copilot"),
				mockExtension("anysphere.cursor"),
			]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.primary).toBe("cursor");
		});

		it("uses priority order when no host match and no user pref", () => {
			setInstalledExtensions([
				mockExtension("github.copilot"),
				mockExtension("anthropic.claude-vscode"),
			]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.primary).toBe("copilot");
		});

		it("respects user-configured primary preference", () => {
			vi.spyOn(vscode.workspace, "getConfiguration").mockReturnValue({
				get: vi.fn().mockReturnValue("claude"),
				has: vi.fn().mockReturnValue(true),
				inspect: vi.fn().mockReturnValue(undefined),
				update: vi.fn().mockResolvedValue(undefined),
			} as unknown as vscode.WorkspaceConfiguration);
			setInstalledExtensions([
				mockExtension("github.copilot"),
				mockExtension("anthropic.claude-vscode"),
			]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.primary).toBe("claude");
		});
	});

	// ── Backward compatibility ────────────────────────────────────────────

	describe("backward compatibility", () => {
		it("provides hasAI=true when assistants detected", () => {
			setInstalledExtensions([mockExtension("github.copilot")]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.hasAI).toBe(true);
			expect(result.detected).toBe(true);
		});

		it("provides detectedAssistants array matching installed", () => {
			setInstalledExtensions([
				mockExtension("github.copilot"),
				mockExtension("tabnine.tabnine-vscode"),
			]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.detectedAssistants).toEqual(result.installed);
		});

		it("provides tool matching primary", () => {
			setInstalledExtensions([mockExtension("github.copilot")]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.tool).toBe(result.primary);
		});
	});

	// ── Convenience helpers ───────────────────────────────────────────────

	describe("convenience helpers", () => {
		it("isAIAssistantInstalled returns true for installed assistant", () => {
			setInstalledExtensions([mockExtension("github.copilot")]);
			invalidatePresenceCache();
			expect(isAIAssistantInstalled("copilot")).toBe(true);
			expect(isAIAssistantInstalled("claude")).toBe(false);
		});

		it("getInstalledAIAssistants returns name array", () => {
			setInstalledExtensions([
				mockExtension("github.copilot"),
				mockExtension("anthropic.claude-vscode"),
			]);
			invalidatePresenceCache();
			const result = getInstalledAIAssistants();
			expect(result).toContain("copilot");
			expect(result).toContain("claude");
		});
	});

	// ── Cache + invalidation ──────────────────────────────────────────────

	describe("caching", () => {
		it("returns cached result on repeated calls", () => {
			setInstalledExtensions([mockExtension("github.copilot")]);
			invalidatePresenceCache();
			const r1 = detectAIPresence();
			expect(r1.installed).toContain("copilot");
			// Change extensions but do NOT invalidate - should still return cached
			setInstalledExtensions([]);
			const r2 = detectAIPresence();
			expect(r2.installed).toEqual(r1.installed);
		});

		it("returns fresh result after invalidatePresenceCache", () => {
			setInstalledExtensions([mockExtension("github.copilot")]);
			invalidatePresenceCache();
			detectAIPresence();
			// Invalidate and change
			setInstalledExtensions([]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.installed).toEqual([]);
		});
	});

	// ── Indicators ────────────────────────────────────────────────────────

	describe("indicators", () => {
		it("includes extension version in indicators", () => {
			setInstalledExtensions([mockExtension("github.copilot", { version: "1.200.0" })]);
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.indicators.some((i) => i.includes("1.200.0"))).toBe(true);
		});

		it("includes host in indicators", () => {
			invalidatePresenceCache();
			const result = detectAIPresence();
			expect(result.indicators.some((i) => i.startsWith("host:"))).toBe(true);
		});
	});

	// ── Activity tracking API ─────────────────────────────────────────────

	describe("getAIPresenceDetector", () => {
		it("returns instance with onActivityChange event", () => {
			const detector = getAIPresenceDetector();
			expect(detector.onActivityChange).toBeDefined();
			expect(typeof detector.isAnyActive).toBe("boolean");
		});
	});

	// ── Async API ─────────────────────────────────────────────────────────

	describe("detectAIPresenceAsync", () => {
		it("returns the same shape as sync version", async () => {
			setInstalledExtensions([mockExtension("github.copilot")]);
			invalidatePresenceCache();
			const result = await detectAIPresenceAsync();
			expect(result.installed).toContain("copilot");
			expect(result.confidence).toBe("high");
			expect(result.host).toBe("vscode");
			expect(result.hasAI).toBe(true);
		});
	});
});
