import { expect, vi } from "vitest";
import type { ProtectionLevel } from "../../src/views/types.js";

/**
 * Test helper utilities for Protection Level feature testing
 */

export const VALID_PROTECTION_LEVELS: ProtectionLevel[] = [
	"watch",
	"warn",
	"block",
];

interface ProtectedFileRegistry {
	list: ReturnType<typeof vi.fn>;
	total: ReturnType<typeof vi.fn>;
	add: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
	updateProtectionLevel: ReturnType<typeof vi.fn>;
	getProtectionLevel: ReturnType<typeof vi.fn>;
	markCheckpoint: ReturnType<typeof vi.fn>;
	onDidChangeProtectedFiles: ReturnType<typeof vi.fn>;
}

export function createMockProtectedFileRegistry(
	overrides?: Partial<ProtectedFileRegistry>,
) {
	return {
		list: vi.fn().mockResolvedValue([]),
		total: vi.fn().mockResolvedValue(0),
		add: vi.fn().mockResolvedValue(undefined),
		remove: vi.fn().mockResolvedValue(undefined),
		updateProtectionLevel: vi.fn().mockResolvedValue(undefined),
		getProtectionLevel: vi.fn().mockReturnValue("watch"),
		markCheckpoint: vi.fn().mockResolvedValue(undefined),
		onDidChangeProtectedFiles: vi.fn(),
		...overrides,
	};
}

export function createMockProtectedFile(
	path: string,
	level: ProtectionLevel = "watch",
) {
	return {
		id: `mock-${Math.random()}`,
		path,
		label: path.split("/").pop() || path,
		protectionLevel: level,
		lastProtectedAt: Date.now(),
	};
}

export function assertValidProtectionLevel(
	level: unknown,
): asserts level is ProtectionLevel {
	expect(VALID_PROTECTION_LEVELS).toContain(level);
}

export async function waitForAsync(ms: number = 0): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createMockDocument(fsPath: string, content: string = "") {
	return {
		uri: { fsPath, scheme: "file" },
		fileName: fsPath,
		languageId: "typescript",
		version: 1,
		isDirty: false,
		isUntitled: false,
		isClosed: false,
		getText: vi.fn().mockReturnValue(content),
		lineCount: content.split("\n").length,
		save: vi.fn().mockResolvedValue(true),
		eol: 1,
		lineAt: vi.fn(),
	};
}

interface MockDocument {
	uri: { fsPath: string; scheme: string };
	fileName: string;
	languageId: string;
	version: number;
	isDirty: boolean;
	isUntitled: boolean;
	isClosed: boolean;
	getText: ReturnType<typeof vi.fn>;
	lineCount: number;
	save: ReturnType<typeof vi.fn>;
	eol: number;
	lineAt: ReturnType<typeof vi.fn>;
}

export function createMockSaveEvent(
	document: MockDocument,
	reason: number = 1,
) {
	return {
		document,
		reason,
		waitUntil: vi.fn((promise: Promise<unknown>) => promise),
	};
}
