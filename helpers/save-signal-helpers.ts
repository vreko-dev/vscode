/**
 * Shared test utilities for save signal testing
 * Provides helpers for testing onDidSaveTextDocument edge cases
 * 
 * Key scenarios covered:
 * - Clean file saves (isDirty=false, no changes)
 * - Empty contentChanges arrays
 * - Rapid sequential saves
 * - Document state edge cases
 */

import { vi } from "vitest";
import type * as vscode from "vscode";

/**
 * Options for creating mock documents
 */
export interface MockDocumentOptions {
	/** File path */
	path: string;
	/** Document content */
	content?: string;
	/** Whether document has unsaved changes */
	isDirty?: boolean;
	/** URI scheme (file, ssh, inmemory, etc.) */
	scheme?: string;
	/** Language ID */
	languageId?: string;
	/** Line count */
	lineCount?: number;
	/** Whether file is read-only */
	isUntitled?: boolean;
}

/**
 * Create a mock TextDocument for testing
 */
export function createMockDocument(options: MockDocumentOptions): vscode.TextDocument {
	const {
		path,
		content = "const test = 1;",
		isDirty = false,
		scheme = "file",
		languageId = "typescript",
		lineCount = content.split("\n").length,
		isUntitled = false,
	} = options;

	return {
		uri: {
			scheme,
			path,
			fsPath: scheme === "file" ? path : `${scheme}://${path}`,
			with: vi.fn().mockReturnThis(),
			toString: () => `${scheme}://${path}`,
		} as any,
		fileName: path,
		isUntitled,
		languageId,
		version: 1,
		isDirty,
		isClosed: false,
		save: vi.fn().mockResolvedValue(true),
		eol: 1, // LF
		lineCount,
		lineAt: vi.fn().mockReturnValue({
			text: content.split("\n")[0],
			range: { start: { line: 0, character: 0 }, end: { line: 0, character: 10 } },
		}),
		offsetAt: vi.fn().mockReturnValue(0),
		positionAt: vi.fn().mockReturnValue({ line: 0, character: 0 }),
		getText: vi.fn().mockReturnValue(content),
		getWordRangeAtPosition: vi.fn(),
		validateRange: vi.fn().mockReturnValue({ start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }),
		validatePosition: vi.fn().mockReturnValue({ line: 0, character: 0 }),
	} as any;
}

/**
 * Create a clean document (no unsaved changes)
 */
export function createCleanDocument(path = "/test/clean.ts"): vscode.TextDocument {
	return createMockDocument({ path, isDirty: false });
}

/**
 * Create a dirty document (has unsaved changes)
 */
export function createDirtyDocument(path = "/test/dirty.ts"): vscode.TextDocument {
	return createMockDocument({ path, isDirty: true });
}

/**
 * Create a document with specific scheme (non-file)
 */
export function createNonFileDocument(scheme: string, path = "/test/doc.ts"): vscode.TextDocument {
	return createMockDocument({ path, scheme, isDirty: false });
}

/**
 * Create untitled document
 */
export function createUntitledDocument(): vscode.TextDocument {
	return createMockDocument({
		path: "Untitled-1",
		isUntitled: true,
		isDirty: true,
	});
}

/**
 * Mock content change event
 */
export interface MockContentChange {
	range: vscode.Range;
	rangeOffset: number;
	rangeLength: number;
	text: string;
}

/**
 * Create mock contentChanges array
 */
export function createMockContentChanges(isEmpty: boolean): MockContentChange[] {
	if (isEmpty) {
		return [];
	}

	return [
		{
			range: {
				start: { line: 0, character: 0 },
				end: { line: 0, character: 5 },
			} as vscode.Range,
			rangeOffset: 0,
			rangeLength: 5,
			text: "const",
		},
	];
}

/**
 * Simulate a save event with optional changes
 */
export function createSaveEvent(
	document: vscode.TextDocument,
	hasChanges = false,
): { document: vscode.TextDocument; contentChanges: MockContentChange[] } {
	return {
		document,
		contentChanges: createMockContentChanges(hasChanges),
	};
}

/**
 * Wait for a specified duration (for grace period tests)
 */
export function waitForDuration(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Wait for grace period to complete (2000ms + buffer)
 */
export function waitForGracePeriod(): Promise<void> {
	return waitForDuration(2100); // 2s + 100ms buffer
}

/**
 * Simulate rapid sequential saves
 */
export async function simulateRapidSaves(
	document: vscode.TextDocument,
	count: number,
	intervalMs: number,
	saveHandler: (doc: vscode.TextDocument) => void,
): Promise<void> {
	for (let i = 0; i < count; i++) {
		saveHandler(document);
		if (i < count - 1) {
			await waitForDuration(intervalMs);
		}
	}
}

/**
 * Assert that a spy was NOT called
 */
export function assertNoSignalEmitted(spy: any, message?: string): void {
	const calls = spy.mock.calls.length;
	if (calls > 0) {
		const errorMsg = message || `Expected no signal emissions, but found ${calls} call(s)`;
		throw new Error(`${errorMsg}\nCalls: ${JSON.stringify(spy.mock.calls, null, 2)}`);
	}
}

/**
 * Assert that a spy was called exactly N times
 */
export function assertSignalEmittedCount(spy: any, expectedCount: number, message?: string): void {
	const actualCount = spy.mock.calls.length;
	if (actualCount !== expectedCount) {
		const errorMsg =
			message || `Expected ${expectedCount} signal emission(s), but found ${actualCount}`;
		throw new Error(`${errorMsg}\nCalls: ${JSON.stringify(spy.mock.calls, null, 2)}`);
	}
}

/**
 * Create a mock for onDidSaveTextDocument listener
 */
export function createSaveListenerMock(): {
	listener: any;
	trigger: (document: vscode.TextDocument) => void;
} {
	let handler: ((doc: vscode.TextDocument) => void) | null = null;

	const listener = vi.fn((callback: (doc: vscode.TextDocument) => void) => {
		handler = callback;
		return { dispose: vi.fn() };
	});

	const trigger = (document: vscode.TextDocument) => {
		if (handler) {
			handler(document);
		} else {
			throw new Error("No handler registered - call listener first");
		}
	};

	return { listener, trigger };
}

/**
 * Test data: Common file paths for edge cases
 */
export const TEST_PATHS = {
	CLEAN_TS: "/test/workspace/clean.ts",
	DIRTY_TS: "/test/workspace/dirty.ts",
	BINARY_PNG: "/test/workspace/image.png",
	CONFIG_JSON: "/test/workspace/config.json",
	GITIGNORE: "/test/workspace/.gitignore",
	UNTITLED: "Untitled-1",
} as const;

/**
 * Test data: Non-file URI schemes to test
 */
export const NON_FILE_SCHEMES = [
	"inmemory",
	"ssh",
	"vscode-remote",
	"output",
	"git",
	"walkthrough",
	"vscode-userdata",
] as const;
